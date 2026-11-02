// Keyboard navigation for every screen.
//   Arrows  : move focus to the nearest control in that direction (spatial, like a TV / game menu)
//   Enter / Space : activate the focused control          Esc : close pop-up / go back
// Screens add their own shortcuts through `keys.hook = (event) => handled`.
export const keys = { kbd: false, hook: null };

const NATIVE = 'button:not(:disabled), input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const CUSTOM = '.chip, .tab, .item, .lib .slot, .dot, .pickcard, .hslot, .stat.click, .errlink';
const TEXTY = (e) => e && ((e.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(e.type)) || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT');

// make div-style controls reachable (tabindex) — runs for everything added to the page, now and later
function prep(root) {
  if (!root.querySelectorAll) return;
  const list = root.matches?.(CUSTOM) ? [root, ...root.querySelectorAll(CUSTOM)] : root.querySelectorAll(CUSTOM);
  list.forEach((e) => { if (!e.hasAttribute('tabindex')) { e.setAttribute('tabindex', '0'); e.setAttribute('role', 'button'); } });
}

const visible = (e) => {
  const r = e.getBoundingClientRect();
  if (!r.width || !r.height || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
  if (e.closest('.sidebar:not(.open), #fxlayer, [hidden]')) return false;
  return true;
};
function scope() {
  const ov = [...document.querySelectorAll('.overlay')].pop();
  if (ov) return [ov];
  return [document.getElementById('app'), document.querySelector('.coach')].filter(Boolean);
}
export const candidates = () => scope().flatMap((s) => [...s.querySelectorAll(NATIVE)]).filter(visible);
const center = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

function move(dir, within) {
  const list = candidates().filter((e) => !within || within.contains(e));
  if (!list.length) return false;
  let cur = document.activeElement;
  if (!list.includes(cur)) cur = list.find((e) => e.contains(cur)) || null;
  if (!cur) {                                   // nothing focused yet: start in a sensible place
    const hand = list.filter((e) => e.classList.contains('hslot'));
    (hand.length ? hand[Math.floor(hand.length / 2)] : list.find((e) => !TEXTY(e)) || list[0]).focus();
    return true;
  }
  const c = center(cur); let best = null, bs = Infinity;
  for (const e of list) {
    if (e === cur || cur.contains(e) || e.contains(cur)) continue;
    const p = center(e), dx = p.x - c.x, dy = p.y - c.y;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    const across = dir === 'right' || dir === 'left' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 2) continue;
    const s = along + across * 2.4;
    if (s < bs) { bs = s; best = e; }
  }
  if (best) { best.focus(); return true; }
  // nothing further that way: scroll whatever can scroll (lists, rules page)
  if (dir === 'up' || dir === 'down') {
    let n = cur;
    while (n && n !== document.body) { if (n.scrollHeight > n.clientHeight + 4 && getComputedStyle(n).overflowY !== 'visible') break; n = n.parentElement; }
    (n && n !== document.body ? n : document.scrollingElement).scrollBy({ top: dir === 'down' ? 160 : -160, behavior: 'smooth' });
    return true;
  }
  return false;
}

// the whole screen is rebuilt on each state change — remember and restore the keyboard focus
// move focus only among controls inside `root`; false if there is nothing further that way (caller can e.g. flip a page)
export function moveWithin(dir, root) {
  const before = document.activeElement;
  const list = candidates().filter((e) => root.contains(e));
  if (!list.length) return false;
  const cur = list.includes(before) ? before : list.find((e) => e.contains(before));
  if (!cur) return false;
  const c = center(cur); let best = null, bs = Infinity;
  for (const e of list) {
    if (e === cur) continue;
    const p = center(e), dx = p.x - c.x, dy = p.y - c.y;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    if (along <= 2) continue;
    const s = along + (dir === 'right' || dir === 'left' ? Math.abs(dy) : Math.abs(dx)) * 2.4;
    if (s < bs) { bs = s; best = e; }
  }
  if (best) { best.focus(); return true; }
  return false;
}

export function snapshot() {
  if (!keys.kbd) return null;
  const ae = document.activeElement;
  if (!ae || ae === document.body || !document.getElementById('app')?.contains(ae)) return null;
  const list = candidates();
  return { idx: list.indexOf(ae), cls: ae.className, text: (ae.textContent || '').trim().slice(0, 40), tag: ae.tagName };
}
export function restore(s) {
  if (!s) return;
  prep(document.getElementById('app'));   // new elements must be focusable NOW (the MutationObserver runs later)
  const list = candidates();
  const same = list.find((e) => e.className === s.cls && (e.textContent || '').trim().slice(0, 40) === s.text && e.tagName === s.tag);
  const t = same || list[Math.min(Math.max(s.idx, 0), list.length - 1)];
  if (t) t.focus({ preventScroll: true });
}

function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key, typing = TEXTY(e.target);
  const arrow = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];

  if (k === 'Escape') {
    if (typing && e.target.tagName !== 'SELECT') { e.target.blur(); keys.kbd = true; return e.preventDefault(); }
    const ov = [...document.querySelectorAll('.overlay')].pop();
    if (ov) {                                          // game prompts: Esc = "don't use / skip" when allowed; result screen: ignore; others: close
      if (ov.classList.contains('prompt')) ov.querySelector('button.sec')?.click();
      else if (!ov.classList.contains('over')) ov.remove();
      return e.preventDefault();
    }
    if (keys.hook?.(e)) return e.preventDefault();
    const back = document.querySelector('.topbar button.sec');
    if (back && /戻る|退出/.test(back.textContent)) { back.click(); return e.preventDefault(); }
    return;
  }
  if (keys.hook && !typing && !document.querySelector('.overlay') && keys.hook(e)) { keys.kbd = true; document.body.classList.add('kbd'); return e.preventDefault(); }

  if (arrow && !(typing && (e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || ['text', 'search', 'number'].includes(e.target.type) && (arrow === 'left' || arrow === 'right')))) {
    keys.kbd = true; document.body.classList.add('kbd');
    if (move(arrow)) e.preventDefault();
    return;
  }
  if (k === 'Enter' || k === ' ') {
    const t = e.target;
    if (typing || t.tagName === 'BUTTON') return;                     // native behaviour
    if (t.matches?.(CUSTOM) || t.getAttribute?.('role') === 'button') { keys.kbd = true; document.body.classList.add('kbd'); (t.activate ? t.activate() : t.click()); return e.preventDefault(); }
  }
}

export function initKeys() {
  prep(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) prep(n); });
    // a new pop-up grabs the keyboard
    const ov = [...document.querySelectorAll('.overlay')].pop();
    if (ov && !ov.contains(document.activeElement) && (keys.kbd || ov.querySelector('.modal'))) {
      const f = ov.querySelector(NATIVE); if (f && !TEXTY(f)) f.focus({ preventScroll: true });
    }
  }).observe(document.body, { childList: true, subtree: true });
  addEventListener('keydown', onKey);
  addEventListener('pointerdown', () => { keys.kbd = false; document.body.classList.remove('kbd'); }, true);
}
