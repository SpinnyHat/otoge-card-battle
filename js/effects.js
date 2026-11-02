// Effect vocabulary.  Mirrors the card-text grammar from the design doc.
//
// TIMINGS (effects[].when)
//   turnStart  自身のターンの開始時に        (face-up chara on your field)
//   diceRoll   サイコロを振る際、            (auto:true = always applies, else the player is asked "use it?")
//   play       skill card is played
//   resolve    リザルトを出す時 (chart effects, owner = player who chose the song)
//
// CONDITIONS (effects[].cond)    behind: my song wins < opponent's
//
// OPERATIONS (ops[].op) — each is (game, ctx, op, next).  Call next() when finished
// (possibly after a player prompt).  Players: self / opp / each / owner.
//
// Still to implement from the vocabulary: negate (効果を無効化), putTopBottom (上/下に置く),
// skipTask (課題曲をスキップ), addTendency (得意譜面傾向に追加), shuffle(zone), flip up.

import { getCard, TENDENCIES, MACHINE_GROUP, machinesOf } from './cards.js';

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

export const OPS = {
  score(g, ctx, op, next) {
    for (const p of g.who(ctx, op.who)) g.addScore(p, op.label || ctx.card.name, op.n, { force: !!op.force });
    next();
  },
  resultScore(g, ctx, op, next) {
    for (const p of g.who(ctx, op.who)) g.addScore(p, ctx.card.name, op.n);
    next();
  },
  resultScoreByRolls(g, ctx, op, next) {
    const n = g.s.song.rolls.reduce((a, r) => a + r.length, 0);
    for (const p of g.who(ctx, op.who)) g.addScore(p, `${ctx.card.name} (サイコロ×${n})`, n);
    next();
  },
  scoreByOppWins(g, ctx, op, next) {
    const n = Math.max(0, ...g.opps(ctx.p).map((o) => g.s.players[o].won.length));
    g.addScore(ctx.p, ctx.card.name, n);
    next();
  },
  draw(g, ctx, op, next) {
    for (const p of g.who(ctx, op.who)) if (!g.draw(p, op.n)) return; // deck-out ends the game
    next();
  },
  discard(g, ctx, op, next) {
    for (const p of g.who(ctx, op.who)) {
      const zone = g.s.players[p][op.from];
      for (let i = 0; i < op.n && zone.length; i++) {
        const [c] = zone.splice(Math.floor(Math.random() * zone.length), 1);
        g.s.players[p].grave.push({ uid: c.uid, id: c.id });
        g.log(`${g.name(p)}: ${g.cname(c)} が墓地に捨てられた`);
      }
    }
    next();
  },
  // 相手の場のカードを1枚選び墓地に捨てる
  pickToGrave(g, ctx, op, next) {
    const choices = [];
    for (const o of g.opps(ctx.p)) for (const c of g.s.players[o].field) {
      choices.push({ value: c.uid, label: `${g.name(o)}: ${c.faceDown ? '(裏)' : ''}${g.cname(c)}`, cardId: c.id, owner: o });
    }
    if (!choices.length) return next();
    g.ask(ctx.p, { kind: 'pick', text: `${ctx.card.name}: 墓地に捨てる【相手の場のカード】を選んでください (自分のカードではありません)`, choices, optional: !!op.optional, skipLabel: '捨てない' }, (v) => {
      if (v != null) {
        const ch = choices.find((c) => c.value === v);
        const f = g.s.players[ch.owner].field;
        if (protectedCard(g, ch.owner, f.find((x) => x.uid === v))) { g.log('そのカードは場を離れない (スロットの中央リール)'); return next(); }
        const [c] = f.splice(f.findIndex((x) => x.uid === v), 1);
        g.s.players[ch.owner].grave.push({ uid: c.uid, id: c.id });
        g.log(`${g.name(ctx.p)}: ${g.cname(c)} を墓地に捨てた`);
        if (op.once && ctx.inst) { ctx.inst.spent = true; ctx.inst.faceDown = true; g.log(`${ctx.card.name} は使い切って裏向きになった (場には残る・効果は発動しない)`); }
      }
      next();
    });
  },
  // 次のサイコロの出目を○から○まで1つ好きに選ぶ
  chooseDie(g, ctx, op, next) {
    const choices = [];
    for (let v = op.min; v <= op.max; v++) choices.push({ value: v, label: String(v) });
    g.ask(ctx.p, { kind: 'pick', text: `${ctx.card.name}: サイコロの出目を選んでください`, choices, optional: true, big: true }, (v) => {
      if (v == null) { ctx.abort = true; return next(); }
      g.flags(ctx.p).forced = v;
      g.log(`${g.name(ctx.p)}: ${ctx.card.name} で出目を ${v} に指定`);
      next();
    });
  },
  flip(g, ctx, op, next) {
    if (ctx.inst) { ctx.inst.faceDown = op.to === 'down'; g.log(`${ctx.card.name} は裏になった`); }
    next();
  },
  rollBonus(g, ctx, op, next) { g.flags(ctx.p).bonus += op.n; next(); },
  nextRollBonus(g, ctx, op, next) { g.flags(ctx.p).bonus += op.n; next(); },
  rollBest(g, ctx, op, next) { g.flags(ctx.p).best = true; next(); },
  recover(g, ctx, op, next) {
    const grave = g.s.players[ctx.p].grave.filter((c) => g.card(c).type === 'skill');
    if (!grave.length) { g.log('墓地にスキルカードがない'); return next(); }
    const choices = grave.map((c) => ({ value: c.uid, label: g.cname(c), cardId: c.id, owner: ctx.p }));
    g.ask(ctx.p, { kind: 'pick', text: `${ctx.card.name}: 手札に加えるカードを選んでください`, choices }, (v) => {
      const gr = g.s.players[ctx.p].grave;
      const [c] = gr.splice(gr.findIndex((x) => x.uid === v), 1);
      g.s.players[ctx.p].hand.push(c);
      g.log(`${g.name(ctx.p)}: ${g.cname(c)} を墓地から手札に加えた`);
      next();
    });
  },
  mulligan(g, ctx, op, next) {
    const pl = g.s.players[ctx.p];
    const n = pl.hand.length;
    pl.pile.push(...pl.hand.splice(0));
    g.shuffle(pl.pile);
    g.log(`${g.name(ctx.p)}: 手札${n}枚を山札に戻しシャッフル`);
    if (!g.draw(ctx.p, n)) return;
    next();
  },
  steal(g, ctx, op, next) {
    const opps = g.opps(ctx.p).filter((o) => g.s.players[o].hand.length);
    if (!opps.length) return next();
    const o = pickOne(opps);
    const h = g.s.players[o].hand;
    const [c] = h.splice(Math.floor(Math.random() * h.length), 1);
    g.s.players[ctx.p].hand.push(c);
    g.log(`${g.name(ctx.p)} は ${g.name(o)} の手札から1枚奪った`);
    next();
  },
};


