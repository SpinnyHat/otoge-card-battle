// Each slide card does what its text says. Scenarios are set up by writing state directly.
import { Game, viewFor, RULES } from '../js/engine.js';
import { STARTER_DECKS } from '../js/cards.js';
import assert from 'node:assert/strict';

let uid = 5000;
const I = (id) => ({ uid: uid++, id });
function setup({ rounds = 1, task, hand0 = [], hand1 = [], field0 = [], field1 = [], die = 3, tend0 = ['NONE'], tend1 = ['NONE'], machines0 = [] } = {}) {
  const g = new Game([STARTER_DECKS[2], STARTER_DECKS[2]], ['A', 'B'], { ...RULES, turnsPerSong: rounds });
  const s = g.s;
  g.die = () => (typeof die === 'function' ? die() : die);
  s.order = [0, 1]; s.phase = 'song';
  s.players[0].charts = [I(task)]; s.players[0].tendencies = tend0; s.players[1].tendencies = tend1;
  s.players[0].machines = machines0;
  s.players[0].hand = hand0.map(I); s.players[1].hand = hand1.map(I);
  const mkf = (e) => ({ ...I(typeof e === 'string' ? e : e.id), ...(typeof e === 'object' ? e : {}), faceDown: false });
  s.players[0].field = field0.map(mkf); s.players[1].field = field1.map(mkf);
  s.songNo = 0; g.startSong(); g.pump();
  return g;
}
const sc = (g, p) => g.total(p);
const entries = (g, p, label) => g.s.song.score[p].filter((e) => e.label.startsWith(label));
const play = (g, p, id) => { const c = g.s.players[p].hand.find((x) => x.id === id); assert.ok(c, 'card in hand ' + id); const r = g.act(p, { t: 'play', uid: c.uid }); assert.ok(r.ok, r.err); };
const answer = (g, v) => assert.ok(g.act(g.s.prompt.player, { t: 'answer', v }).ok);
const NONE = 'ph-bms-1';   // vanilla task song, tendency NONE, no owner bonus

// -- plain score skills
let g = setup({ task: NONE, hand0: ['ramen'] }); play(g, 0, 'ramen'); assert.equal(sc(g, 0), 1);
g = setup({ task: NONE, hand0: ['energy', 'ramen'] }); play(g, 0, 'energy'); assert.equal(sc(g, 0), 2); assert.ok(g.s.prompt, 'asks which card to discard'); answer(g, g.s.prompt.choices[0].value); assert.equal(g.s.players[0].hand.length, 0);
g = setup({ task: 'ph-bms-4', hand0: ['anmitsu'] });   // PEAK
const h0 = g.s.players[0].hand.length; play(g, 0, 'anmitsu'); assert.equal(sc(g, 0), 0, '-1 then +1 on PEAK'); assert.equal(g.s.players[0].hand.length, h0 - 1 + 2);
g = setup({ task: NONE, hand0: ['anmitsu'] }); play(g, 0, 'anmitsu'); assert.equal(sc(g, 0), -1, 'no PEAK bonus');
g = setup({ task: NONE, hand0: ['saving-xi'] }); play(g, 0, 'saving-xi'); assert.equal(sc(g, 0), 0, 'not behind -> no +10');
g = setup({ task: NONE, hand0: ['saving-xi'] }); g.s.players[1].won.push(I('x')); play(g, 0, 'saving-xi'); assert.equal(sc(g, 0), 2, 'behind -> +2');

// -- 2 plays per turn
g = setup({ task: NONE, hand0: ['ramen', 'ramen', 'ramen'] }); play(g, 0, 'ramen'); play(g, 0, 'ramen');
assert.equal(g.act(0, { t: 'play', uid: g.s.players[0].hand[0].uid }).ok, false, 'third card refused'); assert.equal(sc(g, 0), 2);

