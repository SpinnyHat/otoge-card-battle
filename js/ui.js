// UI: screens + glue. Everything re-renders from state (small enough not to need a framework).
import { cardEl } from './card.js';
import { getCard, cardsOfType, TENDENCIES, TENDENCY_ICON, GAME_TITLE, STARTER_DECKS, machinesOf } from './cards.js';
import { LEVELS } from './ai.js';
import { describeEffects, statusOf, categories, CATS } from './describe.js';
import { PAGES, TIPS } from './tutorial.js';
import { keys, initKeys, snapshot, restore, moveWithin } from './keys.js';
import { BUILD } from './version.js';
import { playCondViewOk } from './effects.js';
import { validateDeck, RULES } from './engine.js';
import { store } from './store.js';
import { onView, play, sound, floatText, heartbeat, newRoll, startDice } from './fx.js';
import { createRoom, joinRoom, createCpuRoom, hasPeer } from './net.js';

/* ------------------------------------------------------------- helpers */
const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat(9)) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(k)); }
  return e;
};
const root = document.getElementById('app');
const toast = (msg, bad) => {
  if (bad) play('error');
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 3500);
};
const modal = (...kids) => {
  const o = h('div', { class: 'overlay', onclick: (e) => { if (e.target === o) o.remove(); } }, h('div', { class: 'modal' }, ...kids));
  document.body.append(o);
  return o;
};
const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const app = {
  screen: 'home', client: null, room: null, lobby: null, view: null,
  timer: null, tut: null, tutPage: 0, page: 0, deckFilter: { q: '', own: 'all', machine: null, tend: null, cat: null, impl: 'all', legal: false }, libSel: null, libFilter: 'all', sel: null, seenRoll: 0, entering: {}, floats: [], cpu: { deck: 'random', level: 'normal', maxPlays: 2, turns: 2, timer: 0 }, tab: 'chara', editId: null, search: '', busy: false, joinCode: '',
};

/* --------------------------------------------------------- connection */
function attach(client, room) {
  app.client = client; app.room = room; app.lobby = null; app.view = null; app.sel = null;
  resetQueue();
  client.onmsg = (m) => {
    if (m.t === 'lobby') { heartbeat(false); resetQueue(); app.lobby = m; if (app.screen === 'game') { app.view = null; } app.screen = 'room'; render(); }
    else if (m.t === 'view') handleView(m.view);
    else if (m.t === 'err') toast(m.msg, true);
    else if (m.t === 'full') { toast('この部屋は満員です', true); leave(); }
  };
  client.onclose = () => { if (app.client === client) { toast('接続が切れました', true); leave(); } };
}
// Incoming game states are queued so the presentation can be paced: a state that contains a new die roll is NOT shown until
// the die has tumbled and landed (otherwise the scores / the win screen would spoil the roll).
const Q = { list: [], busy: false, epoch: 0 };
const resetQueue = () => { Q.epoch++; Q.list.length = 0; Q.busy = false; clearTimeout(app._rv); };
function handleView(v) { Q.list.push(v); if (!Q.busy) pumpViews(); }
function pumpViews() {
  const ep = Q.epoch;
  for (;;) {
    const v = Q.list.shift();
    if (!v) { Q.busy = false; return; }
    Q.busy = true;
    const prev = app.screen === 'game' ? app.view : null;
    if (newRoll(prev, v)) {
      const ms = startDice(v);
      setTimeout(() => { if (ep !== Q.epoch) return; applyView(v, { skipDice: true }); pumpViews(); }, ms + 180);
      return;
    }
    applyView(v);
  }
}
function applyView(v, opts = {}) {
  const wasGame = app.screen === 'game';
  const prevView = wasGame ? app.view : null;
  const o = onView(prevView, v, opts);
  const now = performance.now();
  for (const e of o.entering) app.entering[e.uid] = { kind: e.kind, t0: now };
  app.floats = o.floats;
  app.view = v; app.screen = 'game';
  app.timer = v.timer ? { ...v.timer, end: performance.now() + v.timer.left * 1000 } : null;
  // hold the outcome back for a moment ("判定中…"): longer for sudden death and the match-deciding song
  const fresh = (v.lastResult && v.lastResult.songNo !== prevView?.lastResult?.songNo) || (v.phase === 'over' && prevView?.phase !== 'over');
  const hold = (v.song?.sudden || v.phase === 'over') ? 2900 : 1500;
  app.revealAt = fresh ? performance.now() + hold : 0;
  if (fresh) { const ep = Q.epoch; clearTimeout(app._rv); app._rv = setTimeout(() => { if (ep === Q.epoch) render(); }, hold + 40); }
  render();
}
function leave() {
  heartbeat(false); resetQueue();
  app.tut = null;
  try { app.client?.close(); } catch {}
  Object.assign(app, { client: null, room: null, lobby: null, view: null, screen: 'home', sel: null });
  history.replaceState(null, '', location.pathname);
  render();
}
function sendDeck() {
  const d = store.activeDeck;
  if (d && validateDeck(d).ok) app.client.send({ t: 'deck', deck: d });
}
const needDeck = () => {
  const d = store.activeDeck;
  if (!d) { toast('デッキがありません。先にデッキを作ってください', true); return false; }
  const v = validateDeck(d);
  if (!v.ok) { toast('使用中のデッキが無効です: ' + v.errors[0], true); return false; }
  return true;
};

async function doCreate() {
  if (!needDeck() || app.busy) return;
  app.busy = true; render();
  try {
    const { code, client, host } = await createRoom(store.profile);
    attach(client, { code, host });
    history.replaceState(null, '', `#room=${code}`);
    sendDeck();
  } catch (e) { toast('部屋を作れませんでした: ' + (e.message || e.type), true); }
  app.busy = false; render();
}
async function doJoin(code) {
  if (!needDeck() || app.busy) return;
  if (!code || code.length < 4) return toast('ルームコードを入力してください', true);
  app.busy = true; render();
  try {
    const client = await joinRoom(code, store.profile);
    attach(client, { code: code.toUpperCase(), host: null });
    sendDeck();
  } catch (e) { toast(e.message || '接続できませんでした', true); }
  app.busy = false; render();
}
function cpuDeckChoices() {
  return [
    { key: 'random', label: 'おまかせ', deck: null },
    ...STARTER_DECKS.map((d, i) => ({ key: 's' + i, label: 'スターター: ' + d.name, deck: d })),
    ...store.decks.filter((d) => validateDeck(d).ok).map((d) => ({ key: 'm' + d.id, label: 'マイデッキ: ' + d.name, deck: d })),
  ];
}
function doCpu() {
  if (!needDeck()) return;
  const pick = cpuDeckChoices().find((c) => c.key === app.cpu.deck) || cpuDeckChoices()[0];
  const { client, host } = createCpuRoom(store.profile, { deck: pick.deck, level: app.cpu.level, maxPlays: app.cpu.maxPlays, turns: app.cpu.turns, timer: app.cpu.timer });
  attach(client, { code: null, host });
  sendDeck();
  client.send({ t: 'ready', ready: true });
  client.send({ t: 'start' });
}

/* ------------------------------------------------------------- screens */
function topbar(title, back = true) {
  return h('div', { class: 'topbar' },
    back && h('button', { class: 'sec', onclick: () => { app.screen = 'home'; render(); } }, '← 戻る'),
    h('div', { class: 'title' }, title), h('div', { class: 'grow' }),
    h('button', { class: 'sec', onclick: editName }, `👤 ${store.profile.name}`));
}
// one sound button, fixed in the top-right corner of every screen (phone and PC)
function syncSoundBtn() {
  let b = document.getElementById('sndbtn');
  if (!b) { b = h('button', { id: 'sndbtn', class: 'sec', title: 'サウンド', onclick: soundModal }); document.body.append(b); }
  b.textContent = sound.mute ? '🔇' : '🔊';
}
function soundModal() {
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: sound.vol, oninput: (e) => { sound.setVol(+e.target.value); } });
  vol.addEventListener('change', () => play('scoreUp'));
  const mute = h('input', { type: 'checkbox', checked: sound.mute, onchange: (e) => { sound.setMute(e.target.checked); render(); if (!e.target.checked) play('select'); } });
  modal(h('h3', null, 'サウンド'), h('div', { class: 'col' }, h('label', { class: 'row' }, '音量', vol), h('label', { class: 'row' }, mute, 'ミュート'),
    h('div', { class: 'mute' }, '効果音はブラウザ上で合成しています (音声ファイルなし)。')));
}
function editName() {
  const inp = h('input', { value: store.profile.name, maxlength: 20 });
  const o = modal(h('h3', null, 'ユーザー名'), h('div', { class: 'col' }, inp,
    h('div', { class: 'row' }, h('button', { class: 'pri', onclick: () => { store.setName(inp.value); o.remove(); render(); } }, '保存'),
      h('button', { class: 'sec', onclick: () => o.remove() }, 'キャンセル')),
    h('div', { class: 'mute' }, '対戦相手に表示される名前です。')));
  inp.focus(); inp.select();
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { store.setName(inp.value); o.remove(); render(); } });
}

