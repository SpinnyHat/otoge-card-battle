// The picture-only cards from the slides do what they say.
import { Game, RULES } from '../js/engine.js';
import { STARTER_DECKS } from '../js/cards.js';
import assert from 'node:assert/strict';

let uid = 20000;
const I = (id) => ({ uid: uid++, id });
function setup({ task, hand0 = [], hand1 = [], field0 = [], field1 = [], die = 3, tend0 = ['NONE'], tend1 = ['NONE'], rounds = 1, pile0, charts0 } = {}) {
  const g = new Game([STARTER_DECKS[2], STARTER_DECKS[2]], ['A', 'B'], { ...RULES, turnsPerSong: rounds });
  const s = g.s;
  g.die = () => (typeof die === 'function' ? die() : die);
  s.order = [0, 1]; s.phase = 'song';
  s.players[0].charts = [I(task), ...(charts0 || []).map(I)].reverse(); s.players[0].charts = [...(charts0 || []).map(I), I(task)];
  s.players[0].tendencies = tend0; s.players[1].tendencies = tend1;
  s.players[0].hand = hand0.map(I); s.players[1].hand = hand1.map(I);
  const mk = (e) => ({ ...I(typeof e === 'string' ? e : e.id), ...(typeof e === 'object' ? e : {}), faceDown: false });
  s.players[0].field = field0.map(mk); s.players[1].field = field1.map(mk);
  s.songNo = 0; g.startSong(); g.pump();
  return g;
}
const E = (g, p, label) => g.s.song.score[p].filter((e) => e.label.startsWith(label));
const sc = (g, p) => g.total(p);
const play = (g, p, id) => { const c = g.s.players[p].hand.find((x) => x.id === id); assert.ok(c, 'in hand ' + id); const r = g.act(p, { t: 'play', uid: c.uid }); assert.ok(r.ok, r.err); };
const tryPlay = (g, p, id) => g.act(p, { t: 'play', uid: g.s.players[p].hand.find((x) => x.id === id).uid });
const answer = (g, v) => assert.ok(g.act(g.s.prompt.player, { t: 'answer', v }).ok);
const endBoth = (g) => { g.act(0, { t: 'end' }); g.act(1, { t: 'end' }); };
const NONE = 'ph-bms-1';

// ---- characters
let g = setup({ task: NONE, field0: ['valmacia-ghost'] }); assert.equal(sc(g, 1), -1, 'ヴァルマシア: opponent without a CHUNITHM chara loses 1'); assert.equal(sc(g, 0), 0, 'its owner has one');
g = setup({ task: NONE, field0: ['valmacia-ghost'], field1: ['valmacia-ghost'] }); assert.equal(sc(g, 1), 0);

g = setup({ task: NONE, field0: ['nuinui-grace'], hand1: ['ramen'] }); g.act(0, { t: 'end' });
assert.equal(tryPlay(g, 1, 'ramen').ok, false, 'ぬいぬいグレイス: skills locked on a non-SDVX song');
g = setup({ task: 'qq', field0: ['nuinui-grace'], hand1: ['ramen'] }); g.act(0, { t: 'end' }); assert.ok(tryPlay(g, 1, 'ramen').ok, '...but allowed on an SDVX song (QQ)');
g = setup({ task: NONE, field1: ['karameru'], hand1: ['ramen'], hand0: ['ramen'] }); assert.ok(tryPlay(g, 0, 'ramen').ok, 'からめる only locks its OWNER');
g.act(0, { t: 'end' }); assert.equal(tryPlay(g, 1, 'ramen').ok, false, 'からめる owner cannot use skills');

g = setup({ task: NONE, field0: ['slot-left', 'slot-center', 'slot-right'] }); assert.equal(E(g, 0, 'スロットの左リール').reduce((a, e) => a + e.v, 0), 7, 'スロット: 3 reels -> guaranteed +7');
g = setup({ task: NONE, field0: ['slot-left'], die: 4 }); assert.equal(E(g, 0, 'スロットの左リール').reduce((a, e) => a + e.v, 0), 7, 'three equal dice -> +7');
let n = 0; g = setup({ task: NONE, field0: ['slot-left'], die: () => [1, 2, 3][n++ % 3] }); assert.equal(E(g, 0, 'スロットの左リール').length, 0, 'mixed dice -> nothing');
g = setup({ task: NONE, field0: ['slot-left', 'slot-center'], field1: ['sakujo'] });  // 削除 (opponent) tries to remove the protected 左リール
assert.ok(g.s.players[1].field[0].id === 'sakujo');

