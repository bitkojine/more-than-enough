/* The room service's checks, run locally: the same assertions as
 * server/smoke.mjs (they live in server/checks.mjs), but against a real Room
 * in this process — no network, no admin token, no deploy. So a wrong
 * assumption about the wire (a player id's shape, say) fails in `npm test`
 * instead of only in CI after a deploy.
 *
 * The `service` here is the worker's guards plus one real Room: the worker
 * decides what a caller may do (Origin, the admin token) and the Room decides
 * what happens inside a world. Keeping both means these checks cover what the
 * live ones cover. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { Room } from '../../server/src/room.js';
import { roomChecks } from '../../server/checks.mjs';

const ORIGIN = 'https://play.robertasrudys.com';
const TOKEN = 'the-moderator-token-for-this-test-at-least-32-chars';
const T0 = 1_700_000_000_000;

// A Room in this process, driven the way the worker drives it: the worker's
// guards (Origin, the token) around the room's own rules. `now` advances a
// little on each call, so the room sees a living clock.
function localService() {
  let now = T0;
  const tick = () => (now += 10);
  const rooms = new Map();
  const admin = (token) => token === TOKEN;

  // Everyone connected to a room, so one player's step reaches another's
  // queue the way the live relay does (bound by distance in the room; here
  // every session in the room is close enough for the checks to see).
  const live = new Map(); // roomId -> Map(playerId -> session)

  function session(room, key, code) {
    const id = room.id;
    const msgs = [];
    let closeReason = null;
    // Everyone waiting in `next`: woken whenever a message lands or the
    // socket closes, so a message that arrives later still resolves.
    const waiters = new Set();
    const wake = () => { for (const w of [...waiters]) w(); };
    const push = (m) => { msgs.push(m); wake(); };

    const conn = {
      // Resolves with the first message of `type` (or null after `ms`).
      next: (type, ms = 1000) => new Promise((resolve) => {
        const look = () => {
          const m = msgs.find((x) => x.t === type);
          if (m) { waiters.delete(look); clearTimeout(timer); resolve(m); }
          else if (closeReason) { waiters.delete(look); clearTimeout(timer); resolve(null); }
        };
        const timer = setTimeout(() => { waiters.delete(look); resolve(msgs.find((x) => x.t === type) || null); }, ms);
        waiters.add(look);
        look();
      }),
      send: async (raw) => {
        if (raw === 'ping') { push({ t: 'pong' }); return {}; }
        const out = room.message(conn.id, typeof raw === 'string' ? raw : JSON.stringify(raw), tick());
        if (out && out.toSelf) for (const m of out.toSelf) push(m);
        if (out && out.toOthers) for (const other of live.get(id).values()) {
          if (other.id !== conn.id) other._push(out.toOthers);
        }
        return out || {};
      },
      close: () => { if (closeReason) return; closeReason = '1000 bye'; live.get(id)?.delete(conn.id); wake(); },
      get closed() {
        return new Promise((resolve) => {
          if (closeReason) return resolve(closeReason);
          waiters.add(() => { if (closeReason) resolve(closeReason); });
        });
      },
      id: null,
      _push: (ms) => { for (const m of ms) push(m); }
    };
    // Join is async, like the live handshake: the welcome (or the refusal)
    // lands in the queue a moment later.
    room.join(key, code, tick()).then((o) => {
      if (o.error) { closeReason = '1008 ' + o.error; wake(); return; }
      conn.id = o.id;
      if (!live.has(id)) live.set(id, new Map());
      live.get(id).set(o.id, conn);
      push(o.welcome);
    });
    return conn;
  }

  const service = {
    sessions: 'local',
    async create(body, { token }) {
      tick();
      // The worker's guards: the caller must be Watch (the token), and the
      // body must be a create a room can be made from.
      if (!admin(token)) return { status: 403 };
      if (body.t !== 'create' || !P.cleanCreate(body)) return { status: 400 };
      const id = P.randomRoomId();
      const r = new Room(id, now);
      await r.init(JSON.stringify(body), now, true);
      rooms.set(id, r);
      live.set(id, new Map());
      return { status: 201, room: id };
    },
    connect(room, key, code) {
      return session(rooms.get(room), key, code);
    },
    // The room's join, awaited: for the local half of the check where a live
    // close code carries the refusal.
    async join(room, key, code) {
      const o = await rooms.get(room).join(key, code, tick());
      return o.error ? { error: o.error, why: o.why } : o;
    },
    async post(origin) {
      tick();
      // No Origin (or another site): refused. And with the game's Origin but
      // no token, still refused — worlds are Watch's to make now.
      return { status: 403 };
    },
    async hidden(headers) {
      // The admin routes take the token and nothing else: without it, 404.
      return admin((headers.Authorization || '').replace(/^Bearer\s+/i, '')) ? 200 : 404;
    },
    async log(room, token) {
      if (!admin(token)) return [];
      // The worker prepends the room itself, then its events (worker.js
      // exportLog): the head line is what the moderator's log opens with.
      return [{ e: 'room' }, ...rooms.get(room).takeLog()];
    },
    async players(tests, token) {
      if (!admin(token)) return [];
      const out = [];
      for (const [id, r] of rooms) if (tests || !r.smoke) out.push(id);
      return out;
    }
  };
  return service;
}

test('smoke: the room service passes the same checks the deploy runs', async () => {
  const service = localService();
  const failed = [];
  const check = (ok, what) => { if (!ok) failed.push(what); };
  const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sleep = () => Promise.resolve(); // in process there is no rollout to wait out
  await roomChecks(service, check, { rand, token: TOKEN, sleep });
  assert.deepEqual(failed, [], failed.join('; '));
});
