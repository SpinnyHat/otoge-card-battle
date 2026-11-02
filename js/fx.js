// Sound + visual effects. Sounds are synthesized with WebAudio (no audio files, nothing to license).
// Overlays live in #fxlayer (outside #app) so they survive the full re-render the UI does on every state change.
import { cardEl } from './card.js';
import { CARDS } from './cards.js';

/* ================================================================== sound */
const pref = (() => { try { return { vol: 0.6, mute: false, ...JSON.parse(localStorage.getItem('rcb.sound')) }; } catch { return { vol: 0.6, mute: false }; } })();
const savePref = () => localStorage.setItem('rcb.sound', JSON.stringify(pref));
let ctx = null, master = null, noiseBuf = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C(); master = ctx.createGain(); master.gain.value = pref.mute ? 0 : pref.vol; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// browsers only allow audio after a user gesture
['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, () => ac(), { passive: true }));

export const sound = {
  get vol() { return pref.vol; }, get mute() { return pref.mute; },
  setVol(v) { pref.vol = v; if (master) master.gain.value = pref.mute ? 0 : v; savePref(); },
  setMute(m) { pref.mute = m; if (master) master.gain.value = m ? 0 : pref.vol; savePref(); },
};

function tone(f, o = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + (o.at || 0), dur = o.dur || 0.12;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master); osc.start(t); osc.stop(t + dur + 0.03);
}
function noise(o = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + (o.at || 0), dur = o.dur || 0.15;
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q || 1;
  f.frequency.setValueAtTime(o.f0 || 1000, t);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master); src.start(t, Math.random()); src.stop(t + dur + 0.03);
}
const arp = (notes, step, o = {}) => notes.forEach((n, i) => tone(n, { at: i * step, ...o }));