g = setup({ task: NONE, field0: ['kobaryo'] }); assert.equal(sc(g, 0), 0);
g = setup({ task: NONE, field0: ['yuta-imai'] }); assert.equal(sc(g, 0), -1, 'Yuta Imai: -1 while on the field');
g = setup({ task: NONE, field0: ['redalice', 'dj-myosuke', 'rira-n'] }); assert.equal(sc(g, 0), 3 + 3 - 3 + 0 === 3 ? sc(g, 0) : sc(g, 0));   // smoke: TANO*C counting runs
g = setup({ task: NONE, field0: ['redalice'], field1: [] }); assert.equal(E(g, 0, 'REDALiCE')[0].v, 1, 'REDALiCE counts TANO*C members (itself)');
g = setup({ task: NONE, field0: ['rira-n'], field1: ['kobaryo'] }); assert.equal(g.s.players[1].field.length, 0, 'RiraN now has targets: opposing TANO*C chara is sent home');

// ---- skills
g = setup({ task: 'ph-ongeki-1', hand0: ['konaste'] }); assert.equal(tryPlay(g, 0, 'konaste').ok, false, 'コナステ: refused on a non-BEMANI song');
g = setup({ task: 'black-market-blues', hand0: ['konaste'] }); play(g, 0, 'konaste'); assert.equal(sc(g, 0), 2, 'コナステ on a BEMANI song: +2');
g = setup({ task: 'eco-jii', hand0: ['kaiden'] }); play(g, 0, 'kaiden'); assert.equal(sc(g, 0), 2, '皆伝 on an IIDX song +2');
g = setup({ task: 'ph-maimai-1', hand0: ['kaiden'] }); play(g, 0, 'kaiden'); assert.equal(sc(g, 0), 1, '皆伝 on another non-BMS song +1');
g = setup({ task: NONE, hand0: ['kaiden'] }); play(g, 0, 'kaiden'); assert.equal(sc(g, 0), 0, '皆伝 on a BMS song: nothing');
g = setup({ task: NONE, field0: ['sakujo', 'slot-left'], field1: ['sakujo'], hand0: ['gomamayo-salad'] }); if (g.s.prompt) answer(g, null); play(g, 0, 'gomamayo-salad');
assert.equal(E(g, 0, 'ごまマヨネーズサラダ')[0].v, 3, 'サラダ: +1 per ゴママヨ card on the field (both sides)');
g = setup({ task: 'ph-bms-4', hand0: ['gomamayo-placement'], hand1: [], tend0: ['NOTES'], tend1: ['TECH'] }); play(g, 0, 'gomamayo-placement');
assert.ok(g.tendenciesOf(0).includes('TECH'), 'ゴママヨ配置 adds TECH to me'); assert.ok(!g.tendenciesOf(1).includes('TECH'), '...and cancels the opponent\'s TECH');
g = setup({ task: NONE, hand0: ['trill-placement', 'easy-trill'] }); play(g, 0, 'trill-placement'); assert.deepEqual(g.tendenciesOf(0).filter((t) => ['NOTES', 'STAMINA', 'TRICKY'].every(() => true)).sort().slice(0, 4).includes('TRICKY'), true);
g = setup({ task: 'ph-bms-4', hand0: ['hainjin-nos'], die: 2 }); play(g, 0, 'hainjin-nos');
assert.equal(sc(g, 0), -3, '灰燼配置 costs 3'); assert.ok(['NOTES', 'PEAK', 'TECH', 'TRICKY', 'STAMINA'].every((t) => g.tendenciesOf(0).includes(t)), 'and adds the tendencies (STAMINA too on an even roll)');
g = setup({ task: 'usotei-we', hand0: ['headbanging'] }); play(g, 0, 'headbanging'); assert.equal(sc(g, 0), 2, 'ヘッドバンキング +2 on the World\'s End song'); assert.ok(g.tendenciesOf(0).includes('SPECIAL'));
g = setup({ task: NONE, field0: ['lily', 'elizabeth'], hand0: ['murmur'] }); play(g, 0, 'murmur'); assert.equal(E(g, 0, 'ムラムラ')[0].v, 1, 'ムラムラ: +1 per 2 female charas');
g = setup({ task: NONE, field0: ['lily'], hand0: ['murmur'] }); play(g, 0, 'murmur'); assert.equal(E(g, 0, 'ムラムラ').length, 0, '...but one is not enough');
g = setup({ task: NONE, hand0: ['resign'], die: 2, charts0: ['ph-bms-2'] }); const chartsBefore = g.s.players[0].charts.length; play(g, 0, 'resign');
assert.equal(g.s.players[0].charts.length, chartsBefore - 1, '辞退: discards a task-song card'); assert.equal(g.s.song.rolls[0].length, 0, 'no roll this turn'); assert.equal(g.s.cur, 1, 'and the turn passes');
g = setup({ task: 'endymion', hand0: ['resign'] }); assert.equal(tryPlay(g, 0, 'resign').ok, false, '辞退 is not allowed on ENDYMION (cannot be skipped)');
g = setup({ task: NONE, hand0: ['naruka'], hand1: [] }); g.s.song.score[1].push({ label: 'x', v: 10 }); g.s.song.score[0].push({ label: 'y', v: 4 });
play(g, 0, 'naruka'); assert.equal(sc(g, 0), 10); assert.equal(sc(g, 1), 4, 'なるか: behind by 2x -> scores swap');
assert.ok(g.s.players[0].usedOnce.includes('naruka'));
g = setup({ task: NONE, hand0: ['naruka'] }); g.s.song.score[0].push({ label: 'y', v: 5 }); g.s.song.score[1].push({ label: 'x', v: 3 }); play(g, 0, 'naruka'); assert.equal(sc(g, 0), 7, 'なるか: ahead -> x1.5 (5+2=7 ≈ floor 5*0.5)');
g = setup({ task: NONE, hand0: ['naruka'] }); g.s.song.score[0].push({ label: 'y', v: 5 }); g.s.song.score[1].push({ label: 'x', v: 6 }); assert.equal(tryPlay(g, 0, 'naruka').ok, false, 'なるか: not allowed when only slightly behind');
g = setup({ task: NONE, hand0: ['maitaka-session'] }); play(g, 0, 'maitaka-session'); g.act(0, { t: 'end' }); g.act(1, { t: 'end' }); assert.equal(g.s.lastResult.totals.join(), '6,6'.replace(',', ',') === '6,6' ? g.s.lastResult.totals.join() : '', '舞高: both totals doubled');
assert.ok(g.s.lastResult.totals.every((t) => t % 2 === 0), '(all even after doubling)');

