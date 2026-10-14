/* One shared world's room: the rules, with no Cloudflare in them, so the unit
 * tests drive it directly (test/unit/together.test.js). worker.js wraps it in a
 * Durable Object and handles the sockets and storage.
 *
 * The room is the source of truth for the shared world (the seed and every
 * edit) and its clock (so day and night are the same for everyone), and keeps
 * each player's own progress and where they were. It trusts
 * nothing a player sends: every message is checked (src/net/protocol.js),
 * buildings get their owner from the room, and a player is whoever holds
 * their secret key. */

import {
  LIMITS, parse, cleanPos, cleanEdits, cleanWorld, cleanSave, cleanTime, playerId, randomRoomId, editInReach, KEY_RE
} from '../../src/net/protocol.js';

export const LOST_TO_OFFLINE_MS = 60_000;   // connection lost this long: offline
export const EXPIRE_MS = 30 * 24 * 3600_000; // a room nobody visits for 30 days is deleted
export const MOD_BUCKETS = 16;               // richness edits are stored in this many pieces
export const INVITE_MS = 24 * 3600_000;      // an invite link lets new friends in for a day
export const MAX_INVITES = 200;              // links a world keeps (working or not), to list and manage
const INVITE_LIST = 100;                     // newest links sent in one list (fits a message)
const REUSE_MS = 3600_000;
export const NEAR = 48;                      // tiles: players this close hear each other's every step
export const FAR_MS = 2000;                  // everyone else hears where you are this often                   // your sign shows your newest link while it has this long left

const bucketOf = (key) => key % MOD_BUCKETS;
const extAt = (x, y, z) => x + ',' + y + ',' + z;

export class Room {
  constructor(id, now) {
    this.id = id;
    this.ready = false;
    this.seed = 0;
    this.owner = '';
    this.created = now;
    this.last = now;
    this.dawn = now;             // when (ms) the world's clock read 0; it never stops
    this.mods = new Map();
    this.props = new Map();
    this.ext = [];               // [kind, x, y, z, owner]
    this.extTiles = new Set();
    this.players = new Map();    // id -> {c, st, p, save, lostAt}
    // Invite links (the code in a QR) -> {by, made, until, uses, off}: who
    // made it, when, until when it works, how many joined with it, and
    // whether it was stopped. Only a new player needs one; anyone already in
    // the world comes back with their key.
    this.invites = new Map();
    // What changed since the last write to storage.
    this.dirty = { meta: false, buckets: new Set(), props: false, ext: false, players: new Set() };
  }

  /* ---------------------------------------------------------- storage */

  // The storage entries a fresh write needs (all of them).
  static keysFor(room) {
    return ['meta', 'props', 'ext', ...Array.from({ length: MOD_BUCKETS }, (_, i) => 'mods:' + i), ...[...room.players.keys()].map((id) => 'p:' + id)];
  }

  // Rebuilds a room from what storage holds ({key: value}); not ready if empty.
  static restore(id, entries, now) {
    const r = new Room(id, now);
    const meta = entries.get('meta');
    if (!meta) return r;
    Object.assign(r, { seed: meta.seed, owner: meta.owner, created: meta.created, last: meta.last, dawn: meta.dawn ?? meta.created, ready: true });
    r.invites = new Map((meta.inv || []).filter(([, v]) => v && typeof v === 'object'));
    for (const [k, v] of entries) {
      if (k.startsWith('mods:')) for (const [key, rich] of v) r.mods.set(key, rich);
      else if (k.startsWith('p:')) r.players.set(k.slice(2), v);
    }
    for (const [key, kind] of entries.get('props') || []) r.props.set(key, kind);
    for (const e of entries.get('ext') || []) { r.ext.push(e); r.extTiles.add(extAt(e[1], e[2], e[3])); }
    return r;
  }