/* ======================================================================= conditions */
const arr = (x) => [].concat(x || []);
const MACHINE_TAGS = ['wacca', 'chunithm', 'arcaea', 'maimai', 'ongeki', 'gfdm', 'ddr', 'beatmania', 'sdvx', 'bms'];
const taskCard = (g) => (g.s.song ? getCard(g.s.song.task.inst.id) : null);
export const machineOf = (g, c) => (g.s.song?.sflags.allMaimai ? 'maimai' : c.machine);
export function hasTag(g, card, tag) {
  if (g.s.song?.sflags.allMaimai && MACHINE_TAGS.includes(tag)) return tag === 'maimai';
  return arr(card.tags).includes(tag) || (tag === 'female' && !!g.s.song?.sflags.allFemale && card.type === 'chara');
}
export const charasOf = (g, p) => g.s.players[p].field.filter((i) => !i.faceDown && !i.notChara && getCard(i.id).type === 'chara');
const alive = (g) => g.s.players.map((_, i) => i).filter((i) => !g.s.players[i].out);
const side = (g, p, who) => (who === 'opp' ? g.opps(p) : who === 'any' || who === 'each' ? alive(g) : [p]);

export function condOk(g, ctx, c) {
  if (!c) return true;
  const p = ctx.p, T = taskCard(g), mine = g.tendenciesOf(p);
  const tend = arr(T?.tendency);
  if (c.firstRound && g.s.song && g.s.song.pass !== 1) return false;
  if (c.taskTag && !arr(T?.tags).includes(c.taskTag)) return false;
  if (c.taskMachineNot && T && machinesOf(T).some((m) => c.taskMachineNot.includes(m))) return false;
  if (c.notUsed && (g.s.players[p].usedOnce || []).includes(ctx.card.id)) return false;
  if (c.hasChart && !g.s.players[p].charts.length) return false;
  if (c.notNoSkip && T?.noSkip) return false;
  if (c.scoreRule === 'naruka') { const o = g.opps(p)[0]; const a = g.total(p), b = g.total(o); if (!(a > b || b >= 2 * a)) return false; }
  if (c.notSpent && ctx.inst && ctx.inst.spent) return false;
  if (c.notJustPlayed && ctx.inst && ctx.inst.since === g.s.songNo) return false;
  if (c.behind && !(g.s.players[p].won.length < Math.max(0, ...g.opps(p).map((o) => g.s.players[o].won.length)))) return false;
  if (c.taskTendency && !tend.some((t) => c.taskTendency.includes(t))) return false;
  if (c.taskFav && !tend.some((t) => mine.includes(t))) return false;
  if (c.taskMachine && !(T && (g.s.song.sflags.allMaimai ? 'maimai' === c.taskMachine : machinesOf(T).includes(c.taskMachine) || (g.s.song.sflags.addMachines || []).includes(c.taskMachine)))) return false;
  if (c.taskMachineIn && !(T && machinesOf(T).some((m) => c.taskMachineIn.includes(m)))) return false;
  if (c.taskGroup && !(T && machinesOf(T).some((m) => MACHINE_GROUP[m] === c.taskGroup))) return false;
  if (c.taskComposer && !arr(T?.composer).includes(c.taskComposer)) return false;
  if (c.taskCharter && !arr(T?.charter || T?.composer).includes(c.taskCharter)) return false;
  if (c.taskJacket && T?.jacket !== c.taskJacket) return false;
  if (c.taskCollab && !arr(T?.collab).includes(c.taskCollab)) return false;
  if (c.taskId && T?.id !== c.taskId) return false;
  if (c.favHasAll && !c.favHasAll.every((t) => mine.includes(t))) return false;
  if (c.playedThis && !(g.s.song?.played[p] || []).includes(c.playedThis)) return false;
  if (c.fieldHas) {
    const { who = 'self', name, tag } = c.fieldHas;
    const ok = side(g, p, who).some((q) => charasOf(g, q).some((i) => { const cd = getCard(i.id); return name ? cd.name === name : hasTag(g, cd, tag); }));
    if (!ok) return false;
  }
  return true;
}

