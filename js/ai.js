// CPU opponent. Works on the same sanitized view a human gets (no cheating).
// levels: easy = plays at random, normal = plays most cards, hard = plays everything useful and picks well.
import { getCard } from './cards.js';
import { playCondViewOk, skillLockedView } from './effects.js';

export const LEVELS = { easy: 'かんたん', normal: 'ふつう', hard: 'つよい' };

const canPlay = (c) => c.type === 'chara' || (c.type === 'skill' && (c.effects || []).some((e) => e.when === 'play'));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

export function botAct(view, level = 'normal') {
  const me = view.you;
  const pr = view.prompt;
  if (pr && !pr.waiting && pr.player === me) {
    const ch = pr.choices;
    if (pr.cardId === 'gomamayo-yokushi') return { t: 'answer', v: level === 'easy' && Math.random() < 0.5 ? null : 1 };   // always counter an opposing ゴママヨ effect
    if (pr.reroll != null) return { t: 'answer', v: (level === 'easy' ? Math.random() < 0.5 : pr.reroll <= 3) ? 1 : null };
    if (pr.big && level !== 'easy') return { t: 'answer', v: Math.max(...ch.map((c) => c.value)) }; // always pick the best die
    if (pr.optional && Math.random() < (level === 'easy' ? 0.4 : level === 'normal' ? 0.2 : 0)) return { t: 'answer', v: null };
    return { t: 'answer', v: rnd(ch).value };
  }
  if (pr) return null;
  const mine = view.players[me];
  if (view.phase === 'rolloff') return mine.rolled == null ? { t: 'roll' } : null;
  if (view.phase === 'draw') {
    if (view.drawAns[me] != null) return null;
    if (level === 'easy') return { t: 'draw', n: Math.floor(Math.random() * 3) };
    return { t: 'draw', n: mine.pileCount > 8 ? 2 : mine.pileCount > 4 ? 1 : 0 }; // never draw itself out of cards
  }
  if (view.phase === 'song' && view.cur === me && view.stage === 'main') {
    const max = view.rules.maxPlays;
    if (max && view.song.plays[me] >= max) return { t: 'end' };
    const cards = mine.hand.map((c) => ({ c, d: getCard(c.id) })).filter((x) => !x.c.dead && canPlay(x.d) && playCondViewOk(view, x.d) && !skillLockedView(view, me, x.d));
    const p = level === 'easy' ? 0.4 : level === 'normal' ? 0.7 : 1;
    if (level !== 'hard') {
      const pick = [...cards].sort(() => Math.random() - 0.5).find(() => Math.random() < p);
      return pick ? { t: 'play', uid: pick.c.uid } : { t: 'end' };
    }
    // hard: with a per-turn card limit every play counts, so value each card by what it gives (mostly score now, some card flow)
    const behind = mine.won.length < Math.max(...view.players.filter((_, i) => i !== me).map((x) => x.won.length));
    const songsLeft = (view.rules.songsPerCredit - view.songNo) * (view.rules.turns || 1) + (view.rules.turns - view.song.pass);   // my remaining turns incl. later rounds
    const useful = mine.grave.some((g) => getCard(g.id).type === 'skill' && g.id !== 'ph-recover');
    const val = (d) => {
      if (d.type === 'chara') return 0.6 + 0.9 * Math.min(songsLeft, 3) * ((d.effects || []).some((e) => e.when === 'turnStart' || e.when === 'diceRoll') ? 1 : 0.3);
      let v = 0;
      for (const o of (d.effects.find((e) => e.when === 'play') || { ops: [] }).ops) {
        if (o.op === 'score') v += o.who === 'opp' ? -o.n * 0.9 : o.n * (o.cond?.behind ? (behind ? 1 : 0) : 1);
        else if (o.op === 'draw') v += 0.45 * o.n;
        else if (o.op === 'discard' || o.op === 'discardPick') v -= 0.5 * (o.n || 1);
        else if (o.op === 'recover') v += useful ? 0.8 : -9;
        else if (o.op === 'mulligan') v += mine.handCount <= 2 ? -9 : 0.1;
        else if (o.op === 'steal') v += 0.6;
        else if (o.op === 'nextRollBonus' || o.op === 'rollBest') v += 1.2;
        else if (o.op === 'rerollRight') v += 1.1;
        else if (o.op === 'lookPick') v += 0.5;
        else if (o.op === 'extraRolls') v += o.who === 'each' ? 0.1 : 3.5;
        else if (o.op === 'doubleRolls') v += 3.5;
        else if (o.op === 'addTendency') v += 0.7;
        else if (o.op === 'flag') v += o.flag === 'drawOnRoll' ? 0.45 : o.flag === 'envy' ? (behind ? 1.5 : 0.4) : o.flag === 'allTendencies' ? 0.6 : 0;
        else if (o.op === 'giveCard') v += (o.to === 'opp' ? 0.7 : -0.7) * Math.max(1, songsLeft);
        else if (o.op === 'negateLabel') v += 0.2;
        else if (o.op === 'keepOnField') v += 0;
        else v += 0.2;
      }
      return v;
    };
    const best = cards.map((x) => ({ ...x, v: val(x.d) })).sort((a, b) => b.v - a.v)[0];
    return best && best.v > 0.3 ? { t: 'play', uid: best.c.uid } : { t: 'end' };
  }
  return null;
}
