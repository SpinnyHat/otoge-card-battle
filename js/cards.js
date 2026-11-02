// Card database.  Cards are plain data; effects are declarative (see effects.js for the vocabulary).
//
//   type      : 'chara' | 'skill' | 'chart' | 'machine'
//   source    : small tag over the art (game / series the card comes from)
//   footer    : tag line at the bottom of the card
//   attr      : icon key shown top-right (see ATTR_ICONS)
//   tendency  : (chart only) one of TENDENCIES
//   machine   : (chart only) machine card id the song belongs to ('bms' = unaffiliated)
//   effects   : [{ when, cond?, ops:[...] }]       (vocabulary in effects.js)
//   wip       : true  -> text is shown but the effect is not implemented yet
//   placeholder: true -> invented filler so decks are legal; replace with real cards

import { realChara, realSkills, realCharts, realMachines } from './cards-real.js';
import { slideChara, slideSkills, slideCharts, slideMachines } from './cards-slides.js';

export const GAME_TITLE = 'Rhythm Card Battle';

export const TENDENCIES = ['NONE', 'NOTES', 'PEAK', 'TECH', 'STAMINA', 'TRICKY', 'SPECIAL'];

// GUESS: which icon represents which tendency.  Edit freely.
export const TENDENCY_ICON = {
  NONE: 'half', NOTES: 'piano', PEAK: 'gloves', TECH: 'joystick',
  STAMINA: 'muscle', TRICKY: 'joker', SPECIAL: 'kyo',
};
export const TYPE_ICON = { chara: 'person', chart: 'note', skill: 'sparkle', machine: 'menu' };
export const ATTR_ICONS = ['up','down','half','joystick','note','sparkle','person','piano','joker','kyo','gloves','muscle','menu'];

const S = 'サイコロ';
const art = (n) => `assets/art/${n}.jpg`;

/* ---------------------------------------------------------------- machines */
const machines = [
  ['maimai', 'maimai', '#e8a0c0'], ['ongeki', 'オンゲキ', '#b8c4ff'], ['gfdm', 'ギタドラ/ドラマニ', '#d0182c'],
  ['arcaea', 'Arcaea', '#d9d3f0'], ['bms', 'BMS', '#bbbbbb'], ['sdvx', 'SDVX', '#8ad0ff'],
].concat(realMachines.concat(slideMachines).map(([id, name, theme]) => [id, name, theme])).map(([id, name, theme]) => ({
  id, type: 'machine', name, theme, source: '機種', footer: '機種カード', attr: 'menu', placeholder: true,
  group: ['gfdm', 'sdvx', 'ddr', 'beatmania'].includes(id) ? 'bemani' : null,
  text: ['この機種の譜面を山札に入れられる。(固有効果は未定)'], effects: [],
}));

