/* What a room writes in its audit log (room.js, audit.js): where players
 * are and what they did, their progress, and what the moderator sees.
 * Methods of Room, kept here by subject; `this` is the room. */

import { SAMPLE_MS, PROG_MS, digestOf, progressEvent, sameDigest, codeTag } from './audit.js';

export class RoomLog {
  /* -------------------------------------------------------- audit log */

  // Records one event (see audit.js); the Durable Object writes them out.
  audit(now, p, e, fields) {
    if (this.copy) return; // a copy logs nothing: it isn't anyone's play
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
    return {
      since: now,
      at: now,
      dist: 0,
      layers: 0,
      m: 0,
      p: 0,
      x: 0,
      no: 0,
      drops: 0,
      dg: old ? old.dg : null,
      dgAt: old ? old.dgAt : 0
    };
  }

  actOf(id, now) {
    let a = this.acts.get(id);
    if (!a) this.acts.set(id, (a = this.newAct(now)));
    return a;
  }

  // Where a player is and what they did since the last sample: every
  // SAMPLE_MS while they move, and when they leave (`force`). Positions
  // and the time between samples show where people spend their time and
  // where they get stuck.
  sample(id, now, force = false) {
    const a = this.acts.get(id),
      pl = this.players.get(id);
    if (!a || !pl || (!force && now - a.at < SAMPLE_MS)) return;
    const busy = a.dist >= 0.5 || a.layers || a.m || a.p || a.x || a.no || a.drops;
    if (busy || !force) {
      const p = pl.p;
      this.audit(now, id, 'at', {
        ...(p ? { x: Math.round(p.x), y: Math.round(p.y), z: p.z, act: p.a || null } : {}),
        secs: Math.round((now - a.at) / 1000),
        walked: Math.round(a.dist),
        layers: a.layers,
        dug: a.m,
        props: a.p,
        built: a.x,
        refused: a.no,
        drops: a.drops
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
      const w = this.watch.get(id),
        a = this.acts.get(id);
      out.push({
        id,
        c: p.c,
        st: p.st,
        at: p.p ? [Math.round(p.p.x), Math.round(p.p.y), p.p.z] : null,
        cheats: w ? w.cheats : 0,
        frozen: !!p.frozen,
        bot: !!p.bot,
        via: codeTag(p.via),
        sessionSecs:
          a && (p.st === 'online' || p.st === 'away') ? Math.round((now - a.since) / 1000) : null,
        progress: p.save ? digestOf(p.save) : null,
        shadow: this.shadow?.report(id) ?? null // the room's own copy: checks, how many were off, acts refused
      });
    }
    return out;
  }
}