// Same check as the engine's, but from the sanitized view (the UI and the CPU use it to know if a card can be played right now)
export function playCondViewOk(view, card) {
  const c = (card.effects || []).find((e) => e.when === 'play')?.playCond;
  if (!c) return true;
  const T = view.song && getCard(view.song.taskId);
  if (!T) return false;
  if (c.firstRound && view.song.pass !== 1) return false;
  if (c.taskMachineIn && !machinesOf(T).some((m) => c.taskMachineIn.includes(m))) return false;
  if (c.taskGroup && !machinesOf(T).some((m) => MACHINE_GROUP[m] === c.taskGroup)) return false;
  const me = view.players[view.you];
  if (c.notUsed && (me.usedOnce || []).includes(card.id)) return false;
  if (c.hasChart && !me.chartCount) return false;
  if (c.notNoSkip && T.noSkip) return false;
  if (c.scoreRule === 'naruka') { const a = view.song.totals[view.you], b = Math.max(...view.song.totals.filter((_, i) => i !== view.you)); if (!(a > b || b >= 2 * a)) return false; }
  return true;
}

/* ================================================================ more operations */
// スロットの左リール cannot leave the field while スロットの中央リール is out
const protectedCard = (g, q, inst) => inst.id === 'slot-left' && g.s.players[q].field.some((i) => i.id === 'slot-center' && !i.faceDown);
const toGrave = (g, q, inst) => {
  if (protectedCard(g, q, inst)) { g.log(`${g.cname(inst)} は場を離れない (スロットの中央リール)`); return; }
  const f = g.s.players[q].field, i = f.findIndex((x) => x.uid === inst.uid);
  if (i >= 0) f.splice(i, 1);
  g.s.players[q].grave.push({ uid: inst.uid, id: inst.id });
  g.log(`${g.name(q)}: ${g.cname(inst)} が墓地に送られた`);
};

