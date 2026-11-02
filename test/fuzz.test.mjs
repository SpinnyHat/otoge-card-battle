// Random decks from the WHOLE card pool (validation bypassed on purpose), bots on both sides.
// Looks for: exceptions inside effects, stuck games, illegal bot moves, state corruption.
import { Game, viewFor, validateDeck } from '../js/engine.js';
import { cardsOfType, STARTER_DECKS, CARDS } from '../js/cards.js';
import { botAct } from '../js/ai.js';
import assert from 'node:assert/strict';

for (const d of STARTER_DECKS) assert.ok(validateDeck(d).ok, `starter invalid: ${d.name} ${validateDeck(d).errors}`);

const pick = (arr, n) => { const a = [...arr].sort(() => Math.random() - 0.5); const out = []; while (out.length < n) out.push(a[out.length % a.length]); return out; };
const pool = (t) => cardsOfType(t).filter((c) => !c.token).map((c) => c.id);
const randDeck = () => ({ name: 'fuzz', tendency: pick(['NONE', 'NOTES', 'PEAK', 'TECH', 'STAMINA', 'TRICKY', 'SPECIAL'], 1)[0], machines: pick(cardsOfType('machine').map((m) => m.id), 3),
  chara: pick(pool('chara'), 5), skill: pick(pool('skill'), 20), chart: pick(pool('chart'), 10) });

const used = new Set(); let games = 0, errs = new Map();
const N = Number(process.argv[2] || 800);
for (let n = 0; n < N; n++) {
  const decks = n % 4 === 0 ? [STARTER_DECKS[n % STARTER_DECKS.length], STARTER_DECKS[(n + 1) % STARTER_DECKS.length]] : [randDeck(), randDeck()];
  const levels = [['easy', 'normal', 'hard'][n % 3], ['hard', 'easy', 'normal'][n % 3]];
  let g;
  try {
    g = new Game(decks, ['A', 'B']);
    for (let steps = 0; g.s.phase !== 'over'; steps++) {
      assert.ok(steps < 4000, 'stuck');
      let acted = false;
      for (let p = 0; p < 2; p++) {
        const a = botAct(viewFor(g, p), levels[p]);
        if (!a) continue;
        const r = g.act(p, a);
        assert.ok(r.ok, `illegal action ${JSON.stringify(a)}: ${r.err}`);
        acted = true; break;
      }
      assert.ok(acted, `deadlock phase=${g.s.phase} stage=${g.s.stage} prompt=${JSON.stringify(g.s.prompt)}`);
    }
    g.s.log.forEach((l) => { const m = l.match(/(?:使った|場に出した)/); if (m) used.add(l); });
    games++;
  } catch (e) {
    const key = String(e.message).slice(0, 140) + ' @ ' + (e.stack || '').split('\n').find((l) => l.includes('/js/'))?.trim();
    errs.set(key, (errs.get(key) || 0) + 1);
  }
}
const played = new Set([...used].map((l) => l.replace(/^.+? は /, '').replace(/ を(使った|場に出した)$/, '')));
const implemented = Object.values(CARDS).filter((c) => !c.token && (c.type === 'chara' || c.type === 'skill') && !c.wip && !c.reactOnly && c.effects?.length);
const never = implemented.filter((c) => !played.has(c.name)).map((c) => c.name);
console.log(`${games}/${N} games completed`);
if (never.length) console.log('never played in fuzz (fine if rare):', never.join(', '));
if (errs.size) { console.log('ERRORS:'); for (const [k, v] of errs) console.log(`  x${v}  ${k}`); process.exit(1); }
console.log('fuzz ok');
