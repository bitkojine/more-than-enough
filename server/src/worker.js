/* The room service for playing together: a Cloudflare Worker that makes
 * rooms and hands each room's WebSockets to its Durable Object.
 *
 *   POST /rooms                 make a room from a world (the admin token); returns {room}
 *   GET  /rooms/<id>            whether it exists, and how many play there now
 *   GET  /rooms/<id>/ws         join it (WebSocket)
 *   POST /solo                  your own world (and your character), kept for every device you link: pull, get, push, me (vault.js)
 *
 * and, for the moderator only (a bearer token, the ADMIN_TOKEN secret):
 *
 *   GET  /admin                        the moderator's page (admin.js): holds nothing, asks for the token
 *   GET  /admin/players?tests=         every world with everyone in it, named (not the smoke test's)
 *   GET  /admin/rooms                  every world, in brief
 *   GET  /admin/rooms/<id>/players     who is in one, and how far along
 *   GET  /admin/rooms/<id>/log?since=  its audit log as JSON lines (audit.js)
 *   POST /admin/rooms/<id>/ban         the same as freeze (no ban deletes anyone since v0.155.0)
 *   POST /admin/rooms/<id>/freeze      freeze a hacked character: {"id", "why"}
 *   POST /admin/rooms/<id>/thaw        undo that: {"id"}
 *   POST /admin/rooms/<id>/invite      an invite link into it: {"uses", "life"} (both optional)
 *   POST /admin/rooms/<id>/revoke      stop an invite link: {"code"}
 *   GET  /admin/rooms/<id>/graves      its tombstones, as players receive them
 *   POST /admin/rooms/<id>/copy        a copy to play as one player: {"id"} (copy.js)
 *   GET  /admin/rooms/<id>/backup      the whole world as one file, to keep on disk (backup.js)
 *   POST /admin/rooms/<id>/restore     put a world that's gone back from that file (never over one that's there)
 *   POST /admin/rooms/<id>/smoke       mark (or unmark) a deploy smoke-test room: {"smoke": bool} (kept out of the lists)
 *
 * Only the game's own pages may call the rest (ALLOWED_ORIGINS), worlds are
 * Watch's to make (the admin token), and everything else is refused. The
 * rules of a room are in room.js; the wire format is src/net/protocol.js. */

import { DurableObject } from 'cloudflare:workers';
import { Room, Bucket, NEAR } from './room.js';
import {
  LOG_DAYS,
  SECURITY_DAYS,
  LOG_FLUSH_MS,
  LOG_FLUSH_EVENTS,
  toLines,
  hasSecurity,
  securityOnly
} from './audit.js';
import { snapshot } from './copy.js';
import { isSmokeTest } from './admin.js';
import { pull, get, push, me } from './vault.js';
import { LIMITS, PING, PONG } from '../../src/net/protocol.js';

const HELLO_MS = 5_000; // a socket must say who it is within this
const SOCKETS_PER_VISITOR = 8; // sockets one visitor may hold in a room
const STRANGERS_PER_VISITOR = 3; // of them, ones that haven't said who they are yet
const PERSIST_MS = 2_000; // edits reach storage this soon
const MAX_SOCKETS = LIMITS.players * 2;
const LOG_CHUNKS = 500; // log chunks one export reads; the rest comes with the next `since`
const PRUNE_MS = 3600_000; // old log is deleted this often
const PUT_MAX = 100; // entries storage takes in one put (it allows 128)
const COPY_ENDED = 4006; // a copy's sockets close with this when it's deleted

// Whether a player at `p` is near enough to `q` to hear its every step.
function isNear(p, q) {
  return !!p && p.z === q.z && Math.abs(p.x - q.x) <= NEAR && Math.abs(p.y - q.y) <= NEAR;
}
import { route } from './routes.js';

export default { fetch: route };

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

