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

import { LIMITS, parse, cleanSave, cleanCreate, playerId, KEY_RE } from '../../src/net/protocol.js';
import { playedIn } from './shadow.js';
import { WORLD_FORMAT, ECON_FORMAT } from '../../src/core/format.js';
import { codeTag } from './audit.js';
import {
  bucketOf,
  clean,
  everything,
  isDirty,
  keysOf,
  markKeys,
  piecesOf,
  modsIn
} from './stored.js';
import * as Invites from './invites.js';
import { RoomPlay } from './room-play.js';
import { RoomWatch } from './room-watch.js';
import { RoomLog } from './room-log.js';

// Split out of this file, and still importable from it.
export { FAR_MS, STATUS_MS, DRIFT_LOG_MS } from './room-play.js';
export { MAX_GRAVES } from './room-watch.js';
export { MOD_BUCKETS } from './stored.js';
export { INVITE_MS, MAX_INVITES } from './invites.js';
export { MAX_SPEED, MOVE_BURST, CHEATS_TO_FREEZE, CHEAT_FORGIVE_MS } from './moves.js';
export { visitor, Bucket, STRIKE_FORGIVE_MS, editBucket } from './limits.js';

export const LOST_TO_OFFLINE_MS = 60_000; // connection lost this long: offline
export const SMOKE_SEED = 12345; // the seed the deploy's smoke test sends (server/smoke.mjs); never used to classify a room
export const NEAR = 48; // tiles: players this close hear each other's every step
// Steps and edits are watched (moves.js): enough cheats freeze a character.
// What one player may add to a world, so one player can't fill it for
// everyone. What the world held when it was made doesn't count.
export const PLAYER_BUILDINGS = 400;
export const PLAYER_PROPS = 2000;
// Tiles nobody had changed before (re-changing one is free). Nothing grows
// back, so this is a whole world's play of gathering (the Perfect bot
// changes about 15,000 in its ~25 h), with room to roam.
export const PLAYER_TILES = 60_000;
const extAt = (x, y, z) => x + ',' + y + ',' + z;

export class Room {
  constructor(id, now) {
    this.id = id;
    this.ready = false;
    this.seed = 0;
    this.created = now;
    this.last = now;
    this.dawn = now; // when (ms) the world's clock read 0; it never stops
    this.mods = new Map();
    this.props = new Map();
    this.ext = []; // [kind, x, y, z, owner]
    this.extTiles = new Set();
    this.players = new Map(); // id -> {c, st, p, save, lostAt, gone}
    // Invite links (the code in a QR) -> {by, made, until, uses, off}: who
    // made it, when, until when it works, how many joined with it, and
    // whether it was stopped. Only a new player needs one; anyone already in
    // the world comes back with their key.
    this.invites = new Map(); // see invites.js
    // Every world is kept, always (Watch, 2026-10-18): nothing resets a
    // world, and there is no nuke. `fmt` and `ef` say which WORLD_FORMAT and
    // ECON_FORMAT the room plays by (always the current ones, see restore);
    // `gen` counted the world's remakings when there were any, and stays.
    this.fmt = 0;
    this.ef = 0;
    this.gen = 0;
    // Whether the server made this room as the deploy's smoke test (set only under
    // the admin token, see init): marked rooms stay out of the moderator's
    // lists. Nothing deletes them, or any other room (Watch, 2026-10-20).
    this.smoke = false;
    // Tombstones where banned and frozen characters last stood, so everyone
    // knows where they were (Watch's rule): [id, colour, x, y, z, kind],
    // kind 'ban' (from before v0.155.0) or 'ice' (frozen).
    this.graves = [];
    // Per player, not kept: their step budget and cheats (moves.js newWatch).
    this.watch = new Map();
    // The audit log (audit.js): events waiting to be written, and per player
    // what they've done since their last sample ({since, at, dist, m, p, x, no, drops, dg, dgAt}).
    this.log = [];
    this.acts = new Map();
    // Its own copy of everyone's progress, from what they did (shadow.js),
    // made when first needed; not kept (a restart starts it from saves).
    this.shadow = null;
    this.driftAt = new Map(); // when each player's drift was last logged
    // What changed since the last write to storage.
    this.dirty = clean(); // see stored.js
    // An admin's copy of another room (copy.js), or null: {as, key, until}.
    this.copy = null;
  }

  /* ---------------------------------------------------------- storage */

  // The storage entries a fresh write needs (all of them).
  static keysFor(room) {
    return keysOf(room.players.keys());
  }

