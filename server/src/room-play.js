/* What a player's messages do in a shared world's room (room.js): moves,
 * progress, edits, and the buildings the room's copy of their play put up.
 * Methods of Room, kept here by subject; `this` is the room. */

import {
  LIMITS,
  parse,
  cleanPos,
  cleanEdits,
  cleanSave,
  editInReach,
  cleanInviteAsk,
  unpackKey,
  cleanActs
} from '../../src/net/protocol.js';
import { baseRichness } from '../../src/core/world.js';
import { Shadow } from './shadow.js';
import { codeTag, kindTag } from './audit.js';
import * as Invites from './invites.js';

export const FAR_MS = 2000; // everyone else hears where you are this often
export const STATUS_MS = 2000; // a player's away/back changes, at most this often (the game waits it out)
export const DRIFT_LOG_MS = 60_000; // a player's drift goes in the log at most this often

const ON_MESSAGE = Object.freeze({
  pos: 'onPos',
  edits: 'onEdits',
  save: 'onSave',
  acts: 'onActs',
  away: 'onAway',
  awayProduce: 'onAwayProduce',
  invite: 'onInvite',
  invites: 'onInvites',
  revoke: 'onRevoke',
  nuke: 'onNuke'
});

export class RoomPlay {
  /* -------------------------------------------------------- messages */

  // A message from player `id`. Returns {toOthers, toAll} messages to send,
  // or {drop: true} if it was malformed.
  message(id, raw, now, edits = null) {
    // Only your progress may be bigger than an ordinary message.
    const d = parse(raw, LIMITS.saveBytes + 1024);
    const pl = this.players.get(id);
    if (!d || !pl || (d.t !== 'save' && raw.length > LIMITS.messageBytes)) return { drop: true };
    const on = Object.hasOwn(ON_MESSAGE, d.t) && ON_MESSAGE[d.t];
    return on ? this[on]({ id, pl, d, now, edits }) : { drop: true };
  }