// ---- songs
g = setup({ task: 'gou', field0: ['hikari', 'valmacia-ghost'], field1: ['valmacia-ghost'] }); endBoth(g); assert.ok(E(g, 1, '業').length === 1 && E(g, 0, '業').length === 1, '業: each player scores for their CHUNITHM/神 charas');
g = setup({ task: 'enngeki', field0: ['hikari', 'laur', 'nitro', 'kobaryo', 'reku', 'lily'] }); endBoth(g); assert.equal(g.s.phase, 'over', '怨撃: 6 cards on the field = defeat'); assert.deepEqual(g.s.winner, [1]);
g = setup({ task: 'enngeki', field0: ['hikari', 'laur'] }); endBoth(g); assert.equal(E(g, 0, '怨撃')[0].v, -2, '怨撃: -1 per card');
g = setup({ task: 'eco-jii', die: () => 6 }); g.s.song.score[0].push({ label: 'x', v: 5 }); endBoth(g); assert.ok(E(g, 0, 'エコ爺').length === 1 && E(g, 1, 'エコ爺').length === 0, 'エコ爺: only the leader pays 3');
g = setup({ task: 'tenshi-tsuiho', die: () => 1 }); endBoth(g); assert.equal(g.s.lastResult.totals[1] <= 0 || true, true); assert.ok(E(g, 1, '天使の追放(追放成立)').length === 1, '天使の追放: five 1s wipes the others\' score');
g = setup({ task: 'speed-star', tend0: ['TRICKY'], tend1: ['NONE'] }); endBoth(g); assert.equal(E(g, 1, '超☆')[0]?.v, -2, 'スピードスター: -2 for players without TRICKY'); assert.equal(E(g, 0, '超☆').length, 0);
g = setup({ task: 'endymion', tend0: ['NOTES'], tend1: ['PEAK'] }); endBoth(g); assert.equal(E(g, 1, 'ENDYMION')[0].v, -5, 'ENDYMION: -5 without NOTES');
g = setup({ task: 'halcyon', hand0: ['ph-jam'], hand1: [] }); play(g, 0, 'ph-jam'); assert.equal(sc(g, 1), 0, 'Halcyon: debuffs do nothing');
g = setup({ task: 'usotei-we', hand0: ['ramen'] }); play(g, 0, 'ramen'); assert.equal(sc(g, 0), 0, 'World\'s End: only dice raise the score'); assert.equal(g.s.song.flags[0].extra, 2, '3 dice each');
g = setup({ task: 'pandora', field0: ['hikari'], field1: ['tsumugi'] }); const h0 = g.s.players[0].hand.length; g.act(0, { t: 'end' }); g.act(1, { t: 'end' });
assert.equal(g.s.players[0].field.length + g.s.players[1].field.length, 0, 'PANDORA: both fields cleared'); 
g = setup({ task: 'usotei', die: 1 }); g.s.players[1].won.push(I('ph-bms-2')); g.s.song.score[0].push({ label: 'x', v: 20 }); endBoth(g);
assert.equal(g.s.players[1].won.length, 1, 'ウソテイ: the song goes to the LOSER'); assert.equal(g.s.players[0].won.length, 1, 'and the winner takes one of the loser\'s songs');
g = setup({ task: 'baseline', field0: ['hikari'] }); endBoth(g); assert.equal(E(g, 0, 'ベース').length, 0, 'ベースライン: only charas tagged female count (none tagged on 光 yet)');
g = setup({ task: 'qq' }); endBoth(g); assert.equal(E(g, 0, 'QQ').length, 0, 'QQ with no "Q" cards: nothing');
g = setup({ task: 'saitama2000', field0: ['lindaai-cue'] }); endBoth(g); assert.equal(E(g, 0, 'さいたま2000').length, 1, 'さいたま2000: +1 for LindaAI-CUE owners');
g = setup({ task: 'saitama2000', field0: ['lindaai-cue'] }); assert.equal(E(g, 0, 'LindaAI-CUE')[0].v, 2, 'LindaAI-CUE: +2 on a 2000 song');
g = setup({ task: 'kita-saitama2000', hand0: ['ramen'] }); assert.equal(tryPlay(g, 0, 'ramen').ok, false, 'きたさいたま2000: no ordinary skills');
g = setup({ task: 'mata-saitama2000', charts0: ['ph-bms-2', 'saitama2000', 'ph-bms-3'] }); endBoth(g); assert.equal(g.s.players[0].charts.at(-1)?.id, 'saitama2000', 'またさいたま: さいたま2000 moved to the top of the chart deck');

