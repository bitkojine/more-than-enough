/* After each deploy: the live room service answers as the game expects.
 * Makes a room, joins it as its maker and as an invited friend, and checks
 * that strangers are turned away. Usage: node smoke.mjs <service url> <origin>
 *
 * The checks themselves live in server/checks.mjs, so the same assertions run
 * in npm test against a real Room (test/unit/smoke.test.js) without the
 * network or the admin token. This file is only the live `service`: a
 * WebSocket per player and fetch for the rest. */

import { roomChecks } from './checks.mjs';

const [BASE, ORIGIN] = process.argv.slice(2);
const WS = BASE.replace(/^http/, 'ws');
const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok: ' : 'FAIL: ') + what); if (!ok) failed++; };

function connect(room, key, code) {
  const ws = new WebSocket(`${WS}/rooms/${room}/ws`, { headers: { Origin: ORIGIN } });
  const msgs = [];
  const next = (type, ms = 8000) => new Promise((resolve) => {
    const t0 = Date.now();
    const look = () => {
      const m = msgs.find((x) => x.t === type);
      if (m) return resolve(m);
      if (Date.now() - t0 > ms) return resolve(null);
      setTimeout(look, 50);
    };
    look();
  });
  const closed = new Promise((resolve) => { ws.onclose = (e) => { console.log('  (socket closed: ' + e.code + ' ' + e.reason + ')'); resolve(e.code + ' ' + e.reason); }; });
  ws.onerror = (e) => console.log('  (socket error: ' + (e.message || e.type) + ')');
  ws.onmessage = (e) => msgs.push(e.data === 'pong' ? { t: 'pong' } : JSON.parse(e.data));
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', key, ...(code ? { code } : {}) }));
  return { ws, next, closed, send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)), close: () => ws.close(1000, 'bye') };
}

// Repeats an admin read for a few seconds, so it waits out a deploy's rollout
// (right after one, the old version may still answer).
const hiddenFor = async (url, headers) => {
  let status = 0;
  for (let i = 0; i < 10 && status !== 404; i++) {
    if (i) await sleep(3000);
    status = (await fetch(BASE + url, { headers })).status;
  }
  return status;
};

const service = {
  sessions: 'live',
  async create(body, { token }) {
    const res = await fetch(BASE + '/rooms', {
      method: 'POST',
      headers: {
        Origin: ORIGIN, 'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: JSON.stringify(body)
    });
    const { room } = await res.json().catch(() => ({}));
    return { status: res.status, room };
  },
  connect: (room, key, code) => connect(room, key, code),
  async post(origin, body) {
    return fetch(BASE + '/rooms', { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' }, body });
  },
  hidden: (headers) => hiddenFor('/admin/rooms', headers),
  async log(room, token) {
    const res = await fetch(`${BASE}/admin/rooms/${room}/log`, { headers: { Authorization: 'Bearer ' + token } });
    return res.status === 200 ? (await res.text()).trim().split('\n').map((l) => JSON.parse(l)) : [];
  },
  async players(tests, token) {
    const r = await fetch(`${BASE}/admin/players${tests ? '?tests=1' : ''}`, { headers: { Authorization: 'Bearer ' + token } });
    return r.status === 200 ? (await r.json()).rooms.map((w) => w.id) : [];
  }
};

const token = process.env.ROOMS_ADMIN_TOKEN;
if (!token) { console.error('ROOMS_ADMIN_TOKEN is needed: worlds are made under it now.'); process.exit(1); }

await roomChecks(service, check, { rand, token, sleep });
console.log(failed ? `${failed} check(s) failed` : 'room service OK');
process.exit(failed ? 1 : 0);
