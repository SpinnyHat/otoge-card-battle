// Room host: owns the seats, the lobby and the Game. Runs in the host player's browser.
// Remote guests and the local UI all talk to it through the same handle(seat, msg) entry point.
import { Game, viewFor, validateDeck, RULES } from './engine.js';
import { STARTER_DECKS } from './cards.js';
import { botAct } from './ai.js';

export class Host {
  constructor({ max = 2 } = {}) {
    this.max = max;
    this.seats = [];       // {name, kind:'local'|'remote'|'bot', send, deck, ready, token, connected}
    this.game = null;
    this.botTimer = null;
    this.settings = { maxPlays: RULES.maxPlaysPerTurn, turns: RULES.turnsPerSong, timer: RULES.turnTimeLimit };   // timer: seconds, 0 = off
    this.deadlines = {};
    this.tmr = null;
    this.botDelay = null; // ms; null = human-like random delay
  }

  addSeat(seat) {
    if (this.game) return -1;
    if (this.seats.length >= this.max) return -1;
    this.seats.push({ ready: false, deck: null, connected: true, ...seat });
    this.lobby();
    return this.seats.length - 1;
  }
  addBot({ deck, level = 'normal' } = {}) {
    const d = deck || STARTER_DECKS[Math.floor(Math.random() * STARTER_DECKS.length)];
    const tag = { easy: 'かんたん', normal: 'ふつう', hard: 'つよい' }[level];
    return this.addSeat({ name: `CPU(${tag})`, kind: 'bot', level, send() {}, deck: structuredClone(d), ready: true });
  }
  seatByToken(token) { return this.seats.findIndex((s) => s.token && s.token === token); }
  reconnect(idx, send) { const s = this.seats[idx]; s.send = send; s.connected = true; this.game ? this.push() : this.lobby(); }
  disconnect(idx) {
    const s = this.seats[idx]; if (!s) return;
    s.connected = false;
    if (!this.game) { this.seats.splice(idx, 1); }
    this.game ? this.push() : this.lobby();
  }

  lobby() {
    const seats = this.seats.map((s) => ({ name: s.name, kind: s.kind, ready: s.ready, deck: s.deck?.name || null, connected: s.connected }));
    this.seats.forEach((s, i) => s.send({ t: 'lobby', seats, you: i, max: this.max, settings: this.settings }));
  }
  push() {
    if (!this.game) return;
    const connected = this.seats.map((s) => s.connected);
    const timer = this.syncTimer();
    this.seats.forEach((s, i) => s.send({ t: 'view', view: { ...viewFor(this.game, i), connected, names: this.seats.map((x) => x.name), timer } }));
    this.scheduleBots();
  }

  handle(i, m) {
    const s = this.seats[i]; if (!s) return;
    switch (m.t) {
      case 'rename': s.name = String(m.name || '').trim().slice(0, 20) || s.name; return this.game ? null : this.lobby();
      case 'deck': {
        if (this.game) return;
        const v = validateDeck(m.deck);
        if (!v.ok) return s.send({ t: 'err', msg: 'デッキが無効: ' + v.errors[0] });
        s.deck = m.deck; s.ready = false; return this.lobby();
      }
      case 'settings': {
        if (i !== 0 || this.game) return;
        const n = Number(m.maxPlays ?? this.settings.maxPlays), t = Number(m.turns ?? this.settings.turns), tm = Number(m.timer ?? this.settings.timer);
        if (Number.isInteger(n) && n >= 0 && n <= 9 && Number.isInteger(t) && t >= 1 && t <= 4 && tm >= 0 && tm <= 300) { this.settings.maxPlays = n; this.settings.turns = t; this.settings.timer = tm; for (const x of this.seats) if (x.kind !== 'bot') x.ready = false; this.lobby(); }
        return;
      }
      case 'ready': if (this.game || !s.deck) return; s.ready = !!m.ready; return this.lobby();
      case 'start': {
        if (i !== 0 || this.game) return;
        if (this.seats.length < 2 || !this.seats.every((x) => x.ready && x.connected)) return s.send({ t: 'err', msg: '全員の準備が必要です' });
        this.deadlines = {};
        this.game = new Game(this.seats.map((x) => x.deck), this.seats.map((x) => x.name), { ...RULES, maxPlaysPerTurn: this.settings.maxPlays, turnsPerSong: this.settings.turns });
        return this.push();
      }
      case 'act': {
        if (!this.game) return;
        const r = this.game.act(i, m.a);
        if (!r.ok) s.send({ t: 'err', msg: r.err });
        return this.push();
      }
      case 'toLobby': {
        if (i !== 0 || !this.game || this.game.s.phase !== 'over') return;
        this.game = null; this.deadlines = {}; clearTimeout(this.tmr); this.seats.forEach((x) => { if (x.kind !== 'bot') x.ready = false; });
        this.seats = this.seats.filter((x) => x.connected);
        return this.lobby();
      }
    }
  }