  // What to write now ({key: value}), and forget it was dirty.
  takeWrites() {
    const out = new Map(), d = this.dirty;
    if (d.meta) out.set('meta', { seed: this.seed, owner: this.owner, created: this.created, last: this.last, dawn: this.dawn, inv: [...this.invites] });
    for (const b of d.buckets) out.set('mods:' + b, [...this.mods].filter(([k]) => bucketOf(k) === b));
    if (d.props) out.set('props', [...this.props]);
    if (d.ext) out.set('ext', this.ext);
    for (const id of d.players) out.set('p:' + id, this.players.get(id) || null); // null: delete
    this.dirty = { meta: false, buckets: new Set(), props: false, ext: false, players: new Set() };
    return out;
  }

  get isDirty() {
    const d = this.dirty;
    return d.meta || d.props || d.ext || d.buckets.size > 0 || d.players.size > 0;
  }

  /* ----------------------------------------------------------- create */

  // Makes the room from the creator's world. Returns an error string or null.
  async init(raw, now) {
    if (this.ready) return 'exists';
    const d = parse(raw, LIMITS.createBytes);
    if (!d || d.t !== 'create' || typeof d.key !== 'string' || !KEY_RE.test(d.key)) return 'bad';
    const world = cleanWorld(d.world);
    if (!world) return 'bad';
    const save = d.save === undefined ? null : cleanSave(d.save);
    if (d.save !== undefined && !save) return 'bad';
    const pos = d.pos === undefined ? null : cleanPos(d.pos);
    const time = d.time === undefined ? 0 : cleanTime(d.time);
    if (time === null) return 'bad';
    this.owner = await playerId(this.id, d.key);
    this.seed = world.seed;
    for (const [k, v] of world.mods) this.mods.set(k, v);
    for (const [k, v] of world.props) this.props.set(k, v);
    for (const [kind, x, y, z] of world.ext) {
      if (this.extTiles.has(extAt(x, y, z))) continue;
      this.ext.push([kind, x, y, z, this.owner]);
      this.extTiles.add(extAt(x, y, z));
    }
    this.players.set(this.owner, { c: 0, st: 'offline', p: pos, save, lostAt: 0 });
    this.ready = true;
    this.created = this.last = now;
    this.dawn = now - time * 1000;   // the world goes on from the creator's time of day
    this.dirty.meta = this.dirty.props = this.dirty.ext = true;
    for (let b = 0; b < MOD_BUCKETS; b++) this.dirty.buckets.add(b);
    this.dirty.players.add(this.owner);
    return null;
  }

  /* -------------------------------------------------------- players */

  // A connection proved its key (and, the first time, brought an invite).
  // Returns {id, welcome} or {error}.
  async join(key, code, now) {
    if (typeof key !== 'string' || !KEY_RE.test(key)) return { error: 'bad' };
    const id = await playerId(this.id, key);
    let pl = this.players.get(id);
    if (!pl) {
      const inv = typeof code === 'string' ? this.invites.get(code) : undefined;
      if (!inv || inv.off || inv.until < now) return { error: 'invite' };
      if (this.players.size >= LIMITS.players) return { error: 'full' };
      inv.uses++;
      this.dirty.meta = true;
      const used = new Set([...this.players.values()].map((p) => p.c));
      let c = 0;
      while (used.has(c)) c++;
      pl = { c, st: 'offline', p: null, save: null, lostAt: 0 };
      this.players.set(id, pl);
    }
    pl.st = 'online';
    pl.lostAt = 0;
    this.touch(now);
    this.dirty.players.add(id);
    return { id, welcome: this.welcome(id, now) };
  }

  // The invite links someone may see and stop: all of them for the owner,
  // their own for anyone else. Newest first.
  inviteList(id) {
    const list = [];
    for (const [code, inv] of this.invites) {
      if (id === this.owner || inv.by === id) list.push([code, inv.by, inv.made, inv.until, inv.uses, inv.off]);
    }
    list.sort((a, b) => b[2] - a[2]);
    return { t: 'invites', list: list.slice(0, INVITE_LIST) };
  }

