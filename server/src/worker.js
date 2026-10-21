/* The room service for playing together: a Cloudflare Worker that makes
 * rooms and hands each room's WebSockets to its Durable Object.
 *
 *   POST /rooms                 make a room from a world (the admin token); returns {room}
 *   GET  /rooms/<id>            whether it exists, and how many play there now
 *   GET  /rooms/<id>/ws         join it (WebSocket)
 *
 * and, for the moderator only (a bearer token, the ADMIN_TOKEN secret):
 *
 *   GET  /admin                        the moderator's page (admin.js): holds nothing, asks for the token
 *   GET  /admin/players?tests=         every world with everyone in it, named (not the smoke test's)
 *   GET  /admin/rooms                  every world, in brief
 *   GET  /admin/rooms/<id>/players     who is in one, and how far along
 *   GET  /admin/rooms/<id>/log?since=  its audit log as JSON lines (audit.js)
 *   POST /admin/rooms/<id>/ban         take a player out: {"id", "why"}
 *   POST /admin/rooms/<id>/freeze      freeze a hacked character: {"id", "why"}
 *   POST /admin/rooms/<id>/thaw        undo that: {"id"}
 *   POST /admin/rooms/<id>/revoke      stop an invite link: {"code"}
 *   GET  /admin/rooms/<id>/graves      its tombstones, as players receive them
 *   POST /admin/rooms/<id>/copy        a copy to play as one player: {"id"} (copy.js)
 *   GET  /admin/rooms/<id>/backup      the whole world as one file, to keep on disk (backup.js)
 *   POST /admin/rooms/<id>/restore     put a world that's gone back from that file (never over one that's there)
 *   POST /admin/rooms/<id>/smoke       mark (or unmark) a deploy smoke-test room: {"smoke": bool} (only marked rooms age out)
 *
 * Only the game's own pages may call the rest (ALLOWED_ORIGINS), worlds are
 * Watch's to make (the admin token), and everything else is refused. The
 * rules of a room are in room.js; the wire format is src/net/protocol.js. */

import { DurableObject } from 'cloudflare:workers';
import { Room, Bucket, NEAR, visitor } from './room.js';
import { LOG_DAYS, SECURITY_DAYS, LOG_FLUSH_MS, LOG_FLUSH_EVENTS, toLines, hasSecurity, securityOnly } from './audit.js';
import { snapshot, copyEntries, COPY_MS } from './copy.js';
import { adminPage, worldOf, isSmokeTest } from './admin.js';
import { backupOf, backupName, entriesOf, BACKUP_MAX } from './backup.js';
import { VERSION } from '../../src/version.js';
import { LIMITS, ROOM_ID_RE, ID_RE, randomRoomId, randomHex, playerId, sha256Hex, PING, PONG, parse, cleanCreate } from '../../src/net/protocol.js';

const HELLO_MS = 5_000;          // a socket must say who it is within this
const SOCKETS_PER_VISITOR = 8;   // sockets one visitor may hold in a room
const STRANGERS_PER_VISITOR = 3; // of them, ones that haven't said who they are yet
const PERSIST_MS = 2_000;        // edits reach storage this soon
const MAX_SOCKETS = LIMITS.players * 2;
const LOG_CHUNKS = 500;          // log chunks one export reads; the rest comes with the next `since`
const PRUNE_MS = 3600_000;       // old log is deleted this often
const PUT_MAX = 100;             // entries storage takes in one put (it allows 128)
const COPY_ENDED = 4006;         // a copy's sockets close with this when it's deleted

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

