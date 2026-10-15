/* After each deploy: the live room service answers as the game expects.
 * Makes a room, joins it as its owner and as an invited friend, and checks
 * that strangers are turned away. Usage: node smoke.mjs <service url> <origin> */

import { packKey } from '../src/core/coords.js';

const [BASE, ORIGIN] = process.argv.slice(2);
const WS = BASE.replace(/^http/, 'ws');
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  return { ws, next, closed, send: (m) => ws.send(JSON.stringify(m)) };
}

const post = (origin, body) => fetch(BASE + '/rooms', { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' }, body });

check((await post(null, '{}')).status === 403, 'no Origin: refused');
check((await post('https://evil.example', '{}')).status === 403, 'another site: refused');
const bad = await post(ORIGIN, '{"t":"create","key":"short"}');
check(bad.status === 400, 'a malformed world: refused (' + bad.status + ' ' + (await bad.text()) + ')');

// Right after a deploy the old version may still make and run rooms for a
// few seconds: rooms are made until one welcomes with what this version
// says (`ack`), for a while.
let ownerKey, res, room, owner, hi;
for (let i = 0; i < 5; i++) { // (a visitor may make 6 rooms an hour)
  if (i) { owner.ws.close(1000, 'bye'); await new Promise((r) => setTimeout(r, 3000)); }
  ownerKey = hex(32);
  res = await post(ORIGIN, JSON.stringify({ t: 'create', key: ownerKey, world: { seed: 12345, mods: [], props: [], ext: [] }, pos: { x: 0.5, y: 0.5, z: 0 } }));
  ({ room } = await res.json());
  owner = connect(room, ownerKey);
  hi = await owner.next('welcome');
  if (!hi || hi.ack === true) break;
}
check(res.status === 201 && /^[A-Za-z0-9_-]{22}$/.test(room), 'a room is made');
check(hi && hi.you === hi.owner && hi.seed === 12345, 'the owner gets the world back');

const stranger = connect(room, hex(32));
check(/1008 invite/.test(await stranger.closed), 'a stranger without an invite is turned away');

owner.send({ t: 'invite' });
const inv = await owner.next('invite');
check(!!inv, 'the owner gets an invite');
const friend = connect(room, hex(32), inv && inv.code);
const fw = await friend.next('welcome');
check(fw && fw.you !== hi.you && fw.players[hi.you], 'an invited friend joins and sees the owner');
friend.send({ t: 'pos', p: { x: 2, y: 3, z: 0 } });
const moved = await owner.next('pos');
check(moved && moved.p.x === 2, 'the owner sees the friend move');
check(hi && hi.pong === true && hi.ack === true, 'the welcome says the room answers pings and acknowledges edits');
friend.ws.send('ping');
check(!!(await friend.next('pong')), 'the room answers a ping');
friend.send({ t: 'edits', e: [['m', packKey(2, 3, 0), 1]], n: 1 });
const ack = await friend.next('ack');
check(ack && ack.n === 1, 'numbered edits are acknowledged');

// (Right after a deploy the old version may still answer for a few seconds.)
const hidden = async (headers) => {
  let status = 0;
  for (let i = 0; i < 10 && status !== 404; i++) {
    if (i) await new Promise((r) => setTimeout(r, 3000));
    status = (await fetch(BASE + '/admin/rooms', { headers })).status;
  }
  return status;
};
let st = await hidden({});
check(st === 404, 'the moderator routes are hidden without the token (' + st + ')');
st = await hidden({ Authorization: 'Bearer ' + hex(32) });
check(st === 404, 'and with a wrong one (' + st + ')');
const token = process.env.ROOMS_ADMIN_TOKEN;
if (token) {
  const res = await fetch(`${BASE}/admin/rooms/${room}/log`, { headers: { Authorization: 'Bearer ' + token } });
  const lines = res.status === 200 ? (await res.text()).trim().split('\n').map((l) => JSON.parse(l)) : [];
  check(lines[0]?.e === 'room' && lines.some((l) => l.e === 'join' && l.new), "the moderator reads the room's audit log");
}

owner.ws.close(1000, 'bye');
friend.ws.close(1000, 'bye');
console.log(failed ? `${failed} check(s) failed` : 'room service OK');
process.exit(failed ? 1 : 0);
