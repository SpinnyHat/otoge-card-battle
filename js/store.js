// localStorage persistence: profile + saved decks
import { STARTER_DECKS } from './cards.js';

const K = 'rcb.v1';
const rid = () => Math.random().toString(36).slice(2, 10);
const load = () => { try { return JSON.parse(localStorage.getItem(K)) || null; } catch { return null; } };

let data = load();
if (!data) {
  data = {
    profile: { id: rid(), name: 'Player' + Math.floor(Math.random() * 900 + 100) },
    decks: STARTER_DECKS.map((d) => ({ id: rid(), ...structuredClone(d) })),
    activeDeck: null,
  };
}
// migrations: v2 = renamed ギタドラ starter + slide-card starter decks
if ((data.v || 1) < 2) {
  for (const d of data.decks) {
    d.name = d.name.replace('GFDM/Arcaea', 'ギタドラ/Arcaea');
    if (JSON.stringify(d.machines) === JSON.stringify(['maimai', 'ongeki', 'bms'])) d.machines = ['maimai', 'ongeki'];   // old starter broke the BMS limit
    if (JSON.stringify(d.machines) === JSON.stringify(['gfdm', 'arcaea', 'bms'])) d.machines = ['gfdm', 'arcaea'];
  }
  for (const st of STARTER_DECKS.slice(2)) if (!data.decks.some((d) => d.name === st.name)) data.decks.push({ id: rid(), ...structuredClone(st) });
  data.v = 2;
}
data.activeDeck ||= data.decks[0]?.id;
const save = () => localStorage.setItem(K, JSON.stringify(data));
save();

export const store = {
  get profile() { return data.profile; },
  setName(n) { data.profile.name = (n || '').trim().slice(0, 20) || data.profile.name; save(); },
  get decks() { return data.decks; },
  get activeDeck() { return data.decks.find((d) => d.id === data.activeDeck) || data.decks[0] || null; },
  setActive(id) { data.activeDeck = id; save(); },
  upsert(deck) {
    const i = data.decks.findIndex((d) => d.id === deck.id);
    if (i >= 0) data.decks[i] = deck; else data.decks.push(deck);
    save();
  },
  newDeck(name = '新しいデッキ') {
    const d = { id: rid(), name, tendency: 'NONE', machines: [], chara: [], skill: [], chart: [] };
    data.decks.push(d); save(); return d;
  },
  remove(id) { data.decks = data.decks.filter((d) => d.id !== id); if (data.activeDeck === id) data.activeDeck = data.decks[0]?.id; save(); },
  duplicate(id) {
    const d = data.decks.find((x) => x.id === id); if (!d) return null;
    const c = { ...structuredClone(d), id: rid(), name: d.name + ' コピー' };
    data.decks.push(c); save(); return c;
  },
  exportDeck(d) { const { id, ...rest } = d; return btoa(unescape(encodeURIComponent(JSON.stringify(rest)))); },
  importDeck(code) {
    const o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    const d = { id: rid(), name: String(o.name || '取り込みデッキ').slice(0, 40), tendency: o.tendency, machines: o.machines || [], chara: o.chara || [], skill: o.skill || [], chart: o.chart || [] };
    data.decks.push(d); save(); return d;
  },
  rid,
};