  onPos({ id, pl, d, now }) {
    const p = cleanPos(d.p);
    if (!p) return { drop: true };
    const step = this.canStep(id, pl, p, now);
    if (step === 'place') return { toSelf: [{ t: 'place', p: pl.p }] };
    if (step === 'wait') return {};
    if (step === 'far') {
      return this.cheat(id, now, 'speed', {
        from: pl.p && [Math.round(pl.p.x), Math.round(pl.p.y), pl.p.z],
        to: [Math.round(p.x), Math.round(p.y), p.z]
      });
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

  onEdits({ id, pl, d, now, edits }) {
    // Numbered edits are answered with their number once the room has
    // dealt with them (applied or not), so the game knows which never
    // arrived and sends those again after a lost connection.
    const out = this.editBatch(id, pl, d.e, now, edits);
    if (Number.isSafeInteger(d.n) && !out.drop && !out.kick) out.toSelf = [{ t: 'ack', n: d.n }];
    return out;
  }

  onSave({ id, pl, d, now }) {
    // Their game's progress is only compared: the room keeps its own.
    const save = cleanSave(d.s);
    if (!save) return { drop: true };
    const {
      drift,
      why,
      save: ours,
      ms,
      away
    } = this.shadowOf().settle(id, save, now, this, pl.gone, pl.awayProduce === true);
    const kept = ours && cleanSave(ours);
    if (!kept) return {};
    pl.save = kept;
    pl.savedAt = now;
    delete pl.gone;
    this.dirty.players.add(id);
    this.progress(id, kept, now);
    if (away) this.audit(now, id, 'away', { secs: away.secs });
    // What their buildings made while they were away: their game adds it
    // and says so ('away', src/game/together.js)...
    const said = away && { secs: away.secs, made: away.made };
    if (!drift) return said ? { toSelf: [{ t: 'away', ...said }] } : {};
    this.logDrift(id, drift, now);
    // ...unless their game is off: then it's told what they really have
    // (that included), as of the progress it sent, and why, if the room
    // refused something (shadow.js whyNot): the game tells the player.
    return {
      toSelf: [
        {
          t: 'econ',
          ms,
          s: kept,
          ...(Number.isSafeInteger(d.n) ? { n: d.n } : {}),
          ...(said ? { away: said } : {}),
          ...(why.length ? { why } : {})
        }
      ]
    };
  }

  onActs({ id, d, now }) {
    const list = cleanActs(d.a);
    if (!list || !Number.isSafeInteger(d.ms) || d.ms < 0) return { drop: true };
    const { made } = this.shadowOf().acts(id, d.ms, list, now, this);
    return this.made(id, made, now);
  }

  onAway({ id, pl, d, now }) {
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

  onAwayProduce({ pl, d }) {
    // Their freeze-season choice changed while playing (Settings). Off
    // is the default; nothing to tell anyone else, only what the room works
    // out for them (shadow.js away). A copy plays the copied player, so
    // their own rule stands there and the admin's own setting is ignored.
    if (!this.copy) pl.awayProduce = d.a === true;
    return {};
  }

  onInvite({ id, d, now }) {
    // Anyone in the world may hold up the QR, choosing how many people its
    // link lets in and for how long. It shows your newest link made that
    // way while that still has a while to go and room for someone, else a
    // new one.
    if (this.copy) return { toSelf: [{ t: 'invitesFull' }] }; // nobody else comes into a copy
    const ask = cleanInviteAsk(d);
    const { code, made, full } = Invites.linkFor(this.invites, id, ask, now);
    if (full) return { toSelf: [{ t: 'invitesFull' }] };
    if (made) {
      this.dirty.meta = true;
      this.audit(now, id, 'invite', { code: codeTag(code), uses: ask.uses, life: ask.life });
    }
    return { toSelf: [{ t: 'invite', code, until: this.invites.get(code).until }] };
  }

  onInvites({ id }) {
    return { toSelf: [this.inviteList(id)] };
  }

  onRevoke({ id, d, now }) {
    // Each player stops only the links they made; Watch stops any of them
    // through the admin route (modRevoke).
    const inv = typeof d.code === 'string' ? this.invites.get(d.code) : undefined;
    if (!inv || inv.by !== id) return { drop: true };
    if (!inv.off) {
      inv.off = true;
      this.dirty.meta = true;
      this.audit(now, id, 'revoke', { code: codeTag(d.code) });
    }
    return { toSelf: [this.inviteList(id)] };
  }

  // There is no nuke any more: an old game pressing it changes nothing.
  onNuke() {
    return {};
  }

  // A batch of edits from player `id` (see message).
  editBatch(id, pl, raw, now, edits) {
    const list = cleanEdits(raw);
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
      // Buildings and props come from the room's copy of what they did (made).
      if (e[0] !== 'm') continue;
      if (!editInReach(e, pl.p)) {
        if (pl.p) far = e;
        continue;
      }
      // Nothing grows back (src/core/sim.js), so a tile's richness only ever
      // goes down: an edit raising it is refused (an old game regrowing it,
      // or someone refilling a deposit).
      if (e[2] > this.richnessAt(e[1])) {
        act.no++;
        continue;
      }
      if (this.apply(e, id)) {
        applied.push(e);
        act.m++;
      } else act.no++;
    }
    this.touch(now);
    const out = applied.length ? { toAll: [{ t: 'edits', id, e: applied }] } : {};
    if (!far) return out;
    const t = far[0] === 'x' ? { x: far[2], y: far[3], z: far[4] } : unpackKey(far[1]);
    const frozen = this.cheat(id, now, 'reach', {
      kind: far[0],
      at: [t.x, t.y, t.z],
      from: [Math.round(pl.p.x), Math.round(pl.p.y), pl.p.z]
    });
    return frozen.kick ? frozen : out;
  }

  // Tile `key`'s richness in this world now: as edited, else as generated.
  richnessAt(key) {
    if (this.mods.has(key)) return this.mods.get(key);
    const t = unpackKey(key);
    return baseRichness(this.shadowOf().bare, t.x, t.y, t.z);
  }

  shadowOf() {
    return (this.shadow ||= new Shadow(this.seed, this.eco === 'crystal'));
  }

  // Buildings and props player `id` put up, as the room's copy of their
  // progress worked out (shadow.js): into the world, for everyone.
  // Moves ('v') go out in an edits message of their own: a game before
  // v0.169.0 drops an edits message holding a kind it doesn't know, and this
  // way drops only the moves. A move the world had no room for goes back to
  // the mover's game as a move back.
  made(id, list, now) {
    const applied = [],
      moved = [],
      back = [];
    const act = this.actOf(id, now);
    for (const e of list) {
      if (this.apply(e, id)) {
        if (e[0] === 'v') {
          moved.push(e);
          this.audit(now, id, 'move', { from: [e[1], e[2], e[3]], at: [e[4], e[5], e[3]] });
          continue;
        }
        applied.push(e[0] === 'x' ? [...e, id] : e);
        act[e[0]]++;
        if (e[0] === 'x')
          this.audit(now, id, 'build', { k: kindTag(e[1]), at: [e[2], e[3], e[4]] });
      } else {
        this.shadow?.unmake(id, e); // the world is full: not built after all
        if (e[0] === 'v') back.push(['v', e[4], e[5], e[3], e[1], e[2]]);
        act.no++;
      }
    }
    const toAll = [];
    if (applied.length) toAll.push({ t: 'edits', id, e: applied });
    if (moved.length) toAll.push({ t: 'edits', id, e: moved });
    const out = {};
    if (toAll.length) {
      this.touch(now);
      out.toAll = toAll;
    }
    if (back.length) out.toSelf = [{ t: 'edits', id, e: back }];
    return out;
  }

  // Where a player's game differs from the room's copy (shadow.js), in the
  // log at most every DRIFT_LOG_MS per player.
  logDrift(id, drift, now) {
    if (now - (this.driftAt.get(id) || 0) < DRIFT_LOG_MS) return;
    this.driftAt.set(id, now);
    this.audit(now, id, 'drift', { res: drift.res.slice(0, 8), levels: drift.levels.slice(0, 8) });
  }
}
