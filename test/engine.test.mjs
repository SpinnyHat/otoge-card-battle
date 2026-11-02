import { Game, viewFor, validateDeck } from '../js/engine.js';
import { STARTER_DECKS } from '../js/cards.js';
import { botAct } from '../js/ai.js';

for (const d of STARTER_DECKS) { const v = validateDeck(d); if (!v.ok) { console.error('starter invalid', d.name, v.errors); process.exit(1); } }
// negative cases
const bad = { ...STARTER_DECKS[0], skill: STARTER_DECKS[0].skill.slice(1) };
if (validateDeck(bad).ok) { console.error('short deck accepted'); process.exit(1); }

let wins = [0, 0], reasons = {}, maxSteps = 0;
for (let n = 0; n < 500; n++) {
  const g = new Game([STARTER_DECKS[n % 2], STARTER_DECKS[(n + 1) % 2]], ['A', 'B']);
  let steps = 0;
  while (g.s.phase !== 'over') {
    if (++steps > 2000) { console.error('stuck', JSON.stringify(viewFor(g, 0)).slice(0, 600)); process.exit(1); }
    let acted = false;
    for (let p = 0; p < 2; p++) {
      const a = botAct(viewFor(g, p));
      if (!a) continue;
      const r = g.act(p, a);
      if (!r.ok) { console.error('bot illegal action', a, r); process.exit(1); }
      acted = true; break;
    }
    if (!acted) { console.error('deadlock', g.s.phase, g.s.stage, g.s.prompt); process.exit(1); }
  }
  maxSteps = Math.max(maxSteps, steps);
  wins[g.s.winner[0]]++; reasons[g.s.reason.split(':').pop()] = (reasons[g.s.reason.split(':').pop()] || 0) + 1;
}
console.log('500 games ok; seat wins', wins, 'reasons', reasons, 'max steps', maxSteps);