Object.assign(OPS, {
  lockPlays(g, ctx, op, next) { const max = g.R.maxPlaysPerTurn; if (max) { g.s.song.plays[ctx.p] = max; g.log(`${g.name(ctx.p)}: このターンはもうカードを使えない`); } next(); },
  scoreCount(g, ctx, op, next) {
    let n = 0;
    for (const q of side(g, ctx.p, op.who === 'any' ? 'any' : 'self')) for (const i of charasOf(g, q)) {
      const cd = getCard(i.id); if (hasTag(g, cd, op.tag) || (op.female && hasTag(g, cd, 'female'))) n++;
    }
    n = Math.floor(n / (op.step || 1));
    if (n) g.addScore(ctx.p, `${ctx.card.name} (×${n})`, n * (op.per || 1));
    next();
  },
  giveCard(g, ctx, op, next) {
    for (const q of g.who(ctx, op.to)) {
      const pl = g.s.players[q], inst = { uid: g.uidN++, id: op.id };
      if (op.zone === 'pile') { pl.pile.push(inst); g.shuffle(pl.pile); }
      else if (op.zone === 'field') pl.field.push({ ...inst, faceDown: false, notChara: getCard(op.id).type !== 'chara' });
      else pl[op.zone].push(inst);
      g.log(`${g.name(q)} の${{ grave: '墓地', field: '場', pile: '山札', hand: '手札' }[op.zone]}に ${getCard(op.id).name} が加わった`);
    }
    next();
  },
  discardPick(g, ctx, op, next) {
    const pl = g.s.players[ctx.p];
    const one = (k) => {
      if (k <= 0 || !pl.hand.length || g.over()) return next();
      g.ask(ctx.p, { kind: 'pick', text: `${ctx.card.name}: 墓地に送る【自分の手札】を選んでください`, choices: pl.hand.map((c) => ({ value: c.uid, label: g.cname(c), cardId: c.id, owner: ctx.p })) }, (v) => {
        const [c] = pl.hand.splice(pl.hand.findIndex((x) => x.uid === v), 1); pl.grave.push(c);
        g.log(`${g.name(ctx.p)}: ${g.cname(c)} を墓地に送った`); one(k - 1);
      });
    };
    one(op.n || 1);
  },
  lookPick(g, ctx, op, next) {
    const pl = g.s.players[ctx.p], top = pl.pile.slice(-op.n);
    if (!top.length) return next();
    g.ask(ctx.p, { kind: 'pick', text: `${ctx.card.name}: 手札に加えるカードを選んでください (自分の山札の上${top.length}枚)`, choices: top.map((c) => ({ value: c.uid, label: g.cname(c), cardId: c.id, owner: ctx.p })) }, (v) => {
      const [c] = pl.pile.splice(pl.pile.findIndex((x) => x.uid === v), 1); pl.hand.push(c); g.shuffle(pl.pile);
      g.log(`${g.name(ctx.p)} は山札から1枚を手札に加え、山札をシャッフルした`); next();
    });
  },
  flag(g, ctx, op, next) { if (op.song) g.s.song.sflags[op.flag] = true; else g.flags(ctx.p)[op.flag] = true; next(); },
  extraRolls(g, ctx, op, next) { for (const q of g.who(ctx, op.who || 'self')) g.flags(q).extra += op.n; next(); },
  doubleRolls(g, ctx, op, next) { g.flags(ctx.p).mult *= 2; next(); },
  rerollRight(g, ctx, op, next) { g.flags(ctx.p).rerolls += op.n; next(); },
  negateLabel(g, ctx, op, next) {
    const list = g.s.song.score[ctx.p], back = list.filter((e) => e.label === op.label).reduce((a, e) => a + e.v, 0);
    g.s.song.score[ctx.p] = list.filter((e) => e.label !== op.label);
    g.flags(ctx.p).immune[op.label] = true;
    g.log(`${g.name(ctx.p)}: 「${op.label}」を無効化${back ? ` (${back > 0 ? '+' : ''}${-back}戻る)` : ''}`);
    next();
  },
  addTendency(g, ctx, op, next) { const t = g.s.players[ctx.p].tendencies; if (!t.includes(op.t)) t.push(op.t); g.log(`${g.name(ctx.p)} の得意傾向に ${op.t} が加わった`); next(); },
  keepOnField(g, ctx, op, next) { ctx.keep = true; next(); },
  sendOthersToGrave(g, ctx, op, next) {
    for (const q of g.who(ctx, op.who)) for (const i of charasOf(g, q)) if (g.card(i).name !== op.except) toGrave(g, q, i);
    next();
  },
  sendTagToGrave(g, ctx, op, next) {
    for (const q of side(g, ctx.p, op.who)) for (const i of charasOf(g, q)) if (hasTag(g, getCard(i.id), op.tag)) toGrave(g, q, i);
    next();
  },
  replaceAllChara(g, ctx, op, next) {
    for (const q of alive(g)) {
      const had = charasOf(g, q);
      for (const i of had) { toGrave(g, q, i); g.s.players[q].field.push({ uid: g.uidN++, id: op.id, faceDown: false }); }
    }
    next();
  },
  doppelganger(g, ctx, op, next) {
    const all = alive(g).flatMap((q) => charasOf(g, q).map((i) => ({ q, i, words: getCard(i.id).name.toLowerCase().split(/[\s・]+/).filter((w) => w.length >= 2) })));
    const hit = all.filter((a) => all.some((b) => b !== a && a.words.some((w) => b.words.includes(w))));
    for (const h of hit) toGrave(g, h.q, h.i);
    if (!hit.length) g.log('同じ名前を含むキャラはいなかった');
    next();
  },
  morph(g, ctx, op, next) { g.s.song.task.inst.id = op.to; g.log(`楽曲が【${getCard(op.to).name}】に変化した`); next(); },
  triple(g, ctx, op, next) {
    const d = [g.die(), g.die(), g.die()];
    g.log(`${g.name(ctx.p)}: サイコロ3つ ${d.join(' ')}`);
    if (d[0] === d[1] && d[1] === d[2]) g.addScore(ctx.p, '777 ゾロ目', 21);
    if (d.includes(6) && !charasOf(g, ctx.p).some((i) => g.card(i).name === 'RoughSketch')) g.addScore(ctx.p, '666', -18);
    next();
  },
  breakcore(g, ctx, op, next) {
    const song = g.s.song, order = [song.chooser, ...alive(g).filter((q) => q !== song.chooser)];
    const one = (k) => {
      if (k >= order.length || g.over()) return next();
      const q = order[k], pl = g.s.players[q];
      g.shuffle(pl.pile);
      const inst = pl.pile.pop();
      if (!inst) return one(k + 1);
      const card = getCard(inst.id);
      g.log(`${g.name(q)} の山札の一番上: ${card.name}`);
      if (card.type === 'chara') { pl.field.push({ uid: inst.uid, id: inst.id, faceDown: false }); return one(k + 1); }
      const ef = (card.effects || []).find((e) => e.when === 'play');
      const c2 = { p: q, inst, card };
      if (!ef) { pl.grave.push(inst); return one(k + 1); }
      g.runOps(c2, ef.ops, () => { if (c2.keep) pl.field.push({ uid: inst.uid, id: inst.id, faceDown: false, notChara: true }); else pl.grave.push(inst); one(k + 1); });
    };
    one(0);
  },
  deathPit(g, ctx, op, next) {
    const order = alive(g);
    const one = (k) => {
      if (k >= order.length || g.over()) return next();
      const q = order[k], mine = charasOf(g, q);
      if (!mine.length) return one(k + 1);
      g.ask(q, { kind: 'pick', text: `${ctx.card.name}: 墓地に送る【自分のキャラ】を選んでください`, choices: mine.map((i) => ({ value: i.uid, label: g.cname(i), cardId: i.id, owner: q })) }, (v) => { toGrave(g, q, mine.find((i) => i.uid === v)); one(k + 1); });
    };
    one(0);
  },
  revive(g, ctx, op, next) {
    const pl = g.s.players[ctx.p], pool = pl.grave.filter((c) => { const cd = getCard(c.id); return cd.type === 'chara' && !cd.token; });
    if (pool.length) { const c = pickOne(pool); pl.grave.splice(pl.grave.findIndex((x) => x.uid === c.uid), 1); pl.hand.push(c); g.log(`${g.name(ctx.p)}: 墓地から ${g.cname(c)} が手札に戻った`); }
    next();
  },
  yoshitaka(g, ctx, op, next) {
    ctx.inst.uses = (ctx.inst.uses || 0) + 1;
    if (ctx.inst.uses >= 3) { g.log(`${ctx.card.name}: 3回目 — スコア無効、墓地へ`); toGrave(g, ctx.p, ctx.inst); }
    else g.addScore(ctx.p, ctx.card.name, 2);
    next();
  },
  aether(g, ctx, op, next) {
    const pl = g.s.players[ctx.p], count = (tag) => charasOf(g, ctx.p).filter((i) => hasTag(g, getCard(i.id), tag)).length;
    const opts = [];
    if (pl.machines.includes('chunithm')) opts.push(['Celestial', count('chunithm')]);
    if (pl.machines.includes('arcaea')) opts.push(['Astral', count('arcaea')]);
    if (opts.length) { const [nm, n] = opts.sort((a, b) => b[1] - a[1])[0]; g.addScore(ctx.p, `Aether Crest:${nm}`, n); }
    if (pl.hand.some((c) => ['光', 'セイネ・シュリル'].includes(g.cname(c)))) g.addScore(ctx.p, 'Aether Crest 手札ボーナス', 3);
    next();
  },
  // 削除ビーム: any chara on the field, or the top card of either player's deck -> grave
  beam(g, ctx, op, next) {
    const choices = [];
    for (const q of alive(g)) for (const i of g.s.players[q].field) if (getCard(i.id).type === 'chara') choices.push({ value: i.uid, label: `${i.faceDown ? '(裏) ' : ''}${g.cname(i)}`, cardId: i.id, owner: q });
    for (const q of alive(g)) if (g.s.players[q].pile.length) choices.push({ value: `pile${q}`, label: `${q === ctx.p ? 'あなた' : g.name(q)}の山札の一番上のカード`, pile: true, owner: q });
    if (!choices.length) return next();
    g.ask(ctx.p, { kind: 'pick', text: `${ctx.card.name}: 墓地に置くものを選んでください`, choices }, (v) => {
      if (String(v).startsWith('pile')) { const q = +String(v).slice(4), c = g.s.players[q].pile.pop(); g.s.players[q].grave.push(c); g.log(`${g.name(q)} の山札の一番上 (${g.cname(c)}) が墓地に置かれた`); }
      else for (const q of alive(g)) { const i = g.s.players[q].field.find((x) => x.uid === v); if (i) toGrave(g, q, i); }
      next();
    });
  },
  // もぺもぺ: you may put your own chara in the grave; if you did, the opponent does too (if able)
  sacrifice(g, ctx, op, next) {
    const order = [ctx.p, ...g.opps(ctx.p)];
    const one = (k) => {
      if (k >= order.length || g.over()) return next();
      const q = order[k], mine = g.s.players[q].field.filter((i) => getCard(i.id).type === 'chara' && !i.notChara);
      if (!mine.length) { if (k === 0) g.log(`${g.name(q)} は墓地に置けるキャラがいない`); return k === 0 ? next() : one(k + 1); }
      g.ask(q, { kind: 'pick', text: `${ctx.card.name}: 墓地に置く【自分のキャラ】を選んでください`, optional: k === 0, skipLabel: 'やめる', choices: mine.map((i) => ({ value: i.uid, label: g.cname(i), cardId: i.id, owner: q })) }, (v) => {
        if (v == null) return next();
        toGrave(g, q, mine.find((i) => i.uid === v)); one(k + 1);
      });
    };
    one(0);
  },
  lifeSyndrome(g, ctx, op, next) {
    const pl = g.s.players[ctx.p];
    const choices = pl.hand.map((c) => ({ value: c.uid, label: g.cname(c), cardId: c.id }));
    if (pl.pile.length) choices.push({ value: 'deck', label: '山札の一番上のカードを墓地に置く' });
    if (!choices.length) return next();
    g.ask(ctx.p, { kind: 'pick', text: `${ctx.card.name}: 手札を1枚墓地に置く、または山札の一番上を墓地に置く`, choices }, (v) => {
      if (v === 'deck') { const c = pl.pile.pop(); pl.grave.push(c); g.log(`${g.name(ctx.p)}: 山札の上の ${g.cname(c)} を墓地に置いた`); }
      else { const [c] = pl.hand.splice(pl.hand.findIndex((x) => x.uid === v), 1); pl.grave.push(c); g.log(`${g.name(ctx.p)}: ${g.cname(c)} を墓地に置いた`); }
      next();
    });
  },
});


