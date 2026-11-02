// Balance report: hard-vs-hard games on random legal-size decks. For each card, win rate with it in the deck vs without
// (and when it was actually played). Run: node test/balance.mjs [games]   — not part of the pass/fail suite.
import { Game, viewFor } from '../js/engine.js';
import { cardsOfType, CARDS } from '../js/cards.js';
import { botAct } from '../js/ai.js';

const N = Number(process.argv[2] || 12000);
const pool = (t) => cardsOfType(t).filter((c) => !c.token && !c.wip && (t === 'chart' || c.effects?.length !== undefined)).map((c) => c.id);
const sample = (arr, n, maxCopies = 1) => { const out = [], cnt = {}; const a = [...arr].sort(() => Math.random() - 0.5); for (const x of a) { if (out.length >= n) break; if ((cnt[x] || 0) < maxCopies) { out.push(x); cnt[x] = (cnt[x] || 0) + 1; } } for (let i = 0; out.length < n; i++) { const x = a[i % a.length]; if ((cnt[x] || 0) < maxCopies) { out.push(x); cnt[x] = (cnt[x] || 0) + 1; } } return out; };
const T = ['NONE', 'NOTES', 'PEAK', 'TECH', 'STAMINA', 'TRICKY', 'SPECIAL'];
const deck = () => ({ name: 'r', tendency: T[Math.floor(Math.random() * 7)], machines: [], chara: sample(pool('chara'), 5), skill: sample(pool('skill'), 20, 2), chart: sample(pool('chart'), 10) });

const st = {};   // id -> {inc, incWin, pl, plWin}
const S = (id) => (st[id] ||= { inc: 0, incWin: 0, pl: 0, plWin: 0 });
const t0 = Date.now(); let first = 0, plays = 0;
for (let n = 0; n < N; n++) {
  const decks = [deck(), deck()];
  const g = new Game(decks, ['P0', 'P1']);
  for (let k = 0; g.s.phase !== 'over' && k < 4000; k++) {
    let a = false;
    for (let p = 0; p < 2; p++) { const m = botAct(viewFor(g, p), 'hard'); if (m) { g.act(p, m); a = true; break; } }
    if (!a) break;
  }
  if (g.s.phase !== 'over') continue;
  const w = g.s.winner[0];
  const playedBy = [new Set(), new Set()];
  for (const l of g.s.log) { const m = l.match(/^(P[01]) は (.+) を(?:使った|場に出した)$/); if (m) { const c = Object.values(CARDS).find((x) => x.name === m[2]); if (c) playedBy[+m[1][1]].add(c.id); } }
  decks.forEach((d, p) => {
    const ids = new Set([...d.chara, ...d.skill, ...d.chart]);
    for (const id of ids) { const s = S(id); s.inc++; if (p === w) s.incWin++; }
    for (const id of playedBy[p]) { const s = S(id); s.pl++; if (p === w) s.plWin++; }
  });
  if (w === 0) first++; plays++;
}
console.log(`${plays} games in ${((Date.now() - t0) / 1000).toFixed(0)}s, seat0 win ${(first / plays * 100).toFixed(1)}%`);
const tot = Object.values(st).reduce((a, s) => ({ inc: a.inc + s.inc, w: a.w + s.incWin }), { inc: 0, w: 0 });
const rows = Object.entries(st).map(([id, s]) => {
  const restN = plays * 2 - s.inc, restW = plays - s.incWin;      // every game has exactly one winner among 2 decks
  const wr = s.incWin / s.inc, wo = restW / restN;
  const se = Math.sqrt(wr * (1 - wr) / s.inc + wo * (1 - wo) / restN);
  return { id, name: CARDS[id].name, type: CARDS[id].type, inc: s.inc, wr, delta: wr - wo, z: (wr - wo) / se, pl: s.pl, plwr: s.pl ? s.plWin / s.pl : NaN };
}).sort((a, b) => b.delta - a.delta);
const pct = (x) => (x * 100).toFixed(1).padStart(5);
console.log('type    delta    z   inc   played-wr  card');
for (const r of rows) console.log(`${r.type.padEnd(6)} ${(r.delta >= 0 ? '+' : '') + pct(r.delta)}% ${r.z.toFixed(1).padStart(5)} ${String(r.inc).padStart(5)}  ${pct(r.plwr)}% (${r.pl})  ${r.name}`);