  // Rebuilds a room from what storage holds ({key: value}); not ready if empty.
  static restore(id, entries, now) {
    const r = new Room(id, now);
    const meta = entries.get('meta');
    if (!meta) return r;
    Object.assign(r, {
      seed: meta.seed,
      created: meta.created,
      last: meta.last,
      dawn: meta.dawn ?? meta.created,
      gen: meta.gen ?? 0,
      fmt: meta.fmt ?? 0,
      ef: meta.ef ?? 0,
      smoke: meta.smk === true,
      ready: true
    });
    r.graves = Array.isArray(meta.gv) ? meta.gv : [];
    r.copy = meta.copy ?? null;
    // A world made under an older format is kept and plays on under the
    // current one (a pending nuke from before, meta.call, is dropped).
    if (r.fmt !== WORLD_FORMAT || r.ef !== ECON_FORMAT || meta.call || meta.nk?.length) {
      r.audit(now, null, 'kept', { fmt: r.fmt, ef: r.ef });
      Object.assign(r, { fmt: WORLD_FORMAT, ef: ECON_FORMAT });
      r.dirty.meta = true;
    }
    r.invites = new Map((meta.inv || []).filter(([, v]) => v && typeof v === 'object'));
    const { mods, moved } = modsIn(entries);
    r.mods = mods;
    for (const [k, v] of entries) if (k.startsWith('p:')) r.players.set(k.slice(2), v);
    if (moved) r.dirty.buckets = everything([]).buckets;
    for (const [key, kind] of entries.get('props') || []) r.props.set(key, kind);
    for (const e of entries.get('ext') || []) {
      r.ext.push(e);
      r.extTiles.add(extAt(e[1], e[2], e[3]));
    }
    return r;
  }

  // What to write now ({key: value}), and forget it was dirty.
  takeWrites() {
    const out = this.writesOf(this.dirty);
    this.dirty = clean();
    return out;
  }

  // Every entry storage holds for the room, as copies (for copy.js).
  entries() {
    return structuredClone(this.writesOf(everything(this.players.keys())));
  }

  // The entries the parts marked in `d` take ({key: value}).
  writesOf(d) {
    const out = new Map();
    if (d.meta)
      out.set('meta', {
        seed: this.seed,
        created: this.created,
        last: this.last,
        dawn: this.dawn,
        inv: [...this.invites],
        gen: this.gen,
        fmt: this.fmt,
        ef: this.ef,
        smk: this.smoke === true,
        gv: this.graves,
        ...(this.copy ? { copy: this.copy } : {})
      });
    for (const [k, list] of piecesOf(this.mods, d.buckets)) out.set(k, list);
    if (d.props) out.set('props', [...this.props]);
    if (d.ext) out.set('ext', this.ext);
    for (const id of d.players) {
      // A player's progress goes to storage as the room's copy has it now,
      // with the world edits it made, so a restart (a deploy) never finds the
      // world ahead of their progress. Their game sends again what came after.
      const pl = this.players.get(id);
      if (pl && this.shadow?.has(id)) {
        const now = this.saveFor(id, pl);
        if (now) {
          pl.save = now;
          pl.savedAt = this.shadow.atOf(id) ?? pl.savedAt;
        }
      }
      out.set('p:' + id, pl || null); // null: delete
    }
    return out;
  }

  // A write that didn't reach storage (keys put, keys deleted): marked
  // dirty again, so the next write carries it with whatever changed since.
  redo(puts, gone) {
    markKeys(this.dirty, [...puts.keys(), ...gone]);
  }

  get isDirty() {
    return isDirty(this.dirty);
  }

  /* ----------------------------------------------------------- create */

  // Makes the room from the creator's world. Returns an error string or null.
  // `trusted` is the worker saying the create came under the admin token: only
  // then can the body's `smoke` marker mark a deploy smoke-test room.
  async init(raw, now, trusted = false) {
    if (this.ready) return 'exists';
    const d = parse(raw, LIMITS.createBytes);
    const c = cleanCreate(d);
    if (!c) return 'bad';
    // Everyone starts a shared world from nothing (Watch's
    // call): the room can't check progress made anywhere else. So a world is
    // made from the creator's seed alone, and their save and edits are not
    // taken (an older game still sends them).
    const world = c.world;
    world.mods = [];
    world.props = [];
    world.ext = [];
    const save = null;
    const pos = null;
    const time = c.time;
    // A room is a smoke test only when the server says the caller is who they
    // are (the admin token) and the body asked for it: a player's own world
    // never marks itself, and the seed is never consulted (Watch's rule).
    this.smoke = trusted === true && d.smoke === true;
    this.fmt = WORLD_FORMAT;
    this.ef = ECON_FORMAT;
    const first = await playerId(this.id, d.key);
    this.seed = world.seed;
    for (const [k, v] of world.mods) this.mods.set(k, v);
    for (const [k, v] of world.props) this.props.set(k, v);
    for (const [kind, x, y, z] of world.ext) {
      if (this.extTiles.has(extAt(x, y, z))) continue;
      this.ext.push([kind, x, y, z, first]);
      this.extTiles.add(extAt(x, y, z));
    }
    this.players.set(first, { c: 0, st: 'offline', p: pos, save, lostAt: 0 });
    this.ready = true;
    this.created = this.last = now;
    this.dawn = now - time * 1000; // the world goes on from the creator's time of day
    this.audit(now, first, 'create', {
      seed: this.seed,
      fmt: this.fmt,
      mods: this.mods.size,
      props: this.props.size,
      ext: this.ext.length
    });
    this.dirty = everything([first]);
    return null;
  }