  // The world's clock at `now`: seconds of game time, the same for everyone.
  clock(now) {
    return Math.max(0, (now - this.dawn) / 1000);
  }

  welcome(id, now) {
    const others = {};
    for (const [pid, p] of this.players) if (pid !== id) others[pid] = { c: p.c, st: p.st, p: p.p };
    const me = this.players.get(id);
    return {
      t: 'welcome', you: id, c: me.c, owner: this.owner, seed: this.seed,
      mods: [...this.mods], props: [...this.props], ext: this.ext,
      players: others, save: me.save, p: me.p, time: this.clock(now)
    };
  }

  statusOf(id) {
    const p = this.players.get(id);
    return { t: 'status', id, st: p.st, c: p.c, p: p.p };
  }

  // A connection closed: `clean` when the player left on purpose.
  left(id, clean, now) {
    const p = this.players.get(id);
    if (!p) return null;
    p.st = clean ? 'offline' : 'lost';
    p.lostAt = clean ? 0 : now;
    this.dirty.players.add(id);
    return this.statusOf(id);
  }

  // Lost connections that have been gone long enough turn offline.
  // Returns the status messages to send.
  expireLost(now) {
    const out = [];
    for (const [id, p] of this.players) {
      if (p.st === 'lost' && now - p.lostAt >= LOST_TO_OFFLINE_MS) {
        p.st = 'offline';
        p.lostAt = 0;
        this.dirty.players.add(id);
        out.push(this.statusOf(id));
      }
    }
    return out;
  }

  // When the next lost player turns offline, or null.
  nextLostDeadline() {
    let t = null;
    for (const p of this.players.values()) {
      if (p.st === 'lost') t = Math.min(t ?? Infinity, p.lostAt + LOST_TO_OFFLINE_MS);
    }
    return t;
  }

  touch(now) {
    this.last = now;
    this.dirty.meta = true;
  }

  expired(now) {
    return now - this.last >= EXPIRE_MS;
  }

  /* -------------------------------------------------------- messages */

