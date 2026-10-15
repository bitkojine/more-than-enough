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
  LIMITS, parse, cleanPos, cleanEdits, cleanWorld, cleanSave, cleanTime, playerId, randomRoomId, editInReach, cleanInviteAsk, unpackKey, KEY_RE
} from '../../src/net/protocol.js';
import { WORLD_FORMAT } from '../../src/core/format.js';
import { SAMPLE_MS, PROG_MS, digestOf, progressEvent, sameDigest, codeTag, kindTag } from './audit.js';

export const LOST_TO_OFFLINE_MS = 60_000;   // connection lost this long: offline
export const EXPIRE_MS = 30 * 24 * 3600_000; // a room nobody visits for 30 days is deleted
export const MOD_BUCKETS = 16;               // richness edits are stored in this many pieces
export const INVITE_MS = cleanInviteAsk(null).life * 60_000; // a link works this long unless asked otherwise
export const MAX_INVITES = 200;              // links a world keeps (working or not), to list and manage
const INVITE_LIST = 100;                     // newest links sent in one list (fits a message)
const REUSE_MS = 3600_000;                   // your sign shows your newest link while it has this long left (or half its life)
export const NEAR = 48;                      // tiles: players this close hear each other's every step
export const FAR_MS = 2000;
export const STATUS_MS = 2000;               // a player's away/back changes, at most this often                  // everyone else hears where you are this often
export const NUKE_AFK_MS = 60_000;           // after this, the nuke is pressed for whoever hasn't
export const MAX_BANS = 1000;                // removed players a world remembers, to keep out
// Basic anti-cheat. Nobody walks faster than MAX_SPEED tiles a second (the
// fastest boots with many Nomad perks are well under it); a player's steps
// draw on a budget of that much distance a second, up to MOVE_BURST, so steps
// that arrive bunched up after a hiccup still pass. A step past the budget
// or an edit out of reach is a cheat: the step is refused, and CHEATS_TO_BAN
// cheats (at most one a second, one forgiven every CHEAT_FORGIVE_MS) take
// the player out of the world for good. Owners too (Watch's rule: nobody
// cheats in a shared world); the world then passes to whoever joined it
// first among those left.
//
// Reconnecting doesn't start a player afresh: their first step after it may
// cover only their budget, or the distance they could have walked since
// the room last saw them. A first step further than that isn't counted as a
// cheat (a phone that was offline, or another device, may simply be
// elsewhere): the room tells the game where the player stands (`place`) and
// refuses their steps and edits, quietly, until one starts from there.
// Edits draw on a budget per player, not per connection, so a reconnect
// doesn't refill it either.
export const MAX_SPEED = 40;
export const MOVE_BURST = 120;
export const CHEATS_TO_BAN = 10;
export const CHEAT_FORGIVE_MS = 30_000;
// What one player (the owner too) may add to a world, so one player can't
// fill it for everyone. What the owner's world held when it was made
// doesn't count.
export const PLAYER_BUILDINGS = 400;
export const PLAYER_PROPS = 2000;
export const PLAYER_TILES = 10_000; // tiles nobody had changed before (re-changing one is free)
// One player (not the owner) brings at most LIMITS.invitesPerDay people into
// a world through their own links in a day, so one bad invite can't fill a
// world with others.
const DAY_MS = 24 * 3600_000;

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
    // The nuke. `fmt` is the world format (WORLD_FORMAT) the world was made
    // with. When the room service is newer (an update changed how worlds are
    // made), the next player in calls the nuke (`call`: {fmt, at}); nothing
    // a player says can. It shows on
    // everyone's screen. Who has pressed it is in `nuke`; it's pressed for
    // anyone away, offline or idle (see nukeDue). Then the world is made
    // again from scratch with everything new, and everyone starts over.
    // `gen` counts how many times, so a phone can tell its copy of your
    // progress is from a world that's gone.
    this.fmt = 0;
    this.call = null;
    this.nuke = new Set();
    this.gen = 0;
    // Players taken out of the world (by the owner or for cheating), who
    // can't come back with their key.
    this.bans = new Set();
    // Per player, not kept: their step budget and cheats ({at, budget, fresh, cheats, cheatAt}).
    this.watch = new Map();
    // The audit log (audit.js): events waiting to be written, and per player
    // what they've done since their last sample ({since, at, dist, m, p, x, no, drops, dg, dgAt}).
    this.log = [];
    this.acts = new Map();
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
    Object.assign(r, { seed: meta.seed, owner: meta.owner, created: meta.created, last: meta.last, dawn: meta.dawn ?? meta.created, gen: meta.gen ?? 0, fmt: meta.fmt ?? 0, call: meta.call ?? null, ready: true });
    r.nuke = new Set((meta.nk || []).filter((id) => typeof id === 'string'));
    r.bans = new Set((meta.bans || []).filter((id) => typeof id === 'string'));
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
    if (d.meta) out.set('meta', { seed: this.seed, owner: this.owner, created: this.created, last: this.last, dawn: this.dawn, inv: [...this.invites], gen: this.gen, fmt: this.fmt, call: this.call, nk: [...this.nuke], bans: [...this.bans] });
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
    this.fmt = WORLD_FORMAT;
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
    this.audit(now, this.owner, 'create', { seed: this.seed, fmt: this.fmt, mods: this.mods.size, props: this.props.size, ext: this.ext.length });
    this.dirty.meta = this.dirty.props = this.dirty.ext = true;
    for (let b = 0; b < MOD_BUCKETS; b++) this.dirty.buckets.add(b);
    this.dirty.players.add(this.owner);
    return null;
  }

  /* -------------------------------------------------------- players */

  // A connection proved its key (and, the first time, brought an invite).
  // Returns {id, welcome, called} (called: the nuke was just called) or
  // {error}.
  async join(key, code, now) {
    if (typeof key !== 'string' || !KEY_RE.test(key)) return { error: 'bad' };
    const id = await playerId(this.id, key);
    if (this.bans.has(id)) { this.audit(now, id, 'deny', { why: 'banned' }); return { error: 'invite' }; }
    let pl = this.players.get(id);
    const fresh = !pl;
    if (!pl) {
      const inv = typeof code === 'string' ? this.invites.get(code) : undefined;
      if (!inv || !this.inviteWorks(inv, now)) {
        this.audit(now, id, 'deny', { why: 'invite', code: codeTag(code) });
        // Say why, so a friend knows whether to ask for a new link or more room on it.
        return { error: 'invite', why: inv ? this.whyNot(inv, now) : undefined };
      }
      if (this.players.size >= LIMITS.players) { this.audit(now, id, 'deny', { why: 'full' }); return { error: 'full' }; }
      // Whoever made the link has brought in their share for today.
      const host = inv.by !== this.owner ? this.players.get(inv.by) : null;
      if (host) {
        const today = (Array.isArray(host.brought) ? host.brought : []).filter((t) => now - t < DAY_MS);
        if (today.length >= LIMITS.invitesPerDay) {
          this.audit(now, id, 'deny', { why: 'limit', code: codeTag(code) });
          return { error: 'invite', why: 'limit' };
        }
        host.brought = [...today, now];
        this.dirty.players.add(inv.by);
      }
      inv.uses++;
      this.dirty.meta = true;
      const used = new Set([...this.players.values()].map((p) => p.c));
      let c = 0;
      while (used.has(c)) c++;
      // `via`: the link they came in with, stopped if they're taken out;
      // `by`: who made it, taking them along if they're taken out.
      pl = { c, st: 'offline', p: null, save: null, lostAt: 0, via: code, by: inv.by, np: 0 };
      this.players.set(id, pl);
    }
    // A new connection may stand anywhere its game remembers: its first step is free.
    this.watch.set(id, { ...this.watchOf(id, now), fresh: true });
    pl.st = 'online';
    pl.lostAt = 0;
    this.touch(now);
    this.dirty.players.add(id);
    this.acts.set(id, this.newAct(now, this.acts.get(id)));
    this.audit(now, id, 'join', { new: fresh, c: pl.c, ...(fresh ? { via: codeTag(pl.via) } : {}), at: pl.p ? [Math.round(pl.p.x), Math.round(pl.p.y), pl.p.z] : null, online: this.online() });
    const called = this.callNuke(now);
    return { id, welcome: this.welcome(id, now), called };
  }

  // The invite links someone may see and stop: all of them for the owner,
  // their own for anyone else. Newest first.
  inviteList(id) {
    const list = [];
    for (const [code, inv] of this.invites) {
      if (id === this.owner || inv.by === id) list.push([code, inv.by, inv.made, inv.until, inv.uses, inv.off, this.maxOf(inv)]);
    }
    list.sort((a, b) => b[2] - a[2]);
    return { t: 'invites', list: list.slice(0, INVITE_LIST) };
  }

  // How many people a link lets in (links from before the limit: the default).
  maxOf(inv) {
    return Number.isSafeInteger(inv.max) ? inv.max : cleanInviteAsk(null).uses;
  }

  // Whether a link still lets someone new in: not stopped, not expired, not used up.
  inviteWorks(inv, now) {
    return !inv.off && inv.until >= now && inv.uses < this.maxOf(inv);
  }

  // Why a link no longer lets anyone in: 'stopped', 'expired' or 'usedUp'
  // (or, from join, 'limit': its maker has brought in LIMITS.invitesPerDay today).
  whyNot(inv, now) {
    if (inv.off) return 'stopped';
    if (inv.until < now) return 'expired';
    return 'usedUp';
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
      players: others, save: me.save, p: me.p, time: this.clock(now), gen: this.gen, nuke: this.call ? this.nukeVotes().nuke : null
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
    this.sample(id, now, true);
    const act = this.acts.get(id);
    this.audit(now, id, 'leave', { clean, secs: act ? Math.round((now - act.since) / 1000) : null, at: p.p ? [Math.round(p.p.x), Math.round(p.p.y), p.p.z] : null });
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
      const step = this.canStep(id, pl, p, now);
      if (step === 'place') return { toSelf: [{ t: 'place', p: pl.p }] };
      if (step === 'wait') return {};
      if (step === 'far') {
        return this.cheat(id, now, 'speed', { from: pl.p && [Math.round(pl.p.x), Math.round(pl.p.y), pl.p.z], to: [Math.round(p.x), Math.round(p.y), p.z] });
      }
      pl.at = now;
      const act = this.actOf(id, now);
      if (pl.p && pl.p.z === p.z) act.dist += Math.hypot(p.x - pl.p.x, p.y - pl.p.y);
      else if (pl.p) act.layers++;
      pl.p = p;
      this.sample(id, now);
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
      const w = this.watchOf(id, now);
      if (!(edits || w.edits).take(now, list.length)) return { drop: true };
      // Not where the room has them yet (see MAX_SPEED): refused, not a cheat.
      if (w.placing) return {};
      const applied = [];
      const act = this.actOf(id, now);
      let far = null;
      for (const e of list) {
        if (!editInReach(e, pl.p)) { if (pl.p) far = e; continue; }
        if (this.apply(e, id)) {
          applied.push(e[0] === 'x' ? [...e.slice(0, 5), id] : e);
          act[e[0]]++;
          if (e[0] === 'x') this.audit(now, id, 'build', { k: kindTag(e[1]), at: [e[2], e[3], e[4]] });
        } else act.no++;
      }
      this.touch(now);
      const out = applied.length ? { toAll: [{ t: 'edits', id, e: applied }] } : {};
      if (!far) return out;
      const t = far[0] === 'x' ? { x: far[2], y: far[3], z: far[4] } : unpackKey(far[1]);
      const banned = this.cheat(id, now, 'reach', { kind: far[0], at: [t.x, t.y, t.z], from: [Math.round(pl.p.x), Math.round(pl.p.y), pl.p.z] });
      return banned.kick ? banned : out;
    }
    if (d.t === 'save') {
      const save = cleanSave(d.s);
      if (!save) return { drop: true };
      pl.save = save;
      this.dirty.players.add(id);
      this.progress(id, save, now);
      return {};
    }
    if (d.t === 'away') {
      const st = d.a === true ? 'away' : 'online';
      if (pl.st === st) return {};
      // At most one change every STATUS_MS: each one goes to every player
      // and into the log, so flicking it can't flood either. (A step brings
      // a player back online anyway.)
      if (now - (pl.stAt || 0) < STATUS_MS) return {};
      pl.stAt = now;
      this.audit(now, id, 'st', { st });
      return this.setStatus(id, st);
    }
    if (d.t === 'invite') {
      // Anyone in the world may hold up the QR, choosing how many people its
      // link lets in and for how long. It shows your newest link made that
      // way while that still has a while to go and room for someone, else a
      // new one.
      const ask = cleanInviteAsk(d);
      const lifeMs = ask.life * 60_000;
      let code = null, newest = 0;
      for (const [c, inv] of this.invites) {
        if (inv.by === id && this.inviteWorks(inv, now) && this.maxOf(inv) === ask.uses && inv.life === ask.life &&
            inv.until - now >= Math.min(REUSE_MS, lifeMs / 2) && inv.made >= newest) { code = c; newest = inv.made; }
      }
      if (!code) {
        if (this.invites.size >= MAX_INVITES) {
          // Make room by forgetting the oldest link that no longer works.
          let dead = null;
          for (const [c, inv] of this.invites) if (!this.inviteWorks(inv, now) && (!dead || inv.made < this.invites.get(dead).made)) dead = c;
          if (!dead) return { toSelf: [{ t: 'invitesFull' }] };
          this.invites.delete(dead);
        }
        code = randomRoomId();
        this.invites.set(code, { by: id, made: now, until: now + lifeMs, uses: 0, max: ask.uses, life: ask.life, off: false });
        this.dirty.meta = true;
        this.audit(now, id, 'invite', { code: codeTag(code), uses: ask.uses, life: ask.life });
      }
      return { toSelf: [{ t: 'invite', code, until: this.invites.get(code).until }] };
    }
    if (d.t === 'invites') return { toSelf: [this.inviteList(id)] };
    if (d.t === 'revoke') {
      // The owner stops any link; anyone else only their own.
      const inv = typeof d.code === 'string' ? this.invites.get(d.code) : undefined;
      if (!inv || (id !== this.owner && inv.by !== id)) return { drop: true };
      if (!inv.off) { inv.off = true; this.dirty.meta = true; this.audit(now, id, 'revoke', { code: codeTag(d.code) }); }
      return { toSelf: [this.inviteList(id)] };
    }
    if (d.t === 'remove') {
      // Only the world's owner removes a player, never themselves.
      if (id !== this.owner || typeof d.id !== 'string' || d.id === this.owner || !this.players.has(d.id)) return { drop: true };
      return this.ban(d.id, now, 'owner', 'removed by the owner');
    }
    if (d.t === 'nuke') {
      // Pressed, for good: there's no taking it back.
      if (!this.call) return {};
      if (!this.nuke.has(id)) { this.nuke.add(id); this.dirty.meta = true; this.audit(now, id, 'nuke', {}); }
      return { toAll: [this.nukeVotes()] };
    }
    return { drop: true };
  }

  /* ------------------------------------------------------- anti-cheat */

  watchOf(id, now) {
    let w = this.watch.get(id);
    if (!w) this.watch.set(id, w = { at: now, budget: MOVE_BURST, fresh: true, placing: false, cheats: 0, cheatAt: 0, edits: editBucket(now) });
    return w;
  }

  // Whether player `pl` (id `id`) could step to `to`, taking it from their
  // budget: 'ok', 'far' (a cheat) or 'place' (the first step after
  // connecting starts somewhere else: not a cheat, see MAX_SPEED). A climb
  // or fall keeps them on the same spot.
  canStep(id, pl, to, now) {
    const w = this.watchOf(id, now), from = pl.p;
    w.budget = Math.min(MOVE_BURST, w.budget + (now - w.at) / 1000 * MAX_SPEED);
    w.at = now;
    if (!from) { w.fresh = w.placing = false; return 'ok'; } // nowhere yet: a new player, or a renewed world
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (w.fresh || w.placing) {
      const since = Number.isSafeInteger(pl.at) ? Math.max(0, now - pl.at) / 1000 * MAX_SPEED : 0;
      const ok = dist <= (w.placing ? w.budget : Math.max(w.budget, since));
      const was = w.fresh;
      w.fresh = false;
      w.placing = !ok;
      if (!ok) return was ? 'place' : 'wait';
      w.budget = Math.max(0, w.budget - dist);
      return 'ok';
    }
    if (dist > w.budget) return 'far';
    w.budget -= dist;
    return 'ok';
  }

  // A cheat by player `id`: counted (one a second at most, older ones
  // forgiven slowly), and enough of them take the player out for good.
  // `why` ('speed' or 'reach') and `detail` go in the audit log.
  cheat(id, now, why, detail = {}) {
    const w = this.watchOf(id, now);
    if (now - w.cheatAt >= 1000) {
      w.cheats = Math.max(0, w.cheats - Math.floor((now - w.cheatAt) / CHEAT_FORGIVE_MS)) + 1;
      w.cheatAt = now;
      this.audit(now, id, 'cheat', { why, n: w.cheats, ...detail });
    }
    if (w.cheats >= CHEATS_TO_BAN && this.players.has(id)) return this.ban(id, now, 'auto', why);
    return {}; // refused quietly: a socket isn't cut for it (see Bucket strikes)
  }

  // Takes a player out of the world for good: their key can't come back,
  // the link they came in with and every link they made stop, and their
  // buildings go. So does everyone who came in through their links, and
  // whoever those brought in (Watch's rule: a bad invite is cleaned up in
  // one go). `by` is who decided ('owner', 'auto' for the anti-cheat, 'mod'
  // for the moderator). Returns {kick, also, toAll}: the player, the others
  // taken with them, and the news for everyone.
  ban(id, now, by, why) {
    const also = [];
    const wasOwner = id === this.owner;
    this.banOne(id, now, by, why);
    // An owner's guests are the world's, not a bad invite's: they stay.
    for (let i = 0, from = wasOwner ? [] : [id]; i < from.length; i++) {
      for (const [pid, p] of this.players) {
        if (pid === this.owner || p.by !== from[i]) continue;
        this.banOne(pid, now, by, 'came in through ' + from[i]);
        also.push(pid);
        from.push(pid);
      }
    }
    const toAll = [id, ...also].map((x) => ({ t: 'removed', id: x }));
    if (wasOwner) {
      // The world passes to whoever joined it first among those left (the
      // lowest place), or to nobody if it's empty.
      let next = '';
      for (const [pid, p] of this.players) if (!next || p.c < this.players.get(next).c) next = pid;
      this.owner = next;
      this.dirty.meta = true;
      this.audit(now, next || null, 'owner', { was: id });
      if (next) toAll.push({ t: 'owner', id: next });
    }
    return { kick: id, also, toAll };
  }

  banOne(id, now, by, why) {
    const pl = this.players.get(id);
    this.sample(id, now, true);
    this.audit(now, id, 'ban', { by, why: String(why || '').slice(0, 200) });
    this.acts.delete(id);
    this.players.delete(id);
    this.dirty.players.add(id);
    this.nuke.delete(id);
    this.watch.delete(id);
    if (this.bans.size >= MAX_BANS) this.bans.delete(this.bans.values().next().value);
    this.bans.add(id);
    // The link they came in with stops, and every link they made: a banned
    // player can't come back through an invite of their own.
    const via = pl && typeof pl.via === 'string' ? this.invites.get(pl.via) : undefined;
    if (via) via.off = true;
    for (const inv of this.invites.values()) if (inv.by === id) inv.off = true;
    this.dirty.meta = true;
    const left = this.ext.filter((e) => e[4] !== id);
    if (left.length !== this.ext.length) {
      this.ext = left;
      this.extTiles = new Set(left.map((e) => extAt(e[1], e[2], e[3])));
      this.dirty.ext = true;
    }
  }

  /* ------------------------------------------------------------ nuke */

  // Someone arrived in a world made before the current world format: it
  // misses what the update brings, so the nuke is called. Returns true if it
  // was just called (everyone needs telling).
  callNuke(now) {
    if (this.fmt >= WORLD_FORMAT || this.call) return false;
    this.call = { fmt: WORLD_FORMAT, at: now };
    this.dirty.meta = true;
    this.audit(now, null, 'nukeCall', { fmt: WORLD_FORMAT, was: this.fmt });
    return true;
  }

  // The nuke as everyone sees it: who has pressed it, and when it will be
  // pressed for whoever hasn't.
  nukeVotes() {
    return { t: 'nuke', nuke: { votes: [...this.nuke], until: this.call.at + NUKE_AFK_MS } };
  }

  // Whether it's time: every player has pressed it, or had it pressed for
  // them (away, offline, connection lost, or still not pressed once the
  // minute is up).
  nukeDue(now) {
    if (!this.call) return false;
    if (now >= this.call.at + NUKE_AFK_MS) return true;
    for (const [id, p] of this.players) if (p.st === 'online' && !this.nuke.has(id)) return false;
    return true;
  }

  // When the nuke will be pressed for everyone left, or null.
  nukeDeadline() {
    return this.call ? this.call.at + NUKE_AFK_MS : null;
  }

  // The world from scratch: a new seed, nothing built or changed, the clock
  // at dawn, and every player's progress gone. The players, their colours
  // and the invite links stay, so everyone comes back to the same room.
  renew(now) {
    let seed = 0;
    while (!seed) seed = crypto.getRandomValues(new Uint32Array(1))[0];
    this.seed = seed;
    this.mods.clear();
    this.props.clear();
    this.ext = [];
    this.extTiles.clear();
    for (const [id, p] of this.players) {
      p.save = null;
      p.p = null;
      p.np = p.nm = p.nx = 0; // their share of the world starts over with it
      this.dirty.players.add(id);
    }
    this.nuke.clear();
    if (this.call) this.fmt = this.call.fmt;
    this.call = null;
    this.gen++;
    this.dirty.meta = true;
    this.dawn = now;
    this.audit(now, null, 'renew', { gen: this.gen, seed });
    for (const a of this.acts.values()) { a.dg = null; a.dgAt = 0; }
    this.touch(now);
    this.dirty.props = this.dirty.ext = true;
    for (let b = 0; b < MOD_BUCKETS; b++) this.dirty.buckets.add(b);
  }

  /* -------------------------------------------------------- audit log */

  // Records one event (see audit.js); the Durable Object writes them out.
  audit(now, p, e, fields) {
    this.log.push({ ts: now, p, e, ...fields });
  }

  // The events waiting to be written, taken.
  takeLog() {
    const out = this.log;
    this.log = [];
    return out;
  }

  online() {
    let n = 0;
    for (const p of this.players.values()) if (p.st === 'online' || p.st === 'away') n++;
    return n;
  }

  newAct(now, old) {
    return { since: now, at: now, dist: 0, layers: 0, m: 0, p: 0, x: 0, no: 0, drops: 0, dg: old ? old.dg : null, dgAt: old ? old.dgAt : 0 };
  }

  actOf(id, now) {
    let a = this.acts.get(id);
    if (!a) this.acts.set(id, a = this.newAct(now));
    return a;
  }

  // Where a player is and what they did since the last sample: every
  // SAMPLE_MS while they move, and when they leave (`force`). Positions
  // and the time between samples show where people spend their time and
  // where they get stuck.
  sample(id, now, force = false) {
    const a = this.acts.get(id), pl = this.players.get(id);
    if (!a || !pl || (!force && now - a.at < SAMPLE_MS)) return;
    const busy = a.dist >= 0.5 || a.layers || a.m || a.p || a.x || a.no || a.drops;
    if (busy || !force) {
      const p = pl.p;
      this.audit(now, id, 'at', {
        ...(p ? { x: Math.round(p.x), y: Math.round(p.y), z: p.z, act: p.a || null } : {}),
        secs: Math.round((now - a.at) / 1000), walked: Math.round(a.dist), layers: a.layers,
        dug: a.m, props: a.p, built: a.x, refused: a.no, drops: a.drops
      });
    }
    Object.assign(a, { at: now, dist: 0, layers: 0, m: 0, p: 0, x: 0, no: 0, drops: 0 });
  }

  // A player's progress came in: logged when it changed, at most every
  // PROG_MS (sooner when they reach a new goal).
  progress(id, save, now) {
    const a = this.actOf(id, now);
    const dg = digestOf(save);
    if (!dg || sameDigest(a.dg, dg)) return;
    if (a.dg && now - a.dgAt < PROG_MS && dg.goal === a.dg.goal) return;
    this.audit(now, id, 'prog', progressEvent(a.dg, dg));
    a.dg = dg;
    a.dgAt = now;
  }

  // The service dropped a message from a player (malformed, too many):
  // counted in their next sample.
  dropped(id, now) {
    if (this.players.has(id)) this.actOf(id, now).drops++;
  }

  // What the moderator sees of each player now.
  roster(now) {
    const out = [];
    for (const [id, p] of this.players) {
      const w = this.watch.get(id), a = this.acts.get(id);
      out.push({
        id, c: p.c, st: p.st, owner: id === this.owner, at: p.p ? [Math.round(p.p.x), Math.round(p.p.y), p.p.z] : null,
        cheats: w ? w.cheats : 0, via: codeTag(p.via), sessionSecs: a && (p.st === 'online' || p.st === 'away') ? Math.round((now - a.since) / 1000) : null,
        progress: p.save ? digestOf(p.save) : null
      });
    }
    return out;
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
    const pl = this.players.get(by);
    if (e[0] === 'm') {
      if (!this.mods.has(e[1])) {
        if (this.mods.size >= LIMITS.mods || (pl && (pl.nm || 0) >= PLAYER_TILES)) return false;
        if (pl) { pl.nm = (pl.nm || 0) + 1; this.dirty.players.add(by); }
      }
      this.mods.set(e[1], e[2]);
      this.dirty.buckets.add(bucketOf(e[1]));
      return true;
    }
    if (e[0] === 'p') {
      if (this.props.has(e[1]) || this.props.size >= LIMITS.props) return false;
      if (pl && (pl.np || 0) >= PLAYER_PROPS) return false;
      if (pl) { pl.np = (pl.np || 0) + 1; this.dirty.players.add(by); }
      this.props.set(e[1], e[2]);
      this.dirty.props = true;
      return true;
    }
    if (e[0] === 'x') {
      const at = extAt(e[2], e[3], e[4]);
      if (this.extTiles.has(at) || this.ext.length >= LIMITS.extractors) return false;
      if (pl && (pl.nx || 0) >= PLAYER_BUILDINGS) return false;
      if (pl) { pl.nx = (pl.nx || 0) + 1; this.dirty.players.add(by); }
      this.ext.push([e[1], e[2], e[3], e[4], by]);
      this.extTiles.add(at);
      this.dirty.ext = true;
      return true;
    }
    return false;
  }
}