// A short, salted hash of a visitor for a room's socket limits: enough to
// count sockets, without the room keeping anyone's address.
async function visitorTag(room, request) {
  return (await sha256Hex('mte-visitor|' + room + '|' + visitor(request.headers.get('CF-Connecting-IP')))).slice(0, 12);
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

// Whether a request carries the moderator's token. Without an ADMIN_TOKEN
// secret (or with a short one) there is no moderator. The hashes are
// compared, so how long the comparison takes says nothing about the token.
async function isAdmin(request, env) {
  const want = env.ADMIN_TOKEN;
  if (typeof want !== 'string' || want.length < 32) return false;
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!got) return false;
  const [a, b] = await Promise.all([sha256Hex('mte-admin|' + got), sha256Hex('mte-admin|' + want)]);
  return a === b;
}

// The moderator's routes (see the top of this file).
async function admin(request, env, url) {
  if (url.pathname === '/admin/rooms' && request.method === 'GET') {
    const registry = env.REGISTRY.get(env.REGISTRY.idFromName('*'));
    const rooms = [];
    for (const id of await registry.list()) {
      const s = await env.ROOMS.get(env.ROOMS.idFromName(id)).summary();
      if (s) rooms.push(s); else await registry.remove(id);
    }
    return respond({ rooms }, 200, null);
  }
  if (url.pathname === '/admin/players' && request.method === 'GET') {
    const tests = url.searchParams.get('tests') === '1';
    const registry = env.REGISTRY.get(env.REGISTRY.idFromName('*'));
    const rooms = await Promise.all((await registry.list()).map(async (id) => {
      const room = env.ROOMS.get(env.ROOMS.idFromName(id));
      try {
        const o = await room.overview(id, tests);
        return o && (o.players ? worldOf(o.summary, o.players, o.graves) : null);
      } catch (e) {
        // A busy room can run the code from before a deploy for a while:
        // asked the older way; failing that, it says so and the rest still shows.
        try {
          const summary = await room.summary();
          if (!summary || (isSmokeTest(summary) && !tests)) return null;
          return worldOf(summary, await room.roster(id) || [], await room.graves(id) || []);
        } catch {
          return { id, error: String(e && e.message || e).slice(0, 200), players: [], name: { en: id, lt: id }, last: 0 };
        }
      }
    }));
    return respond({ rooms: rooms.filter(Boolean) }, 200, null);
  }
  const m = url.pathname.match(/^\/admin\/rooms\/([^/]+)\/(players|log|ban|freeze|thaw|revoke|graves|copy|backup|restore|smoke)$/);
  if (!m || !ROOM_ID_RE.test(m[1])) return respond({ error: 'not found' }, 404, null);
  const room = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
  if (m[2] === 'players' && request.method === 'GET') {
    const players = await room.roster(m[1]);
    return players ? respond({ players }, 200, null) : respond({ error: 'room' }, 404, null);
  }
  if (m[2] === 'graves' && request.method === 'GET') {
    const graves = await room.graves(m[1]);
    return graves ? respond({ graves }, 200, null) : respond({ error: 'room' }, 404, null);
  }
  if (m[2] === 'log' && request.method === 'GET') {
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    const text = await room.exportLog(m[1], since);
    if (text === null) return respond({ error: 'room' }, 404, null);
    return new Response(text, { status: 200, headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
  }
  if (m[2] === 'backup' && request.method === 'GET') {
    const entries = await room.snapshot(m[1]);
    if (!entries) return respond({ error: 'room' }, 404, null);
    const now = Date.now();
    return new Response(backupOf(entries, m[1], now, VERSION), { status: 200, headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="' + backupName(m[1], now) + '"' } });
  }
  if (m[2] === 'restore' && request.method === 'POST') {
    const body = await readCapped(request, BACKUP_MAX);
    if (body === null) return respond({ error: 'size' }, 413, null);
    const entries = entriesOf(body, m[1]);
    if (!entries) return respond({ error: 'bad' }, 400, null);
    // adopt refuses a room that's there ('exists'): a live world is never written over.
    const err = await room.adopt(m[1], entries);
    if (err) return respond({ error: err }, 409, null);
    await env.REGISTRY.get(env.REGISTRY.idFromName('*')).add(m[1]);
    return respond({ room: m[1] }, 200, null);
  }
  if (m[2] === 'copy' && request.method === 'POST') {
    const body = await readCapped(request, 1024);
    let d = null;
    try { d = JSON.parse(body); } catch { /* below */ }
    if (!d || typeof d.id !== 'string' || !ID_RE.test(d.id)) return respond({ error: 'bad' }, 400, null);
    const entries = await room.snapshot(m[1]);
    if (!entries) return respond({ error: 'room' }, 404, null);
    // A key of its own for the copy, handed to the moderator only: the
    // player's own never leaves their phone (the room has its hash).
    const copy = randomRoomId(), key = randomHex(32), until = Date.now() + COPY_MS;
    const made = copyEntries(entries, d.id, await playerId(copy, key), until);
    if (!made) return respond({ error: 'player' }, 409, null);
    const err = await env.ROOMS.get(env.ROOMS.idFromName(copy)).adopt(copy, made);
    if (err) return respond({ error: err }, 409, null);
    const game = String(env.ALLOWED_ORIGINS || '').split(',')[0].trim();
    return respond({ room: copy, key, until, link: game + '/#copy=' + copy + '.' + key + '&of=' + m[1] }, 200, null);
  }
  if ((m[2] === 'ban' || m[2] === 'freeze' || m[2] === 'thaw') && request.method === 'POST') {
    const body = await readCapped(request, 1024);
    let d = null;
    try { d = JSON.parse(body); } catch { /* below */ }
    if (!d || typeof d.id !== 'string' || !ID_RE.test(d.id)) return respond({ error: 'bad' }, 400, null);
    const why = typeof d.why === 'string' ? d.why : '';
    const err = m[2] === 'ban' ? await room.modBan(m[1], d.id, why)
      : m[2] === 'freeze' ? await room.modFreeze(m[1], d.id, why)
      : await room.modThaw(m[1], d.id);
    return err ? respond({ error: err }, 409, null) : respond({ ok: true }, 200, null);
  }
  // Stopping any invite link (only its maker can in the game itself): for a
  // link that got out, without taking the person who made it along.
  if (m[2] === 'revoke' && request.method === 'POST') {
    const body = await readCapped(request, 1024);
    let d = null;
    try { d = JSON.parse(body); } catch { /* below */ }
    if (!d || typeof d.code !== 'string' || !ROOM_ID_RE.test(d.code)) return respond({ error: 'bad' }, 400, null);
    const err = await room.modRevoke(m[1], d.code);
    return err ? respond({ error: err }, 409, null) : respond({ ok: true }, 200, null);
  }
  // Marking a room as the deploy's smoke test (or unmarking one the old way
  // got marked): only marked rooms age out, so the mark is the moderator's,
  // from scripts/mark-smoke.mjs, never a guess from the seed.
  if (m[2] === 'smoke' && request.method === 'POST') {
    const body = await readCapped(request, 1024);
    let d = null;
    try { d = JSON.parse(body); } catch { /* below */ }
    if (!d || typeof d.smoke !== 'boolean') return respond({ error: 'bad' }, 400, null);
    const err = await room.modSmoke(m[1], d.smoke);
    return err ? respond({ error: err }, 409, null) : respond({ ok: true }, 200, null);
  }
  return respond({ error: 'not found' }, 404, null);
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

    // The commit it was deployed from (rooms.yml), for scripts/live-check.mjs.
    if (url.pathname === '/') return respond({ ok: true, commit: env.COMMIT || null }, 200, okOrigin);
    // The moderator's page holds nothing until the token is typed in it.
    if (url.pathname === '/admin' && request.method === 'GET') {
      const { html, headers } = await adminPage();
      return new Response(html, { status: 200, headers: { ...SECURITY_HEADERS, ...headers } });
    }
    // The moderator's routes take a token, from the page or a script, and
    // never an Origin's word. Anyone without the token sees nothing there at all.
    if (url.pathname.startsWith('/admin/')) {
      if (!(await isAdmin(request, env))) return respond({ error: 'not found' }, 404, null);
      // A failure says what went wrong, to the moderator only.
      try { return await admin(request, env, url); } catch (e) { return respond({ error: String(e && e.message || e).slice(0, 300) }, 500, null); }
    }
    // Browsers always send Origin on these; anything else isn't the game.
    if (!okOrigin) return respond({ error: 'origin' }, 403, null);

    if (url.pathname === '/rooms' && request.method === 'POST') {
      // Worlds are made by Watch, by hand, as many as players need
      // (2026-10-20): the door is shut for everyone else before the body is
      // even read, so there is no creation left to flood. The deploy's
      // smoke test creates under the admin token and marks its own room to
      // age out (room.js); worlds Watch makes stay unmarked.
      const trusted = await isAdmin(request, env);
      if (!trusted) return respond({ error: 'closed' }, 403, okOrigin);
      const len = Number(request.headers.get('Content-Length') || 0);
      if (len > LIMITS.createBytes) return respond({ error: 'size' }, 413, okOrigin);
      const body = await readCapped(request, LIMITS.createBytes);
      if (body === null) return respond({ error: 'size' }, 413, okOrigin);
      // A body must be a create a room can actually be made from, or it is
      // refused here without a room ever being touched.
      if (!cleanCreate(parse(body, LIMITS.createBytes))) return respond({ error: 'bad' }, 400, okOrigin);
      const id = randomRoomId();
      const room = env.ROOMS.get(env.ROOMS.idFromName(id));
      const err = await room.create(id, body, trusted);
      if (err) return respond({ error: err }, err === 'bad' ? 400 : 409, okOrigin);
      await env.REGISTRY.get(env.REGISTRY.idFromName('*')).add(id);
      return respond({ room: id }, 201, okOrigin);
    }

    // Whether a shared world still exists (a game that couldn't get in asks,
    // so it stops offering a world that's gone), and how many play there now
    // (the Worlds list). Only a count: never who.
    const there = url.pathname.match(/^\/rooms\/([^/]+)$/);
    if (there && request.method === 'GET') {
      if (!ROOM_ID_RE.test(there[1])) return respond({ exists: false }, 200, okOrigin);
      return respond(await env.ROOMS.get(env.ROOMS.idFromName(there[1])).brief(there[1]), 200, okOrigin);
    }

    const m = url.pathname.match(/^\/rooms\/([^/]+)\/ws$/);
    if (m && request.method === 'GET') {
      if (!ROOM_ID_RE.test(m[1])) return respond({ error: 'room' }, 404, okOrigin);
      if (request.headers.get('Upgrade') !== 'websocket') return respond({ error: 'upgrade' }, 426, okOrigin);
      const room = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      // The room learns its own id only from here, never from a player.
      const headers = new Headers(request.headers);
      headers.set('X-Room-Id', m[1]);
      headers.set('X-Visitor', await visitorTag(m[1], request));
      return room.fetch(new Request(request.url, { headers, method: 'GET' }));
    }

    return respond({ error: 'not found' }, 404, okOrigin);
  }
};

/* ------------------------------------------------------------------ */

// Every room's id (one object, named '*'), so the moderator can list them:
// Durable Objects can't be listed. A room adds itself when it's made or
// first visited, and leaves when it's gone.
export class Registry extends DurableObject {
  async add(id) {
    if (await this.ctx.storage.get('r:' + id)) return;
    await this.ctx.storage.put('r:' + id, 1);
  }

  async remove(id) {
    await this.ctx.storage.delete('r:' + id);
  }

  async list() {
    return [...(await this.ctx.storage.list({ prefix: 'r:' })).keys()].map((k) => k.slice(2));
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
    this.registered = false;  // in the Registry, as far as this copy knows
    this.prunedAt = 0;        // when old log was last deleted
    // The audit log: chunks of JSON lines, each stamped with its first event.
    // Not in the key-value storage, so loading a room never reads it.
    // `sec`: the chunk has security events (kept SECURITY_DAYS); `trimmed`:
    // the rest of it has gone.
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS audit (ts INTEGER NOT NULL, lines TEXT NOT NULL, sec INTEGER NOT NULL DEFAULT 0, trimmed INTEGER NOT NULL DEFAULT 0)');
    for (const col of ['sec', 'trimmed']) {
      try { ctx.storage.sql.exec(`ALTER TABLE audit ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`); } catch { /* already there */ }
    }
    // A game asks 'ping' now and then and the room answers 'pong' without
    // waking up (see PING in src/net/protocol.js): that's how a game notices
    // a connection that died without closing.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
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
  async create(id, body, trusted = false) {
    if (this.room.ready) return 'exists';
    this.room.id = id;
    const err = await this.room.init(body, Date.now(), trusted);
    if (err) { this.room = Room.restore('', new Map(), Date.now()); return err; }
    this.registered = true;
    await this.persist({ id }); // with the room itself, in one go
    return null;
  }

  /* ------------------------------------------------- for the moderator */

  // Every entry of the room, for a copy (copy.js), or null if there's no
  // such room. Reads only.
  async snapshot(id) {
    if (!this.room.ready || this.room.id !== id) return null;
    return snapshot(this.room);
  }

  // Becomes the copy `id` of a room, from its entries (copy.js copyEntries).
  // Error string or null.
  async adopt(id, entries) {
    if (this.room.ready) return 'exists';
    const all = [...entries, ['id', id]];
    const ops = [];
    for (let i = 0; i < all.length; i += PUT_MAX) ops.push(this.ctx.storage.put(Object.fromEntries(all.slice(i, i + PUT_MAX))));
    await Promise.all(ops);
    await this.load(); // as after a restart: whoever was in is gone now
    await this.persist();
    await this.schedule();
    return null;
  }

  // The room in brief, or null if there's no such room (any more).
  async summary() {
    const r = this.room;
    if (!r.ready) return null;
    let online = 0;
    for (const p of r.players.values()) if (p.st === 'online' || p.st === 'away') online++;
    let frozen = 0;
    for (const p of r.players.values()) if (p.frozen) frozen++;
    return { id: r.id, created: r.created, last: r.last, seed: r.seed, gen: r.gen, fmt: r.fmt, players: r.players.size, online, bans: r.bans.size, frozen, smk: r.smoke === true };
  }

  // Whether this is still the room `id` (a copy is deleted when its time is up, a smoke-test room after EXPIRE_MS unvisited).
  async brief(id) {
    const exists = this.room.ready && this.room.id === id;
    return exists ? { exists, online: this.room.online() } : { exists };
  }

  // The tombstones, the same list every welcome hands a player.
  async graves(id) {
    if (!this.room.ready || this.room.id !== id) return null;
    return this.room.graves; // the welcome's `graves`
  }

  async roster(id) {
    if (!this.room.ready || this.room.id !== id) return null;
    return this.room.roster(Date.now());
  }

  // The room in brief with everyone in it and its tombstones (for their
  // names), in one call; just the brief for the smoke test's rooms, unless
  // `tests`. Null if there's no such room.
  async overview(id, tests) {
    if (!this.room.ready || this.room.id !== id) return null;
    const summary = await this.summary();
    if (isSmokeTest(summary) && !tests) return { summary };
    return { summary, players: this.room.roster(Date.now()), graves: this.room.graves };
  }

  // The audit log from `since` (ms) as JSON lines: first the room itself,
  // then its events, oldest first, and last {e: 'more', since} when there
  // is more to fetch from there.
  async exportLog(id, since) {
    if (!this.room.ready || this.room.id !== id) return null;
    await this.flushLog(Date.now(), true);
    const head = { e: 'room', ...(await this.summary()), now: Date.now(), since };
    // A chunk starts at its first event, so the one before `since` may hold later events.
    const first = this.ctx.storage.sql.exec('SELECT MAX(rowid) AS r FROM audit WHERE ts <= ?', since).one().r ?? 0;
    const rows = this.ctx.storage.sql.exec('SELECT rowid AS r, lines FROM audit WHERE rowid >= ? ORDER BY rowid LIMIT ?', first, LOG_CHUNKS + 1).toArray();
    const lines = [JSON.stringify(head)];
    let last = since;
    for (const row of rows.slice(0, LOG_CHUNKS)) {
      for (const line of row.lines.split('\n')) {
        const ts = Number(line.slice(6, line.indexOf(','))); // every line starts {"ts":<ms>,
        if (ts >= since) { lines.push(line); last = ts; }
      }
    }
    if (rows.length > LOG_CHUNKS) lines.push(JSON.stringify({ e: 'more', since: last + 1 }));
    return lines.join('\n') + '\n';
  }

  // The moderator takes a player out. Error string or null.
  async modBan(id, player, why) {
    if (!this.room.ready || this.room.id !== id) return 'room';
    if (!this.room.players.has(player)) return 'player';
    const now = Date.now();
    const r = this.room.ban(player, now, 'mod', why);
    for (const msg of r.toAll) this.send(msg, null);
    this.kick(r.kick);
    for (const other of r.also) this.kick(other);
    await this.persist();
    await this.schedule();
    return null;
  }

  // The moderator freezes a hacked character (Room.freeze).
  // The player's game is told, so it shows the notice. Error string or null.
  async modFreeze(id, player, why) {
    if (!this.room.ready || this.room.id !== id) return 'room';
    const r = this.room.freeze(player, Date.now(), why);
    if (r.error) return r.error;
    this.kick(r.kick, 4005, 'frozen', { t: 'frozen' });
    for (const msg of r.toAll) this.send(msg, null);
    await this.persist();
    await this.schedule();
    return null;
  }

  async modThaw(id, player) {
    if (!this.room.ready || this.room.id !== id) return 'room';
    const r = this.room.thaw(player, Date.now());
    if (r.error) return r.error;
    for (const msg of r.toAll) this.send(msg, null);
    await this.persist();
    await this.schedule();
    return null;
  }
  async modSmoke(id, smoke) {
    const err = this.room.markSmoke(smoke, Date.now());
    if (err) return err;
    await this.persist();
    return null;
  }
  // The moderator stops any invite link (Room.revokeAny). Error string or null.
  async modRevoke(id, code) {
    if (!this.room.ready || this.room.id !== id) return 'room';
    const err = this.room.revokeAny(code, Date.now());
    if (err) return err;
    await this.persist();
    return null;
  }

  // Writes waiting log events: when the oldest has waited LOG_FLUSH_MS, when
  // many are waiting, or now (`force`). Old log goes now and then.
  async flushLog(now, force = false) {
    const log = this.room.log;
    if (log.length && (force || log.length >= LOG_FLUSH_EVENTS || now - log[0].ts >= LOG_FLUSH_MS)) {
      const events = this.room.takeLog();
      this.ctx.storage.sql.exec('INSERT INTO audit (ts, lines, sec) VALUES (?, ?, ?)', events[0].ts, toLines(events), hasSecurity(events) ? 1 : 0);
    }
    if (now - this.prunedAt >= PRUNE_MS) {
      this.prunedAt = now;
      const day = 24 * 3600_000, sql = this.ctx.storage.sql;
      sql.exec('DELETE FROM audit WHERE ts < ? OR (sec = 0 AND ts < ?)', now - SECURITY_DAYS * day, now - LOG_DAYS * day);
      // Chunks with security events keep just those once the rest is old.
      for (const row of sql.exec('SELECT rowid AS r, lines FROM audit WHERE sec = 1 AND trimmed = 0 AND ts < ?', now - LOG_DAYS * day).toArray()) {
        sql.exec('UPDATE audit SET lines = ?, trimmed = 1 WHERE rowid = ?', securityOnly(row.lines), row.r);
      }
    }
  }

  async fetch(request) {
    const id = request.headers.get('X-Room-Id');
    if (!this.room.ready || this.room.id !== id) return new Response('no such room', { status: 404 }); // i18n-ok: an HTTP status body
    // Rooms made before the Registry add themselves when next visited
    // (never a copy: it's nobody's world).
    if (!this.registered && !this.room.copy) {
      await this.env.REGISTRY.get(this.env.REGISTRY.idFromName('*')).add(id);
      this.registered = true;
    }
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_SOCKETS) return new Response('busy', { status: 429 }); // i18n-ok: an HTTP status body
    // One visitor can't take every place in a room: a few sockets each, and
    // fewer still that haven't said who they are.
    const v = request.headers.get('X-Visitor') || '';
    const theirs = sockets.map((ws) => ws.deserializeAttachment() || {}).filter((a) => a.v === v);
    if (theirs.length >= SOCKETS_PER_VISITOR || theirs.filter((a) => !a.id).length >= STRANGERS_PER_VISITOR) {
      return new Response('busy', { status: 429 }); // i18n-ok: an HTTP status body
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null, at: Date.now(), v });
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const now = Date.now();
    if (typeof raw !== 'string') return ws.close(1003, 'text only');
    let bucket = this.buckets.get(ws);
    if (!bucket) this.buckets.set(ws, bucket = new Bucket(now));
    const att = ws.deserializeAttachment() || {};
    if (!bucket.take(now)) {
      if (att.id) this.room.dropped(att.id, now);
      if (bucket.strikes > LIMITS.rateBurst) this.cut(ws, att.id, 'too fast', now);
      return;
    }
    if (!att.id) return this.hello(ws, raw, now);
    const r = this.room.message(att.id, raw, now); // edits draw on the player's own budget (Room.watchOf)
    if (r.drop) {
      this.room.dropped(att.id, now);
      bucket.strikes += 5; // malformed messages cost more
      if (bucket.strikes > LIMITS.rateBurst) this.cut(ws, att.id, 'bad messages', now);
      return;
    }
    if (r.toSelf) for (const msg of r.toSelf) ws.send(JSON.stringify(msg));
    if (r.toOthers) for (const msg of r.toOthers) this.send(msg, att.id, r.near);
    if (r.toAll) for (const msg of r.toAll) this.send(msg, null);
    if (r.kick) this.kick(r.kick);
    if (r.also) for (const other of r.also) this.kick(other);
    if (this.room.log.length >= LOG_FLUSH_EVENTS) await this.flushLog(now);
    await this.schedule();
  }

  // Closes a removed (or frozen) player's sockets, telling them `last` first.
  kick(id, code = 4003, reason = 'removed', last = null) {
    for (const other of this.ctx.getWebSockets()) {
      if ((other.deserializeAttachment() || {}).id !== id) continue;
      other.serializeAttachment({ id: null, at: 0 });
      if (last) try { other.send(JSON.stringify(last)); } catch { /* closing */ }
      other.close(code, reason);
    }
  }

  // Closes a connection that keeps breaking the limits, and logs it.
  cut(ws, id, why, now) {
    if (id) this.room.audit(now, id, 'cut', { why });
    ws.close(1008, why);
  }

  async hello(ws, raw, now) {
    let d = null;
    if (raw.length <= 256) try { d = JSON.parse(raw); } catch { /* below */ }
    if (!d || d.t !== 'hello') return ws.close(1008, 'hello first');
    // Freeze season: whether this player wants time away to make anything.
    // Only `true` counts. A game from before the setting says nothing at all,
    // and then the room keeps what it knows: frozen, unless this player
    // turned it on before (src/net/protocol.js).
    const away = d.away === undefined ? undefined : d.away === true;
    const r = await this.room.join(d.key, d.code, now, away);
    if (r.error) {
      ws.send(JSON.stringify({ t: r.error, ...(r.why ? { why: r.why } : {}) }));
      return ws.close(1008, r.error);
    }
    // One connection per player: a newer one (another tab, a reconnect) wins.
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws && (other.deserializeAttachment() || {}).id === r.id) {
        other.serializeAttachment({ id: null, at: 0, replaced: true });
        other.close(4001, 'replaced');
      }
    }
    ws.serializeAttachment({ id: r.id, at: now, v: (ws.deserializeAttachment() || {}).v });
    ws.send(JSON.stringify(r.welcome));
    this.send(this.room.statusOf(r.id), r.id);
    await this.schedule();
  }

  async webSocketClose(ws, code, reason) {
    this.closed(ws, code === 1000 && reason === 'bye');
    try { ws.close(1000); } catch { /* already closed */ }
    await this.afterClose();
  }

  async webSocketError(ws) {
    this.closed(ws, false);
    await this.afterClose();
  }

  // An empty room may be put to sleep and forget what it hasn't written,
  // so the log is written when the last player goes.
  async afterClose() {
    if (!this.room.ready) return; // deleted (a copy whose time was up)
    const now = Date.now();
    if (!this.ctx.getWebSockets().some((ws) => (ws.deserializeAttachment() || {}).id)) await this.flushLog(now, true);
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

  // Writes what changed. The deletes and puts are issued together, with no
  // await between them, so storage commits them as one: a ban can't land
  // as "player gone" without "player banned" if the room stops in between.
  // If the write fails, what it held is still to be written next time.
  async persist(also = null) {
    const writes = this.room.takeWrites();
    if (also) for (const [k, v] of Object.entries(also)) writes.set(k, v);
    const gone = [...writes].filter(([, v]) => v === null).map(([k]) => k);
    for (const k of gone) writes.delete(k);
    const ops = [];
    if (gone.length) ops.push(this.ctx.storage.delete(gone));
    if (writes.size) ops.push(this.ctx.storage.put(Object.fromEntries(writes)));
    try {
      await Promise.all(ops);
    } catch (err) {
      this.room.redo(writes, gone);
      throw err;
    }
  }

  // One alarm covers everything that waits: saving, lost players turning
  // offline, sockets that never said hello, and deleting a copy or an abandoned smoke-test room.
  async schedule() {
    const now = Date.now();
    let at = now + 24 * 3600_000;
    if (this.room.isDirty) at = Math.min(at, now + PERSIST_MS);
    if (this.room.log.length) at = Math.min(at, Math.max(now, this.room.log[0].ts + LOG_FLUSH_MS));
    const lost = this.room.nextLostDeadline();
    if (lost !== null) at = Math.min(at, lost);
    if (this.ctx.getWebSockets().some((ws) => !(ws.deserializeAttachment() || {}).id)) at = Math.min(at, now + HELLO_MS);
    if (this.room.copy) at = Math.min(at, Math.max(now, this.room.copy.until));
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const now = Date.now();
    // A copy goes when its time is up, even while it's played.
    if (this.room.ready && this.room.expired(now) && (this.room.copy || this.ctx.getWebSockets().length === 0)) {
      const id = this.room.id;
      for (const ws of this.ctx.getWebSockets()) {
        ws.serializeAttachment({ id: null, at: 0 });
        ws.close(COPY_ENDED, 'ended');
      }
      await this.ctx.storage.deleteAll(); // the audit log too
      this.room = Room.restore('', new Map(), now);
      await this.env.REGISTRY.get(this.env.REGISTRY.idFromName('*')).remove(id);
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() || {};
      if (!att.id && now - (att.at || 0) >= HELLO_MS) ws.close(1008, 'hello first');
    }
    for (const msg of this.room.expireLost(now)) this.send(msg, null);
    await this.persist();
    if (this.room.ready) await this.flushLog(now);
    if (this.room.ready) await this.schedule();
  }
}