  // A message from player `id`. Returns {toOthers, toAll} messages to send,
  // or {drop: true} if it was malformed.
  message(id, raw, now, edits = null) {
    // Only your progress may be bigger than an ordinary message.
    const d = parse(raw, LIMITS.saveBytes + 1024);
    const pl = this.players.get(id);
    if (!d || !pl || (d.t !== 'save' && raw.length > LIMITS.messageBytes)) return { drop: true };
    if (d.t === 'pos') {
      const p = cleanPos(d.p);
      if (!p) return { drop: true };
      pl.p = p;
      if (pl.st !== 'online') return this.setStatus(id, 'online', { t: 'pos', id, p });
      // Players near you hear every step; everyone else every FAR_MS, enough
      // for the pins at the edge of their screen. (With a hundred players,
      // relaying every step to everyone would swamp every phone.)
      const far = now - (pl.farAt || 0) >= FAR_MS;
      if (far) pl.farAt = now;
      return { toOthers: [{ t: 'pos', id, p }], near: far ? null : p };
    }
    if (d.t === 'edits') {
      const list = cleanEdits(d.e);
      if (!list) return { drop: true };
      // A budget of edits per player (see Bucket), so nobody can strip a
      // world bare in a moment, and only around where they stand.
      if (edits && !edits.take(now, list.length)) return { drop: true };
      const applied = [];
      for (const e of list) if (editInReach(e, pl.p) && this.apply(e, id)) applied.push(e[0] === 'x' ? [...e.slice(0, 5), id] : e);
      this.touch(now);
      return applied.length ? { toAll: [{ t: 'edits', id, e: applied }] } : {};
    }
    if (d.t === 'save') {
      const save = cleanSave(d.s);
      if (!save) return { drop: true };
      pl.save = save;
      this.dirty.players.add(id);
      return {};
    }
    if (d.t === 'away') {
      return this.setStatus(id, d.a === true ? 'away' : 'online');
    }
    if (d.t === 'invite') {
      // Anyone in the world may hold up the QR. It shows your newest link
      // while that still has a while to go, else a new one.
      let code = null, newest = 0;
      for (const [c, inv] of this.invites) {
        if (inv.by === id && !inv.off && inv.until - now >= REUSE_MS && inv.made >= newest) { code = c; newest = inv.made; }
      }
      if (!code) {
        if (this.invites.size >= MAX_INVITES) {
          // Make room by forgetting the oldest link that no longer works.
          let dead = null;
          for (const [c, inv] of this.invites) if ((inv.off || inv.until < now) && (!dead || inv.made < this.invites.get(dead).made)) dead = c;
          if (!dead) return { toSelf: [{ t: 'invitesFull' }] };
          this.invites.delete(dead);
        }
        code = randomRoomId();
        this.invites.set(code, { by: id, made: now, until: now + INVITE_MS, uses: 0, off: false });
        this.dirty.meta = true;
      }
      return { toSelf: [{ t: 'invite', code, until: this.invites.get(code).until }] };
    }
    if (d.t === 'invites') return { toSelf: [this.inviteList(id)] };
    if (d.t === 'revoke') {
      // The owner stops any link; anyone else only their own.
      const inv = typeof d.code === 'string' ? this.invites.get(d.code) : undefined;
      if (!inv || (id !== this.owner && inv.by !== id)) return { drop: true };
      if (!inv.off) { inv.off = true; this.dirty.meta = true; }
      return { toSelf: [this.inviteList(id)] };
    }
    if (d.t === 'remove') {
      // Only the world's owner removes a player, never themselves.
      if (id !== this.owner || typeof d.id !== 'string' || d.id === this.owner || !this.players.has(d.id)) return { drop: true };
      this.players.delete(d.id);
      this.dirty.players.add(d.id);
      return { kick: d.id, toAll: [{ t: 'removed', id: d.id }] };
    }
    return { drop: true };
  }

  setStatus(id, st, also) {
    const pl = this.players.get(id);
    const out = also ? [also] : [];
    if (pl.st !== st) {
      pl.st = st;
      this.dirty.players.add(id);
      out.push(this.statusOf(id));
    }
    return { toOthers: out };
  }

  // Applies one checked edit. False if it can't be (full world, taken tile).
  apply(e, by) {
    if (e[0] === 'm') {
      if (!this.mods.has(e[1]) && this.mods.size >= LIMITS.mods) return false;
      this.mods.set(e[1], e[2]);
      this.dirty.buckets.add(bucketOf(e[1]));
      return true;
    }
    if (e[0] === 'p') {
      if (this.props.has(e[1]) || this.props.size >= LIMITS.props) return false;
      this.props.set(e[1], e[2]);
      this.dirty.props = true;
      return true;
    }
    if (e[0] === 'x') {
      const at = extAt(e[2], e[3], e[4]);
      if (this.extTiles.has(at) || this.ext.length >= LIMITS.extractors) return false;
      this.ext.push([e[1], e[2], e[3], e[4], by]);
      this.extTiles.add(at);
      this.dirty.ext = true;
      return true;
    }
    return false;
  }
}

/* A token bucket per connection: LIMITS.ratePerSecond on average, bursts
 * up to LIMITS.rateBurst. A connection that keeps going over is closed. */
export class Bucket {
  constructor(now, rate = LIMITS.ratePerSecond, burst = LIMITS.rateBurst) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.at = now;
    this.strikes = 0;
  }

  take(now, n = 1) {
    this.tokens = Math.min(this.burst, this.tokens + (now - this.at) / 1000 * this.rate);
    this.at = now;
    if (this.tokens >= n) { this.tokens -= n; return true; }
    this.strikes++;
    return false;
  }
}

export const editBucket = (now) => new Bucket(now, LIMITS.editsPerSecond, LIMITS.editsBurst);