  /* ---- turn timer (host-enforced) ----------------------------------------------------------
     Who is "on the clock" right now:  a pending choice pop-up > the opening roll-off > the card phase of a turn > the post-song draw choice.
     Each situation gets a deadline once (keyed), so playing cards does not restart the clock. Bots are never timed. */
  clockInfo() {
    const g = this.game, T = this.settings.timer;
    if (!g || T <= 0 || g.s.phase === 'over') return null;
    const s = g.s, human = (i) => this.seats[i] && this.seats[i].kind !== 'bot' && !s.players[i].out;
    if (s.prompt) return human(s.prompt.player) ? { kind: 'prompt', players: [s.prompt.player], secs: Math.min(30, T), key: `prompt|${s.promptN}` } : null;
    if (s.phase === 'rolloff') { const pl = s.players.map((x, i) => i).filter((i) => s.players[i].rolled == null && human(i)); return pl.length ? { kind: 'roll', players: pl, secs: Math.min(20, T), key: `roll|${s.log.length}` } : null; }
    if (s.phase === 'song' && s.stage === 'main') return human(s.cur) ? { kind: 'turn', players: [s.cur], secs: T, key: `turn|${s.songNo}|${s.song.pass}|${s.cur}` } : null;
    if (s.phase === 'draw') { const pl = s.players.map((x, i) => i).filter((i) => s.drawAns[i] == null && human(i)); return pl.length ? { kind: 'draw', players: pl, secs: Math.min(30, T), key: `draw|${s.songNo}` } : null; }
    return null;
  }
  syncTimer() {
    clearTimeout(this.tmr); this.tmr = null;
    const c = this.clockInfo();
    if (!c) return null;
    if (this.deadlines[c.key] == null) this.deadlines[c.key] = Date.now() + c.secs * 1000;
    const wait = Math.max(0, this.deadlines[c.key] - Date.now());
    this.tmr = setTimeout(() => this.expire(), wait + 30);
    return { kind: c.kind, players: c.players, left: Math.max(0, Math.round(wait / 1000)), total: c.secs };
  }
  expire() {
    const g = this.game, c = this.clockInfo();
    if (!g || !c || Date.now() < this.deadlines[c.key] - 5) return this.push();
    const nm = (i) => g.name(i);
    if (c.kind === 'turn') { g.log(`⏱ ${nm(c.players[0])} は時間切れ — 自動でサイコロを振る`); g.act(c.players[0], { t: 'end' }); }
    else if (c.kind === 'roll') { for (const i of c.players) { g.log(`⏱ ${nm(i)} は時間切れ — 自動で振る`); g.act(i, { t: 'roll' }); } }
    else if (c.kind === 'draw') { for (const i of c.players) { g.log(`⏱ ${nm(i)} は時間切れ — 1枚引く`); g.act(i, { t: 'draw', n: Math.min(1, g.R.postSongDraw) }); } }
    else if (c.kind === 'prompt') {
      const pr = g.s.prompt, v = pr.optional ? null : pr.choices[Math.floor(Math.random() * pr.choices.length)].value;
      g.log(`⏱ ${nm(pr.player)} は時間切れ — 自動で選択`); g.act(pr.player, { t: 'answer', v });
    }
    for (const k of Object.keys(this.deadlines)) if (k !== c.key && !k.startsWith('turn|')) delete this.deadlines[k];
    this.push();
  }

  scheduleBots() {
    clearTimeout(this.botTimer);
    if (!this.game || this.game.s.phase === 'over') return;
    const bi = this.seats.findIndex((s, i) => s.kind === 'bot' && botAct(viewFor(this.game, i), s.level));
    if (bi < 0) return;
    this.botTimer = setTimeout(() => {
      if (!this.game) return;
      const a = botAct(viewFor(this.game, bi), this.seats[bi].level);
      if (a) this.game.act(bi, a);
      this.push();
    }, this.botDelay ?? 650 + Math.random() * 500);
  }
  stop() { clearTimeout(this.botTimer); clearTimeout(this.tmr); }
}

// The UI talks to a "client": send(msg) and onmsg(cb). Local = host's own seat 0.
export function localClient(host, name) {
  const c = { onmsg: () => {}, onclose: () => {}, send: (m) => host.handle(0, m), close: () => host.stop() };
  host.addSeat({ name, kind: 'local', send: (m) => queueMicrotask(() => c.onmsg(m)) });
  return c;
}