// Who's asking, for the limits: the IP address, or for IPv6 its /48 (a
// home or a phone gets a /64 to a /48, so single addresses, and even single
// /64s, cost an abuser nothing). Addresses are written out in full first, so
// "2001:db8::1" and "2001:0db8:0:0::1" are the same visitor.
export function visitor(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  return groups.slice(0, 3).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':') + '::/48';
}

/* A token bucket per connection: LIMITS.ratePerSecond on average, bursts
 * up to LIMITS.rateBurst. A connection that keeps going over is closed:
 * each refusal is a strike, and one strike is forgiven every STRIKE_FORGIVE_MS,
 * so an honest connection that goes over now and then is never cut. */
export const STRIKE_FORGIVE_MS = 10_000;
export class Bucket {
  constructor(now, rate = LIMITS.ratePerSecond, burst = LIMITS.rateBurst) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.at = now;
    this.strikes = 0;
  }

  take(now, n = 1) {
    this.strikes = Math.max(0, this.strikes - (now - this.at) / STRIKE_FORGIVE_MS);
    this.tokens = Math.min(this.burst, this.tokens + (now - this.at) / 1000 * this.rate);
    this.at = now;
    if (this.tokens >= n) { this.tokens -= n; return true; }
    this.strikes++;
    return false;
  }
}

export const editBucket = (now) => new Bucket(now, LIMITS.editsPerSecond, LIMITS.editsBurst);
