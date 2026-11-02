// Turns a card's declarative effects into plain Japanese, so the library can show what a card actually does.
import { getCard } from './cards.js';

const WHEN = {
  react: '相手が「ゴママヨ」の効果を発動する際 (自動で確認されます)', ability: '課題曲の間、任意のタイミングで (ボタンで発動)', turnStart: '自分のターン開始時 (各曲の最初のラウンドのみ)', diceRoll: 'サイコロを振る際', play: 'このカードを使用した時', resolve: 'リザルトを出す時',
  songStart: 'この楽曲が課題曲に選ばれた時', scoreGain: '自分のスコアが増える効果を得る度', skillScore: '自分のスコアを増やすスキルを使う度',
};
const ZONE = { grave: '(墓地にある間)', field: '(場にある間)', task: '(課題曲として選ばれている間)' };
const WHO = { self: '自分', opp: '相手', each: '両プレイヤー', owner: '選曲したプレイヤー', any: '全員' };
const nm = (id) => getCard(id)?.name || id;
const sgn = (n) => (n > 0 ? '＋' : '－') + Math.abs(n);

const COND = {
  notJustPlayed: () => '場に出した次の曲から',
  firstRound: () => '各曲の最初のラウンドのみ',
  taskMachineIn: (v) => `課題曲が ${v.join(' / ')} のいずれかの楽曲の場合`,
  notSpent: () => 'まだ使っていない場合 (1回だけ)',
  behind: () => '自分の獲得曲が相手より少ない場合',
  taskTendency: (v) => `課題曲の傾向が ${v.join(' / ')} の場合`,
  taskFav: () => '課題曲が自分の得意傾向の場合',
  taskMachine: (v) => `課題曲が ${v} の楽曲の場合`,
  taskGroup: (v) => `課題曲が ${v.toUpperCase()} の楽曲の場合`,
  taskComposer: (v) => `課題曲の作曲者が ${v} の場合`,
  taskCharter: (v) => `課題曲の譜面製作者が ${v} の場合`,
  taskJacket: (v) => `課題曲のジャケットが ${v} によるものの場合`,
  taskCollab: (v) => `課題曲が ${v} との合作の場合`,
  taskId: (v) => `課題曲が【${nm(v)}】の場合`,
  favHasAll: (v) => `得意傾向に ${v.join(' と ')} がある場合`,
  playedThis: (v) => `この曲で【${nm(v)}】を使用済みの場合`,
  fieldHas: (v) => `${WHO[v.who] || ''}の場に${v.name ? `キャラ【${v.name}】` : `${v.tag}キャラ`}がいる場合`,
};
const cond = (c) => (c ? Object.entries(c).map(([k, v]) => (COND[k] ? COND[k](v) : `${k}`)).join('、かつ') : '');

