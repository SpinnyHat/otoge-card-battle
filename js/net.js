// WebRTC transport via PeerJS (public signalling server; gameplay itself is peer-to-peer).
// Needs the global `Peer` from the <script> tag in index.html.
import { Host, localClient } from './host.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const peerId = (code) => 'rcb-v1-' + code;
const ICE = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };

export function hasPeer() { return typeof Peer !== 'undefined'; }

// Create a room. Resolves { code, client, host }.
export function createRoom(profile, max = 2) {
  return new Promise((resolve, reject) => {
    if (!hasPeer()) return reject(new Error('PeerJS を読み込めませんでした (オフライン?)'));
    const host = new Host({ max });
    let tries = 0;
    const open = () => {
      const code = newCode();
      const peer = new Peer(peerId(code), ICE);
      peer.on('open', () => {
        const client = localClient(host, profile.name);
        const origClose = client.close;
        client.close = () => { origClose(); peer.destroy(); };
        peer.on('connection', (conn) => {
          let idx = -1;
          const send = (m) => { if (conn.open) conn.send(m); };
          conn.on('data', (m) => {
            if (m.t === 'hello') {
              const prev = host.seatByToken(m.token);
              if (prev >= 0) { idx = prev; host.reconnect(prev, send); return; }
              idx = host.addSeat({ name: String(m.name || 'Guest').slice(0, 20), kind: 'remote', send, token: m.token });
              if (idx < 0) { send({ t: 'full' }); setTimeout(() => conn.close(), 300); }
              return;
            }
            if (idx >= 0) host.handle(idx, m);
          });
          conn.on('close', () => { if (idx >= 0) host.disconnect(idx); });
          conn.on('error', () => { if (idx >= 0) host.disconnect(idx); });
        });
        resolve({ code, client, host });
      });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); return open(); }
        reject(e);
      });
    };
    open();
  });
}

// Join a room. Resolves a client { send, onmsg, onclose, close }.
export function joinRoom(code, profile) {
  return new Promise((resolve, reject) => {
    if (!hasPeer()) return reject(new Error('PeerJS を読み込めませんでした (オフライン?)'));
    const peer = new Peer(undefined, ICE);
    const fail = (e) => { peer.destroy(); reject(e); };
    const timer = setTimeout(() => fail(new Error('接続がタイムアウトしました。ルームコードを確認してください')), 15000);
    peer.on('error', (e) => { clearTimeout(timer); fail(e.type === 'peer-unavailable' ? new Error('その部屋は見つかりません') : e); });
    peer.on('open', () => {
      const conn = peer.connect(peerId(code.trim().toUpperCase()), { reliable: true });
      const client = { onmsg: () => {}, onclose: () => {}, send: (m) => conn.open && conn.send(m), close: () => peer.destroy() };
      conn.on('open', () => {
        clearTimeout(timer);
        let token = sessionStorage.getItem('rcb.token');
        if (!token) { token = Math.random().toString(36).slice(2); sessionStorage.setItem('rcb.token', token); }
        conn.send({ t: 'hello', name: profile.name, token });
        resolve(client);
      });
      conn.on('data', (m) => client.onmsg(m));
      conn.on('close', () => client.onclose());
      conn.on('error', () => client.onclose());
    });
  });
}

// Solo / CPU room (no network).
export function createCpuRoom(profile, opts) {
  const host = new Host({ max: 2 });
  const client = localClient(host, profile.name);
  if (opts?.maxPlays != null) host.settings.maxPlays = opts.maxPlays;
  if (opts?.turns != null) host.settings.turns = opts.turns;
  host.settings.timer = opts?.timer ?? 0;      // vs CPU: no clock unless asked for
  host.addBot(opts);
  return { client, host };
}