function homeScreen() {
  const d = store.activeDeck;
  const dv = d && validateDeck(d);
  return h('div', { class: 'wrap' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }), h('button', { class: 'sec', onclick: editName }, `👤 ${store.profile.name}`)),
    h('div', { class: 'hero' }, h('h1', null, GAME_TITLE), h('div', { class: 'mute' }, '音ゲー × カードバトル　サイコロと選曲で勝負！')),
    h('div', { class: 'menu' },
      h('button', { onclick: () => { app.tutPage = 0; app.screen = 'tutorial'; render(); } }, h('b', null, '🎓 チュートリアル'), h('span', null, '遊び方を覚えて練習対戦')),
      h('button', { onclick: () => { app.screen = 'play'; render(); } }, h('b', null, '🌐 オンライン対戦'), h('span', null, '部屋を作る / コードで参加')),
      h('button', { onclick: () => { app.screen = 'cpu'; render(); } }, h('b', null, '🤖 CPU対戦'), h('span', null, 'デッキと強さを選んでひとりで対戦')),
      h('button', { onclick: () => { app.screen = 'decks'; render(); } }, h('b', null, '🃏 デッキ構築'), h('span', null, '作成・編集・共有コード')),
      h('button', { onclick: () => { app.screen = 'library'; render(); } }, h('b', null, '📖 カード図鑑'), h('span', null, '全カードを見る')),
      h('button', { onclick: () => { app.screen = 'rules'; render(); } }, h('b', null, '📜 ルール'), h('span', null, '遊び方と現在の仕様'))),
    h('div', { class: 'panel', style: 'margin-top:1rem' },
      h('div', { class: 'row' }, h('span', { class: 'mute' }, '使用中のデッキ:'), h('b', null, d ? d.name : 'なし'),
        d && (dv.ok ? h('span', { class: 'okc' }, '✔ 対戦可能') : h('span', { class: 'err' }, '⚠ ' + dv.errors[0])),
        h('div', { class: 'grow' }), h('button', { onclick: () => { app.screen = 'decks'; render(); } }, '編集'))),
    h('div', { class: 'mute', style: 'text-align:center;font-size:.7rem;margin-top:.5rem' }, `build ${BUILD}`));
}

function cpuScreen() {
  const choices = cpuDeckChoices();
  return h('div', { class: 'wrap' }, topbar('CPU対戦'),
    h('div', { class: 'panel col' },
      h('b', null, 'あなたのデッキ'), h('div', { class: 'row' }, deckSelect(), h('button', { class: 'sec', onclick: () => { app.screen = 'decks'; render(); } }, 'デッキを編集')),
      h('b', { style: 'margin-top:.6rem' }, '相手のデッキ'),
      h('select', { onchange: (e) => { app.cpu.deck = e.target.value; } }, choices.map((c) => h('option', { value: c.key, selected: c.key === app.cpu.deck }, c.label))),
      h('b', { style: 'margin-top:.6rem' }, '強さ'),
      h('div', { class: 'row' }, Object.entries(LEVELS).map(([k, l]) => h('span', { class: 'chip' + (app.cpu.level === k ? ' on' : ''), onclick: () => { app.cpu.level = k; render(); } }, l))),
      h('div', { class: 'mute', style: 'font-size:.85rem' }, { easy: 'ほぼランダムにカードを使います。ルールの練習用。', normal: 'だいたいのカードを使います。', hard: '使えるカードをフル活用し、サイコロの出目指定も最適に選びます。' }[app.cpu.level]),
      h('div', { class: 'row', style: 'margin-top:.6rem' }, playsSelect(app.cpu.maxPlays, (n) => { app.cpu.maxPlays = n; }), turnsSelect(app.cpu.turns, (t) => { app.cpu.turns = t; }), timerSelect(app.cpu.timer, (n) => { app.cpu.timer = n; }, 'なし')),
      h('button', { class: 'pri', style: 'margin-top:.8rem', onclick: doCpu }, '対戦開始')));
}

function deckSelect(onchange) {
  const sel = h('select', { onchange: (e) => { store.setActive(e.target.value); onchange?.(); } },
    store.decks.map((d) => { const ok = validateDeck(d).ok; return h('option', { value: d.id, selected: d.id === store.activeDeck?.id, disabled: !ok }, `${ok ? '' : '⚠ '}${d.name}`); }));
  return sel;
}

function playScreen() {
  const code = h('input', { placeholder: 'ルームコード (例 K7MQ2)', maxlength: 8, value: app.joinCode, style: 'text-transform:uppercase;letter-spacing:.2em;font-weight:700' });
  code.addEventListener('input', () => { app.joinCode = code.value; });
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(code.value); });
  return h('div', { class: 'wrap' }, topbar('オンライン対戦'),
    !hasPeer() && h('div', { class: 'panel err' }, 'PeerJS を読み込めませんでした。ネット接続を確認してください。'),
    h('div', { class: 'panel col' }, h('b', null, '使用するデッキ'), h('div', { class: 'row' }, deckSelect(), h('button', { class: 'sec', onclick: () => { app.screen = 'decks'; render(); } }, 'デッキを編集'))),
    h('div', { class: 'row', style: 'align-items:stretch;margin-top:1rem' },
      h('div', { class: 'panel col grow' }, h('h3', null, '部屋を作る'),
        h('div', { class: 'mute' }, '2人対戦 (3〜4人対戦は準備中)'),
        h('button', { class: 'pri', disabled: app.busy, onclick: doCreate }, app.busy ? '接続中…' : '部屋を作る')),
      h('div', { class: 'panel col grow' }, h('h3', null, '部屋に入る'), code,
        h('button', { class: 'pri', disabled: app.busy, onclick: () => doJoin(code.value) }, app.busy ? '接続中…' : '参加する'))),
    h('p', { class: 'mute' }, '※ 通信はP2P(WebRTC)です。ホストのブラウザが部屋を管理するので、ホストがタブを閉じると部屋は消えます。'));
}

const md = (t) => { const f = document.createDocumentFragment(); t.split(/\*\*/).forEach((seg, i) => { if (i % 2) { const b = document.createElement('b'); b.textContent = seg; b.style.color = 'var(--warn)'; f.append(b); } else f.append(seg); }); return f; };
function tutorialScreen() {
  const pg = PAGES[app.tutPage], last = app.tutPage === PAGES.length - 1;
  keys.hook = (e) => {
    if (e.key === 'ArrowRight' && !last) { app.tutPage++; render(); return true; }
    if (e.key === 'ArrowLeft' && app.tutPage > 0) { app.tutPage--; render(); return true; }
    if ((e.key === 'Enter' || e.key === ' ') && (!document.activeElement || document.activeElement === document.body)) { if (last) startTutorialGame(); else { app.tutPage++; render(); } return true; }
    return false;
  };
  return h('div', { class: 'wrap fit', style: 'max-width:1000px;margin:0 auto;width:100%' }, topbar('チュートリアル'),
    h('div', { class: 'panel tutpage' },
      h('div', { class: 'row' }, h('h2', null, `${app.tutPage + 1}. ${pg.title}`), h('div', { class: 'grow' }), h('span', { class: 'mute' }, `${app.tutPage + 1} / ${PAGES.length}`)),
      h('div', { class: 'tutbody' },
        h('div', { class: 'tuttext' }, pg.body.map((t) => h('p', null, md(t)))),
        pg.cards.length ? h('div', { class: 'tutcards' }, pg.cards.map((id) => cardEl(id, { size: 'lg' }))) : null),
      h('div', { class: 'dots' }, PAGES.map((_, i) => h('span', { class: 'dot' + (i === app.tutPage ? ' on' : ''), onclick: () => { app.tutPage = i; render(); } }))),
      h('div', { class: 'row' },
        h('button', { disabled: app.tutPage === 0, onclick: () => { app.tutPage--; render(); } }, '← 前へ'), h('div', { class: 'grow' }),
        last ? h('button', { class: 'pri', onclick: startTutorialGame }, '▶ 練習対戦を始める') : h('button', { class: 'pri', onclick: () => { app.tutPage++; render(); } }, '次へ →'),
        !last && h('button', { class: 'sec', onclick: startTutorialGame }, 'スキップして練習対戦'))));
}
function startTutorialGame() {
  const { client } = createCpuRoom(store.profile, { deck: STARTER_DECKS[1], level: 'easy', maxPlays: 2 });
  attach(client, { code: null, host: null });
  app.tut = { on: true, seen: {} };
  client.send({ t: 'deck', deck: STARTER_DECKS[0] });
  client.send({ t: 'ready', ready: true });
  client.send({ t: 'start' });
}
function coachTip(v) {
  if (!app.tut?.on) return null;
  const me = v.you, seen = app.tut.seen;
  const tip = TIPS.find((t) => !seen[t.id] && t.when(v, me, seen));
  if (!tip) return null;
  return h('div', { class: 'coach' },
    h('div', { class: 'coach-h' }, '🎓 チュートリアル'),
    h('div', { class: 'coach-b' }, md(tip.text)),
    h('div', { class: 'row' },
      h('button', { class: 'pri', onclick: () => { seen[tip.id] = true; render(); } }, tip.id === 'over' ? '完了' : 'わかった'),
      h('button', { class: 'sec', onclick: () => { app.tut.on = false; render(); } }, '解説を終了')));
}
const tleft = () => (app.timer ? Math.max(0, Math.ceil((app.timer.end - performance.now()) / 1000)) : 0);
function timerSelect(value, onchange, off = '無制限') {
  return h('label', { class: 'row' }, '持ち時間(カード選び)', h('select', { onchange: (e) => onchange(+e.target.value) },
    [[30, '30秒'], [60, '60秒 (標準)'], [90, '90秒'], [0, off]].map(([n, l]) => h('option', { value: n, selected: n === value }, l))));
}
function turnsSelect(value, onchange) {
  return h('label', { class: 'row' }, '1曲のラウンド数', h('select', { onchange: (e) => onchange(+e.target.value) },
    [[1, '1ラウンド'], [2, '2ラウンド (標準)'], [3, '3ラウンド']].map(([n, l]) => h('option', { value: n, selected: n === value }, l))));
}
function playsSelect(value, onchange) {
  return h('label', { class: 'row' }, '1ターンに使えるカード', h('select', { onchange: (e) => onchange(+e.target.value) },
    [[1, '1枚'], [2, '2枚 (標準)'], [3, '3枚'], [0, '無制限']].map(([n, l]) => h('option', { value: n, selected: n === value }, l))));
}
function roomScreen() {
  const L = app.lobby;
  if (!L) return h('div', { class: 'wrap' }, '接続中…');
  const host = L.you === 0;
  const me = L.seats[L.you];
  const link = app.room?.code ? `${location.origin}${location.pathname}#room=${app.room.code}` : null;
  return h('div', { class: 'wrap' },
    h('div', { class: 'topbar' }, h('button', { class: 'sec', onclick: leave }, '← 退出'), h('div', { class: 'title' }, 'ルーム'), h('div', { class: 'grow' }),
      h('button', { class: 'sec', onclick: editName }, `👤 ${store.profile.name}`)),
    app.room?.code && h('div', { class: 'panel col', style: 'align-items:flex-start' },
      h('div', { class: 'mute' }, 'ルームコード (友達に教えてね)'),
      h('div', { class: 'codebox' }, app.room.code),
      h('div', { class: 'row' }, h('button', { onclick: () => navigator.clipboard?.writeText(link).then(() => toast('招待リンクをコピーしました')) }, '招待リンクをコピー'))),
    h('div', { class: 'panel col', style: 'margin-top:1rem' },
      h('b', null, `プレイヤー (${L.seats.length}/${L.max})`),
      L.seats.map((s, i) => h('div', { class: 'seat' }, h('span', { class: 'dot ' + (s.connected ? 'on' : 'off') }),
        h('b', null, s.name), i === 0 && h('span', { class: 'mute' }, '(ホスト)'), s.kind === 'bot' && h('span', { class: 'mute' }, '(CPU)'),
        h('div', { class: 'grow' }), h('span', { class: 'mute' }, s.deck || 'デッキ未選択'), h('span', { class: s.ready ? 'okc' : 'mute' }, s.ready ? '✔ 準備OK' : '準備中'))),
      L.seats.length < L.max && h('div', { class: 'mute' }, '対戦相手を待っています…')),
    host && h('div', { class: 'panel row', style: 'margin-top:1rem' }, h('b', null, 'ルール設定'), playsSelect(L.settings?.maxPlays ?? 2, (n) => app.client.send({ t: 'settings', maxPlays: n })), turnsSelect(L.settings?.turns ?? 2, (t) => app.client.send({ t: 'settings', turns: t })), timerSelect(L.settings?.timer ?? 60, (n) => app.client.send({ t: 'settings', timer: n }))),
    !host && L.settings && h('div', { class: 'mute', style: 'margin-top:.6rem' }, `1ターンに使えるカード: ${L.settings.maxPlays || '無制限'} / 1曲のラウンド数: ${L.settings.turns} / 持ち時間: ${L.settings.timer ? L.settings.timer + '秒' : '無制限'}`),
    h('div', { class: 'panel col', style: 'margin-top:1rem' },
      h('b', null, 'あなたのデッキ'),
      h('div', { class: 'row' }, deckSelect(() => { sendDeck(); }), h('button', { class: 'sec', onclick: () => { app.screen = 'decks'; render(); } }, '編集')),
      h('div', { class: 'row' },
        h('button', { class: me.ready ? '' : 'pri', disabled: !me.deck, onclick: () => app.client.send({ t: 'ready', ready: !me.ready }) }, me.ready ? '準備を取り消す' : '準備OK'),
        host && h('button', { class: 'pri', disabled: !(L.seats.length >= 2 && L.seats.every((s) => s.ready)), onclick: () => app.client.send({ t: 'start' }) }, '対戦開始'),
        host && L.seats.length < 2 && h('button', { onclick: () => app.room.host.addBot() }, '🤖 CPUを追加'))));
}