  /* -------------------------------------------------------- players */

  // A connection proved its key (and, the first time, brought an invite).
  // `awayProduce` is the player's own freeze-season choice, told on the
  // hello: undefined means the game didn't say (one from before the
  // setting), and then the room keeps what it knows.
  // Returns {id, welcome} or
  // {error}.
  async join(key, code, now, awayProduce = undefined) {
    if (typeof key !== 'string' || !KEY_RE.test(key)) return { error: 'bad' };
    let id = await playerId(this.id, key);
    // An admin's copy lets in only its own key, as the player it copies.
    if (this.copy) {
      if (id !== this.copy.key) return { error: 'invite' };
      id = this.copy.as;
    }
    let pl = this.players.get(id);
    // A frozen character can't be played (see freeze): the game shows why.
    if (pl && pl.frozen) {
      this.audit(now, id, 'deny', { why: 'frozen' });
      return { error: 'frozen' };
    }
    const fresh = !pl;
    if (!pl) {
      const inv = typeof code === 'string' ? this.invites.get(code) : undefined;
      if (!inv || !Invites.works(inv, now)) {
        this.audit(now, id, 'deny', { why: 'invite', code: codeTag(code) });
        // Say why, so a friend knows whether to ask for a new link or more room on it.
        return { error: 'invite', why: inv ? Invites.whyNot(inv, now) : undefined };
      }
      if (this.players.size >= LIMITS.players) {
        this.audit(now, id, 'deny', { why: 'full' });
        return { error: 'full' };
      }
      // Whoever made the link has brought in their share for today.
      const host = this.players.get(inv.by);
      if (host) {
        const today = Invites.broughtToday(host, now);
        if (!today) {
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
    // Left before rooms noted when (v0.100.0): away since their last progress,
    // so their buildings make what they would have meanwhile too (shadow.js away).
    if (!fresh && pl.st === 'offline' && !pl.gone && pl.save && Number.isFinite(pl.savedAt))
      pl.gone = [pl.savedAt, playedIn(pl.save)];
    // Freeze season: their own choice for time away, whatever they came in
    // with this time (they may have changed it in Settings since). A game
    // from before the setting says nothing, and then the room keeps what it
    // knows: frozen, unless this player turned it on before. A copy plays the
    // copied player, so their own rule stands there too.
    if (!this.copy && awayProduce !== undefined) pl.awayProduce = awayProduce === true;
    // A new connection may stand anywhere its game remembers: its first step is free.
    this.watchOf(id, now).fresh = true;
    pl.st = 'online';
    pl.lostAt = 0;
    this.touch(now);
    this.dirty.players.add(id);
    this.acts.set(id, this.newAct(now, this.acts.get(id)));
    this.audit(now, id, 'join', {
      new: fresh,
      c: pl.c,
      ...(fresh ? { via: codeTag(pl.via) } : {}),
      at: pl.p ? [Math.round(pl.p.x), Math.round(pl.p.y), pl.p.z] : null,
      online: this.online()
    });
    return { id, welcome: this.welcome(id, now) };
  }

  // The invite links someone may see and stop (invites.js listFor).
  inviteList(id) {
    return Invites.listFor(this.invites, id);
  }

  // The world's clock at `now`: seconds of game time, the same for everyone.
  clock(now) {
    return Math.max(0, (now - this.dawn) / 1000);
  }

  welcome(id, now) {
    const others = {};
    for (const [pid, p] of this.players)
      if (pid !== id && !p.frozen) others[pid] = { c: p.c, st: p.st, p: p.p };
    const me = this.players.get(id);
    return {
      t: 'welcome',
      you: id,
      c: me.c,
      seed: this.seed,
      mods: [...this.mods],
      props: [...this.props],
      ext: this.ext,
      players: others,
      save: this.saveFor(id, me),
      p: me.p,
      time: this.clock(now),
      gen: this.gen,
      nuke: null,
      graves: this.graves,
      // The world format it plays by: a game on another one can't grow the
      // same land (src/game/together.js).
      fmt: this.fmt,
      // This room answers PING (worker.js) and acknowledges numbered edits
      // ('ack'): games only rely on either when the room says so.
      pong: true,
      ack: true,
      // The room keeps its own copy of your progress from what you did:
      // games send 'acts' (src/core/acts.js) when it says so.
      acts: true,
      // ...including moves ('v', a building moved): games offer Move in a
      // shared world only when it says so (src/core/actions.js moveExtractor).
      moves: true,
      collectAt: true, // targeted single-building collections (optional c coordinates)
      // ...and that copy is what you have: `save` is it, and 'econ' sets
      // your game straight when it's off (src/game/together.js).
      econ: true
    };
  }

  // Player `id`'s progress as the room has it: its copy, if it's working
  // one out (newer than the last one kept), else the one kept.
  saveFor(id, me) {
    if (!this.shadow?.has(id)) return me.save;
    let kept;
    try {
      kept = me.save && JSON.parse(me.save);
    } catch {
      kept = null;
    }
    return cleanSave(this.shadow.saveOf(id, kept)) || me.save;
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
    this.audit(now, id, 'leave', {
      clean,
      secs: act ? Math.round((now - act.since) / 1000) : null,
      at: p.p ? [Math.round(p.p.x), Math.round(p.p.y), p.p.z] : null
    });
    p.st = clean ? 'offline' : 'lost';
    p.lostAt = clean ? 0 : now;
    // Away from here (unless still away since an earlier leave): when, and
    // their play time then, for what their buildings make meanwhile (shadow.js away).
    if (!p.gone && p.save) p.gone = [now, this.shadow?.playedOf(id) ?? playedIn(p.save)];
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

  // Only a moderator's throwaway copy goes (copy.js): the world it copies is
  // untouched. Every other room, smoke tests included, is kept until
  // someone deletes it by hand (Watch, 2026-10-20: no automatic deleting).
  expired(now) {
    return !!this.copy && now >= this.copy.until;
  }

  // The moderator marks (or unmarks) the room as the deploy's smoke test,
  // which only keeps it out of the moderator's lists. Logged.
  markSmoke(smoke, now) {
    if (!this.ready) return 'room';
    this.smoke = smoke === true;
    this.audit(now, null, 'smoke', { smoke: this.smoke });
    this.dirty.meta = true;
    return null;
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
        if (pl) {
          pl.nm = (pl.nm || 0) + 1;
          this.dirty.players.add(by);
        }
      }
      this.mods.set(e[1], e[2]);
      this.dirty.buckets.add(bucketOf(e[1]));
      return true;
    }
    if (e[0] === 'p') {
      if (this.props.has(e[1]) || this.props.size >= LIMITS.props) return false;
      if (pl && (pl.np || 0) >= PLAYER_PROPS) return false;
      if (pl) {
        pl.np = (pl.np || 0) + 1;
        this.dirty.players.add(by);
      }
      this.props.set(e[1], e[2]);
      this.dirty.props = true;
      return true;
    }
    if (e[0] === 'v') {
      // Only your own building moves, and only onto a free tile.
      const from = extAt(e[1], e[2], e[3]),
        to = extAt(e[4], e[5], e[3]);
      const b = this.ext.find((x) => x[1] === e[1] && x[2] === e[2] && x[3] === e[3]);
      if (!b || b[4] !== by || (to !== from && this.extTiles.has(to))) return false;
      b[1] = e[4];
      b[2] = e[5];
      this.extTiles.delete(from);
      this.extTiles.add(to);
      this.dirty.ext = true;
      return true;
    }
    if (e[0] === 'x') {
      const at = extAt(e[2], e[3], e[4]);
      if (this.extTiles.has(at) || this.ext.length >= LIMITS.extractors) return false;
      if (pl && (pl.nx || 0) >= PLAYER_BUILDINGS) return false;
      if (pl) {
        pl.nx = (pl.nx || 0) + 1;
        this.dirty.players.add(by);
      }
      this.ext.push([e[1], e[2], e[3], e[4], by]);
      this.extTiles.add(at);
      this.dirty.ext = true;
      return true;
    }
    return false;
  }
}

// Room's methods by subject, each in its own file: what messages do
// (room-play.js), anti-cheat and moderation (room-watch.js) and the audit
// log (room-log.js). They are Room's own methods, as if written here.
for (const part of [RoomPlay, RoomWatch, RoomLog])
  for (const name of Object.getOwnPropertyNames(part.prototype))
    if (name !== 'constructor')
      Object.defineProperty(
        Room.prototype,
        name,
        Object.getOwnPropertyDescriptor(part.prototype, name)
      );