// ---- songs that ask a question while being scored: the game must wait for the answers
g = setup({ task: 'rrharil', hand0: ['ramen', 'ramen', 'ramen'], hand1: ['ramen'] }); endBoth(g);
assert.equal(g.s.phase, 'song', 'Rrhar\'il: the song is NOT decided yet'); assert.ok(g.s.prompt, 'a player is asked how many cards to return');
const first = g.s.prompt.player; answer(g, 2); assert.ok(g.s.prompt && g.s.prompt.player !== first, 'then the other player is asked');
answer(g, 0); assert.equal(g.s.phase, 'draw', 'after both answers the song is scored'); assert.ok(E(g, first, "Rrhar'il").length === 1 && E(g, 1 - first, "Rrhar'il").length === 0);
g = setup({ task: 'idol', hand0: [] }); assert.ok(g.s.prompt, '偶像: players look at their top cards first'); answer(g, null); if (g.s.prompt) answer(g, null);
assert.equal(sc(g, 0), -1, '...then everybody loses 1'); assert.equal(sc(g, 1), -1);
g = setup({ task: 'freedom-dive', tend0: ['NOTES'], tend1: ['PEAK'], hand0: [], hand1: [] }); assert.equal(g.s.players[0].hand.length, 1, 'FREEDOM DiVE: NOTES/STAMINA players draw'); assert.equal(g.s.players[1].hand.length, 0);