/* ---------------------------------------------------------- deck builder */
function mutate(fn) { const d = editing(); fn(d); store.upsert(d); render(); }
function editing() { return store.decks.find((d) => d.id === app.editId) || store.activeDeck || store.decks[0]; }
const countOf = (arr, id) => arr.filter((x) => x === id).length;

function counter(label, n, max) { return h('span', { class: 'counter ' + (n === max ? 'full' : n > max ? 'over' : '') }, `${label} ${n}/${max}`); }

const FILTER_DEFAULT = { q: '', own: 'all', machine: null, tend: null, cat: null, impl: 'all', legal: false };
const PER_PAGE = 8;
const isPhone = () => matchMedia('(max-width:700px)').matches;      // portrait phones get their own, much simpler layouts
const perPage = () => (isPhone() ? 12 : PER_PAGE);
function deckList(d, key) {
  const F = app.deckFilter;
  return cardsOfType(key).filter((c) => {
    if (c.token) return false;
    if (F.q && !(c.name + (c.text || []).join('') + (c.tags || []).join('')).toLowerCase().includes(F.q.toLowerCase())) return false;
    const n = countOf(d[key], c.id);
    if (F.own === 'in' && !n) return false;
    if (F.own === 'out' && n) return false;
    if (F.impl === 'ok' && c.wip) return false;
    if (F.impl === 'wip' && !c.wip) return false;
    if (F.cat && !categories(c).includes(F.cat)) return false;
    if (key === 'chart') {
      if (F.machine && !machinesOf(c).includes(F.machine)) return false;
      if (F.tend && ![].concat(c.tendency || 'NONE').includes(F.tend)) return false;
      if (F.legal && !(machinesOf(c).includes('bms') || machinesOf(c).some((m) => d.machines.includes(m)))) return false;
    }
    return true;
  });
}
const filterCount = () => { const F = app.deckFilter; return ['machine', 'tend', 'cat'].filter((k) => F[k]).length + (F.own !== 'all') + (F.impl !== 'all') + (F.legal ? 1 : 0); };

// big view of a card; ◀ ▶ / ←→ browse the list, Esc / click outside closes
function zoomCard(list, start) {
  let i = start;
  const o = h('div', { class: 'overlay zoom', onclick: (e) => { if (e.target === o || e.target.classList.contains('zoomwrap')) o.remove(); } });
  const step = (d) => { i = (i + d + list.length) % list.length; draw(); o.querySelector('.zoomnext')?.focus({ preventScroll: true }); };
  const draw = () => { const c = list[i]; o.replaceChildren(h('div', { class: 'zoomwrap' },
    h('button', { class: 'sec zoomprev', onclick: () => step(-1) }, '◀'),
    h('div', { class: 'zoomcard' }, cardEl(c, { size: 'zoom' }), h('div', { class: 'zoomcap' }, `${c.name}  (${i + 1} / ${list.length})`, h('div', { class: 'mute', style: 'font-size:.8rem' }, '← → で前後 / Esc・外側クリックで閉じる'))),
    h('button', { class: 'sec zoomnext', onclick: () => step(1) }, '▶'),
    h('button', { class: 'sec zoomx', onclick: () => o.remove() }, '✕'))); };
  const onk = (e) => {
    if (!document.body.contains(o)) return removeEventListener('keydown', onk, true);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { step(e.key === 'ArrowLeft' ? -1 : 1); e.stopImmediatePropagation(); e.preventDefault(); }
  };
  addEventListener('keydown', onk, true);
  document.body.append(o); draw();
}
function pickModal(title, build) {   // small modal whose content can redraw itself after a change
  const o = h('div', { class: 'overlay', onclick: (e) => { if (e.target === o) o.remove(); } });
  const draw = () => o.replaceChildren(h('div', { class: 'modal fmodal' }, h('div', { class: 'row' }, h('h3', null, title), h('div', { class: 'grow' }), h('button', { class: 'sec', onclick: () => o.remove() }, '✕')), build(draw, () => o.remove())));
  document.body.append(o); draw();
}
const chips = (items, isOn, set) => h('div', { class: 'row' }, items.map(([val, label, icon]) => h('span', { class: 'chip' + (isOn(val) ? ' on' : ''), onclick: () => set(val) }, icon && h('img', { src: `assets/icons/${icon}.png` }), label)));

function tendencyModal() {
  pickModal('得意譜面傾向', (draw, close) => h('div', { class: 'col' }, h('div', { class: 'mute' }, '一致する譜面でスコア＋1。互いに同じ傾向だと＋2。'),
    chips(TENDENCIES.map((t) => [t, t, TENDENCY_ICON[t]]), (t) => editing().tendency === t, (t) => { mutate((x) => (x.tendency = t)); close(); })));
}
function machineModal() {
  pickModal('機種カード', (draw) => h('div', { class: 'col' },
    h('div', { class: 'mute' }, `最大${RULES.maxMachines}枚、BMSを入れる場合は${RULES.bmsMaxMachines}枚まで。BMSの譜面は機種なしでも入れられます。`),
    chips(cardsOfType('machine').map((m) => [m.id, m.name]), (id) => editing().machines.includes(id),
      (id) => { mutate((x) => { x.machines = x.machines.includes(id) ? x.machines.filter((i) => i !== id) : [...x.machines, id]; }); draw(); })));
}
function filterModal() {
  const d = () => editing(), key = () => app.tab;
  const set = (k, v, draw) => { app.deckFilter[k] = v; app.page = 0; render(); draw(); };
  pickModal('絞り込み', (draw, close) => {
    const F = app.deckFilter, isChart = key() === 'chart';
    const kw = isPhone() ? h('input', { type: 'search', placeholder: '🔎 名前・効果で検索', value: F.q, oninput: (e) => { app.deckFilter.q = e.target.value; app.page = 0; render(); } }) : null;
    return h('div', { class: 'col' }, kw,
      h('b', null, 'デッキ内'), chips([['all', 'すべて'], ['in', '入っている'], ['out', '入っていない']], (v) => F.own === v, (v) => set('own', v, draw)),
      h('b', null, '実装状況'), chips([['all', 'すべて'], ['ok', '実装済み'], ['wip', '効果未実装']], (v) => F.impl === v, (v) => set('impl', v, draw)),
      h('b', null, '効果のタイプ'), chips([[null, 'すべて'], ...Object.entries(CATS)], (v) => F.cat === v, (v) => set('cat', v, draw)),
      isChart && h('b', null, '機種'), isChart && chips([[null, 'すべて'], ...cardsOfType('machine').map((m) => [m.id, m.name])], (v) => F.machine === v, (v) => set('machine', v, draw)),
      isChart && h('b', null, '傾向'), isChart && chips([[null, 'すべて'], ...TENDENCIES.map((t) => [t, t, TENDENCY_ICON[t]])], (v) => F.tend === v, (v) => set('tend', v, draw)),
      isChart && h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: F.legal, onchange: (e) => set('legal', e.target.checked, draw) }), 'このデッキの機種で使える譜面だけ'),
      h('div', { class: 'row foot' }, h('button', { onclick: () => { app.deckFilter = { ...FILTER_DEFAULT }; app.page = 0; render(); draw(); } }, 'クリア'), h('div', { class: 'grow' }),
        h('span', { class: 'cnt mute' }, `${deckList(d(), key()).length}件`), h('button', { class: 'pri', onclick: close }, '閉じる')));
  });
}