const SFX = {
  tick: () => { tone(1500, { dur: 0.05, vol: 0.12, type: 'square' }); },
  click: () => tone(1200, { dur: 0.03, vol: 0.05, type: 'triangle' }),
  hover: () => tone(1900, { dur: 0.025, vol: 0.035, type: 'triangle' }),
  select: () => { tone(660, { dur: 0.08, vol: 0.12, type: 'triangle' }); tone(990, { at: 0.05, dur: 0.1, vol: 0.1, type: 'triangle' }); },
  deselect: () => tone(480, { dur: 0.07, vol: 0.08, type: 'triangle' }),
  draw: () => noise({ dur: 0.09, f0: 3500, f1: 7000, filter: 'highpass', vol: 0.18 }),
  playChara: () => { noise({ dur: 0.2, f0: 400, f1: 70, filter: 'lowpass', vol: 0.6 }); tone(110, { dur: 0.3, slide: 0.45, vol: 0.4 }); arp([660, 880, 1320], 0.06, { at: 0.1, dur: 0.25, type: 'triangle', vol: 0.09 }); },
  playSkill: () => { noise({ dur: 0.4, f0: 300, f1: 4200, q: 2.5, vol: 0.28 }); tone(440, { at: 0.18, dur: 0.25, slide: 2.4, type: 'sawtooth', vol: 0.07 }); tone(1760, { at: 0.35, dur: 0.15, type: 'triangle', vol: 0.08 }); },
  discard: () => { noise({ dur: 0.18, f0: 1500, f1: 200, filter: 'lowpass', vol: 0.3 }); tone(180, { dur: 0.15, slide: 0.5, type: 'square', vol: 0.05 }); },
  steal: () => noise({ dur: 0.35, f0: 6000, f1: 400, q: 3, vol: 0.25 }),
  diceRoll: () => { for (let i = 0; i < 10; i++) { const t = i * 0.07 + Math.random() * 0.02; noise({ at: t, dur: 0.035, f0: 1800 + Math.random() * 2500, q: 4, vol: 0.28 }); tone(300 + Math.random() * 400, { at: t, dur: 0.03, type: 'square', vol: 0.03 }); } },
  diceLand: () => { tone(130, { dur: 0.25, slide: 0.5, vol: 0.5 }); noise({ dur: 0.12, f0: 900, f1: 120, filter: 'lowpass', vol: 0.5 }); },
  scoreUp: () => arp([523, 659, 784], 0.055, { dur: 0.14, type: 'triangle', vol: 0.13 }),
  scoreDown: () => { tone(260, { dur: 0.3, slide: 0.45, type: 'sawtooth', vol: 0.11 }); },
  yourTurn: () => { tone(784, { dur: 0.14, type: 'triangle', vol: 0.18 }); tone(1175, { at: 0.11, dur: 0.35, type: 'triangle', vol: 0.18 }); tone(1568, { at: 0.11, dur: 0.35, type: 'sine', vol: 0.05 }); },
  oppTurn: () => { tone(330, { dur: 0.12, type: 'triangle', vol: 0.1 }); tone(247, { at: 0.1, dur: 0.2, type: 'triangle', vol: 0.1 }); },
  songStart: () => { tone(98, { dur: 0.7, slide: 1.6, type: 'sawtooth', vol: 0.1, attack: 0.2 }); noise({ dur: 0.7, f0: 200, f1: 3000, q: 1.5, vol: 0.14, attack: 0.4 }); tone(660, { at: 0.65, dur: 0.3, type: 'triangle', vol: 0.12 }); },
  songWin: () => { arp([523, 659, 784, 1047], 0.085, { dur: 0.16, type: 'square', vol: 0.09 }); tone(1047, { at: 0.34, dur: 0.6, type: 'triangle', vol: 0.15 }); tone(1319, { at: 0.34, dur: 0.6, type: 'sine', vol: 0.08 }); },
  songLose: () => arp([392, 349, 311, 262], 0.14, { dur: 0.22, type: 'sawtooth', vol: 0.09 }),
  matchPoint: () => { tone(220, { dur: 0.9, slide: 2, type: 'sawtooth', vol: 0.09, attack: 0.3 }); noise({ dur: 0.9, f0: 300, f1: 5000, q: 2, vol: 0.14, attack: 0.5 }); tone(1480, { at: 0.85, dur: 0.25, type: 'square', vol: 0.07 }); },
  suddenDeath: () => { tone(65, { dur: 1.2, slide: 0.7, type: 'sawtooth', vol: 0.18 }); noise({ dur: 1, f0: 4000, f1: 200, q: 2, vol: 0.22 }); },
  heartbeat: () => { tone(62, { dur: 0.16, slide: 0.55, vol: 0.5 }); tone(55, { at: 0.2, dur: 0.18, slide: 0.55, vol: 0.32 }); },
  gameWin: () => { arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.11, { dur: 0.22, type: 'square', vol: 0.09 }); tone(1047, { at: 0.9, dur: 1.2, type: 'triangle', vol: 0.18 }); tone(1319, { at: 0.9, dur: 1.2, vol: 0.1 }); tone(1568, { at: 0.9, dur: 1.2, vol: 0.08 }); },
  gameLose: () => { arp([392, 330, 262, 196], 0.28, { dur: 0.5, type: 'sawtooth', vol: 0.1 }); },
  drumroll: () => { for (let i = 0; i < 18; i++) { const t = i * 0.07; noise({ at: t, dur: 0.06, f0: 700 + i * 70, f1: 250, filter: 'lowpass', vol: 0.1 + i * 0.012 }); tone(66 + i * 3, { at: t, dur: 0.07, vol: 0.14 + i * 0.01 }); } tone(1568, { at: 1.3, dur: 0.12, type: 'square', vol: 0.08 }); },
  prompt: () => { tone(740, { dur: 0.08, type: 'triangle', vol: 0.12 }); tone(988, { at: 0.08, dur: 0.14, type: 'triangle', vol: 0.12 }); },
  error: () => tone(150, { dur: 0.2, type: 'square', vol: 0.09 }),
};
export const play = (n, delay = 0) => { if (pref.mute) return; const f = SFX[n]; if (f) delay ? setTimeout(f, delay) : f(); };

let hbTimer = null;
export function heartbeat(on) {
  if (on && !hbTimer) hbTimer = setInterval(() => play('heartbeat'), 1150);
  if (!on && hbTimer) { clearInterval(hbTimer); hbTimer = null; }
}