/* ============================================================ skill locks (game + view versions) */
function lockReason(fields, taskId, taskMachines, p, card) {
  if (card.type !== 'skill') return null;
  if (fields[p].includes('karameru')) return 'からめるが場にいる間、スキルカードは使えません';
  if (fields.some((f) => f.includes('nuinui-grace')) && !taskMachines.includes('sdvx')) return 'ぬいぬいグレイスが場にいる間、SDVX以外の課題曲ではスキルカードを使えません';
  if (taskId === 'kita-saitama2000' && !arr(card.tags).includes('taiko')) return 'この課題曲の間は〈太鼓の達人〉カード以外のスキルカードを使えません';
  return null;
}
export function skillLockReason(g, p, card) {
  const T = taskCard(g);
  return lockReason(g.s.players.map((pl) => pl.field.filter((i) => !i.faceDown).map((i) => i.id)), T.id, machinesOf(T), p, card);
}
export function skillLockedView(view, me, card) {
  if (!view.song) return null;
  const T = getCard(view.song.taskId);
  return lockReason(view.players.map((pl) => pl.field.filter((i) => !i.faceDown && i.id).map((i) => i.id)), T.id, machinesOf(T), me, card);
}

/* ======================================================== operations for the slide cards */
const rollN = (g, n) => Array.from({ length: n }, () => g.die());
const seqAsk = (g, list, make, done) => { const one = (k) => { if (k >= list.length || g.over()) return done(); make(list[k], () => one(k + 1)); }; one(0); };

