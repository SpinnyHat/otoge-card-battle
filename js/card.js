// Renders a card as DOM. Layout follows the hand-drawn card template (header / art / flavour / text / footer).
import { getCard, TYPE_ICON, TENDENCY_ICON } from './cards.js';

const icon = (k) => { const i = document.createElement('img'); i.className = 'ic'; i.src = `assets/icons/${k}.png`; i.alt = ''; i.draggable = false; return i; };
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

// opts: faceDown, size ('xs'|'sm'|'md'|'lg'|'xl'), count, dim, selected
export function cardEl(idOrCard, opts = {}) {
  const c = typeof idOrCard === 'string' ? getCard(idOrCard) : idOrCard;
  const root = el('div', `card size-${opts.size || 'md'}`);
  if (opts.uid != null) root.dataset.uid = opts.uid;
  if (opts.dim) root.classList.add('dim');
  if (opts.selected) root.classList.add('sel');
  if (opts.faceDown || !c) { root.classList.add('back'); root.append(el('div', 'back-mark', '♪')); return root; }
  root.dataset.id = c.id;
  root.classList.add('t-' + c.type);
  if (c.theme) root.style.setProperty('--theme', c.theme);
  if (c.wip) root.classList.add('wip');

  const hd = el('div', 'hd');
  const name = el('div', 'nm', c.name);
  const units = [...c.name].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 1 : 0.55), 0);
  name.style.fontSize = `min(6.8cqw, ${(72 / Math.max(units, 1)).toFixed(2)}cqw)`;
  const right = c.type === 'chart' && c.tendency && !c.attr ? TENDENCY_ICON[[].concat(c.tendency)[0]] : c.attr || 'half';
  hd.append(icon(TYPE_ICON[c.type]), name, icon(right));

  const art = el('div', 'art');
  if (c.art) { const im = el('img'); im.src = c.art; im.alt = ''; im.draggable = false; art.append(im); }
  else {
    const h = hash(c.id) % 360;
    art.style.background = `linear-gradient(135deg, hsl(${h} 55% 62%), hsl(${(h + 50) % 360} 60% 36%))`;
    art.append(el('div', 'ph-glyph', c.type === 'chart' ? '♪' : c.type === 'skill' ? '✦' : c.type === 'machine' ? '☰' : '☺'));
  }
  if (c.source) art.append(el('span', 'src', c.source));

  const fl = el('div', 'fl', c.flavor || '');
  const tx = el('div', 'tx');
  const ul = el('ul');
  for (const t of c.text || []) ul.append(el('li', null, t));
  tx.append(ul);
  // bigger text for short effects, shrink only as much as needed for long ones
  const len = (c.text || []).join('').length;
  tx.style.fontSize = (len < 45 ? 5 : len < 80 ? 4.4 : len < 120 ? 3.9 : len < 170 ? 3.4 : len < 230 ? 3 : 2.6) + 'cqw';
  if (c.type === 'chart' && c.tendency) tx.append(el('div', 'meta', `傾向: ${[].concat(c.tendency).join('/')}${c.composer ? ' / ' + [].concat(c.composer).join(',') : ''}`));
  const ft = el('div', 'ft', c.footer || '');
  root.append(hd, art, fl, tx, ft);
  if (c.placeholder) root.append(el('div', 'badge ph', '仮'));
  if (c.unverified) root.append(el('div', 'badge uv', '要確認'));
  if (c.wip) root.append(el('div', 'badge wipb', '効果未実装'));
  if (opts.spent) root.append(el('div', 'badge spent', '使用済み'));
  if (opts.count != null) root.append(el('div', 'count', '×' + opts.count));
  return root;
}