/* ================================================================== visuals */
const layer = document.createElement('div'); layer.id = 'fxlayer'; document.body.append(layer);
const el = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const later = (fn, ms) => setTimeout(fn, ms);

export function shake(px = 7, ms = 380) {
  document.getElementById('app')?.animate(
    [0, 1, 2, 3, 4, 5].map((i) => ({ transform: `translate(${i % 2 ? -px : px}px,${i % 3 ? px / 2 : -px / 2}px)`, offset: i / 6 })).concat([{ transform: 'none', offset: 1 }]),
    { duration: ms, easing: 'ease-out' });
}
export function banner(main, sub, cls = '') {
  layer.querySelectorAll('.fx-banner').forEach((b) => b.remove());
  const b = el('fx-banner ' + cls, `<div class="bm">${esc(main)}</div>${sub ? `<div class="bs">${esc(sub)}</div>` : ''}`);
  layer.append(b); later(() => b.remove(), 1700);
}
export function reveal(cardId, who, fromTop) {
  layer.querySelectorAll('.fx-reveal').forEach((b) => b.remove());
  const r = el('fx-reveal ' + (fromTop ? 'from-top' : 'from-bottom'));
  r.append(el('rv-who', `${esc(who)} が使用`), cardEl(cardId, { size: 'reveal' }));
  layer.append(r); later(() => r.classList.add('out'), 1050); later(() => r.remove(), 1400);
}
const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export function diceOverlay(value, who, mine) {
  layer.querySelectorAll('.fx-dice').forEach((b) => b.remove());
  const d = el('fx-dice' + (mine ? ' mine' : ''));
  const face = el('face', FACE[1 + Math.floor(Math.random() * 6)]);
  d.append(face, el('dl', `${esc(who)} のサイコロ`));
  layer.append(d);
  play('diceRoll');
  let n = 0;
  const iv = setInterval(() => { face.textContent = FACE[1 + Math.floor(Math.random() * 6)]; if (++n > 9) clearInterval(iv); }, 70);
  later(() => { face.textContent = FACE[value] || value; d.classList.add('landed'); play('diceLand'); shake(5, 260); }, 760);
  later(() => d.classList.add('out'), 1700); later(() => d.remove(), 2050);
  return 800; // ms until the result is "known" (used to delay score sounds)
}
export function floatText(rect, text, good) {
  const f = el('fx-float ' + (good ? 'good' : 'bad'), esc(text));
  f.style.left = rect.left + rect.width / 2 + 'px'; f.style.top = rect.top + 10 + 'px';
  layer.append(f); later(() => f.remove(), 1100);
}

/* ============================================================ view differ */
const BY_NAME = Object.fromEntries(Object.values(CARDS).map((c) => [c.name, c]));

// Compare previous and new sanitized views: fire sounds / overlays, and tell the UI what to animate on the cards.
export const newRoll = (prev, v) => !!(prev && v.lastRoll && v.lastRoll.seq !== prev.lastRoll?.seq);
export function startDice(v) { const names = v.names || v.players.map((p) => p.name); return diceOverlay(v.lastRoll.v, names[v.lastRoll.p], v.lastRoll.p === v.you); }

