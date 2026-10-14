/* The room service for playing together: a Cloudflare Worker that makes
 * rooms and hands each room's WebSockets to its Durable Object.
 *
 *   POST /rooms                 make a room from a world; returns {room}
 *   GET  /rooms/<id>/ws         join it (WebSocket)
 *
 * Only the game's own pages may call it (ALLOWED_ORIGINS), a visitor can make
 * only a few rooms an hour, and everything else is refused. The rules of a
 * room are in room.js; the wire format is src/net/protocol.js. */

import { DurableObject } from 'cloudflare:workers';
import { Room, Bucket, editBucket, NEAR } from './room.js';
import { LIMITS, ROOM_ID_RE, randomRoomId } from '../../src/net/protocol.js';

const CREATES_PER_HOUR = 6;      // rooms one IP address may make
const HELLO_MS = 10_000;         // a socket must say who it is within this
const PERSIST_MS = 2_000;        // edits reach storage this soon
const MAX_SOCKETS = LIMITS.players * 2;

// Whether a player at `p` is near enough to `q` to hear its every step.
function isNear(p, q) {
  return !!p && p.z === q.z && Math.abs(p.x - q.x) <= NEAR && Math.abs(p.y - q.y) <= NEAR;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

function allowedOrigin(env, origin) {
  if (!origin) return false;
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return true;
  // Local development only when the deployment says so.
  return env.ALLOW_LOCALHOST === 'true' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

// Who's asking, for the room-making limit: the IP address, or for IPv6 its
// /64 (one home or phone gets a whole /64, so single addresses are free).
function visitor(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip;
}

// The request body as text, or null once it passes `max` bytes (read in
// pieces, so a huge body is never held whole).
async function readCapped(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(all); } catch { return null; }
}

function respond(body, status, origin) {
  const headers = { ...SECURITY_HEADERS, 'Content-Type': 'application/json' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const okOrigin = allowedOrigin(env, origin) ? origin : null;

    if (request.method === 'OPTIONS') {
      if (!okOrigin) return new Response(null, { status: 403, headers: SECURITY_HEADERS });
      return new Response(null, {
        status: 204,
        headers: {
          ...SECURITY_HEADERS,
          'Access-Control-Allow-Origin': okOrigin,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin'
        }
      });
    }

    if (url.pathname === '/') return respond({ ok: true }, 200, okOrigin);
    // Browsers always send Origin on these; anything else isn't the game.
    if (!okOrigin) return respond({ error: 'origin' }, 403, null);

    if (url.pathname === '/rooms' && request.method === 'POST') {
      const len = Number(request.headers.get('Content-Length') || 0);
      if (len > LIMITS.createBytes) return respond({ error: 'size' }, 413, okOrigin);
      const gate = env.LIMITER.get(env.LIMITER.idFromName(visitor(request)));
      if (!(await gate.allow(Date.now()))) return respond({ error: 'busy' }, 429, okOrigin);
      const body = await readCapped(request, LIMITS.createBytes);
      if (body === null) return respond({ error: 'size' }, 413, okOrigin);
      const id = randomRoomId();
      const room = env.ROOMS.get(env.ROOMS.idFromName(id));
      const err = await room.create(id, body);
      if (err) return respond({ error: err }, err === 'bad' ? 400 : 409, okOrigin);
      return respond({ room: id }, 201, okOrigin);
    }

    const m = url.pathname.match(/^\/rooms\/([^/]+)\/ws$/);
    if (m && request.method === 'GET') {
      if (!ROOM_ID_RE.test(m[1])) return respond({ error: 'room' }, 404, okOrigin);
      if (request.headers.get('Upgrade') !== 'websocket') return respond({ error: 'upgrade' }, 426, okOrigin);
      const room = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      // The room learns its own id only from here, never from a player.
      const headers = new Headers(request.headers);
      headers.set('X-Room-Id', m[1]);
      return room.fetch(new Request(request.url, { headers, method: 'GET' }));
    }

    return respond({ error: 'not found' }, 404, okOrigin);
  }
};

/* ------------------------------------------------------------------ */

// Counts room creations for one IP address (an object per address).
export class Limiter extends DurableObject {
  async allow(now) {
    const hour = 3600_000;
    const times = ((await this.ctx.storage.get('t')) || []).filter((t) => now - t < hour);
    if (times.length >= CREATES_PER_HOUR) return false;
    times.push(now);
    await this.ctx.storage.put('t', times);
    await this.ctx.storage.setAlarm(now + hour);
    return true;
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

/* ------------------------------------------------------------------ */

// One room. Sockets use the hibernation API, so an idle room costs nothing;
// each socket's attachment says which player it is ({id, at}).
export class Rooms extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    this.buckets = new Map(); // socket -> Bucket (resets on hibernation, which is fine)
    ctx.blockConcurrencyWhile(() => this.load());
  }

  async load() {
    const entries = await this.ctx.storage.list();
    const roomId = entries.get('id');
    this.room = Room.restore(roomId || '', entries, Date.now());
    // After a restart, players whose socket is gone are lost, not online.
    const live = new Set(this.ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() || {}).id).filter(Boolean));
    for (const [id, p] of this.room.players) {
      if ((p.st === 'online' || p.st === 'away') && !live.has(id)) this.room.left(id, false, Date.now());
    }
  }

  // Called by the Worker for POST /rooms. Returns an error string or null.
  async create(id, body) {
    if (this.room.ready) return 'exists';
    this.room.id = id;
    const err = await this.room.init(body, Date.now());
    if (err) { this.room = Room.restore('', new Map(), Date.now()); return err; }
    await this.ctx.storage.put('id', id);
    await this.persist();
    return null;
  }

  async fetch(request) {
    const id = request.headers.get('X-Room-Id');
    if (!this.room.ready || this.room.id !== id) return new Response('no such room', { status: 404 }); // i18n-ok: an HTTP status body
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('busy', { status: 429 }); // i18n-ok: an HTTP status body
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null, at: Date.now() });
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const now = Date.now();
    if (typeof raw !== 'string') return ws.close(1003, 'text only');
    let bucket = this.buckets.get(ws);
    if (!bucket) this.buckets.set(ws, bucket = new Bucket(now));
    if (!bucket.edits) bucket.edits = editBucket(now);
    if (!bucket.take(now)) {
      if (bucket.strikes > LIMITS.rateBurst) ws.close(1008, 'too fast');
      return;
    }
    const att = ws.deserializeAttachment() || {};
    if (!att.id) return this.hello(ws, raw, now);
    const r = this.room.message(att.id, raw, now, bucket.edits);
    if (r.drop) {
      bucket.strikes += 5; // malformed messages cost more
      if (bucket.strikes > LIMITS.rateBurst) ws.close(1008, 'bad messages');
      return;
    }
    if (r.toSelf) for (const msg of r.toSelf) ws.send(JSON.stringify(msg));
    if (r.toOthers) for (const msg of r.toOthers) this.send(msg, att.id, r.near);
    if (r.toAll) for (const msg of r.toAll) this.send(msg, null);
    if (r.kick) {
      for (const other of this.ctx.getWebSockets()) {
        if ((other.deserializeAttachment() || {}).id !== r.kick) continue;
        other.serializeAttachment({ id: null, at: 0 });
        other.close(4003, 'removed');
      }
    }
    await this.schedule();
  }

  async hello(ws, raw, now) {
    let d = null;
    if (raw.length <= 256) try { d = JSON.parse(raw); } catch { /* below */ }
    if (!d || d.t !== 'hello') return ws.close(1008, 'hello first');
    const r = await this.room.join(d.key, d.code, now);
    if (r.error) {
      ws.send(JSON.stringify({ t: r.error }));
      return ws.close(1008, r.error);
    }
    // One connection per player: a newer one (another tab, a reconnect) wins.
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws && (other.deserializeAttachment() || {}).id === r.id) {
        other.serializeAttachment({ id: null, at: 0, replaced: true });
        other.close(4001, 'replaced');
      }
    }
    ws.serializeAttachment({ id: r.id, at: now });
    ws.send(JSON.stringify(r.welcome));
    this.send(this.room.statusOf(r.id), r.id);
    await this.schedule();
  }

  async webSocketClose(ws, code, reason) {
    this.closed(ws, code === 1000 && reason === 'bye');
    try { ws.close(1000); } catch { /* already closed */ }
    await this.schedule();
  }

  async webSocketError(ws) {
    this.closed(ws, false);
    await this.schedule();
  }

  closed(ws, clean) {
    this.buckets.delete(ws);
    const att = ws.deserializeAttachment() || {};
    if (!att.id) return;
    ws.serializeAttachment({ id: null, at: 0 });
    const msg = this.room.left(att.id, clean, Date.now());
    if (msg) this.send(msg, att.id);
  }

  // Sends to every player's socket except `except` (a player id), or to all.
  // To every player but `except`; with `near` (a position), only to those
  // close to it (see Room's pos).
  send(msg, except, near = null) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const id = (ws.deserializeAttachment() || {}).id;
      if (!id || id === except) continue;
      if (near && !isNear(this.room.players.get(id)?.p, near)) continue;
      try { ws.send(text); } catch { /* closing */ }
    }
  }

  async persist() {
    const writes = this.room.takeWrites();
    const gone = [...writes].filter(([, v]) => v === null).map(([k]) => k);
    for (const k of gone) writes.delete(k);
    if (gone.length) await this.ctx.storage.delete(gone);
    if (writes.size) await this.ctx.storage.put(Object.fromEntries(writes));
  }

  // One alarm covers everything that waits: saving, lost players turning
  // offline, sockets that never said hello, and deleting an abandoned room.
  async schedule() {
    const now = Date.now();
    let at = now + 24 * 3600_000;
    if (this.room.isDirty) at = Math.min(at, now + PERSIST_MS);
    const lost = this.room.nextLostDeadline();
    if (lost !== null) at = Math.min(at, lost);
    if (this.ctx.getWebSockets().some((ws) => !(ws.deserializeAttachment() || {}).id)) at = Math.min(at, now + HELLO_MS);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const now = Date.now();
    if (this.room.ready && this.room.expired(now) && this.ctx.getWebSockets().length === 0) {
      await this.ctx.storage.deleteAll();
      this.room = Room.restore('', new Map(), now);
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() || {};
      if (!att.id && now - (att.at || 0) >= HELLO_MS) ws.close(1008, 'hello first');
    }
    for (const msg of this.room.expireLost(now)) this.send(msg, null);
    await this.persist();
    if (this.room.ready) await this.schedule();
  }
}