// -- dice cards
g = setup({ task: NONE, hand0: ['ichixi'], die: 4 }); play(g, 0, 'ichixi'); g.act(0, { t: 'end' }); assert.equal(g.s.song.rolls[0].length, 2, 'rolls doubled'); assert.equal(sc(g, 0), 8);
g = setup({ task: NONE, hand0: ['kansha-xi'], die: 2 }); play(g, 0, 'kansha-xi'); g.act(0, { t: 'end' }); assert.equal(g.s.song.rolls[0].length, 2); assert.equal(g.s.song.flags[1].extra, 1, 'opponent gets it too');
g = setup({ task: NONE, hand0: ['man-xi'], die: 2 }); const hp = g.s.players[0].hand.length; play(g, 0, 'man-xi'); g.act(0, { t: 'end' }); assert.equal(g.s.players[0].hand.length, hp - 1 + 1, 'drew on roll');
let rolls = [1, 6]; g = setup({ task: NONE, hand0: ['xi-reroll'], die: () => rolls.shift() ?? 3 }); play(g, 0, 'xi-reroll'); g.act(0, { t: 'end' });
assert.ok(g.s.prompt?.reroll === 1, 'offers a reroll of the 1'); answer(g, 1); assert.deepEqual(g.s.song.rolls[0], [6]);
g = setup({ task: 'not-equal', die: 3 }); g.act(0, { t: 'end' }); assert.equal(g.s.song.rolls[0].length, 2, '≠ -> two dice');

// -- 癖 (habit) cycle
g = setup({ task: NONE, hand0: ['nenchaku'] }); play(g, 0, 'nenchaku'); assert.equal(g.s.players[1].grave.filter((c) => c.id === 'kuse').length, 1);
g.act(0, { t: 'end' }); assert.equal(entries(g, 1, '癖')[0]?.v, -1, 'opponent loses 1 at their turn start');
g = setup({ task: NONE, hand0: ['tsumikasane'] }); play(g, 0, 'tsumikasane'); assert.equal(sc(g, 0), 2); assert.equal(g.s.players[0].field.filter((c) => c.id === 'kuse').length, 1);
g = setup({ task: NONE, hand0: ['nenchaku'], hand1: ['gokugen'] }); play(g, 0, 'nenchaku'); g.act(0, { t: 'end' });
assert.equal(sc(g, 1), -1); play(g, 1, 'gokugen'); assert.equal(sc(g, 1), 0, '極限状態 refunds the 癖'); 

// -- 妬み
g = setup({ task: NONE, hand0: ['ramen'], hand1: ['netami'], die: () => 3 }); g.act(0, { t: 'end' }); play(g, 1, 'netami'); g.s.song.score[1].push({ label: 'x', v: -5 }); g.act(1, { t: 'end' });
assert.equal(g.s.players[0].won.length, 1); assert.equal(g.s.players[1].nextBonus, 3, 'loser gets +3 next song');