// opts.skipDice: the dice animation was already played before this state was applied (see the view queue in ui.js)
export function onView(prev, v, opts = {}) {
  const out = { entering: [], floats: [] };
  const names = v.names || v.players.map((p) => p.name);
  const me = v.you;
  if (!prev) return out;

  let delay = 0;
  if (!opts.skipDice && newRoll(prev, v)) delay = diceOverlay(v.lastRoll.v, names[v.lastRoll.p], v.lastRoll.p === me);

  const n = Math.max(0, (v.logN || 0) - (prev.logN || 0));
  for (const l of n ? v.log.slice(-n) : []) {
    let m;
    if ((m = l.match(/^(.+) は (.+) を使った$/)) && BY_NAME[m[2]]) { reveal(BY_NAME[m[2]].id, m[1], m[1] !== names[me]); play('playSkill'); }
    else if ((m = l.match(/^(.+) は (.+) を場に出した$/)) && BY_NAME[m[2]]) { reveal(BY_NAME[m[2]].id, m[1], m[1] !== names[me]); play('playChara'); shake(4, 250); }
    else if (/枚引いた$/.test(l)) play('draw', 150);
    else if (/墓地に捨て/.test(l)) play('discard');
    else if (/奪った/.test(l)) play('steal');
  }

  // cards that just appeared (field = slam, own hand = draw-in)
  v.players.forEach((p, i) => {
    const before = new Set((prev.players[i].field || []).map((c) => c.uid));
    p.field.forEach((c) => { if (!before.has(c.uid)) out.entering.push({ uid: c.uid, kind: 'field' }); });
  });
  if (v.players[me].hand && prev.players[me].hand) {
    const before = new Set(prev.players[me].hand.map((c) => c.uid));
    v.players[me].hand.forEach((c) => { if (!before.has(c.uid)) out.entering.push({ uid: c.uid, kind: 'draw' }); });
  }

  // score changes -> floating numbers + sound
  if (v.song && prev.song && v.song.no === prev.song.no) {
    v.song.totals.forEach((t, i) => {
      const d = t - prev.song.totals[i];
      if (d) { out.floats.push({ p: i, d, delay }); play(d > 0 ? 'scoreUp' : 'scoreDown', delay + (n ? 250 : 0)); }
    });
  }

  // song start / turn changes
  const newSong = v.song && (!prev.song || v.song.no !== prev.song.no);
  if (newSong) {
    const card = CARDS[v.song.taskId];
    banner(v.song.sudden ? 'SUDDEN DEATH' : `第${v.song.no}曲`, card?.name, v.song.sudden ? 'danger' : '');
    play(v.song.sudden ? 'suddenDeath' : 'songStart');
    if (v.song.sudden) shake(9, 600);
  }
  const roundChanged = v.song && prev.song && v.song.no === prev.song.no && v.song.pass !== prev.song.pass;
  if (roundChanged) { banner(`ROUND ${v.song.pass}`, `${v.song.pass} / ${v.rules.turns} ラウンド目`, ''); play('songStart'); }
  const turnChanged = v.phase === 'song' && (newSong || roundChanged || prev.cur !== v.cur || prev.phase !== 'song');
  if (turnChanged) {
    const mine = v.cur === me;
    later(() => { banner(mine ? 'YOUR TURN' : 'OPPONENT', mine ? 'あなたのターン' : `${names[v.cur]} のターン`, mine ? 'mine' : 'theirs'); play(mine ? 'yourTurn' : 'oppTurn'); }, newSong || roundChanged ? 1450 : 0);
  }

  // song result — a longer, tenser build-up for sudden death and for the song that ends the match
  if (v.lastResult && v.lastResult.songNo !== prev.lastResult?.songNo) {
    const win = v.lastResult.winner === me;
    const drama = !!(v.song?.sudden || v.phase === 'over'), wait = drama ? 1300 : 0;
    if (drama) { banner('判定…', v.song?.sudden ? '運命のサドンデス' : '勝敗が決まる…', 'danger'); play('drumroll'); }
    later(() => {
      banner(win ? 'SONG WIN!' : 'SONG LOSE', v.lastResult.totals.join(' - '), win ? 'win' : 'lose');
      play(win ? 'songWin' : 'songLose'); shake(win ? 6 : 10, 420);
    }, delay + 900 + wait);
    const mp = v.players.findIndex((p) => p.won.length === v.rules.winsNeeded - 1);
    if (mp >= 0 && v.players[mp].won.length !== prev.players[mp].won.length && v.phase !== 'over') {
      later(() => { banner('MATCH POINT', `${names[mp]} あと1曲`, 'danger'); play('matchPoint'); }, delay + 2800 + wait);
    }
  }

  if (v.prompt && !v.prompt.waiting && !(prev.prompt && !prev.prompt.waiting)) play('prompt');
  if (v.phase === 'over' && prev.phase !== 'over') later(() => play(v.winner?.includes(me) ? 'gameWin' : 'gameLose'), delay + 1800 + (v.lastResult && v.lastResult.songNo !== prev.lastResult?.songNo ? 1300 : 0));

  heartbeat(!!(v.song?.sudden && v.phase === 'song'));
  return out;
}