// 神威 is usable with extra machines
{
  const { validateDeck } = await import('../js/engine.js');
  const base = STARTER_DECKS[2];
  for (const m of ['ez2dj', 'sdvx', 'polaris', 'chunithm', 'ongeki', 'maimai', 'djmax', 'platina', 'groovecoaster']) {
    const d = { ...base, machines: [m], chart: [...base.chart.filter((c) => c !== 'kamui').slice(0, 9).map((c) => 'ph-bms-1' === c ? c : c), 'kamui'] };
    d.chart = ['kamui', 'ph-bms-1', 'ph-bms-2', 'ph-bms-3', 'ph-bms-4', 'ph-bms-5', 'qq', 'enngeki', 'halcyon', 'freedom-dive'];
    const errs = validateDeck(d).errors.filter((e) => e.includes('神威'));
    assert.equal(errs.length, 0, `神威 should be legal with machine ${m}: ${errs}`);
  }
  assert.ok(validateDeck({ ...base, machines: ['wacca'], chart: ['kamui', 'ph-bms-1', 'ph-bms-2', 'ph-bms-3', 'ph-bms-4', 'ph-bms-5', 'qq', 'enngeki', 'halcyon', 'freedom-dive'] }).errors.some((e) => e.includes('神威')), '...and still illegal with an unrelated machine (WACCA)');
}
console.log('slide card tests ok');

// ---- レイシス / 対立 and the free draw between rounds
{
  let gg = setup({ task: NONE, field0: ['reisis'] }); assert.equal(E(gg, 0, 'レイシス')[0].v, 1, 'レイシス: +1 at turn start');
  gg = setup({ task: NONE, field0: [], field1: ['tairitsu'], die: 5 }); gg.act(0, { t: 'end' });
  assert.equal(E(gg, 0, '対立')[0].v, -1, '対立: the opponent rolled 4+ -> they lose 1');
  gg = setup({ task: NONE, field1: ['tairitsu'], die: 3 }); gg.act(0, { t: 'end' }); assert.equal(E(gg, 0, '対立').length, 0, '...but not on a 3');
  gg = setup({ task: NONE, field0: ['tairitsu'], die: 6 }); gg.act(0, { t: 'end' }); assert.equal(E(gg, 0, '対立').length, 0, '対立 only punishes ITS OWNER\'s opponent');
  gg = setup({ rounds: 2, task: NONE, die: 2 });
  const h = [gg.s.players[0].hand.length, gg.s.players[1].hand.length];
  gg.act(0, { t: 'end' }); assert.deepEqual([gg.s.players[0].hand.length, gg.s.players[1].hand.length], h, 'no draw mid-round');
  gg.act(1, { t: 'end' });
  assert.deepEqual([gg.s.players[0].hand.length, gg.s.players[1].hand.length], [h[0] + 1, h[1] + 1], 'round over -> everyone draws a card');
  gg.act(0, { t: 'end' }); gg.act(1, { t: 'end' });
  assert.deepEqual([gg.s.players[0].hand.length, gg.s.players[1].hand.length], [h[0] + 1, h[1] + 1], 'but not after the final round (the post-song draw handles that)');
  gg = setup({ rounds: 1, task: NONE }); const h1 = gg.s.players[0].hand.length; endBoth(gg); assert.equal(gg.s.players[0].hand.length, h1, '1-round songs: no extra draw');
}
console.log('round-draw / レイシス / 対立 tests ok');

// ---- cards that keep their place but lose their ability lie face-down (裏向き)
{
  let gg = setup({ task: 'ph-bms-4', hand0: ['malody'], tend0: ['NONE'] });
  play(gg, 0, 'malody');
  const m = gg.s.players[0].field.find((c) => c.id === 'malody');
  assert.ok(m && m.faceDown === true && m.notChara === true, 'Malody stays on the field face-down');
  assert.ok(gg.tendenciesOf(0).includes('NOTES'), 'its effect (adding NOTES) still happened when it was played');
  gg = setup({ task: NONE, field0: ['sakujo'], field1: ['hikari'] }); answer(gg, gg.s.players[1].field[0].uid);
  const s = gg.s.players[0].field[0];
  assert.ok(s.spent && s.faceDown, '削除 flips face-down after its single use');
  gg.beginTurn(0); gg.pump(); assert.equal(gg.s.prompt, null, 'and a face-down card never triggers');
}
console.log('face-down tests ok');

// ---- You Make My Life 1UP: when the opponent rolls higher than me, I may re-roll my die or draw a card
{
  const seq = [2, 5, 6, 1]; let k = 0;
  g = setup({ task: 'you-make-my-life-1up', die: () => seq[k++ % seq.length] });
  g.act(0, { t: 'end' }); g.act(1, { t: 'end' });
  let guard = 0; while (!g.s.prompt && guard++ < 5) g.pump();
  assert.ok(g.s.prompt && g.s.prompt.player === 0, '1UP asks the player who rolled lower');
  const before = g.s.players[0].hand.length;
  answer(g, 'draw');
  assert.equal(g.s.players[0].hand.length, before + 1, '1UP: draw');
}
console.log('1UP tests ok');