/* ------------------------------------------------------------------- chara */
const chara = [
  {
    id: 'mendako', name: 'メンダコちゃん', source: 'BMS', art: art('mendako'), attr: 'half',
    flavor: 'これってババ抜きですか？', footer: S,
    text: [`${S}を振る際、このカードを使える。`, `自分が振る次の${S}の出目を1から6まで1つ好きに選ぶことができる。その後、このカードを裏にする。(裏になったカードの効果は発動しない)`],
    effects: [{ when: 'diceRoll', ops: [{ op: 'chooseDie', min: 1, max: 6 }, { op: 'flip', to: 'down' }] }],
  },
  {
    id: 'hikari', name: '光', source: 'Arcaea', art: art('hikari'), attr: 'up',
    flavor: 'ひかりです！最近ぬいぐるみになりました！', footer: '光',
    text: ['自身のターンの開始時に、スコア＋1'],
    effects: [{ when: 'turnStart', ops: [{ op: 'score', who: 'self', n: 1 }] }],
  },
  {
    id: 'sakujo', name: '削除', source: '', art: art('sakujo'), attr: 'half', theme: '#555', tags: ['gomamayo'],
    flavor: 'オムライスすごい食べたい', footer: 'コンポーザー、ゴママヨ',
    text: ['場に出したあと1度だけ、自身のターン開始時に、相手の場のカードを1枚選んで墓地に捨ててよい。使った後もこのカードは場に残る。'],
    balance: '調整: 使い切り(1回だけ)。元は毎ターン使えた。使用後もカードは場に残る',
    // implemented as: pick one chara on the opponent's field -> grave, once; the card then stays (spent)
    effects: [{ when: 'turnStart', cond: { notSpent: true }, ops: [{ op: 'pickToGrave', from: 'oppField', optional: true, once: true }] }],
  },
  {
    id: 'tsumugi', name: '東雲つむぎ', source: 'オンゲキ', art: art('tsumugi'), attr: 'up',
    flavor: 'こっちをジロジロ見ないでください。「これ」鳴らしますよ？', footer: 'シューター',
    text: ['自身のターンの開始時に、山札から1枚引き手札に加える。'],
    effects: [{ when: 'turnStart', ops: [{ op: 'draw', who: 'self', n: 1 }] }],
  },
  // ---- placeholders
  {
    id: 'ph-scorer', name: 'ハイスコアラー(仮)', source: '仮', attr: 'up', placeholder: true,
    flavor: '仮カード', footer: 'プレイヤー',
    text: [`場に出した次の曲から、各曲の最初のラウンドで自身が${S}を振る際、出目に＋1する。`],
    effects: [{ when: 'diceRoll', auto: true, cond: { notJustPlayed: true, firstRound: true }, ops: [{ op: 'rollBonus', n: 1 }] }],
  },
  {
    id: 'ph-dj', name: '見習いDJ(仮)', source: '仮', attr: 'half', placeholder: true,
    flavor: '仮カード', footer: 'プレイヤー',
    text: ['自身のターンの開始時に、山札から1枚引き手札に加える。その後、自身の手札からランダムに1枚墓地に捨てる。'],
    effects: [{ when: 'turnStart', ops: [{ op: 'draw', who: 'self', n: 1 }, { op: 'discard', who: 'self', from: 'hand', n: 1, random: true }] }],
  },
  {
    id: 'ph-regular', name: 'ゲーセン常連(仮)', source: '仮', attr: 'up', placeholder: true,
    flavor: '仮カード', footer: 'プレイヤー',
    text: ['自身のターンの開始時に、自身の勝利数が相手より少ない場合、スコア＋2'],
    effects: [{ when: 'turnStart', cond: { behind: true }, ops: [{ op: 'score', who: 'self', n: 2 }] }],
  },
  {
    id: 'ph-nervous', name: '緊張しいの子(仮)', source: '仮', attr: 'down', placeholder: true,
    flavor: '仮カード', footer: 'プレイヤー',
    text: ['自身のターンの開始時に、スコア－2。', `場に出した次の曲から、各曲の最初のラウンドで自身が${S}を振る際、出目に＋2する。(サイコロを何回も振る時に真価を発揮)`],
    effects: [
      { when: 'turnStart', ops: [{ op: 'score', who: 'self', n: -2 }] },
      { when: 'diceRoll', auto: true, cond: { notJustPlayed: true, firstRound: true }, ops: [{ op: 'rollBonus', n: 2 }] },
    ],
  },
].map((c) => ({ type: 'chara', ...c }));