// One player's own worlds, kept for every device they link (vault.js): one
// object per sync key, named by its hash.
export class Vault extends DurableObject {
  pull(have) {
    return pull(this.ctx.storage, have);
  }
  get(seed) {
    return get(this.ctx.storage, seed);
  }
  push(ask) {
    return push(this.ctx.storage, ask, Date.now());
  }
  me(key, mine) {
    return me(this.ctx.storage, key, mine);
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
    this.registered = false; // in the Registry, as far as this copy knows
    this.prunedAt = 0; // when old log was last deleted
    // The audit log: chunks of JSON lines, each stamped with its first event.
    // Not in the key-value storage, so loading a room never reads it.
    // `sec`: the chunk has security events (kept SECURITY_DAYS); `trimmed`:
    // the rest of it has gone.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS audit (ts INTEGER NOT NULL, lines TEXT NOT NULL, sec INTEGER NOT NULL DEFAULT 0, trimmed INTEGER NOT NULL DEFAULT 0)'
    );
    for (const col of ['sec', 'trimmed']) {
      try {
        ctx.storage.sql.exec(`ALTER TABLE audit ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
      } catch {
        /* already there */
      }
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
    const live = new Set(
      this.ctx
        .getWebSockets()
        .map((ws) => (ws.deserializeAttachment() || {}).id)
        .filter(Boolean)
    );
    for (const [id, p] of this.room.players) {
      if ((p.st === 'online' || p.st === 'away') && !live.has(id))
        this.room.left(id, false, Date.now());
    }
  }

  // Called by the Worker for POST /rooms. Returns an error string or null.
  async create(id, body, trusted = false) {
    if (this.room.ready) return 'exists';
    this.room.id = id;
    const err = await this.room.init(body, Date.now(), trusted);
    if (err) {
      this.room = Room.restore('', new Map(), Date.now());
      return err;
    }
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
    for (let i = 0; i < all.length; i += PUT_MAX)
      ops.push(this.ctx.storage.put(Object.fromEntries(all.slice(i, i + PUT_MAX))));
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
    return {
      id: r.id,
      created: r.created,
      last: r.last,
      seed: r.seed,
      gen: r.gen,
      fmt: r.fmt,
      ...(r.eco === 'crystal' ? { eco: r.eco } : {}),
      players: r.players.size,
      online,
      frozen,
      smk: r.smoke === true
    };
  }

  // Whether this is still the room `id` (a moderator's copy is deleted when its time is up).
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
    const first =
      this.ctx.storage.sql.exec('SELECT MAX(rowid) AS r FROM audit WHERE ts <= ?', since).one().r ??
      0;
    const rows = this.ctx.storage.sql
      .exec(
        'SELECT rowid AS r, lines FROM audit WHERE rowid >= ? ORDER BY rowid LIMIT ?',
        first,
        LOG_CHUNKS + 1
      )
      .toArray();
    const lines = [JSON.stringify(head)];
    let last = since;
    for (const row of rows.slice(0, LOG_CHUNKS)) {
      for (const line of row.lines.split('\n')) {
        const ts = Number(line.slice(6, line.indexOf(','))); // every line starts {"ts":<ms>,
        if (ts >= since) {
          lines.push(line);
          last = ts;
        }
      }
    }
    if (rows.length > LOG_CHUNKS) lines.push(JSON.stringify({ e: 'more', since: last + 1 }));
    return lines.join('\n') + '\n';
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
  // An invite link from the moderator (Room.inviteAny): {code, until} or {error}.
  async modInvite(id, ask) {
    if (!this.room.ready || this.room.id !== id) return { error: 'room' };
    const r = this.room.inviteAny(ask, Date.now());
    if (!r.error) await this.persist();
    return r;
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
    if (
      log.length &&
      (force || log.length >= LOG_FLUSH_EVENTS || now - log[0].ts >= LOG_FLUSH_MS)
    ) {
      const events = this.room.takeLog();
      this.ctx.storage.sql.exec(
        'INSERT INTO audit (ts, lines, sec) VALUES (?, ?, ?)',
        events[0].ts,
        toLines(events),
        hasSecurity(events) ? 1 : 0
      );
    }
    if (now - this.prunedAt >= PRUNE_MS) {
      this.prunedAt = now;
      const day = 24 * 3600_000,
        sql = this.ctx.storage.sql;
      sql.exec(
        'DELETE FROM audit WHERE ts < ? OR (sec = 0 AND ts < ?)',
        now - SECURITY_DAYS * day,
        now - LOG_DAYS * day
      );
      // Chunks with security events keep just those once the rest is old.
      for (const row of sql
        .exec(
          'SELECT rowid AS r, lines FROM audit WHERE sec = 1 AND trimmed = 0 AND ts < ?',
          now - LOG_DAYS * day
        )
        .toArray()) {
        sql.exec(
          'UPDATE audit SET lines = ?, trimmed = 1 WHERE rowid = ?',
          securityOnly(row.lines),
          row.r
        );
      }
    }
  }

  async fetch(request) {
    const id = request.headers.get('X-Room-Id');
    if (!this.room.ready || this.room.id !== id)
      return new Response('no such room', { status: 404 }); // i18n-ok: an HTTP status body
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
    if (
      theirs.length >= SOCKETS_PER_VISITOR ||
      theirs.filter((a) => !a.id).length >= STRANGERS_PER_VISITOR
    ) {
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
    if (!bucket) this.buckets.set(ws, (bucket = new Bucket(now)));
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
    this.sendTo(r.to);
    // The anti-cheat froze them: their game shows the notice, as for the moderator's freeze.
    if (r.kick) this.kick(r.kick, 4005, 'frozen', { t: 'frozen' });
    if (this.room.log.length >= LOG_FLUSH_EVENTS) await this.flushLog(now);
    await this.schedule();
  }

  // Closes a removed (or frozen) player's sockets, telling them `last` first.
  kick(id, code = 4003, reason = 'removed', last = null) {
    for (const other of this.ctx.getWebSockets()) {
      if ((other.deserializeAttachment() || {}).id !== id) continue;
      other.serializeAttachment({ id: null, at: 0 });
      if (last)
        try {
          other.send(JSON.stringify(last));
        } catch {
          /* closing */
        }
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
    if (raw.length <= 256)
      try {
        d = JSON.parse(raw);
      } catch {
        /* below */
      }
    if (!d || d.t !== 'hello') return ws.close(1008, 'hello first');
    // Freeze season: whether this player wants time away to make anything.
    // Only `true` counts. A game from before the setting says nothing at all,
    // and then the room keeps what it knows: frozen, unless this player
    // turned it on before (src/net/protocol.js).
    const away = d.away === undefined ? undefined : d.away === true;
    // Whether the game can play a crystal room (0.194.0): only `true` counts.
    const r = await this.room.join(d.key, d.code, now, away, {
      crystal: d.crystal === true,
      seats: d.seats === true,
      shares: d.shares === true
    });
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
    this.sendTo(r.to);
    await this.schedule();
  }

  async webSocketClose(ws, code, reason) {
    this.closed(ws, code === 1000 && reason === 'bye');
    try {
      ws.close(1000);
    } catch {
      /* already closed */
    }
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
    if (!this.ctx.getWebSockets().some((ws) => (ws.deserializeAttachment() || {}).id))
      await this.flushLog(now, true);
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
  // Messages for one player each ([{id, m}], room-jobs.js).
  sendTo(list) {
    for (const { id, m } of list || []) this.send(m, null, null, id);
  }

  send(msg, except, near = null, only = null) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const id = (ws.deserializeAttachment() || {}).id;
      if (!id || id === except || (only && id !== only)) continue;
      if (near && !isNear(this.room.players.get(id)?.p, near)) continue;
      try {
        ws.send(text);
      } catch {
        /* closing */
      }
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
    if (this.ctx.getWebSockets().some((ws) => !(ws.deserializeAttachment() || {}).id))
      at = Math.min(at, now + HELLO_MS);
    if (this.room.copy) at = Math.min(at, Math.max(now, this.room.copy.until));
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const now = Date.now();
    // A copy goes when its time is up, even while it's played.
    if (
      this.room.ready &&
      this.room.expired(now) &&
      (this.room.copy || this.ctx.getWebSockets().length === 0)
    ) {
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