const OP = {
  score: (o) => `${WHO[o.who] || '自分'}のスコア${sgn(o.n)}${o.label ? `(「${o.label}」)` : ''}`,
  resultScore: (o) => `${WHO[o.who] || '自分'}のリザルトのスコア${sgn(o.n)}`,
  resultScoreByRolls: () => '(この曲でサイコロを振った回数)×(＋1) のスコアを得る',
  scoreByOppWins: () => '相手が勝利した課題曲1枚につきスコア＋1',
  scoreCount: (o) => `場の${o.tag || '対象'}${o.female ? '・女性キャラ' : ''}カード1枚につきスコア＋1`,
  draw: (o) => `${WHO[o.who] || '自分'}は山札から${o.n}枚引く`,
  discard: (o) => `${WHO[o.who] || '自分'}は${o.from === 'hand' ? '手札' : o.from}からランダムに${o.n}枚墓地に捨てる`,
  discardPick: (o) => `手札を${o.n || 1}枚選んで墓地に捨てる`,
  pickToGrave: () => '相手の場のカードを1枚選んで墓地に捨ててよい',
  chooseDie: (o) => `次に振るサイコロの出目を${o.min}から${o.max}まで好きに選ぶ`,
  flip: () => 'このカードを裏にする (裏のカードの効果は発動しない)',
  rollBonus: (o) => `サイコロの出目に${sgn(o.n)}`,
  nextRollBonus: (o) => `この曲で次に振るサイコロの出目に${sgn(o.n)}`,
  rollBest: () => 'この曲でサイコロを2回振って高い方を出目にする',
  rollBest2: () => '',
  recover: () => '墓地のスキルカードを1枚選んで手札に加える',
  mulligan: () => '手札を全て山札に戻してシャッフルし、同じ枚数を引く',
  steal: () => '相手の手札からランダムに1枚奪う',
  flag: (o) => ({ allFemale: '1曲の間、場のキャラ全員を女性として扱う', allTendencies: 'この曲の間、全ての得意傾向を得る', drawOnRoll: 'この番、サイコロを振るたびに1枚引く', envy: 'この曲で相手のリザルトが高かった場合、次の曲のスコア＋3', allMaimai: '場の全てのカードの機種をmaimaiとして扱う' }[o.flag] || o.flag),
  extraRolls: (o) => `${WHO[o.who] || '自分'}はこの番サイコロを${o.n}回多く振る`,
  lockPlays: () => 'このターンは、もうカードを使えなくなる',
  doubleRolls: () => 'この番サイコロを振れる回数が2倍になる',
  rerollRight: (o) => `この番サイコロの振り直し権を${o.n}回得る`,
  negateLabel: (o) => `このターンの「${o.label}」によるスコア減を無効化し、すでに受けた分も戻す`,
  addTendency: (o) => `得意傾向に ${o.t} を追加する`,
  keepOnField: () => '使用後、墓地ではなく場に置く (キャラカードとしては扱わない)',
  giveCard: (o) => `カード【${nm(o.id)}】を${WHO[o.to] || ''}の${{ grave: '墓地', field: '場', pile: '山札', hand: '手札' }[o.zone]}に加える`,
  lookPick: (o) => `自分の山札の上${o.n}枚を見て1枚を手札に加え、山札をシャッフルする`,
  sendOthersToGrave: (o) => `${WHO[o.who]}の場の【${o.except}】以外のキャラを墓地に送る`,
  sendTagToGrave: (o) => `${WHO[o.who]}の場の ${o.tag} キャラを全て墓地に送る`,
  replaceAllChara: (o) => `両プレイヤーのキャラを全て【${nm(o.id)}】に置き換える`,
  doppelganger: () => '同じ名前を含むキャラが2枚以上ある場合、それらを全て墓地に送る',
  morph: (o) => `この楽曲を【${nm(o.to)}】に変化させる`,
  triple: () => 'サイコロを3つ振り、ゾロ目ならスコア＋21。6が含まれる場合は【666】(場にRoughSketchがいなければ－18)',
  breakcore: () => '両プレイヤーは山札をシャッフルし、一番上のカードを場に出す(選曲者から効果発動)',
  deathPit: () => 'お互いにキャラカードを1枚墓地に送る',
  revive: () => '自分の墓地からキャラカードを1枚ランダムに手札へ戻す',
  yoshitaka: () => 'スコア＋2。3回目の発動時はスコアが無効になり、このカードを墓地に送る',
  aether: () => 'CHUNITHM/arcaeaキャラの数だけスコア＋、光が手札にある時さらに＋3',
  negate: () => '相手が発動した「ゴママヨ」の効果を1度だけ無効化する (永続効果はそのターン限定)',
  beam: () => '場のキャラ1枚、またはどちらかの山札の一番上を選んで墓地に置く',
  sacrifice: () => '自分のキャラ1枚を墓地に置く。そうしたら、可能な場合、相手も自分のキャラを墓地に置く',
  lifeSyndrome: () => '手札を1枚墓地に置く、または山札の一番上を墓地に置く',
};
const op = (o) => { const t = (OP[o.op] || (() => `(${o.op})`))(o); const c = cond(o.cond); return c ? `${c}: ${t}` : t; };

// -> [{ when, zone, cond, steps:[...] }]
export function describeEffects(card) {
  return (card.effects || []).filter((e) => e.ops).map((e) => ({
    when: WHEN[e.when] || e.when, zone: ZONE[e.zone] || '', auto: !!e.auto, cond: [cond(e.cond), e.playCond ? `使用条件: ${cond(e.playCond)}` : ''].filter(Boolean).join(' / '), steps: e.ops.map(op),
  }));
}
export function statusOf(card) {
  const out = [];
  if (card.wip) out.push({ k: 'wip', t: '効果未実装' }); else if (card.type !== 'machine') out.push({ k: 'ok', t: '実装済み' });
  if (card.placeholder) out.push({ k: 'ph', t: '仮カード' });
  if (card.unverified) out.push({ k: 'uv', t: '要確認 (スライドに無い項目を推測)' });
  if (card.token) out.push({ k: 'tk', t: 'トークン (デッキ不可)' });
  return out;
}

export const CATS = { score: 'スコア', draw: 'ドロー', disrupt: '妨害', dice: 'サイコロ', grave: '墓地', field: '場・キャラ操作' };
// derive filterable categories from what a card actually does
export function categories(card) {
  const out = new Set();
  for (const e of card.effects || []) for (const o of e.ops || []) {
    if (['score', 'resultScore', 'scoreCount', 'scoreByOppWins', 'resultScoreByRolls', 'yoshitaka', 'aether', 'triple'].includes(o.op)) out.add(o.who === 'opp' && o.n < 0 ? 'disrupt' : 'score');
    if (['draw', 'lookPick', 'mulligan'].includes(o.op)) out.add('draw');
    if (['steal', 'sendOthersToGrave', 'sendTagToGrave', 'deathPit', 'doppelganger', 'replaceAllChara', 'pickToGrave'].includes(o.op) || (o.op === 'giveCard' && o.to === 'opp')) out.add('disrupt');
    if (['chooseDie', 'rollBonus', 'nextRollBonus', 'rollBest', 'rerollRight', 'extraRolls', 'doubleRolls'].includes(o.op) || o.flag === 'drawOnRoll') out.add('dice');
    if (['recover', 'revive', 'discard', 'discardPick', 'lifeSyndrome'].includes(o.op)) out.add('grave');
    if (['sendOthersToGrave', 'sendTagToGrave', 'replaceAllChara', 'morph', 'breakcore', 'keepOnField', 'addTendency'].includes(o.op)) out.add('field');
  }
  if (card.type === 'chara') out.add('field');
  return [...out];
}