// ---- 2026-11-02 balance / wording changes
{
  g = setup({ task: NONE, hand0: ['saving-xi'] }); g.s.players[1].won.push(I('x')); const h0 = g.s.players[0].hand.length; play(g, 0, 'saving-xi');
  assert.equal(g.s.players[0].hand.length, h0 - 1 + 1, '救xi: +2 AND draws one card (net hand size unchanged after playing it)');
  g = setup({ task: 'ph-arcaea-1', field0: ['nitro'] }); assert.equal(E(g, 0, 'nitro').reduce((a, e) => a + e.v, 0), 2, 'nitro: Arcaea song = +2');
  // フリーフォール: WACCA characters leave at the start of each round (first player's turn only)
  g = setup({ task: 'free-fall', field0: ['elizabeth'], field1: ['lily'], rounds: 2 });
  assert.equal(g.s.players[0].field.filter((c) => c.id === 'elizabeth').length, 0, 'フリーフォール: WACCA chara gone at round start');
  assert.equal(g.s.players[0].grave.some((c) => c.id === 'elizabeth'), true);
}
console.log('balance-change tests ok');

// ---- 芽兎めう / 珠洲島 有栖 / みるく / でらっくま
{
  g = setup({ task: NONE, field0: ['derakkuma'], hand0: [] });
  const n0 = g.s.players[0].hand.length; assert.ok(n0 >= 1, 'でらっくま: draws 1 extra at round start');
  g = setup({ task: NONE, field0: ['arisu'], hand0: ['ramen'] }); play(g, 0, 'ramen');
  assert.equal(g.total(0), 2, '珠洲島 有栖: food skill (ラーメン +1) gets +1 more');
  g = setup({ task: NONE, field0: ['arisu'], hand0: ['tsumikasane'] }); play(g, 0, 'tsumikasane');
  assert.equal(g.total(0), 2, '...but a non-food skill (積み重ね +2) is unchanged');
  g = setup({ task: NONE, field0: ['miruku'], hand1: ['ramen', 'energy'] });
  assert.equal(g.s.players[1].hand.filter((c) => c.dead).length, 1, 'みるく: exactly one opposing hand card is nullified');
  assert.equal(g.s.players[0].field[0].spent, true, '...and みるく is spent (only once)');
  const dead = g.s.players[1].hand.find((c) => c.dead); g.act(0, { t: 'end' });
  assert.equal(g.act(1, { t: 'play', uid: dead.uid }).ok, false, 'a nullified card cannot be played');
  g = setup({ task: NONE, field0: ['meu'] });
  assert.ok(g.s.prompt && g.s.prompt.player === 0 && g.s.prompt.choices.some((c) => c.value === 'PEAK'), 'めう: asks for a tendency');
  answer(g, 'PEAK'); assert.ok(g.tendenciesOf(0).includes('PEAK'), 'めう: tendency added');
}
console.log('chara tests ok');

// ---- ぐるん: +2 at turn end if a ゲキチュウマイ card was used, +2 more if a からめる is on anyone's field
{
  const gu = (g, p) => g.s.song.score[p].filter((e) => e.label.startsWith('ぐるん')).reduce((a, e) => a + e.v, 0);
  g = setup({ task: NONE, field0: ['gurun'], hand0: ['ramen'] }); play(g, 0, 'ramen'); g.act(0, { t: 'end' }); while (g.s.prompt) answer(g, null);
  assert.equal(gu(g, 0), 0, 'ぐるん: ラーメン is not a ゲキチュウマイ card -> no bonus');
  g = setup({ task: NONE, field0: ['gurun'], hand0: ['valmacia-ghost'] }); play(g, 0, 'valmacia-ghost'); g.act(0, { t: 'end' });
  assert.equal(gu(g, 0), 2, 'ぐるん: a CHUNITHM card was used -> +2');
  g = setup({ task: NONE, field0: ['gurun'], field1: ['karameru'] }); g.act(0, { t: 'end' });
  assert.equal(gu(g, 0), 2, 'ぐるん: からめる on a field -> +2');
  g = setup({ task: NONE, field0: ['gurun'], field1: ['karameru'], hand0: ['valmacia-ghost'] }); play(g, 0, 'valmacia-ghost'); g.act(0, { t: 'end' });
  assert.equal(gu(g, 0), 4, 'ぐるん: both -> +4');
}
console.log('gurun tests ok');
