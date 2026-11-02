// Pure game logic. Host-authoritative: only the host constructs a Game; clients get sanitized views.
// Built for N players (turn order is by seat), but only 2-player flow is exercised/tested for now.
import { getCard, TENDENCIES, machinesOf } from './cards.js';
import { OPS, condOk as fxCond } from './effects.js';

export const GOMAMAYO_COUNTER = 'gomamayo-yokushi';

export const RULES = {
  handSize: 5,
  chara: 5, skill: 20, skillCopies: 2, chart: 10,
  maxMachines: 3, bmsMaxMachines: 2,
  songsPerCredit: 5, winsNeeded: 3,
  postSongDraw: 2,
  turnTimeLimit: 60,      // seconds a human has per turn to choose cards (online play); 0 = no limit. Enforced by the host, not here.
  turnsPerSong: 2,        // rounds per song: each round every player plays up to maxPlaysPerTurn cards then rolls; scores add up
  maxPlaysPerTurn: 2,     // cards (chara or skill) a player may play per turn; 0 = unlimited
  tendencyBonus: 1, tendencyBothBonus: 2,
  firstActorPenalty: 0,   // note in the handwritten rules: acting first is too strong -> maybe a debuff. 0 = off.
  dieSides: 6,
};

/* ------------------------------------------------------------ deck check */
export function validateDeck(deck, R = RULES) {
  const errors = [];
  const cnt = (ids) => ids.reduce((m, id) => ((m[id] = (m[id] || 0) + 1), m), {});
  const typed = (ids, type) => ids.every((id) => getCard(id)?.type === type);
  if (!deck || !Array.isArray(deck.chara) || !Array.isArray(deck.skill) || !Array.isArray(deck.chart) || !Array.isArray(deck.machines)) {
    return { ok: false, errors: ['デッキの形式が不正です'] };
  }
  if (!TENDENCIES.includes(deck.tendency)) errors.push('得意譜面傾向を選んでください');
  if (deck.chara.length !== R.chara) errors.push(`キャラカードは${R.chara}枚 (現在${deck.chara.length})`);
  if (deck.skill.length !== R.skill) errors.push(`スキルカードは${R.skill}枚 (現在${deck.skill.length})`);
  if (deck.chart.length !== R.chart) errors.push(`譜面カードは${R.chart}枚 (現在${deck.chart.length})`);
  if (!typed(deck.chara, 'chara') || !typed(deck.skill, 'skill') || !typed(deck.chart, 'chart') || !typed(deck.machines, 'machine')) {
    errors.push('不明なカード、または種類が違うカードが含まれています');
    return { ok: false, errors };
  }
  for (const id of [...deck.chara, ...deck.skill, ...deck.chart]) if (getCard(id)?.token) errors.push(`「${getCard(id).name}」はトークンなのでデッキに入れられません`);
  for (const [id, n] of Object.entries(cnt(deck.chara))) if (n > 1) errors.push(`キャラ「${getCard(id).name}」は1枚まで`);
  for (const [id, n] of Object.entries(cnt(deck.skill))) if (n > R.skillCopies) errors.push(`スキル「${getCard(id).name}」は${R.skillCopies}枚まで`);
  for (const [id, n] of Object.entries(cnt(deck.chart))) if (n > 1) errors.push(`譜面「${getCard(id).name}」は1枚まで (かぶりなし)`);
  if (new Set(deck.machines).size !== deck.machines.length) errors.push('同じ機種カードは重複できません');
  const hasBms = deck.machines.includes('bms');
  const maxM = hasBms ? R.bmsMaxMachines : R.maxMachines;
  if (deck.machines.length > maxM) errors.push(`機種カードは最大${maxM}枚${hasBms ? ' (BMSを入れる場合は2枚まで)' : ''}`);
  for (const id of deck.chart) {
    const c = getCard(id);
    const ms = machinesOf(c);
    if (!ms.includes('bms') && !ms.some((m) => deck.machines.includes(m))) errors.push(`「${c.name}」の機種(${ms.join('/')})が機種カードにありません`);
  }
  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ game */
export class Game {
  constructor(decks, names, rules = RULES) {
    this.R = rules;
    this.jobs = [];
    this.cont = null;
    this.uidN = 1;
    const mk = (id) => ({ uid: this.uidN++, id });
    this.s = {
      n: decks.length, phase: 'rolloff', stage: null, songNo: 0, order: [], cur: 0, seq: 0,
      players: decks.map((d, i) => ({
        name: names[i], tendencies: [d.tendency], machines: [...d.machines],
        pile: this.shuffle([...d.chara, ...d.skill].map(mk)),
        charts: this.shuffle(d.chart.map(mk)),
        hand: [], field: [], grave: [], won: [], rolled: null, out: false,
      })),
      allCharts: [...new Set(decks.flatMap((d) => d.chart))],
      song: null, prompt: null, drawAns: null, lastRoll: null, lastResult: null, winner: null, reason: '', log: [],
    };
    this.log('ゲーム開始！ 最初のサイコロを振って、課題曲を選ぶ順番を決めます');
    for (let p = 0; p < this.s.n; p++) this.draw(p, this.R.handSize);
  }

  /* ---- helpers used by effects ---- */
  card(inst) { return getCard(inst.id); }
  cname(inst) { return getCard(inst.id).name; }
  name(p) { return this.s.players[p].name; }
  over() { return this.s.phase === 'over'; }
  log(t) { this.s.logN = (this.s.logN || 0) + 1; this.s.log.push(t); if (this.s.log.length > 200) this.s.log.shift(); }
  bump() { this.s.seq++; }
  opps(p) { return this.s.players.map((_, i) => i).filter((i) => i !== p && !this.s.players[i].out); }
  who(ctx, w) {
    const p = ctx.p;
    switch (w) {
      case 'self': return [p];
      case 'opp': return this.opps(p);
      case 'each': return this.s.players.map((_, i) => i).filter((i) => !this.s.players[i].out);
      case 'owner': { const o = this.s.song?.task?.owner; return o == null ? [] : [o]; }
      default: return [p];
    }
  }
  rand(n) { return Math.floor(Math.random() * n); }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  flags(p) { return this.s.song.flags[p]; }
  tendenciesOf(p) {
    const pl = this.s.players[p];
    if (this.s.song && this.flags(p).allTendencies) return TENDENCIES.slice();
    const grants = pl.won.map((c) => getCard(c.id).grantTendency).filter(Boolean);
    return [...new Set([...pl.tendencies, ...grants])];
  }
  addScore(p, label, v, opts = {}) {
    if (!v) return;
    if (v < 0 && this.flags(p).immune[label]) return;
    this.s.song.score[p].push({ label, v });
    if (v > 0 && !opts.dice && !this.inGain) {          // "自分のスコアが増える効果を得る度" (e.g. Reku Mochizuki)
      this.inGain = true;
      for (const inst of [...this.s.players[p].field]) {
        if (inst.faceDown) continue;
        const card = this.card(inst);
        for (const ef of card.effects || []) if (ef.when === 'scoreGain') this.runOps({ p, inst, card }, ef.ops);
      }
      this.inGain = false;
    }
  }
  total(p) { return this.s.song.score[p].reduce((a, e) => a + e.v, 0); }
  die() { return 1 + this.rand(this.R.dieSides); }

  draw(p, n) {
    const pl = this.s.players[p];
    for (let i = 0; i < n; i++) {
      if (!pl.pile.length) { this.lose(p, '山札切れ'); return false; }
      pl.hand.push(pl.pile.pop());
    }
    return true;
  }
  lose(p, why) {
    const s = this.s;
    s.players[p].out = true;
    this.log(`${this.name(p)} は ${why} で敗北！`);
    const alive = s.players.map((_, i) => i).filter((i) => !s.players[i].out);
    if (alive.length <= 1) { s.phase = 'over'; s.winner = alive; s.reason = `${this.name(p)}: ${why}`; s.prompt = null; this.cont = null; }
  }
  ask(p, spec, cont) {
    this.s.promptN = (this.s.promptN || 0) + 1;
    this.s.prompt = { player: p, ...spec };
    this.cont = cont;
    this.bump();
  }
  // 「ゴママヨ」 effects can be countered: before one resolves, each opponent holding ゴママヨ抑止 is asked whether to spend it.
  // run() = resolve the effect normally; negated() = it was cancelled.
  maybeNegate(src, card, run, negated) {
    if (!(card.tags || []).includes('gomamayo') || card.noReact) return run();
    const holders = this.opps(src).filter((q) => this.s.players[q].hand.some((c) => c.id === GOMAMAYO_COUNTER));
    const ask = (k) => {
      if (k >= holders.length || this.over()) return run();
      const q = holders[k];
      this.ask(q, { kind: 'pick', text: `${this.name(src)} が「ゴママヨ」の効果【${card.name}】を発動します。ゴママヨ抑止で無効化しますか？`, cardId: GOMAMAYO_COUNTER, optional: true, skipLabel: 'そのまま通す', choices: [{ value: 1, label: 'ゴママヨ抑止を使う' }] }, (v) => {
        if (!v) return ask(k + 1);
        const h = this.s.players[q].hand, i = h.findIndex((c) => c.id === GOMAMAYO_COUNTER);
        const [c] = h.splice(i, 1); this.s.players[q].grave.push(c);
        this.log(`${this.name(q)} は ゴママヨ抑止 で ${card.name} の効果を無効化した！`);
        if (negated) negated();
      });
    };
    ask(0);
  }
  runOps(ctx, ops, done) {
    const step = (i) => {
      if (this.over()) return;
      if (ctx.abort || i >= ops.length) { if (done) done(); return; }
      if (ops[i].cond && !fxCond(this, ctx, ops[i].cond)) return step(i + 1);
      const fn = OPS[ops[i].op];
      if (!fn) { this.log(`(未実装の効果: ${ops[i].op})`); return step(i + 1); }
      fn(this, ctx, ops[i], () => step(i + 1));
    };
    step(0);
  }
  /* ---- entry point for player intents ---- */
  act(p, a) {
    const s = this.s;
    if (this.over()) return { ok: false, err: 'ゲームは終了しています' };
    if (s.players[p].out) return { ok: false, err: '敗北済み' };
    let r;
    if (s.prompt) {
      if (a.t !== 'answer') return { ok: false, err: '選択待ちです' };
      r = this.answer(p, a);
    } else {
      switch (a.t) {
        case 'roll': r = this.rollOff(p); break;
        case 'play': r = this.play(p, a); break;
        case 'end': r = this.end(p); break;
        case 'draw': r = this.drawChoice(p, a); break;
        case 'ability': r = this.ability(p); break;
        default: r = { ok: false, err: '不明な操作' };
      }
    }
    if (r.ok) { this.bump(); this.pump(); }
    return r;
  }

  /* ---- roll-off to decide who chooses the first song ---- */
  rollOff(p) {
    const s = this.s;
    if (s.phase !== 'rolloff') return { ok: false, err: 'いまは振れません' };
    const pl = s.players[p];
    if (pl.rolled != null) return { ok: false, err: '振り終わっています' };
    pl.rolled = this.die();
    s.lastRoll = { p, v: pl.rolled, seq: ++s.seq };
    this.log(`${pl.name} のサイコロ: ${pl.rolled}`);
    if (s.players.every((x) => x.rolled != null)) {
      const best = Math.max(...s.players.map((x) => x.rolled));
      const top = s.players.map((x, i) => i).filter((i) => s.players[i].rolled === best);
      if (top.length > 1) {
        this.log('同値！ 同値のプレイヤーが振り直し');
        top.forEach((i) => (s.players[i].rolled = null));
      } else {
        s.order = s.players.map((x, i) => i).sort((a, b) => s.players[b].rolled - s.players[a].rolled || a - b);
        this.log(`${this.name(s.order[0])} が最初の課題曲を選びます`);
        this.startSong();
      }
    }
    return { ok: true };
  }

  startSong() {
    const s = this.s;
    s.songNo++;
    const sudden = s.songNo >= this.R.songsPerCredit;
    const chooser = s.order[(s.songNo - 1) % s.order.length];
    let owner = chooser, cardInst;
    const chooserPl = s.players[chooser];
    if (sudden || !chooserPl.charts.length) {
      const id = s.allCharts[this.rand(s.allCharts.length)];
      cardInst = { uid: this.uidN++, id };
      owner = null;
    } else cardInst = chooserPl.charts.pop();
    const card = getCard(cardInst.id);
    s.song = {
      no: s.songNo, sudden, task: { inst: cardInst, owner }, chooser, pass: 1,
      rolls: s.players.map(() => []), score: s.players.map(() => []), plays: s.players.map(() => 0), played: s.players.map(() => []),
      done: s.players.map(() => false), sflags: { allFemale: false, allMaimai: false },
      flags: s.players.map(() => ({ bonus: 0, best: false, forced: null, extra: 0, mult: 1, rerolls: 0, drawOnRoll: false, allTendencies: false, envy: false, immune: {} })),
    };
    s.phase = 'song';
    this.log(sudden
      ? `── 第${s.songNo}曲 (サドンデス): ランダム選曲 → ${card.name}`
      : `── 第${s.songNo}曲: ${chooserPl.name} が選曲 → ${card.name}`);
    s.cur = chooser;
    s.players.forEach((pl, i) => { if (pl.nextBonus) { this.addScore(i, '妬み', pl.nextBonus); pl.nextBonus = 0; } });
    const sp = owner ?? chooser;
    for (const ef of card.effects || []) {
      if (ef.when !== 'songStart') continue;
      this.jobs.push(() => { const ctx = { p: sp, card, inst: null }; if (fxCond(this, ctx, ef.cond)) this.runOps(ctx, ef.ops); });
    }
    this.beginTurn(chooser);
  }

  beginTurn(p) {
    const s = this.s;
    s.cur = p; s.stage = 'start';
    s.song.plays[p] = 0;
    this.log(`${this.name(p)} のターン${this.R.turnsPerSong > 1 ? ` (${s.song.pass}/${this.R.turnsPerSong}ラウンド)` : ''}`);
    const pen = this.R.firstActorPenalty;
    if (pen && p === s.song.chooser && s.song.pass === 1) this.addScore(p, '先行ペナルティ', -pen);
    const firstRound = s.song.pass === 1;        // "ターン開始時" effects happen once per song; later rounds only roll again
    let pen2 = 0;
    if (firstRound) for (const z of ['grave', 'field']) for (const c of s.players[p][z]) pen2 += getCard(c.id).perCopyTurnScore || 0;
    if (pen2) this.jobs.push(() => this.addScore(p, '癖', pen2));
    const tcard = getCard(s.song.task.inst.id);
    for (const ef of tcard.effects || []) {
      if (ef.when === 'turnStart' && ef.zone === 'task' && (firstRound || ef.everyRound)) this.jobs.push(() => { const ctx = { p, card: tcard, inst: null }; if (fxCond(this, ctx, ef.cond)) this.runOps(ctx, ef.ops); });
    }
    for (const inst of [...s.players[p].field]) {
      if (inst.faceDown) continue;
      const card = this.card(inst);
      for (const ef of card.effects || []) {
        if (ef.when !== 'turnStart' || !(firstRound || ef.everyRound)) continue;
        this.jobs.push(() => { const ctx = { p, inst, card }; if (inst.faceDown === false || inst.faceDown == null) { if (fxCond(this, ctx, ef.cond)) this.maybeNegate(p, card, () => this.runOps(ctx, ef.ops)); } });
      }
    }
  }

  pump() {
    const s = this.s;
    for (;;) {
      if (s.prompt || this.over() || s.phase !== 'song') return;
      if (this.jobs.length) { this.jobs.shift()(); continue; }
      if (s.stage === 'start') { s.stage = 'main'; this.bump(); return; }
      if (s.stage === 'end') { this.finishRoll(); continue; }
      return;
    }
  }

  answer(p, a) {
    const pr = this.s.prompt;
    if (pr.player !== p) return { ok: false, err: 'あなたの選択ではありません' };
    let v = a.v ?? null;
    if (v == null) { if (!pr.optional) return { ok: false, err: '選んでください' }; }
    else if (!pr.choices.some((c) => c.value === v)) return { ok: false, err: '不正な選択' };
    this.s.prompt = null;
    const c = this.cont; this.cont = null;
    if (c) c(v);
    return { ok: true };
  }

  play(p, a) {
    const s = this.s;
    if (s.phase !== 'song' || s.stage !== 'main' || s.cur !== p) return { ok: false, err: 'あなたのターンではありません' };
    const hand = s.players[p].hand;
    const i = hand.findIndex((c) => c.uid === a.uid);
    if (i < 0) return { ok: false, err: 'そのカードは手札にありません' };
    const card = this.card(hand[i]);
    const max = this.R.maxPlaysPerTurn;
    if (max && s.song.plays[p] >= max) return { ok: false, err: `このターンに使えるカードは最大${max}枚です` };
    if (card.type === 'chara') {
      const [inst] = hand.splice(i, 1);
      s.song.plays[p]++; s.song.played[p].push(card.id);
      s.players[p].field.push({ ...inst, faceDown: false, since: s.songNo });
      this.log(`${this.name(p)} は ${card.name} を場に出した`);
      return { ok: true };
    }
    if (card.type !== 'skill') return { ok: false, err: 'このカードは使えません' };
    const ef = (card.effects || []).find((e) => e.when === 'play');
    if (card.reactOnly) return { ok: false, err: 'このカードは、相手が「ゴママヨ」の効果を発動した時に自動で確認されます' };
    if (!ef) return { ok: false, err: 'このカードの効果は未実装です' };
    if (ef.playCond && !fxCond(this, { p, card, inst: null }, ef.playCond)) return { ok: false, err: 'いまは使えません (使用条件を満たしていません)' };
    const [inst] = hand.splice(i, 1);
    s.song.plays[p]++; s.song.played[p].push(card.id);
    this.log(`${this.name(p)} は ${card.name} を使った`);
    const ctx = { p, inst, card };
    const scoring = ef.ops.some((o) => o.op === 'score' && o.who === 'self' && o.n > 0);
    const after = () => {
      if (ctx.keep) s.players[p].field.push({ uid: inst.uid, id: inst.id, faceDown: false, notChara: true });
      else s.players[p].grave.push({ uid: inst.uid, id: inst.id });
      if (scoring) {                                            // "自分のスコアを増やすスキルを使う度" (e.g. 生命性シンドロウム)
        const tc = getCard(s.song.task.inst.id);
        for (const e2 of tc.effects || []) if (e2.when === 'skillScore') this.runOps({ p, card: tc, inst: null }, e2.ops);
      }
    };
    this.maybeNegate(p, card, () => this.runOps(ctx, ef.ops, after), () => s.players[p].grave.push({ uid: inst.uid, id: inst.id }));
    return { ok: true };
  }

  end(p) {
    const s = this.s;
    if (s.phase !== 'song' || s.stage !== 'main' || s.cur !== p) return { ok: false, err: 'あなたのターンではありません' };
    s.stage = 'end';
    for (const inst of [...s.players[p].field]) {
      if (inst.faceDown) continue;
      const card = this.card(inst);
      for (const ef of card.effects || []) {
        if (ef.when !== 'diceRoll') continue;
        const ctx = { p, inst, card };
        if (ef.auto) this.jobs.push(() => { if (fxCond(this, ctx, ef.cond)) this.runOps(ctx, ef.ops); });
        else this.jobs.push(() => this.ask(p, {
          kind: 'pick', text: `${card.name} を使いますか？`, optional: true, cardId: card.id,
          choices: [{ value: 1, label: '使う' }],
        }, (v) => { if (v) this.runOps(ctx, ef.ops); }));
      }
    }
    return { ok: true };
  }

  finishRoll() {
    const s = this.s, p = s.cur, f = this.flags(p);
    s.stage = 'rolling';
    this.rollN(p, (1 + f.extra) * f.mult, true);
  }
  rollN(p, left, first) {
    if (this.over()) return;
    if (left <= 0) return this.afterRolls(p);
    const s = this.s, f = this.flags(p);
    let v = this.die();
    if (first && f.best) { const v2 = this.die(); this.log(`${this.name(p)}: 2回振って ${v}, ${v2}`); v = Math.max(v, v2); }
    if (first && f.forced != null) { v = f.forced; f.forced = null; }
    const accept = (val) => {
      s.song.rolls[p].push(val);
      this.addScore(p, 'サイコロ', val, { dice: true });
      if (f.bonus) this.addScore(p, 'サイコロ補正', f.bonus, { dice: true });
      s.lastRoll = { p, v: val, seq: ++s.seq };
      this.log(`${this.name(p)} のサイコロ: ${val}${f.bonus ? ` (補正${f.bonus > 0 ? '+' : ''}${f.bonus})` : ''}`);
      if (f.drawOnRoll && !this.draw(p, 1)) return;
      this.rollN(p, left - 1, false);
    };
    const attempt = (val) => {
      if (f.rerolls > 0) {
        this.ask(p, { kind: 'pick', text: `サイコロの出目は ${val} です。振り直しますか？`, reroll: val, optional: true, skipLabel: `${val} のまま`, choices: [{ value: 1, label: `振り直す (残り${f.rerolls}回)` }] }, (ans) => {
          if (ans) { f.rerolls--; const nv = this.die(); this.log(`${this.name(p)} は振り直した → ${nv}`); attempt(nv); } else accept(val);
        });
      } else accept(val);
    };
    attempt(v);
  }
  afterRolls(p) {
    const s = this.s;
    s.song.done[p] = true;
    const n = s.n;
    for (let k = 1; k <= n; k++) {
      const q = (p + k) % n;
      if (!s.song.done[q] && !s.players[q].out) { this.beginTurn(q); return; }
    }
    // everyone has taken this round's turn: start the next round, or score the song
    if (s.song.pass < this.R.turnsPerSong) {
      s.song.pass++;
      s.song.done = s.players.map(() => false);
      for (const f of s.song.flags) Object.assign(f, { bonus: 0, best: false, forced: null, extra: 0, mult: 1, rerolls: 0, drawOnRoll: false, immune: {} });   // per-turn effects end; allTendencies / envy last for the whole song
      this.log(`── ラウンド ${s.song.pass} / ${this.R.turnsPerSong}`);
      const first = s.players[s.song.chooser].out ? s.players.findIndex((x) => !x.out) : s.song.chooser;
      this.beginTurn(first);
      return;
    }
    this.resolve();
  }

  resolve() {
    const s = this.s, song = s.song;
    s.stage = 'resolve';
    const card = getCard(song.task.inst.id);
    // favoured tendency bonus (stronger when both players share the same one)
    const ctend = [].concat(card.tendency || []);
    const matchers = s.players.map((x, i) => i).filter((i) => !s.players[i].out && this.tendenciesOf(i).some((t) => ctend.includes(t)));
    for (const i of matchers) {
      const b = matchers.length > 1 ? this.R.tendencyBothBonus : this.R.tendencyBonus;
      this.addScore(i, `得意傾向 ${ctend.join('/')}`, b);
    }
    for (const ef of card.effects || []) {
      if (ef.when !== 'resolve') continue;
      const ctx = { p: song.task.owner ?? song.chooser, card, inst: null };
      if (fxCond(this, ctx, ef.cond)) this.runOps(ctx, ef.ops);
    }
    const alive = () => s.players.map((x, i) => i).filter((i) => !s.players[i].out);
    let tops;
    for (let guard = 0; guard < 50; guard++) {
      const best = Math.max(...alive().map((i) => this.total(i)));
      tops = alive().filter((i) => this.total(i) === best);
      if (tops.length === 1) break;
      this.log('スコア同点！ 振り直し');
      for (const i of tops) { const v = this.die(); song.rolls[i].push(v); this.addScore(i, 'サイコロ(再)', v); this.log(`${this.name(i)}: ${v}`); }
    }
    const w = tops[0];
    const totals = s.players.map((x, i) => this.total(i));
    s.players[w].won.push(song.task.inst);
    s.players.forEach((pl, i) => { if (i !== w && song.flags[i].envy) { pl.nextBonus = (pl.nextBonus || 0) + 3; this.log(`${pl.name}: 妬みで次の曲のスコア+3`); } });
    s.lastResult = { songNo: song.no, cardId: card.id, totals, winner: w };
    this.log(`第${song.no}曲の結果 ${totals.join(' - ')} → ${this.name(w)} の勝ち！`);
    if (s.players[w].won.length >= this.R.winsNeeded) {
      s.phase = 'over'; s.winner = [w]; s.reason = `${this.R.winsNeeded}曲先取`;
      this.log(`${this.name(w)} の勝利！`);
      return;
    }
    s.phase = 'draw';
    s.drawAns = s.players.map((x) => (x.out ? 0 : null));
  }

  // abilities of the current task song that either player may trigger at any time during the song (e.g. もぺもぺ)
  ability(p) {
    const s = this.s;
    if (s.phase !== 'song' || s.stage !== 'main') return { ok: false, err: 'いまは発動できません' };
    const tc = getCard(s.song.task.inst.id), ef = (tc.effects || []).find((e) => e.when === 'ability');
    if (!ef) return { ok: false, err: 'この課題曲に発動できる効果はありません' };
    this.log(`${this.name(p)} は ${tc.name} の効果を発動した`);
    this.runOps({ p, card: tc, inst: null }, ef.ops);
    return { ok: true };
  }

  drawChoice(p, a) {
    const s = this.s;
    if (s.phase !== 'draw' || s.drawAns[p] != null) return { ok: false, err: 'いまは選べません' };
    const n = Number(a.n);
    if (!(n >= 0 && n <= this.R.postSongDraw)) return { ok: false, err: '枚数が不正です' };
    s.drawAns[p] = n;
    if (s.drawAns.every((x) => x != null)) {
      for (let i = 0; i < s.n; i++) { if (s.drawAns[i] && !this.draw(i, s.drawAns[i])) return { ok: true }; if (s.drawAns[i]) this.log(`${this.name(i)} は${s.drawAns[i]}枚引いた`); }
      this.startSong();
    }
    return { ok: true };
  }
}

/* ------------------------------------------------- per-seat sanitized view */
export function viewFor(g, seat) {
  const s = g.s;
  const pub = (inst, hide) => (inst.faceDown && hide ? { uid: inst.uid, faceDown: true, id: null } : { ...inst });
  return {
    n: s.n, phase: s.phase, stage: s.stage, songNo: s.songNo, cur: s.cur, seq: s.seq, you: seat,
    order: s.order, lastRoll: s.lastRoll, lastResult: s.lastResult, winner: s.winner, reason: s.reason, drawAns: s.drawAns,
    rules: { songsPerCredit: g.R.songsPerCredit, winsNeeded: g.R.winsNeeded, postSongDraw: g.R.postSongDraw, maxPlays: g.R.maxPlaysPerTurn, turns: g.R.turnsPerSong },
    players: s.players.map((p, i) => ({
      name: p.name, tendencies: p.tendencies, machines: p.machines, out: p.out, rolled: p.rolled,
      pileCount: p.pile.length, chartCount: p.charts.length, handCount: p.hand.length,
      hand: i === seat ? p.hand.map((c) => ({ ...c })) : null,
      field: p.field.map((c) => pub(c, i !== seat)),
      grave: p.grave.map((c) => ({ ...c })),
      won: p.won.map((c) => ({ ...c })),
    })),
    song: s.song && {
      no: s.song.no, sudden: s.song.sudden, chooser: s.song.chooser, owner: s.song.task.owner, taskId: s.song.task.inst.id,
      rolls: s.song.rolls, score: s.song.score, done: s.song.done, plays: s.song.plays, pass: s.song.pass,
      ability: (getCard(s.song.task.inst.id).effects || []).find((e) => e.when === 'ability')?.label || null,
      totals: s.song.score.map((e) => e.reduce((a, x) => a + x.v, 0)),
    },
    prompt: s.prompt && s.prompt.player === seat ? s.prompt : s.prompt ? { player: s.prompt.player, waiting: true } : null,
    log: s.log.slice(-60), logN: s.logN || 0,
  };
}