function deckMenu(d) {
  const o = modal(h('h3', null, d.name), h('div', { class: 'col' },
    h('button', { class: d.id === store.activeDeck?.id ? '' : 'pri', onclick: () => { store.setActive(d.id); toast('このデッキを使用します'); o.remove(); render(); } }, d.id === store.activeDeck?.id ? '✔ 使用中のデッキ' : 'このデッキを使う'),
    h('button', { onclick: () => { const n = prompt('デッキ名', d.name); if (n) { mutate((x) => (x.name = n.slice(0, 40))); o.remove(); } } }, '名前を変える'),
    h('button', { onclick: () => { app.editId = store.newDeck().id; app.page = 0; o.remove(); render(); } }, '＋ 新しいデッキ'),
    h('button', { onclick: () => { app.editId = store.duplicate(d.id).id; o.remove(); render(); } }, '複製'),
    h('button', { onclick: () => { const c = store.exportDeck(d); navigator.clipboard?.writeText(c).then(() => toast('デッキコードをコピーしました'), () => prompt('デッキコード', c)); o.remove(); } }, 'デッキコードを書き出す'),
    h('button', { onclick: () => { const c = prompt('デッキコードを貼り付け'); if (!c) return; try { app.editId = store.importDeck(c).id; o.remove(); render(); } catch { toast('デッキコードが不正です', true); } } }, 'デッキコードを読み込む'),
    h('button', { class: 'danger', onclick: () => { if (confirm(`「${d.name}」を削除しますか？`)) { store.remove(d.id); app.editId = null; o.remove(); render(); } } }, '削除')));
}
function deckScreen() {
  let d = editing();
  if (!d) { d = store.newDeck(); }
  app.editId = d.id;
  if (!['chara', 'skill', 'chart'].includes(app.tab)) app.tab = 'chara';
  const v = validateDeck(d), R = RULES, key = app.tab;
  const maxCopies = key === 'skill' ? R.skillCopies : 1;
  const list = deckList(d, key);
  const pages = Math.max(1, Math.ceil(list.length / perPage()));
  app.page = Math.min(app.page, pages - 1);
  const go = (n) => { app.page = Math.max(0, Math.min(pages - 1, n)); render(); };
  const fc = filterCount();

  const decks = h('div', { class: 'col decklist' },
    h('div', { class: 'row' }, h('button', { class: 'pri', onclick: () => { app.editId = store.newDeck().id; app.page = 0; render(); } }, '＋ 新規'),
      h('button', { onclick: () => { const c = prompt('デッキコードを貼り付け'); if (!c) return; try { app.editId = store.importDeck(c).id; render(); } catch { toast('デッキコードが不正です', true); } } }, '読み込み')),
    store.decks.map((x) => h('div', { class: 'item' + (x.id === d.id ? ' on' : ''), onclick: () => { app.editId = x.id; app.page = 0; render(); } },
      h('div', null, x.name), h('div', { class: 'mute', style: 'font-size:.8rem' }, validateDeck(x).ok ? '✔ 対戦可能' : '⚠ 未完成', x.id === store.activeDeck?.id ? ' ・使用中' : ''))));

  const slot = (c) => {
    const n = countOf(d[key], c.id);
    const machineOk = key !== 'chart' || machinesOf(c).includes('bms') || machinesOf(c).some((m) => d.machines.includes(m));
    const canAdd = n < maxCopies && d[key].length < R[key] && machineOk;
    const cel = cardEl(c, { size: 'fit', dim: !machineOk && n === 0 });
    const sl = h('div', { class: 'slot', title: 'ダブルクリックで拡大' }, cel,
      h('div', { class: 'stepper' },
        h('button', { disabled: n === 0, onclick: () => mutate((x) => { x[key].splice(x[key].indexOf(c.id), 1); }) }, '－'), h('b', null, n),
        h('button', { disabled: !canAdd, title: machineOk ? '' : '先に機種カードを選んでください', onclick: () => mutate((x) => x[key].push(c.id)) }, '＋'),
        key === 'chart' && h('span', { class: 'mute', style: 'font-size:.72rem' }, machinesOf(c).join('/'))));
    sl._zoom = () => zoomCard(list, list.indexOf(c));
    return sl;
  };
  const grid = h('div', { class: 'pool8' }, list.slice(app.page * perPage(), app.page * perPage() + perPage()).map(slot),
    !list.length && h('div', { class: 'mute', style: 'grid-column:1/-1;align-self:center;text-align:center' }, '条件に合うカードがありません'));
  let wheelT = 0, swallowClick = 0;
  grid.addEventListener('wheel', (e) => { e.preventDefault(); if (Date.now() - wheelT < 220) return; wheelT = Date.now(); go(app.page + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });

  // phone: swipe the card grid left / right to change page (swipe left = next page)
  let sw = null;
  grid.addEventListener('touchstart', (e) => { const t = e.touches[0]; sw = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null; }, { passive: true });
  grid.addEventListener('touchend', (e) => {
    if (!sw) return; const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y, q = sw; sw = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - q.t > 800) return;
    const n = app.page + (dx < 0 ? 1 : -1); if (n < 0 || n > pages - 1) return;
    swallowClick = Date.now(); go(n);
  }, { passive: true });
  grid.addEventListener('click', (e) => { if (Date.now() - swallowClick < 400) { e.stopPropagation(); e.preventDefault(); } }, true);

  const editor = h('div', { class: 'panel editor' },
    h('div', { class: 'row' },
      h('input', { value: d.name, maxlength: 40, style: 'font-weight:700;font-size:1.05rem;flex:1;min-width:140px', onchange: (e) => mutate((x) => (x.name = e.target.value || x.name)) }),
      h('button', { class: d.id === store.activeDeck?.id ? '' : 'pri', onclick: () => { store.setActive(d.id); toast('このデッキを使用します'); render(); } }, d.id === store.activeDeck?.id ? '使用中' : '使用する'),
      h('button', { onclick: () => { const c = store.exportDeck(d); navigator.clipboard?.writeText(c).then(() => toast('デッキコードをコピーしました'), () => prompt('デッキコード', c)); } }, 'コード'),
      h('button', { onclick: () => { app.editId = store.duplicate(d.id).id; render(); } }, '複製'),
      h('button', { class: 'danger', onclick: () => { if (confirm(`「${d.name}」を削除しますか？`)) { store.remove(d.id); app.editId = null; render(); } } }, '削除')),
    h('div', { class: 'row' },
      h('button', { onclick: tendencyModal }, h('img', { class: 'bi', src: `assets/icons/${TENDENCY_ICON[d.tendency] || 'half'}.png` }), ` 得意傾向: ${d.tendency}`),
      h('button', { onclick: machineModal }, `機種: ${d.machines.length ? d.machines.map((m) => getCard(m).name).join(' / ') : '未選択'}`),
      counter('キャラ', d.chara.length, R.chara), counter('スキル', d.skill.length, R.skill), counter('譜面', d.chart.length, R.chart),
      v.ok ? h('span', { class: 'okc' }, '✔ 使えます') : h('span', { class: 'err errlink', title: v.errors.join('\n'), onclick: () => modal(h('h3', null, 'このデッキの問題'), h('ul', { class: 'err' }, v.errors.map((e) => h('li', null, e)))) }, `⚠ ${v.errors[0]}${v.errors.length > 1 ? ` (他${v.errors.length - 1}件)` : ''}`)),
    h('div', { class: 'row' },
      [['chara', 'キャラ'], ['skill', 'スキル'], ['chart', '譜面']].map(([k, l]) => h('div', { class: 'tab' + (app.tab === k ? ' on' : ''), onclick: () => { app.tab = k; app.page = 0; render(); } }, l)),
      h('div', { class: 'grow' }),
      h('input', { class: 'deck-search', type: 'search', placeholder: '🔎 名前・効果で検索', value: app.deckFilter.q, style: 'width:min(240px,26vw)',
        oninput: (e) => { app.deckFilter.q = e.target.value; app.page = 0; clearTimeout(app._qt); app._qt = setTimeout(() => { render(); const i = document.querySelector('.deck-search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 130); } }),
      h('button', { class: fc ? 'pri' : '', onclick: filterModal }, `🔍 絞り込み${fc ? ` (${fc})` : ''}`),
      (fc || app.deckFilter.q) ? h('button', { class: 'sec', onclick: () => { app.deckFilter = { ...FILTER_DEFAULT }; app.page = 0; render(); } }, 'クリア') : null,
      h('span', { class: 'mute', style: 'font-size:.85rem' }, `${list.length}件`),
      h('button', { disabled: app.page === 0, onclick: () => go(app.page - 1) }, '◀'), h('b', null, `${app.page + 1} / ${pages}`), h('button', { disabled: app.page >= pages - 1, onclick: () => go(app.page + 1) }, '▶')),
    grid);
  // phone: one deck dropdown + ⋯ menu, one-line controls, then the cards (a desktop-sized header would use the whole screen)
  const phone = isPhone();
  const phoneEditor = () => {
    const sel = h('select', { class: 'deck-pick', onchange: (e) => { app.editId = e.target.value; app.page = 0; render(); } },
      store.decks.map((x) => h('option', { value: x.id, selected: x.id === d.id }, `${validateDeck(x).ok ? '✔' : '⚠'} ${x.name}${x.id === store.activeDeck?.id ? ' (使用中)' : ''}`)));
    return h('div', { class: 'panel editor phone' },
      h('div', { class: 'row prow' }, sel, h('button', { onclick: () => deckMenu(d) }, '⋯')),
      h('div', { class: 'row prow' },
        h('button', { onclick: tendencyModal }, h('img', { class: 'bi', src: `assets/icons/${TENDENCY_ICON[d.tendency] || 'half'}.png` }), ` ${d.tendency}`),
        h('button', { onclick: machineModal }, `機種 ${d.machines.length}`),
        counter('👤', d.chara.length, R.chara), counter('✨', d.skill.length, R.skill), counter('🎵', d.chart.length, R.chart),
        v.ok ? h('span', { class: 'okc' }, '✔') : h('span', { class: 'err errlink', onclick: () => modal(h('h3', null, 'このデッキの問題'), h('ul', { class: 'err' }, v.errors.map((e) => h('li', null, e)))) }, '⚠')),
      h('div', { class: 'row prow' },
        [['chara', 'キャラ'], ['skill', 'スキル'], ['chart', '譜面']].map(([k, l]) => h('div', { class: 'tab' + (app.tab === k ? ' on' : ''), onclick: () => { app.tab = k; app.page = 0; render(); } }, l)),
        h('div', { class: 'grow' }),
        h('button', { class: fc || app.deckFilter.q ? 'pri' : '', onclick: filterModal }, `🔍${fc || app.deckFilter.q ? '●' : ''}`),
        h('button', { disabled: app.page === 0, onclick: () => go(app.page - 1) }, '◀'), h('b', { class: 'pg' }, `${app.page + 1}/${pages}`), h('button', { disabled: app.page >= pages - 1, onclick: () => go(app.page + 1) }, '▶')),
      grid);
  };
  keys.hook = (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {            // ←/→ : move between cards, and flip the page when there is nothing further
      const dir = k === 'ArrowLeft' ? 'left' : 'right', pool = document.querySelector('.pool8');
      if (pool && document.activeElement?.closest?.('.pool8') && moveWithin(dir, pool)) return true;
      go(app.page + (dir === 'right' ? 1 : -1)); return true;
    }
    if (k === 'z' || k === 'Z') {
      const sl = document.activeElement?.closest?.('.pool8 .slot'), i = sl ? [...document.querySelectorAll('.pool8 .slot')].indexOf(sl) : 0;
      if (list[app.page * perPage() + i]) { zoomCard(list, app.page * perPage() + i); return true; }
    }
    if (k === 'PageDown' || k === '.') { go(app.page + 1); return true; }
    if (k === 'PageUp' || k === ',') { go(app.page - 1); return true; }
    if (k === 'f' || k === 'F') { filterModal(); return true; }
    const t = { 1: 'chara', 2: 'skill', 3: 'chart' }[k];
    if (t) { app.tab = t; app.page = 0; render(); return true; }
    return false;
  };
  return h('div', { class: 'wrap fit', style: 'max-width:1500px;margin:0 auto;width:100%' }, topbar('デッキ構築'), h('div', { class: 'builder' }, ...(phone ? [phoneEditor()] : [decks, editor])));
}

// phone: tapping a card opens its details in a bottom sheet (◀ ▶ to browse) instead of squeezing a panel under the grid
function libSheet(list, start) {
  let i = start;
  const o = h('div', { class: 'overlay sheetov', onclick: (e) => { if (e.target === o) o.remove(); } });
  const step = (d) => { i = (i + d + list.length) % list.length; draw(); };
  const draw = () => o.replaceChildren(h('div', { class: 'modal sheet' },
    h('div', { class: 'row sheetbar' }, h('button', { onclick: () => step(-1) }, '◀'), h('b', { class: 'grow', style: 'text-align:center' }, `${i + 1} / ${list.length}`), h('button', { onclick: () => step(1) }, '▶'), h('button', { class: 'sec', onclick: () => o.remove() }, '✕')),
    detailPanel(list[i])));
  document.body.append(o); draw();
}
function libraryScreen() {
  const status = { all: 'すべて', ok: '実装済み', wip: '効果未実装', ph: '仮カード', uv: '要確認' };
  const pool = cardsOfType(app.tab).filter((c) => {
    if (app.search && !(c.name + (c.text || []).join('')).toLowerCase().includes(app.search.toLowerCase())) return false;
    const st = statusOf(c).map((x) => x.k);
    return app.libFilter === 'all' || st.includes(app.libFilter);
  });
  let sel = getCard(app.libSel);
  if (!sel || sel.type !== app.tab || !pool.includes(sel)) sel = pool[0] || null;
  const grid = h('div', { class: 'pool' }, pool.map((c, i) => {
    const slot = h('div', { class: 'slot' + (sel && c.id === sel.id ? ' on' : ''), title: 'ダブルクリックで拡大', onclick: () => (isPhone() ? libSheet(pool, i) : selectHere()) }, cardEl(c, { size: 'md' }), h('div', { class: 'cap' }, c.name));
    // select WITHOUT rebuilding the grid: a rebuild between the two clicks of a double-click would swallow the dblclick, and would lose focus
    const selectHere = () => { app.libSel = c.id; document.querySelectorAll('.lib .slot').forEach((x) => x.classList.toggle('on', x === slot)); document.querySelector('.lib .detail')?.replaceWith(detailPanel(c)); };
    slot._zoom = () => zoomCard(pool, i);
    slot.activate = () => { if (app.libSel === c.id) zoomCard(pool, i); else selectHere(); };   // keyboard: Enter selects, Enter again zooms
    return slot;
  }));
  keys.hook = (e) => {
    const t = { 1: 'chara', 2: 'skill', 3: 'chart', 4: 'machine' }[e.key];
    if (t) { app.tab = t; render(); return true; }
    return false;
  };
  return h('div', { class: 'wrap fit', style: 'max-width:1500px;margin:0 auto;width:100%' }, topbar('カード図鑑'),
    h('div', { class: 'row' },
      [['chara', 'キャラ'], ['skill', 'スキル'], ['chart', '譜面'], ['machine', '機種']].map(([k, l]) => h('div', { class: 'tab' + (app.tab === k ? ' on' : ''), onclick: () => { app.tab = k; render(); } }, `${l} ${cardsOfType(k).length}`)),
      h('div', { class: 'grow' }),
      Object.entries(status).map(([k, l]) => h('span', { class: 'chip' + (app.libFilter === k ? ' on' : ''), onclick: () => { app.libFilter = k; render(); } }, l)),
      h('input', { placeholder: '検索', value: app.search, oninput: (e) => { app.search = e.target.value; clearTimeout(app._st); app._st = setTimeout(() => { render(); document.querySelector('.lib-search')?.focus(); }, 250); }, class: 'lib-search' })),
    h('div', { class: 'lib' + (isPhone() ? ' phone' : '') }, grid, isPhone() ? null : detailPanel(sel)));
}
function detailPanel(c) {
  if (!c) return h('div', { class: 'panel detail mute' }, '該当するカードがありません');
  const eff = describeEffects(c);
  const kv = [['種別', { chara: 'キャラカード', skill: 'スキルカード', chart: '譜面カード', machine: '機種カード' }[c.type]]];
  if (c.source) kv.push(['出典', c.source]);
  if (c.type === 'chart') {
    kv.push(['機種', machinesOf(c).join(' / ')]); kv.push(['傾向', [].concat(c.tendency || 'NONE').join(' / ')]);
    if (c.composer) kv.push(['作曲', [].concat(c.composer).join(', ')]);
    if (c.grantTendency) kv.push(['獲得時', `得意傾向に ${c.grantTendency} を追加`]);
  }
  if (c.tags?.length) kv.push(['タグ', c.tags.join(', ')]);
  if (c.bpm) kv.push(['BPM', c.bpm]);
  if (c.genre) kv.push(['ジャンル', c.genre]);
  if (c.note) kv.push(['出典メモ', c.note]);
  if (c.footer) kv.push(['分類', c.footer]);
  return h('div', { class: 'panel detail' },
    h('div', { class: 'big' }, cardEl(c, { size: 'lg' })),
    h('h3', null, c.name),
    h('div', { class: 'tagrow' }, statusOf(c).map((x) => h('span', { class: 'tag ' + x.k }, x.t))),
    h('div', { class: 'kv' }, kv.flatMap(([k, v]) => [h('span', null, k), h('span', null, v)])),
    h('div', null, h('b', null, 'カードテキスト'), h('div', { class: 'rawtext' }, (c.text || []).map((t) => h('p', null, '・' + t)))),
    h('div', null, h('b', null, '効果の内訳'), ' ', h('span', { class: 'mute', style: 'font-size:.8rem' }, '(ゲーム内で実際に処理される内容)'),
      eff.length ? eff.map((e) => h('div', { class: 'eff', style: 'margin-top:.5rem' },
        h('div', { class: 'when' }, `${e.when} ${e.zone}`.trim(), e.auto ? h('span', { class: 'mute' }, '  (自動)') : null),
        e.cond && h('div', { class: 'cnd' }, `条件: ${e.cond}`),
        h('ol', null, e.steps.map((t) => h('li', null, t)))))
        : h('div', { class: 'mute', style: 'margin-top:.4rem' }, c.wip ? 'まだ処理が実装されていません (テキストのみ)。' : c.type === 'machine' ? '固有効果なし (譜面の所属判定のみ)。' : '効果なし。')),
    c.flavor && h('div', { class: 'mute', style: 'font-size:.85rem' }, `フレーバー: ${c.flavor}`));
}

function rulesScreen() {
  const R = RULES;
  const li = (...t) => h('li', null, ...t);
  return h('div', { class: 'wrap fit', style: 'max-width:1100px;margin:0 auto;width:100%' }, topbar('ルール'),
    h('div', { class: 'panel col scroll' },
      h('h3', null, '基本'),
      h('ul', null,
        li(`山札: キャラ${R.chara}枚 + スキル${R.skill}枚 (同じスキルは${R.skillCopies}枚まで)。譜面山札: ${R.chart}枚 (かぶりなし)。`),
        li(`最初に手札を${R.handSize}枚引き、サイコロを振って一番大きい人が最初の課題曲を選びます。以降は交互に選曲。`),
        li('課題曲を選んだプレイヤーから先に行動。手札のカードは好きなだけ使えます。スキルは使うと墓地へ、キャラは場に残ります。'),
        li(R.maxPlaysPerTurn ? `1ターンに使えるカードは最大${R.maxPlaysPerTurn}枚 (キャラを場に出すのも1枚)。ルームの設定で変更できます。` : '1ターンに使えるカードの枚数に制限なし。'),
        R.turnsPerSong > 1 && R.drawBetweenRounds && li(`ラウンドが終わるたびに、全員が山札から${R.drawBetweenRounds}枚引きます (最後のラウンドの後は、曲の終わりのドロー選択になります)。`),
        R.turnsPerSong > 1 && li('「ターン開始時」の効果は各曲の最初のラウンドだけ発動します (サイコロを振る時の効果は毎ラウンド)。'),
        li(R.turnsPerSong > 1 ? `1曲は${R.turnsPerSong}ラウンド。各ラウンドで両者が「カードを最大${R.maxPlaysPerTurn || '∞'}枚使う → サイコロを振る」を行い、${R.turnsPerSong}ラウンド分の合計がその曲のスコア(リザルト)。同点なら振り直し。` : '自分のターンの終わりにサイコロを振り、出目 + スキル等の加算が その曲のスコア(リザルト)。同点なら振り直し。'),
        li(`スコアが高い方が課題曲カードを獲得。曲の終わりに両者が山札から最大${R.postSongDraw}枚まで引けます。`),
        li(`先に${R.winsNeeded}曲獲得した方の勝ち。${R.songsPerCredit}曲目はサドンデス(全譜面からランダム選曲)。`),
        li('山札から引けなくなったら敗北。'),
        li('オンライン対戦では、カードを選ぶ時間に制限があります (標準60秒。ルームで変更可)。時間切れになると自動でサイコロを振ります。選択ポップアップは30秒、最初のサイコロは20秒。')),
      h('h3', null, '得意譜面傾向と機種'),
      h('ul', null,
        li('デッキごとに得意な傾向を1つ宣言。課題曲の傾向と一致すればスコア＋1。両者が同じ傾向なら＋2。'),
        li('機種カードは最大3枚(BMSを入れる場合は2枚まで)。譜面は宣言した機種のものを入れられます。BMSの譜面は無所属として自由に入れられます。')),
      h('h3', null, 'キーボード操作'),
      h('ul', null,
        li('←↑→↓: 近くのボタン・カードへ移動 / Enter・Space: 決定 / Esc: 閉じる・戻る'),
        li('対戦中: ←→で手札を選ぶ → Enter(2回で使用) / 1〜9: 手札を番号で選択 / E: ターン終了・サイコロ・ドロー確定 / L: ログ'),
        li('デッキ構築: PageUp・PageDown(, .)でページ送り / F: 絞り込み / 1・2・3: キャラ・スキル・譜面。カード図鑑: 1〜4でタブ切替')),
      h('h3', null, '未実装 / 仮決め (バランス調整で変更予定)'),
      h('ul', { class: 'mute' },
        li('進化カード・ゴママヨ抑止の無効化・Black Market Bluesの効果は未実装。'),
        li('「仮」バッジのカードは、デッキを組める枚数にするための仮カードです。'),
        li('先行側へのデバフは設定のみ (rules: firstActorPenalty、現在0)。'),
        li('3〜4人対戦: エンジンは人数に対応した作りですが、UI・ルールの検証はこれからです。'))));
}

/* ------------------------------------------------------------------ game */
function gameScreen() {
  const v = app.view;
  if (!v) return h('div', { class: 'wrap' }, '読み込み中…');
  const me = v.you, opp = v.players.findIndex((_, i) => i !== me);
  const P = v.players;
  const myTurn = v.phase === 'song' && v.cur === me && v.stage === 'main' && !v.prompt;
  const act = (a) => app.client.send({ t: 'act', a });
  const playsLeft = !v.rules.maxPlays || (v.song && v.song.plays[me] < v.rules.maxPlays);
  const canUse = myTurn && playsLeft;
  const names = v.names || P.map((p) => p.name);
  const veil = performance.now() < (app.revealAt || 0) && (v.phase === 'draw' || v.phase === 'over');   // outcome held back for the "判定中…" build-up

  const stat2 = (icon, val, title, cls = '') => h('span', { class: 'stat2 ' + cls, title }, h('span', { class: 'si' }, icon), h('b', null, val));
  const pbar = (i) => {
    const p = P[i];
    return h('div', { class: 'pbar' + (v.phase === 'song' && v.cur === i ? ' turn' : '') },
      h('span', { class: 'nm' }, names[i], i === me ? '（あなた）' : '', v.connected && v.connected[i] === false ? ' ⚠切断中' : ''),
      v.song && v.song.owner === i ? h('span', { class: 'sel-tag', title: '今回の課題曲を選んだプレイヤー' }, '🎵 選曲') : null,
      app.timer?.players?.includes(i) ? h('span', { class: 'timer' }, `⏱ ${tleft()}`) : null,
      p.won.length === v.rules.winsNeeded - 1 && h('span', { class: 'matchpt' }, 'MATCH POINT'),
      h('span', { class: 'stat2 tend', title: `得意譜面傾向: ${p.tendencies.join(' / ')}` }, p.tendencies.slice(0, 3).map((t) => h('span', { class: 'tt' }, h('img', { class: 'ti', src: `assets/icons/${TENDENCY_ICON[t] || 'half'}.png`, alt: t }), h('small', null, t)))),
      stat2('🃏', p.handCount, '手札の枚数'),
      stat2('📚', p.pileCount, '山札の残り枚数 (0で敗北)', p.pileCount <= 4 ? 'low' : ''),
      stat2('💿', p.chartCount, '譜面山札の残り枚数', 'chartc'),
      h('span', { class: 'stat2 click', title: `${names[i]} の墓地 (クリックで中身を見る)`, onclick: () => showZone(`${names[i]} の墓地`, p.grave) }, h('span', { class: 'si' }, '🪦'), h('b', null, p.grave.length)),
      h('div', { class: 'grow' }),
      h('div', { class: 'won' }, p.won.map((c) => cardEl(c.id, { size: 'xs' }))),
      h('span', { class: 'stat2 wins', title: `獲得した課題曲 (${v.rules.winsNeeded}曲で勝利)` }, h('span', { class: 'si' }, '🏆'), h('b', null, `${p.won.length}/${v.rules.winsNeeded}`)));
  };
  const fieldRow = (i) => h('div', { class: 'field ' + (i === me ? 'f-mine' : 'f-theirs') }, h('span', { class: 'fieldlabel' }, i === me ? 'あなたの場' : '相手の場'), P[i].field.length ? P[i].field.map((c) => {
    const el = cardEl(c.id || null, { size: 'field', faceDown: c.faceDown, uid: c.uid, spent: c.spent });
    if (!c.faceDown && c.id) {      // click a card on the board -> big detailed view (←/→ browse that side's cards)
      const list = P[i].field.filter((x) => !x.faceDown && x.id).map((x) => getCard(x.id));
      el.classList.add('zoomable'); el.addEventListener('click', () => zoomCard(list, list.findIndex((x) => x.id === c.id)));
    }
    return el;
  }) : h('span', { class: 'hint' }, '場にキャラはいません'));

  // centre: task song + scores
  const song = v.song;
  const center = h('div', { class: 'center' },
    song ? h('div', { class: 'col', style: 'align-items:center' },
      h('div', { class: 'mute' }, `第${song.no}曲${song.sudden ? ' (サドンデス)' : ''} 課題曲${v.rules.turns > 1 ? ` ・ ラウンド ${song.pass}/${v.rules.turns}` : ''}`), h('div', { class: 'taskwrap zoomable ' + (song.owner == null ? 'rand' : song.owner === me ? 'mine' : 'theirs'), title: 'クリックで詳しく見る', onclick: () => zoomCard([getCard(song.taskId)], 0) }, cardEl(song.taskId, { size: 'task' })),
      h('div', { class: 'chooser ' + (song.owner == null ? 'rand' : song.owner === me ? 'mine' : 'theirs') },
        song.owner == null ? '🎲 ランダム選曲' : song.owner === me ? '🎵 あなたが選曲' : `🎵 ${names[song.owner]} が選曲`)) : h('div', { style: 'width:170px' }),
    h('div', { class: 'score' }, [me, opp].map((i) => h('div', { class: 'pcol' + (i === me ? ' me' : ''), 'data-p': i },
      h('div', { class: 'mute' }, names[i], song && song.owner === i ? h('span', { class: 'sel-tag' }, '🎵 選曲') : null),
      h('div', { class: 'tot' }, song ? song.totals[i] : '–'),
      h('ul', null, song ? song.score[i].map((e) => h('li', null, h('span', null, e.label), h('b', { class: e.v > 0 ? 'pos' : 'neg' }, (e.v > 0 ? '+' : '') + e.v))) : null),
      song && song.done[i] && h('div', { class: 'mute', style: 'font-size:.75rem' }, '✔ ターン終了')))),
    actionPanel());

  // Order matters: status + BUTTONS first, informational bits last — so a short window can only ever clip the extras.
  function actionPanel() {
    const head = [], acts = [], info = [];
    if (veil) return h('div', { class: 'actionp' }, h('div', { class: 'status judging' }, '⚖ 判定中…'), h('div', { class: 'mute hint' }, v.song?.sudden ? '運命のサドンデス' : v.phase === 'over' ? '勝敗が決まる…' : null));
    if (v.lastRoll) {
      const fresh = v.lastRoll.seq !== app.seenRoll; app.seenRoll = v.lastRoll.seq;
      info.push(h('div', { class: 'row lastroll' }, h('div', { class: 'die small' + (fresh ? ' roll' : '') }, DIE[v.lastRoll.v] || v.lastRoll.v), h('span', { class: 'mute' }, `${names[v.lastRoll.p]} の出目 ${v.lastRoll.v}`)));
    }
    if (v.phase === 'rolloff') {
      head.push(h('div', { class: 'status' }, '選曲順を決めるサイコロ'));
      acts.push(P[me].rolled == null ? h('button', { class: 'pri big', onclick: () => act({ t: 'roll' }) }, '🎲 サイコロを振る') : h('div', { class: 'mute' }, '相手を待っています…'));
    } else if (v.phase === 'draw') {
      const r = v.lastResult;
      if (r) head.push(h('div', { class: 'status' }, `第${r.songNo}曲 ${r.totals.join(' - ')} → ${names[r.winner]} の勝ち`));
      if (v.drawAns[me] == null) {
        head.push(h('div', { class: 'mute' }, '山札から引く枚数'));
        acts.push(h('div', { class: 'row' }, Array.from({ length: v.rules.postSongDraw + 1 }, (_, n) => h('button', { class: n === v.rules.postSongDraw ? 'pri' : '', onclick: () => act({ t: 'draw', n }) }, `${n}枚`))));
      } else acts.push(h('div', { class: 'mute' }, '相手を待っています…'));
    } else if (v.phase === 'song') {
      if (myTurn) {
        head.push(h('div', { class: 'status' }, 'あなたのターン',
          v.rules.maxPlays ? h('span', { class: playsLeft ? 'cnt-ok' : 'err', style: 'margin-left:.6rem;font-size:.85rem' }, `カード ${v.song.plays[me]}/${v.rules.maxPlays}${playsLeft ? '' : ' (上限)'}`) : null));
        const sc = app.sel && P[me].hand.find((c) => c.uid === app.sel);
        if (sc) {
          const c = getCard(sc.id);
          const playable = c.type === 'chara' || (c.effects || []).some((e) => e.when === 'play');
          const condOk = playCondViewOk(v, c);
          acts.push(h('button', { class: 'pri', disabled: !playable || !playsLeft || !condOk, onclick: () => { app.sel = null; act({ t: 'play', uid: sc.uid }); } }, !playable ? (c.reactOnly ? '相手のゴママヨ発動時に自動で使えます' : '効果未実装') : !condOk ? '使用条件を満たしていません' : !playsLeft ? '使用上限に達しました' : (c.type === 'chara' ? `「${c.name}」を場に出す` : `「${c.name}」を使う`)));
        }
        // nothing else to do (play limit reached or no usable card in hand) -> make the dice button impossible to miss
        const onlyRoll = !playsLeft || !P[me].hand.some((c) => { const cd = getCard(c.id); return (cd.type === 'chara' || (cd.effects || []).some((e) => e.when === 'play')) && playCondViewOk(v, cd); });
        acts.push(h('button', { class: (sc && !onlyRoll ? '' : 'pri big') + (onlyRoll ? ' rollnow' : ''), onclick: () => { app.sel = null; act({ t: 'end' }); } }, '🎲 サイコロを振って終了'));
        if (!sc) info.push(h('div', { class: 'mute hint' }, (app.touchUi || isPhone()) ? 'カードは左右になぞって確認 / 上にドラッグで使用' : 'カードは2回タップ / 上にドラッグで使用'));
      } else if (v.prompt && v.prompt.waiting) head.push(h('div', { class: 'mute' }, `${names[v.prompt.player]} が選択中…`));
      else head.push(h('div', { class: 'status' }, v.cur === me ? '…' : `${names[v.cur]} のターン`));
    }
    return h('div', { class: 'actionp' }, head, h('div', { class: 'acts' }, acts), info);
  }

  const nHand = (P[me].hand || []).length;
  const hand = h('div', { class: 'hand', style: `--n:${nHand}` }, (P[me].hand || []).map((c) => {
    const card = getCard(c.id);
    const playable = (card.type === 'chara' || (card.effects || []).some((e) => e.when === 'play')) && playCondViewOk(v, card);
    const el = cardEl(c.id, { size: 'hand', selected: app.sel === c.uid, dim: !playable || (myTurn && !playsLeft), uid: c.uid });
    // click = select, drag upward = play (Shadowverse style)
    const tap = (touch) => {      // tap = select, tap the selected card again = use it  (also what Enter/Space does on a focused card)
      // touch: a tap only selects (no accidental plays while browsing) -- use the 「使う」 button or drag the card upward
      if (!touch && app.sel === c.uid && canUse && playable) { app.sel = null; return act({ t: 'play', uid: c.uid }); }
      app.sel = app.sel === c.uid ? null : c.uid; play(app.sel ? 'select' : 'deselect'); render();
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType !== 'mouse'; let dragged = false, scrub = false;
      app.touchUi = touch;
      el.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (touch && !dragged && !scrub && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) scrub = true;     // sideways swipe = look through the hand
        if (scrub) { scrubAt(ev.clientX); return; }
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          dragged = true; el.style.transition = 'none'; el.style.zIndex = 60;
          el.style.transform = `translate(${dx}px,${dy}px) scale(1.15)`;
          el.classList.toggle('will-play', canUse && playable && y0 - ev.clientY > 140);
        }
      };
      const up = (ev) => {
        el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up);
        if (scrub) return;
        if (!dragged) return tap(touch);
        if (canUse && playable && y0 - ev.clientY > 140) { app.sel = null; act({ t: 'play', uid: c.uid }); } else render();
      };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
    });
    const slot = h('div', { class: 'hslot' + (app.sel === c.uid ? ' sel' : ''), title: card.name }, el);
    slot.activate = () => tap(false);
    return slot;
  }));

  const logEl = h('div', { class: 'log' }, v.log.map((l) => h('div', { class: l.startsWith('──') ? 'hl' : '' }, l)));
  setTimeout(() => { logEl.scrollTop = logEl.scrollHeight; });

  const mb = pbar(me);
  mb.append(h('button', { class: 'sec', onclick: () => { app.logOpen = !app.logOpen; render(); } }, '📜 ログ'),
    h('button', { class: 'sec', onclick: () => { if (confirm('対戦から退出しますか？')) leave(); } }, '退出'));
  const last = v.log[v.log.length - 1];
  const g = h('div', { class: 'game' + (v.song?.sudden && v.phase === 'song' ? ' sudden' : '') },
    h('div', { class: 'table' }, pbar(opp), fieldRow(opp), center, h('div', { class: 'ticker' }, last || ''), fieldRow(me), mb, h('div', { class: 'handspace' })),
    hand,
    h('div', { class: 'sidebar' + (app.logOpen ? ' open' : '') }, h('button', { class: 'sec', onclick: () => { app.logOpen = false; render(); } }, '閉じる ✕'), logEl));

  keys.hook = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' && app.sel && !app.logOpen) { app.sel = null; render(); return true; }
    if (k === 'l' || (k === 'escape' && app.logOpen)) { app.logOpen = !app.logOpen; render(); return true; }
    const main = () => document.querySelector('.coach .pri') || document.querySelector('.actionp .acts button.pri') || document.querySelector('.actionp .acts button:last-child');
    if (k === 'e' || ((k === 'enter' || k === ' ') && (!document.activeElement || document.activeElement === document.body))) { const b = main(); if (b && !b.disabled) { b.click(); return true; } }
    if (/^[1-9]$/.test(k) && (P[me].hand || [])[+k - 1]) { app.sel = P[me].hand[+k - 1].uid; play('select'); render(); document.querySelectorAll('.hslot')[+k - 1]?.focus({ preventScroll: true }); return true; }
    return false;
  };
  // selected hand card -> enlarged in the centre of the screen (tap it again / Enter to use it)
  const selCard = app.sel && (P[me].hand || []).find((c) => c.uid === app.sel);
  g.addEventListener('click', (e) => { if (app.sel && !e.target.closest('.hslot, button, .actionp, .sidebar, .overlay')) { app.sel = null; render(); } });
  const o = [g];
  if (selCard && !veil) {
    o.push(mkZoom(selCard));
  } else app.zoomShown = null;
  const tip = coachTip(v); if (tip) { o.push(tip); app.tutTarget = TIPS.find((t) => !app.tut.seen[t.id] && t.when(v, me, app.tut.seen))?.target; } else app.tutTarget = null;
  if (v.prompt && !v.prompt.waiting) o.push(promptModal(v.prompt));
  if (v.phase === 'over' && !veil) o.push(overModal());
  return h('div', null, o);

  function mkZoom(selCard) {
    const sc = getCard(selCard.id), pop = app.zoomShown !== selCard.uid; app.zoomShown = selCard.uid;
    const ok = (sc.type === 'chara' || (sc.effects || []).some((e) => e.when === 'play')) && playCondViewOk(v, sc);
    const touch = app.touchUi || isPhone();
    return h('div', { class: 'handzoom' + (pop ? ' pop' : '') }, cardEl(selCard.id, { size: 'zoom2' }),
      h('div', { class: 'hz' }, !ok ? (sc.reactOnly ? '相手のゴママヨ発動時に自動で使えます' : '今は使えないカードです') : !canUse ? 'あなたのターンではありません'
        : touch ? '左右になぞると他のカードも見られます' : '👆 もう一度タップ / Enter で使う　・　Esc で戻す'),
      ok && canUse && touch && h('button', { class: 'pri hzuse', onclick: () => { app.sel = null; act({ t: 'play', uid: selCard.uid }); } }, '▶ このカードを使う'));
  }
  // swiping sideways over the hand: preview whichever card is under the finger, without re-rendering (that would drop the touch)
  function scrubAt(x) {
    const slots = [...document.querySelectorAll('.hslot')]; if (!slots.length) return;
    let i = 0; slots.forEach((sl, k) => { if (x >= sl.getBoundingClientRect().left) i = k; });
    const card = (P[me].hand || [])[i]; if (!card || app.sel === card.uid) return;
    app.sel = card.uid; play('select');
    slots.forEach((sl, k) => sl.classList.toggle('sel', k === i));
    document.querySelector('.handzoom')?.remove();
    document.querySelector('.game')?.parentNode.append(mkZoom(card));
  }
  // (function declarations: promptModal() is called above this point, so these must be hoisted)
  function ownTag(o) { return o == null ? null : h('div', { class: 'owner-tag ' + (o === me ? 'mine' : 'theirs') }, o === me ? '🟦 あなたのカード' : '🟥 相手のカード'); }
  function effText(id, label, o) { const c = getCard(id); return h('div', { class: 'efftext' }, ownTag(o), h('b', null, label || c.name), h('ul', null, (c.text || []).map((t) => h('li', null, t)))); }
  function promptModal(pr) {
    const ans = (val) => act({ t: 'answer', v: val });
    const withCards = pr.choices.some((c) => c.cardId);
    const big = pr.choices.every((c) => typeof c.value === 'number' && c.big);
    return h('div', { class: 'overlay prompt' }, h('div', { class: 'modal' },
      h('h3', null, pr.text), pr.cardId && h('div', { class: 'promptcard' }, cardEl(pr.cardId, { size: 'md' }), effText(pr.cardId)),
      withCards ? h('div', { class: 'choicelist' }, pr.choices.map((c) => c.cardId ? h('div', { class: 'pickcard choicerow' + (c.owner == null ? '' : c.owner === me ? ' own-mine' : ' own-theirs'), onclick: () => ans(c.value) }, cardEl(c.cardId, { size: 'sm' }), effText(c.cardId, c.label, c.owner)) : h('button', { class: 'pri', onclick: () => ans(c.value) }, c.owner == null ? c.label : `${c.owner === me ? '🟦' : '🟥'} ${c.label}`)))
        : big ? h('div', { class: 'dice-pick' }, pr.choices.map((c) => h('button', { onclick: () => ans(c.value) }, c.label)))
          : h('div', { class: 'row' }, pr.choices.map((c) => h('button', { class: 'pri', onclick: () => ans(c.value) }, c.label))),
      pr.optional && h('div', { class: 'row' }, h('button', { class: 'sec', onclick: () => ans(null) }, pr.skipLabel || (withCards || big ? '選ばない' : '使わない')))));
  }
  function overModal() {
    const won = v.winner && v.winner.includes(me);
    const host = me === 0;
    return h('div', { class: 'overlay over' }, h('div', { class: 'modal', style: 'text-align:center' },
      h('h1', { style: `color:${won ? 'var(--ok)' : 'var(--bad)'}` }, won ? 'YOU WIN!' : 'YOU LOSE…'),
      h('div', { class: 'mute' }, `${v.winner.map((i) => names[i]).join(', ')} の勝利 (${v.reason})`),
      h('div', { class: 'row', style: 'justify-content:center;margin-top:1rem' },
        host && !app.room?.code && P.some((_, i) => i !== me) ? h('button', { class: 'pri', onclick: rematchCpu }, 'もう一度対戦') : null,
        host ? h('button', { class: app.room?.code ? 'pri' : '', onclick: () => app.client.send({ t: 'toLobby' }) }, 'ロビーに戻る') : h('span', { class: 'mute' }, 'ホストがロビーに戻すのを待っています…'),
        h('button', { onclick: leave }, '退出'))));
  }
}
function rematchCpu() {
  const c = app.client;
  c.send({ t: 'toLobby' });
  sendDeck(); // pick up any deck change
  c.send({ t: 'ready', ready: true });
  c.send({ t: 'start' });
}
function showZone(title, cards) {
  modal(h('h3', null, title), cards.length ? h('div', { class: 'sel-list' }, cards.map((c) => cardEl(c.id, { size: 'sm' }))) : h('div', { class: 'mute' }, '空です'));
}

/* ------------------------------------------------------------------ main */
const SCREENS = { tutorial: tutorialScreen, cpu: cpuScreen, home: homeScreen, play: playScreen, room: roomScreen, decks: deckScreen, library: libraryScreen, rules: rulesScreen, game: gameScreen };
// The page itself never scrolls. --app-h is the REAL visible height (100vh is taller than the visible area on phones while the
// address bar is showing). Screens that are not "fit" pages (home, setup, online room…) shrink to fit when they are too tall.
function setAppHeight() { document.documentElement.style.setProperty('--app-h', innerHeight + 'px'); }
function fitScreen() {
  setAppHeight();
  const el = document.querySelector('#app > .wrap:not(.fit)');
  if (!el) return;
  el.style.zoom = '';
  let z = 1;
  for (let k = 0; k < 5; k++) {
    const h = el.scrollHeight;
    if (h <= innerHeight + 1) break;
    z = Math.max(0.55, z * (innerHeight / h)); el.style.zoom = z.toFixed(3);
  }
}
addEventListener('resize', () => { setAppHeight(); if (app.screen !== 'game') fitScreen(); });
addEventListener('orientationchange', () => setTimeout(() => { setAppHeight(); fitScreen(); }, 250));

// inner scroll areas whose position must survive a re-render (the whole screen is rebuilt on every state change)
const KEEP_SCROLL = ['.lib .pool', '.decklist', '.panel.scroll', '.tutbody'];
export function render() {
  const saved = KEEP_SCROLL.map((sel) => [sel, [...document.querySelectorAll(sel)].map((e) => [e.scrollTop, e.scrollLeft])]);
  const snap = snapshot();
  keys.hook = null;
  const y = root.scrollTop;
  document.body.classList.toggle('ingame', app.screen === 'game');
  syncSoundBtn();
  root.replaceChildren(SCREENS[app.screen]());
  if (app.screen === 'game') postRenderFx();
  restore(snap);
  fitScreen();
  root.scrollTop = y;
  for (const [sel, pos] of saved) document.querySelectorAll(sel).forEach((e, i) => { if (pos[i]) { e.scrollTop = pos[i][0]; e.scrollLeft = pos[i][1]; } });
}

// re-apply in-flight card animations after a re-render (negative delay = continue where it was), and spawn score floats
function postRenderFx() {
  if (app.tutTarget) document.querySelectorAll(app.tutTarget).forEach((e) => e.classList.add('tut-hl'));
  const now = performance.now();
  for (const [uid, e] of Object.entries(app.entering)) {
    const age = now - e.t0;
    if (age > 900) { delete app.entering[uid]; continue; }
    document.querySelectorAll(`.card[data-uid="${uid}"]`).forEach((c) => {
      const t = e.kind === 'draw' ? c.closest('.hslot') || c : c;
      t.classList.add(e.kind === 'draw' ? 'enter-draw' : 'enter-field');
      t.style.animationDelay = `-${age}ms`;
    });
  }
  for (const f of app.floats) {
    const col = document.querySelector(`.pcol[data-p="${f.p}"]`);
    if (!col) continue;
    col.querySelector('.tot')?.classList.add('pop');
    setTimeout(() => { const c2 = document.querySelector(`.pcol[data-p="${f.p}"]`); if (c2) floatText(c2.getBoundingClientRect(), (f.d > 0 ? '+' : '') + f.d, f.d > 0); }, f.delay || 0);
  }
  app.floats = [];
}

// small UI sounds: buttons, hovering hand cards
document.addEventListener('click', (e) => { if (e.target.closest?.('button,.chip,.tab,.item')) play('click'); }, true);
let lastHslot = null;
document.addEventListener('mouseover', (e) => { const s2 = e.target.closest?.('.hslot'); if (s2 !== lastHslot) { lastHslot = s2; if (s2) play('hover'); } });

// double-click a card (library / deck builder) -> big view. Delegated: the first click re-renders the grid, so per-element handlers would be lost.
document.addEventListener('dblclick', (e) => { e.target.closest?.('.lib .slot, .pool8 .slot')?._zoom?.(); });

// card preview on hover
const prev = document.getElementById('preview');
// hover info panel: compact black box with white text (name, status, effect text) — replaces the giant card preview
const TYPE_JP = { chara: 'キャラ', skill: 'スキル', chart: '譜面', machine: '機種' };
function infoPanel(c) {
  const meta = [TYPE_JP[c.type]];
  if (c.type === 'chart') meta.push(machinesOf(c).join('/'), [].concat(c.tendency || 'NONE').join('/'));
  if (c.source && c.type !== 'chart') meta.push(c.source);
  const flags = statusOf(c).filter((x) => x.k !== 'ok').map((x) => x.k === 'uv' ? '要確認' : x.t.replace(/ \(.*$/, ''));
  return h('div', { class: 'info' },
    h('div', { class: 'info-h' }, h('b', null, c.name), h('span', { class: 'info-m' }, meta.filter(Boolean).join(' ・ '))),
    flags.length ? h('div', { class: 'info-f' }, flags.map((t) => h('span', null, t))) : null,
    h('ul', null, (c.text || []).map((t) => h('li', null, t))),
    c.wip ? h('div', { class: 'info-w' }, '※ このカードの効果はまだゲーム内で処理されません') : null);
}
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest?.('.card[data-id]');
  if (!el || el.closest('#preview') || el.closest('.detail, .fx-reveal, .coach')) { prev.hidden = true; return; }
  const c = getCard(el.dataset.id);
  if (!c) { prev.hidden = true; return; }
  prev.replaceChildren(infoPanel(c));
  Object.assign(prev.style, { top: 'auto', bottom: '1rem', left: 'auto', right: '1rem' });
  prev.hidden = false;
  const pr = prev.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (!(pr.right < r.left || pr.left > r.right || pr.bottom < r.top || pr.top > r.bottom)) Object.assign(prev.style, { left: '1rem', right: 'auto' });   // the card itself is down there: use bottom-left
});
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget?.closest?.('.card[data-id]')) prev.hidden = true; });

