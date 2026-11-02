// Host + simulated remote guest (the same messages PeerJS would carry).
import { Host } from '../js/host.js';
import { STARTER_DECKS } from '../js/cards.js';
import { botAct } from '../js/ai.js';
import assert from 'node:assert/strict';

const host = new Host({ max: 2 });
const inbox = { 0: [], 1: [] };
host.addSeat({ name: 'Host', kind: 'local', send: (m) => inbox[0].push(m) });
const sendG = (m) => inbox[1].push(m);
const g = host.addSeat({ name: 'Guest', kind: 'remote', token: 'tok', send: sendG });
assert.equal(g, 1);
assert.equal(host.addSeat({ name: 'Third', kind: 'remote', send() {} }), -1, 'room is full at 2');

host.handle(1, { t: 'deck', deck: { ...STARTER_DECKS[0], skill: [] } });
assert.equal(inbox[1].at(-1).t, 'err', 'illegal deck rejected');
host.handle(0, { t: 'deck', deck: STARTER_DECKS[0] }); host.handle(1, { t: 'deck', deck: STARTER_DECKS[1] });
host.handle(0, { t: 'start' });
assert.equal(inbox[0].at(-1).t, 'err', 'cannot start until everyone is ready');
host.handle(0, { t: 'ready', ready: true }); host.handle(1, { t: 'ready', ready: true });
host.handle(1, { t: 'start' });
assert.ok(!host.game, 'guest cannot start');
host.handle(0, { t: 'start' });
assert.ok(host.game);

// privacy: guest view must not leak host hand / piles
const gv = inbox[1].filter((m) => m.t === 'view').at(-1).view;
assert.equal(gv.players[0].hand, null); assert.equal(gv.players[1].hand.length, 5);
assert.ok(!JSON.stringify(gv).includes('"pile"') && !JSON.stringify(gv).includes('"charts"'));

// cheating attempts are rejected, not crashed
host.handle(1, { t: 'act', a: { t: 'play', uid: 999 } });
host.handle(1, { t: 'act', a: { t: 'draw', n: 99 } });

// guest drops mid-game and reconnects with the same token
host.disconnect(1);
assert.equal(host.seats[1].connected, false);
const inbox2 = []; host.reconnect(host.seatByToken('tok'), (m) => inbox2.push(m));
assert.equal(inbox2.at(-1).t, 'view', 'reconnect gets current state');

// play to the end driving both seats like humans would
let n = 0;
while (host.game.s.phase !== 'over' && n++ < 1000) {
  for (const i of [0, 1]) {
    const a = botAct(JSON.parse(JSON.stringify(inbox[i].filter((m) => m.t === 'view').at(-1)?.view || inbox2.filter((m) => m.t === 'view').at(-1).view)));
    if (i === 1) { const v = inbox2.filter((m) => m.t === 'view').at(-1).view; const b = botAct(v); if (b) { host.handle(1, { t: 'act', a: b }); break; } continue; }
    if (a) { host.handle(0, { t: 'act', a }); break; }
  }
}
assert.equal(host.game.s.phase, 'over');
host.handle(0, { t: 'toLobby' });
assert.equal(host.game, null); assert.ok(host.seats.every((s) => !s.ready));
console.log('host tests ok (full game via host in', n, 'steps)');