/* ------------------------------------------------------------------- skill */
const skill = [
  {
    id: 'gomamayo-yokushi', name: 'ゴママヨ抑止', source: '', art: art('gomamayo'), attr: 'half', tags: ['gomamayo'], reactOnly: true, noReact: true,
    flavor: '(これ抜擢したらゴママヨってバレるな…)', footer: 'ゴママヨ',
    text: ['相手が「ゴママヨ」の効果を発動する際、このカードを使える。', '相手が発動した「ゴママヨ」の効果を一度だけ無効化する。(ただし、永続的な効果はそのターン限定で無効化するものとする)'],
    // reaction card: it is never played proactively — the game asks the holder whenever an opposing ゴママヨ effect is about to resolve
    effects: [{ when: 'react', ops: [{ op: 'negate' }] }],
  },
  { id: 'ph-combo', name: 'コンボ継続(仮)', text: ['スコア＋2'], ops: [{ op: 'score', who: 'self', n: 2 }] },
  { id: 'ph-draw', name: '連打ドロー(仮)', text: ['山札から2枚引き手札に加える。'], ops: [{ op: 'draw', who: 'self', n: 2 }] },
  { id: 'ph-focus', name: '集中(仮)', text: [`この曲で自身が次に${S}を振る際、2回振って高い方を出目とする。`], ops: [{ op: 'rollBest' }] },
  { id: 'ph-tempo', name: 'ハイスピード(仮)', text: ['スコア＋1。その後、山札から1枚引き手札に加える。'], ops: [{ op: 'score', who: 'self', n: 1 }, { op: 'draw', who: 'self', n: 1 }] },
  { id: 'ph-jam', name: 'ジャミング(仮)', attr: 'down', text: ['相手のスコア－2'], ops: [{ op: 'score', who: 'opp', n: -2 }] },
  { id: 'ph-recover', name: 'リカバリー(仮)', text: ['自身の墓地のスキルカードを1枚選び、手札に加える。'], ops: [{ op: 'recover' }] },
  { id: 'ph-fc', name: 'フルコンボ(仮)', text: ['スコア＋3。その後、自身の手札からランダムに2枚墓地に捨てる。'], ops: [{ op: 'score', who: 'self', n: 3 }, { op: 'discard', who: 'self', from: 'hand', n: 2, random: true }] },
  { id: 'ph-mulligan', name: 'マリガン(仮)', text: ['自身の手札を全て山札に戻しシャッフルする。その後、同じ枚数を山札から引き手札に加える。'], ops: [{ op: 'mulligan' }] },
  { id: 'ph-lucky', name: 'ラッキーフロア(仮)', text: [`この曲で自身が次に${S}を振る際、出目に＋2する。`], ops: [{ op: 'nextRollBonus', n: 2 }] },
  { id: 'ph-clutch', name: 'ラストスパート(仮)', text: ['相手が勝利した課題曲1枚につき、スコア＋1'], ops: [{ op: 'scoreByOppWins' }] },
  { id: 'ph-steal', name: 'ひったくり(仮)', attr: 'down', text: ['相手の手札からランダムに1枚選び、自身の手札に加える。'], ops: [{ op: 'steal' }] },
].map((c) => ({
  type: 'skill', source: c.placeholder === false ? '' : '仮', attr: 'half', flavor: c.wip ? c.flavor : '仮カード', footer: 'スキル',
  placeholder: !c.id.startsWith('gomamayo'),
  effects: c.ops ? [{ when: 'play', ops: c.ops }] : c.effects, ...c,
}));
// `ops` was only a authoring shortcut
skill.forEach((c) => { delete c.ops; });

/* ------------------------------------------------------------------- chart */
const realCharts0 = [
  {
    id: 'if-u', name: 'IF:U', source: 'maimai', composer: 'maimai', art: art('ifu'), attr: 'piano', machine: 'maimai', tendency: 'NOTES',
    flavor: 'オトモダチ対戦伝導楽曲！！', footer: S,
    text: [`この楽曲のスコアは、(対戦中に${S}を振った数)×(＋1)される。`],
    effects: [{ when: 'resolve', ops: [{ op: 'resultScoreByRolls', who: 'owner' }] }],
  },
  {
    id: 'black-market-blues', name: 'Black Market Blues', source: 'ギタドラ/ドラマニ', attr: 'half', theme: '#d0182c',
    machine: 'gfdm', tendency: 'NONE', flavor: '9mm parabellum bullet', footer: 'J-ALTERNATIVE', wip: true,
    text: ['ブラックマーケットブルーズでオマエを狂わせてしまいたいのさ', '演奏時間が218秒以上のカードが他のプレイヤーによってプレイされたとき、それを代わりに自分のものとしてプレイできる'],
    effects: [],
  },
].map((c) => ({ type: 'chart', ...c }));

const mk = (machine, tag, rows) => rows.map(([n, tend, bonus]) => ({
  id: `ph-${machine}-${n}`, type: 'chart', name: `サンプル曲 ${tag}-${n}`, source: '仮', machine, tendency: tend, attr: TENDENCY_ICON[tend],
  placeholder: true, flavor: '仮カード', footer: tend,
  text: bonus ? [`この課題曲を選曲したプレイヤーのリザルトのスコア＋${bonus}`] : ['(効果なし)'],
  effects: bonus ? [{ when: 'resolve', ops: [{ op: 'resultScore', who: 'owner', n: bonus }] }] : [],
}));
const placeholderCharts = [
  ...mk('maimai', 'MAI', [[1, 'PEAK', 1], [2, 'TECH', 0], [3, 'STAMINA', 1]]),
  ...mk('ongeki', 'ONG', [[1, 'NOTES', 0], [2, 'TRICKY', 1], [3, 'SPECIAL', 0]]),
  ...mk('gfdm', 'GD', [[1, 'STAMINA', 0], [2, 'PEAK', 1], [3, 'NONE', 1]]),
  ...mk('arcaea', 'ARC', [[1, 'TECH', 1], [2, 'NOTES', 0], [3, 'TRICKY', 0]]),
  ...mk('bms', 'BMS', [[1, 'NONE', 0], [2, 'SPECIAL', 1], [3, 'TECH', 1], [4, 'PEAK', 0], [5, 'STAMINA', 1]]),
  ...mk('sdvx', 'SDV', [[1, 'NOTES', 1], [2, 'SPECIAL', 0]]),
];