// -- characters
g = setup({ task: NONE, field0: ['reku'], hand0: ['ramen'] }); const hr = g.s.players[0].hand.length; play(g, 0, 'ramen'); assert.equal(g.s.players[0].hand.length, hr - 1 + 1, 'Reku draws one when ramen scores (played card leaves hand)');
g = setup({ task: 'joe-fight', field0: ['dj-myosuke'] }); g.act(0, { t: 'end' }); g.s.song.done[1] = false; assert.equal(entries(g, 1, '爆音').reduce((a, e) => a + e.v, 0), -3, 'joe fight triples 爆音');
g = setup({ task: 'joe-fight', field0: ['dj-myosuke'], hand1: ['equalizer'] }); g.act(0, { t: 'end' }); play(g, 1, 'equalizer'); assert.equal(entries(g, 1, '爆音').length, 0, 'イコライザー negates 爆音');
g = setup({ task: 'seimeisei', field0: [], hand0: ['ramen', 'ramen'] }); play(g, 0, 'ramen'); assert.ok(g.s.prompt, '生命性: must discard/mill after a scoring skill');
g = setup({ task: 'sheriruth', field0: ['laur'] }); assert.equal(g.s.song.task.inst.id, 'sheriruth-remix', 'Laur on field -> remix');
g = setup({ task: 'azure-vixen', field0: ['hikari'], hand0: ['all-girls'] }); g.act(0, { t: 'end' });
g = setup({ task: 'ph-bms-4', field0: ['hikari'], die: 3, tend0: ['PEAK'], tend1: ['NONE'] }); g.act(0, { t: 'end' }); g.act(1, { t: 'end' }); assert.equal(entries(g, 0, '得意傾向')[0].v, 1);
g = setup({ task: 'ph-bms-4', die: 3, tend0: ['PEAK'], tend1: ['PEAK'] }); g.act(0, { t: 'end' }); g.act(1, { t: 'end' }); assert.equal(entries(g, 0, '得意傾向')[0].v, 2, 'both share tendency -> +2');
g = setup({ task: 'chozetsu', die: 3, tend0: ['NOTES'] }); g.s.players[0].won.push(I('chozetsu')); assert.ok(g.tendenciesOf(0).includes('TECH'), '超絶技巧系少女 grants TECH to its owner');
g = setup({ task: 'data-error' }); const errs = (p) => g.s.players[p].pile.filter((c) => c.id === 'error').length; assert.equal(errs(1), 1, 'first turn start added one'); g.act(0, { t: 'end' }); assert.equal(errs(1), 2, 'and one more at each following turn start');
g = setup({ task: 'meinichi', field0: ['hikari', 'laur'], field1: ['tsumugi'] }); g.act(0, { t: 'end' }); g.act(1, { t: 'end' }); assert.ok(g.s.players[0].field.every((c) => c.id === 'fake-leaf'), '命日 replaces all chara');
g = setup({ task: 'free-fall', field0: ['rune'], field1: ['elizabeth', 'hikari'] }); g.act(0, { t: 'end' }); g.act(1, { t: 'end' }); assert.deepEqual(g.s.players[1].field.map((c) => c.id), ['hikari'], 'WACCA chara removed on BOTH sides, 光 stays'); assert.equal(g.s.players[0].field.length, 0);
// リリィ vs エリザベス: Lily wipes the opponent's other chara at her turn start
g = setup({ task: NONE, field0: ['lily'], field1: ['elizabeth', 'hikari', 'tsumugi'] }); assert.deepEqual(g.s.players[1].field.map((c) => c.id), ['elizabeth'], 'リリィ leaves only エリザベス');
g = setup({ task: 'doppelganger', field0: ['dj-myosuke'], field1: ['dj-yoshitaka', 'hikari'] }); g.act(0, { t: 'end' }); g.act(1, { t: 'end' }); assert.deepEqual(g.s.players[1].field.map((c) => c.id), ['hikari']);
// yoshitaka: 3rd activation removes the card
g = setup({ task: 'black-market-blues', field0: [{ id: 'dj-yoshitaka', uses: 2 }] }); assert.equal(g.s.players[0].field.length, 0, '3rd activation sends it to the grave'); assert.equal(entries(g, 0, 'DJ YOSHITAKA').length, 0, 'and its score is voided');
g = setup({ task: 'black-market-blues', field0: ['dj-yoshitaka'] }); assert.equal(entries(g, 0, 'DJ YOSHITAKA')[0].v, 2, 'BEMANI (ギタドラ) song -> +2'); g = setup({ task: NONE, field0: ['dj-yoshitaka'] }); assert.equal(entries(g, 0, 'DJ YOSHITAKA').length, 0, 'non-BEMANI -> nothing');

// -- cards from the illustrated set
g = setup({ task: NONE, hand0: ['sakujo-beam'], field1: ['hikari'] }); play(g, 0, 'sakujo-beam');
assert.ok(g.s.prompt.choices.some((c) => c.value === 'pile1'), '削除ビーム can target a deck top'); const before = g.s.players[1].pile.length;
answer(g, 'pile1'); assert.equal(g.s.players[1].pile.length, before - 1); assert.equal(g.s.players[1].grave.length, 1);
g = setup({ task: NONE, hand0: ['sakujo-beam'], field1: ['hikari'] }); play(g, 0, 'sakujo-beam'); answer(g, g.s.players[1].field[0].uid); assert.equal(g.s.players[1].field.length, 0, '削除ビーム removes a field chara');

g = setup({ task: 'kamui' }); assert.ok(g.s.players[0].grave.some((c) => c.id === 'kuse') && g.s.players[1].grave.some((c) => c.id === 'kuse'), '神威: both players get 癖');
g.act(0, { t: 'end' }); assert.equal(entries(g, 1, '癖')[0]?.v, -1, 'and it bites on the next turn');
g = setup({ task: 'kamui', die: 3, tend0: ['NOTES'], tend1: ['PEAK'] }); g.act(0, { t: 'end' }); g.act(1, { t: 'end' }); assert.ok(entries(g, 0, '得意傾向').length === 1 && entries(g, 1, '得意傾向').length === 0, '神威 counts as NOTES');