const m = location.hash.match(/room=([A-Za-z0-9]+)/);
if (m) { app.screen = 'play'; app.joinCode = m[1].toUpperCase(); }
const pg = location.hash.match(/page=(\w+)(?:&tab=(\w+))?/); // debug/deep link: #page=library&tab=chara
if (pg && SCREENS[pg[1]]) { app.screen = pg[1]; if (pg[2]) app.tab = pg[2]; }
render();
// debug: #demo=K starts a CPU game and auto-plays the first K of my actions instantly (used for screenshots)
const dm = location.hash.match(/^#demo=?(\d*)/);
if (dm) {
  doCpu();
  app.room.host.botDelay = 0;
  let left = Number(dm[1] || 0);
  const orig = app.client.onmsg;
  app.client.onmsg = (msg) => {
    orig(msg);
    if (msg.t === 'view' && left > 0) {
      import('./ai.js').then(({ botAct }) => { const a = botAct(msg.view); if (a && left > 0) { left--; setTimeout(() => app.client.send({ t: 'act', a }), 0); } });
    }
  };
}
window.__app = app;
initKeys();
// countdown: update the clock text in place (no full re-render), tick in the last 5 seconds when it is MY clock
let lastTick = -1;
setInterval(() => {
  if (!app.timer) { lastTick = -1; return; }
  const l = tleft();
  document.querySelectorAll('.timer').forEach((e) => { e.textContent = `⏱ ${l}`; e.classList.toggle('warn', l <= 10); });
  if (l <= 5 && l !== lastTick && app.view && app.timer.players.includes(app.view.you)) { lastTick = l; play('tick'); }
  if (l > 5) lastTick = -1;
}, 250);
window.__render = render;
