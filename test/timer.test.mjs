// The host-enforced clock: with nobody touching anything, a human-vs-human game must finish on its own.
import { Host } from '../js/host.js';
import { STARTER_DECKS } from '../js/cards.js';
import assert from 'node:assert/strict';

const host = new Host({ max: 2 });
const views = [[], []];
for (const i of [0, 1]) host.addSeat({ name: 'P' + i, kind: 'remote', token: 't' + i, send: (m) => { if (m.t === 'view') views[i].push(m.view); } });
host.handle(0, { t: 'settings', timer: 0.04 });                       // 40 ms per decision keeps the test fast
assert.equal(host.settings.timer, 0.04);
host.handle(0, { t: 'deck', deck: STARTER_DECKS[2] }); host.handle(1, { t: 'deck', deck: STARTER_DECKS[3] });
host.handle(0, { t: 'ready', ready: true }); host.handle(1, { t: 'ready', ready: true });
host.handle(0, { t: 'start' });
assert.ok(host.game);
const first = views[0].at(-1);
assert.ok(first.timer && first.timer.kind === 'roll' && first.timer.players.length === 2, 'clock starts on the opening roll for both humans');

const t0 = Date.now();
while (host.game.s.phase !== 'over' && Date.now() - t0 < 25000) await new Promise((r) => setTimeout(r, 25));
assert.equal(host.game.s.phase, 'over', 'game finished with zero player input');
const kinds = new Set(views[0].map((v) => v.timer?.kind).filter(Boolean));
assert.ok(['roll', 'turn', 'draw'].every((k) => kinds.has(k)), 'clock ran for roll-off, card phase and draw choice: ' + [...kinds]);
assert.ok(host.game.s.log.some((l) => l.includes('時間切れ')), 'timeouts are logged');

// the clock must NOT restart when a card is played mid-turn, and must be off when the setting is 0
const h2 = new Host({ max: 2 }); const v2 = [];
for (const i of [0, 1]) h2.addSeat({ name: 'Q' + i, kind: 'remote', send: (m) => { if (m.t === 'view') v2.push(m.view); } });
h2.settings.timer = 0;
h2.handle(0, { t: 'deck', deck: STARTER_DECKS[2] }); h2.handle(1, { t: 'deck', deck: STARTER_DECKS[2] });
h2.handle(0, { t: 'ready', ready: true }); h2.handle(1, { t: 'ready', ready: true }); h2.handle(0, { t: 'start' });
assert.equal(v2.at(-1).timer, null, 'timer 0 = no clock');
h2.stop(); host.stop();
console.log('timer tests ok');
process.exit(0);