g = setup({ task: 'mopemope', field0: ['hikari'], field1: ['tsumugi'] });
assert.ok(g.act(0, { t: 'ability' }).ok); assert.equal(g.s.prompt.player, 0, 'I choose my chara first'); answer(g, g.s.players[0].field[0].uid);
assert.equal(g.s.prompt.player, 1, 'then the opponent must do the same'); answer(g, g.s.players[1].field[0].uid);
assert.equal(g.s.players[0].field.length + g.s.players[1].field.length, 0);
g = setup({ task: 'mopemope', field0: ['hikari'], field1: [] }); g.act(0, { t: 'ability' }); answer(g, g.s.players[0].field[0].uid); assert.equal(g.s.prompt, null, '相手にキャラがいなければ何も起きない');
g = setup({ task: NONE }); assert.equal(g.act(0, { t: 'ability' }).ok, false, 'no ability on an ordinary song');

// -- a crossover song is legal with either of its machines
import { validateDeck } from '../js/engine.js';
const base = STARTER_DECKS[2];
const mk = (machines, chart) => ({ ...base, machines, chart: [...base.chart.filter((c) => c !== chart).slice(0, 9), chart] });
assert.ok(validateDeck(mk(['arcaea', 'wacca', 'maimai'], 'aether-crest')).ok, 'Aether Crest via Arcaea');
assert.ok(validateDeck(mk(['chunithm', 'wacca', 'maimai'], 'aether-crest')).errors.every((e) => !e.includes('Aether')), 'Aether Crest via CHUNITHM');
assert.ok(validateDeck(mk(['wacca', 'maimai'], 'aether-crest')).errors.some((e) => e.includes('Aether')), 'and illegal with neither of its machines');

// -- 削除: one use per placement, the card stays afterwards
g = setup({ task: NONE, field0: ['sakujo'], field1: ['hikari', 'tsumugi'] });
assert.ok(g.s.prompt && g.s.prompt.choices.every((c) => c.owner === 1), '削除 offers only the OPPONENT\'s cards (tagged with their owner)');
answer(g, g.s.players[1].field[0].uid);
assert.equal(g.s.players[1].field.length, 1, 'one opposing card deleted'); assert.equal(g.s.players[0].field.length, 1, '削除 itself stays on the field');
assert.equal(g.s.players[0].field[0].spent, true, 'and is marked used up'); assert.equal(g.s.players[0].field[0].faceDown, true, 'and flips face-down (裏向き)');
g.s.song.done[0] = false; g.beginTurn(0); g.pump(); assert.equal(g.s.prompt, null, 'a spent 削除 never asks again');
g = setup({ task: NONE, field0: ['sakujo'], field1: ['hikari'] }); answer(g, null);
assert.ok(!g.s.players[0].field[0].spent, 'declining does not use it up'); assert.equal(g.s.players[1].field.length, 1);
g.beginTurn(0); g.pump(); assert.ok(g.s.prompt, 'so it can still be used on a later turn');