Object.assign(OPS, {
  // 対立: the opponent's die showed op.min or more -> the roller loses points
  penalizeRoller(g, ctx, op, next) { if (ctx.roll >= op.min) g.addScore(ctx.roller, ctx.card.name, op.n); next(); },
  leaderPenalty(g, ctx, op, next) {
    const ps = alive(g), best = Math.max(...ps.map((i) => g.total(i))), top = ps.filter((i) => g.total(i) === best);
    if (top.length === 1) g.addScore(top[0], ctx.card.name, op.n);
    next();
  },
  scoreCountEach(g, ctx, op, next) {
    for (const q of alive(g)) {
      let n = 0;
      for (const i of charasOf(g, q)) { const cd = getCard(i.id); if ((op.tag && hasTag(g, cd, op.tag)) || (op.nameIncludes && cd.name.includes(op.nameIncludes))) n++; }
      if (n) g.addScore(q, `${ctx.card.name} (×${n})`, n * (op.per || 1));
    }
    next();
  },
  scoreByFieldName(g, ctx, op, next) {
    const n = g.s.players[ctx.p].field.filter((i) => !i.faceDown && g.cname(i).includes(op.text)).length;
    if (n) g.addScore(ctx.p, `${ctx.card.name} (×${n})`, n);
    next();
  },
  scoreIfLackFav(g, ctx, op, next) { for (const q of alive(g)) if (!g.tendenciesOf(q).includes(op.t)) g.addScore(q, `${ctx.card.name} (${op.t}なし)`, op.n); next(); },
  scoreIfLackField(g, ctx, op, next) { for (const q of alive(g)) if (!charasOf(g, q).some((i) => hasTag(g, getCard(i.id), op.tag))) g.addScore(q, ctx.card.name, op.n); next(); },
  scoreIfFieldHas(g, ctx, op, next) { for (const q of alive(g)) if (charasOf(g, q).some((i) => g.cname(i) === op.name)) g.addScore(q, ctx.card.name, op.n); next(); },
  scoreWon(g, ctx, op, next) {
    const won = g.s.players[ctx.p].won.map((c) => arr(getCard(c.id).tendency));
    const inc = won.filter((t) => t.some((x) => (op.inc || []).includes(x))).length;
    const dec = won.filter((t) => t.some((x) => (op.dec || []).includes(x))).length;
    if (inc) g.addScore(ctx.p, `${ctx.card.name} (+${inc}曲)`, inc * (op.per || 1));
    if (dec) g.addScore(ctx.p, `${ctx.card.name} (−${dec}曲)`, dec * (op.decPer || -1));
    next();
  },
  tempTendency(g, ctx, op, next) { const f = g.flags(ctx.p); for (const t of op.t) if (!f.tempTend.includes(t)) f.tempTend.push(t); g.log(`${g.name(ctx.p)} は得意傾向に ${op.t.join('/')} を一時的に追加`); next(); },
  blockTendency(g, ctx, op, next) {
    for (const q of g.opps(ctx.p)) { const f = g.flags(q); if (!f.blocked.includes(op.t)) f.blocked.push(op.t); }
    g.log(`相手の得意傾向 ${op.t} を打ち消した`); next();
  },
  dieEvenTendency(g, ctx, op, next) {
    const d = g.die(); g.log(`${g.name(ctx.p)}: 出目 ${d}`);
    if (d % 2 === 0) { const f = g.flags(ctx.p); if (!f.tempTend.includes(op.t)) f.tempTend.push(op.t); g.s.players[ctx.p].tendencies.includes(op.t) || g.s.players[ctx.p].tendencies.push(op.t); g.log(`偶数！ 得意傾向に ${op.t} も追加`); }
    next();
  },
  drawIfFav(g, ctx, op, next) { for (const q of alive(g)) if (g.tendenciesOf(q).some((t) => op.tends.includes(t))) { if (!g.draw(q, 1)) return; } next(); },
  addTaskMachine(g, ctx, op, next) { (g.s.song.sflags.addMachines ||= []).push(op.id); g.log(`この楽曲の収録機種に ${op.id} が加わった`); next(); },
  drawByCount(g, ctx, op, next) { for (const q of alive(g)) { const n = charasOf(g, q).filter((i) => hasTag(g, getCard(i.id), op.tag)).length; if (n && !g.draw(q, n)) return; } next(); },
  drawByName(g, ctx, op, next) { for (const q of alive(g)) { const n = g.s.players[q].field.filter((i) => !i.faceDown && g.cname(i).includes(op.text)).length; if (n && !g.draw(q, n)) return; } next(); },
  chartToTop(g, ctx, op, next) {
    const pile = g.s.players[ctx.p].charts, i = pile.findIndex((c) => c.id === op.id);
    if (i >= 0) { const [c] = pile.splice(i, 1); g.shuffle(pile); pile.push(c); g.log(`${g.name(ctx.p)} は譜面山札の一番上に ${g.cname(c)} を置いて切った`); }
    next();
  },
  clearFields(g, ctx, op, next) { for (const q of alive(g)) for (const i of [...g.s.players[q].field]) toGrave(g, q, i); next(); },
  peekTop(g, ctx, op, next) {
    seqAsk(g, alive(g), (q, again) => {
      const top = g.s.players[q].pile.slice(-op.n).reverse();
      if (!top.length) return again();
      g.ask(q, { kind: 'pick', text: `${ctx.card.name}: 自分の山札の上${top.length}枚を確認 (どれを選んでも何も起きません)`, optional: true, skipLabel: '確認した', choices: top.map((c) => ({ value: c.uid, label: g.cname(c), cardId: c.id, owner: q })) }, () => again());
    }, next);
  },
  returnHandForScore(g, ctx, op, next) {
    seqAsk(g, alive(g), (q, again) => {
      const pl = g.s.players[q], max = Math.min(pl.hand.length, 6);
      if (!max) return again();
      const choices = Array.from({ length: max + 1 }, (_, n) => ({ value: n, label: `${n}枚` }));
      g.ask(q, { kind: 'pick', text: `${ctx.card.name}: 手札を何枚山札に戻しますか？ (戻した枚数×1点)`, choices }, (n) => {
        for (let k = 0; k < n; k++) { const [c] = pl.hand.splice(g.rand(pl.hand.length), 1); pl.pile.push(c); }
        if (n) { g.shuffle(pl.pile); g.addScore(q, `${ctx.card.name} (${n}枚)`, n); g.log(`${g.name(q)} は手札${n}枚を山札に戻した`); }
        again();
      });
    }, next);
  },
  fieldPenalty(g, ctx, op, next) {
    for (const q of alive(g)) {
      const lost = g.s.players[q].field.length;
      if (lost) g.addScore(q, `${ctx.card.name} (場${lost}枚)`, -lost);
      if (lost >= op.loseAt) { g.lose(q, `${ctx.card.name} (場のカード${lost}枚)`); if (g.over()) return; }
    }
    next();
  },
  randomDice(g, ctx, op, next) {
    for (const q of alive(g)) { const d = rollN(g, op.rolls), sum = d.reduce((a, b) => a + b, 0), pts = Math.round(sum * op.mult); g.log(`${g.name(q)}: ${d.join(' ')} → 合計${sum} → +${pts}`); g.addScore(q, ctx.card.name, pts); }
    next();
  },
  angelExile(g, ctx, op, next) {
    const p = ctx.p, d = rollN(g, 5), ones = d.filter((x) => x === 1).length, sum = d.reduce((a, b) => a + b, 0), others = g.opps(p);
    g.log(`${g.name(p)}: ${d.join(' ')} (合計${sum})`);
    if (ones >= 5) { for (const o of others) g.addScore(o, `${ctx.card.name}(追放成立)`, -g.total(o)); }
    else if (ones === 4) { for (const o of others) { g.addScore(o, ctx.card.name, -1); g.addScore(p, ctx.card.name, 1); } }
    else if (sum % 2 === 1) g.addScore(p, ctx.card.name, 1);
    else if (others.length) { const low = others.reduce((a, b) => (g.total(b) < g.total(a) ? b : a)); g.addScore(low, ctx.card.name, 2); }
    next();
  },
  devilBirth(g, ctx, op, next) {
    const d = rollN(g, 5), S = d.reduce((a, b) => a + b, 0);
    g.log(`${g.name(ctx.p)}: ${d.join(' ')} (合計${S})`);
    if (S >= 30) { for (const q of alive(g)) if (g.total(q) % 3 === 0) { g.addScore(q, `${ctx.card.name}(脱落)`, -g.total(q)); g.log(`${g.name(q)} は脱落`); } }
    else if (S >= 25) { for (const q of alive(g)) if (g.total(q) % 2 === 0) g.addScore(q, ctx.card.name, -2); }
    else {
      for (const q of alive(g)) {
        const list = g.s.song.score[q], cand = list.filter((e) => e.v > 0 && !e.label.startsWith('サイコロ'));
        if (cand.length) { const big = cand.reduce((a, b) => (b.v > a.v ? b : a)); list.splice(list.indexOf(big), 1); g.log(`${g.name(q)} の加算「${big.label}」が無効になった`); }
      }
    }
    next();
  },
  witchHunt(g, ctx, op, next) {
    const p = ctx.p, d = g.die(), ps = alive(g), tot = (i) => g.total(i);
    const top = ps.reduce((a, b) => (tot(b) > tot(a) ? b : a)), low = ps.reduce((a, b) => (tot(b) < tot(a) ? b : a));
    g.log(`${g.name(p)}: 出目 ${d}`);
    if (d % 2 === 1) { if (top !== p) { g.addScore(top, ctx.card.name, -1); g.addScore(p, ctx.card.name, 1); } }
    else if (top !== low) { g.addScore(top, ctx.card.name, -2); g.addScore(low, ctx.card.name, 2); }
    for (const q of ps) {
      const pl = g.s.players[q];
      if ([...pl.hand, ...pl.field].some((c) => ['sakujo', 'sakujo-beam'].includes(c.id))) g.addScore(q, `${ctx.card.name}(削除関係)`, -1);
    }
    next();
  },
  slotRoll(g, ctx, op, next) {
    const p = ctx.p, T = taskCard(g);
    if (arr(T?.composer).includes('Rough Sketch')) { g.addScore(p, ctx.card.name, 7); return next(); }
    const n = 3 - charasOf(g, p).filter((i) => ['slot-center', 'slot-right'].includes(i.id)).length;
    if (n <= 1) { g.log(`${g.name(p)}: リールが揃った！`); g.addScore(p, ctx.card.name, 7); return next(); }
    const d = rollN(g, n); g.log(`${g.name(p)}: スロット ${d.join(' ')}`);
    if (d.every((x) => x === d[0])) g.addScore(p, `${ctx.card.name} (ゾロ目)`, 7);
    next();
  },
  narukaSwap(g, ctx, op, next) {
    const p = ctx.p, o = g.opps(p)[0], a = g.total(p), b = g.total(o);
    if (a > b) { g.addScore(p, ctx.card.name, Math.floor(a * 0.5)); g.log(`${g.name(p)} のスコアが1.5倍になった`); }
    else { const L = g.s.song.score; [L[p], L[o]] = [L[o], L[p]]; g.log('スコアを入れ替えた！'); }
    next();
  },
  sopinPenalty(g, ctx, op, next) {
    const ps = alive(g);
    for (const q of ps) if (ps.some((o) => o !== q && g.total(q) - g.total(o) >= 5)) g.addScore(q, ctx.card.name, -2);
    next();
  },
  skipTurn(g, ctx, op, next) {
    const pl = g.s.players[ctx.p];
    if (!pl.charts.length) return next();
    const c = pl.charts.pop(); pl.grave.push(c);
    g.s.song.skipNow = true;
    g.log(`${g.name(ctx.p)} は課題曲カード ${g.cname(c)} を捨ててこのターンをスキップした`);
    next();
  },
});