/* --------------------------------------------------------------- catalogue */
export const CARDS = {};

const oldReal = [...realCharts0];
for (const c of [...machines, ...chara, ...realChara, ...slideChara, ...skill, ...realSkills, ...slideSkills, ...oldReal, ...realCharts, ...slideCharts, ...placeholderCharts]) {
  if (CARDS[c.id]) throw new Error('duplicate card id ' + c.id);
  CARDS[c.id] = c;
}
export const getCard = (id) => CARDS[id];
// a song can belong to several machines (e.g. a crossover): `machine` + optional `alsoMachines`
export const machinesOf = (c) => [].concat(c.machine || [], c.alsoMachines || []);
export const cardsOfType = (t) => Object.values(CARDS).filter((c) => c.type === t);

/* ---------------------------------------------------------- starter decks */
const skills10 = ['ph-combo', 'ph-draw', 'ph-focus', 'ph-tempo', 'ph-jam', 'ph-recover', 'ph-fc', 'ph-mulligan', 'ph-lucky', 'ph-clutch'];
const twice = (a) => a.flatMap((x) => [x, x]);

export const STARTER_DECKS = [
  {
    name: 'スターターA (maimai/オンゲキ)', tendency: 'NOTES', machines: ['maimai', 'ongeki'],
    chara: ['hikari', 'tsumugi', 'mendako', 'sakujo', 'ph-scorer'],
    skill: twice(skills10),
    chart: ['if-u', 'ph-maimai-1', 'ph-maimai-2', 'ph-maimai-3', 'ph-ongeki-1', 'ph-ongeki-2', 'ph-ongeki-3', 'ph-bms-1', 'ph-bms-2', 'ph-bms-3'],
  },
  {
    name: 'スターターB (ギタドラ/Arcaea)', tendency: 'PEAK', machines: ['gfdm', 'arcaea'],
    chara: ['ph-regular', 'ph-dj', 'ph-nervous', 'ph-scorer', 'hikari'],
    skill: twice([...skills10.slice(0, 9), 'ph-steal']),
    chart: ['black-market-blues', 'ph-gfdm-1', 'ph-gfdm-2', 'ph-gfdm-3', 'ph-arcaea-1', 'ph-arcaea-2', 'ph-arcaea-3', 'ph-bms-4', 'ph-bms-5', 'ph-bms-1'],
  },
];

STARTER_DECKS.push(
  {
    name: 'スライドA (アーケア/WACCA)', tendency: 'NOTES', machines: ['arcaea', 'wacca', 'maimai'],
    chara: ['hikari', 'laur', 'nitro', 'lily', 'elizabeth'],
    skill: twice(['ramen', 'energy', 'anmitsu', 'jiro', 'saving-xi', 'sorekudaxi', 'xi-reroll', 'man-xi', 'tsumikasane', 'netami']),
    chart: ['if-u', 'sheriruth', 'sheriruth-remix', 'aether-crest', 'mare-maris', 'ph-maimai-1', 'free-fall', 'data-error', 'meinichi', 'doppelganger'],
  },
  {
    name: 'スライドB (ギタドラ/DJ)', tendency: 'PEAK', machines: ['gfdm', 'ongeki'],
    chara: ['tsumugi', 'mendako', 'reku', 'dj-myosuke', 'dj-yoshitaka'],
    skill: twice(['ramen', 'energy', 'anmitsu', 'nenchaku', 'gokugen', 'tsumikasane', 'man-xi', 'ichixi', 'equalizer', 'xi-reroll']),
    chart: ['black-market-blues', 'joe-fight', 'mopemope', 'breakcore', 'not-equal', 'seven77', 'death-pit', 'were-back', 'chozetsu', 'ph-ongeki-1'],
  },
);
export const MACHINE_GROUP = Object.fromEntries(machines.map((m) => [m.id, m.group]));
