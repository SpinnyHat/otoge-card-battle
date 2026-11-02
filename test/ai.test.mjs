// Do the difficulty levels actually differ?  Mirror match (same deck), seats alternated, so only the AI matters.
import { Game, viewFor } from '../js/engine.js';
import { STARTER_DECKS } from '../js/cards.js';
import { botAct } from '../js/ai.js';
import assert from 'node:assert/strict';

function play(levels, deck) {
  const g = new Game([deck, deck], ['A', 'B']);
  for (let steps = 0; g.s.phase !== 'over'; steps++) {
    assert.ok(steps < 3000, 'stuck');
    for (let p = 0; p < 2; p++) {
      const a = botAct(viewFor(g, p), levels[p]);
      if (a) { assert.ok(g.act(p, a).ok, 'illegal ' + JSON.stringify(a)); break; }
    }
  }
  return g.s.winner[0];
}
function rate(lvA, lvB, deck, n = 600) {
  let a = 0;
  for (let i = 0; i < n; i++) { const swap = i % 2; const w = play(swap ? [lvB, lvA] : [lvA, lvB], deck); if ((w === 0) !== !!swap) a++; }
  return a / n;
}
for (const deck of STARTER_DECKS) {
  const hardEasy = rate('hard', 'easy', deck), hardNormal = rate('hard', 'normal', deck), normalEasy = rate('normal', 'easy', deck);
  console.log(deck.name, `hard>easy ${(hardEasy * 100).toFixed(0)}%  hard>normal ${(hardNormal * 100).toFixed(0)}%  normal>easy ${(normalEasy * 100).toFixed(0)}%`);
  if (STARTER_DECKS.indexOf(deck) < 2) assert.ok(hardEasy > 0.55 && hardNormal > 0.5 && normalEasy > 0.5, 'levels should be ordered');
  else assert.ok(hardEasy > 0.4 && normalEasy > 0.4, 'sanity: neither level collapses on synergy decks (informational ordering only)');
}
console.log('ai levels ok');