// -- ゴママヨ cards
{
  const MAI = 'ph-maimai-1';          // an arcade (maimai) song
  let gg = setup({ task: MAI, hand0: ['kakin'], hand1: [] }); play(gg, 0, 'kakin');
  assert.equal(gg.flags(0).rerolls, 1, '課金 on an arcade song: gains a re-roll right');
  gg = setup({ task: NONE, hand0: ['kakin'] });
  assert.equal(gg.act(0, { t: 'play', uid: gg.s.players[0].hand[0].uid }).ok, false, '課金 is refused on a non-arcade (BMS) song');
  gg = setup({ rounds: 2, task: MAI, hand0: ['kakin'] }); gg.act(0, { t: 'end' }); gg.act(1, { t: 'end' });
  assert.equal(gg.s.song.pass, 2); gg.s.players[0].hand = [{ uid: 9901, id: 'kakin' }];
  assert.equal(gg.act(0, { t: 'play', uid: 9901 }).ok, false, '課金 only works at the start of the song (round 1)');

  // the counter: opponent holds ゴママヨ抑止 -> asked when a ゴママヨ card's effect is about to resolve
  gg = setup({ task: MAI, hand0: ['kakin'], hand1: ['gomamayo-yokushi'] }); play(gg, 0, 'kakin');
  assert.equal(gg.s.prompt.player, 1, 'the OPPONENT (holder of ゴママヨ抑止) is asked'); assert.equal(gg.s.prompt.cardId, 'gomamayo-yokushi');
  answer(gg, 1);
  assert.equal(gg.flags(0).rerolls, 0, 'effect negated'); assert.ok(gg.s.players[0].grave.some((c) => c.id === 'kakin'), '課金 still goes to the grave');
  assert.ok(gg.s.players[1].grave.some((c) => c.id === 'gomamayo-yokushi') && gg.s.players[1].hand.length === 0, 'the counter is spent');
  gg = setup({ task: MAI, hand0: ['kakin'], hand1: ['gomamayo-yokushi'] }); play(gg, 0, 'kakin'); answer(gg, null);
  assert.equal(gg.flags(0).rerolls, 1, 'declined -> the effect goes through'); assert.equal(gg.s.players[1].hand.length, 1, 'and the counter is kept');
  gg = setup({ task: NONE, hand0: ['ramen'], hand1: ['gomamayo-yokushi'] }); play(gg, 0, 'ramen');
  assert.equal(gg.s.prompt, null, 'non-ゴママヨ cards are never interrupted'); assert.equal(sc(gg, 0), 1);
  gg = setup({ task: NONE, hand1: ['gomamayo-yokushi'] }); assert.equal(gg.act(1, { t: 'play', uid: gg.s.players[1].hand[0].uid }).ok, false, '抑止 cannot be played proactively');

  // 削除 is a ゴママヨ card too: its turn-start deletion can be countered, and a negated 削除 is not used up
  gg = setup({ task: NONE, field0: ['sakujo'], field1: ['hikari'], hand1: ['gomamayo-yokushi'] });
  assert.equal(gg.s.prompt.player, 1, '削除\'s effect triggers the counter question'); answer(gg, 1);
  assert.equal(gg.s.prompt, null, 'negated: no deletion prompt for 削除\'s owner'); assert.equal(gg.s.players[1].field.length, 1, 'their card is safe');
  assert.ok(!gg.s.players[0].field[0].spent, 'and 削除 is not used up');
}
console.log('card tests ok');

// -- two rounds per song (default rules): each player plays <=2 cards and rolls, then the same again; totals decide
{
  const g2 = setup({ rounds: 2, task: NONE, hand0: ['ramen', 'ramen', 'ramen', 'ramen', 'ramen'], hand1: [], die: 3 });
  assert.equal(g2.s.song.pass, 1);
  play(g2, 0, 'ramen'); play(g2, 0, 'ramen');
  assert.equal(g2.act(0, { t: 'play', uid: g2.s.players[0].hand[0].uid }).ok, false, 'round 1: still only 2 cards');
  g2.act(0, { t: 'end' }); g2.act(1, { t: 'end' });
  assert.equal(g2.s.song.pass, 2, 'both finished -> round 2 starts');
  assert.equal(g2.s.cur, 0, 'same order again (song chooser first)');
  assert.equal(g2.s.song.plays[0], 0, 'card allowance refreshes each round');
  play(g2, 0, 'ramen'); play(g2, 0, 'ramen');
  assert.equal(sc(g2, 0), (3 + 1 + 1) + (1 + 1), 'score so far: round 1 (roll 3 + two ramen) + round 2 ramen x2 (its roll is still to come)');
  assert.equal(g2.s.phase, 'song', 'the song is not decided after round 1');
  g2.act(0, { t: 'end' }); g2.act(1, { t: 'end' });
  assert.equal(g2.s.lastResult.totals.join('-'), '12-8', 'result = totals over both rounds (+2 each: both favour NONE, which matches this song)');
  assert.equal(g2.s.players[0].won.length, 1);
}
{ // per-turn effects end with the turn, per-song effects do not
  const g2 = setup({ rounds: 2, task: NONE, hand0: ['ichixi', 'xi-reroll'], die: 2 });
  play(g2, 0, 'ichixi'); g2.act(0, { t: 'end' }); assert.equal(g2.s.song.rolls[0].length, 2, 'ichixi doubled round 1');
  g2.act(1, { t: 'end' }); assert.equal(g2.s.song.flags[0].mult, 1, 'and is gone in round 2');
  g2.act(0, { t: 'end' }); assert.equal(g2.s.song.rolls[0].length, 3, 'round 2: a single roll again');
}
{ // 光 (+1 at every turn start) is worth +1 per round
  const g2 = setup({ rounds: 2, task: NONE, field0: ['hikari'], die: 3 });
  g2.act(0, { t: 'end' }); g2.act(1, { t: 'end' }); g2.act(0, { t: 'end' });
  assert.equal(entries(g2, 0, '光').length, 1, '光 (turn start) fires once per song, not once per round');
}
console.log('round tests ok');
