/* The room's own copy of each player's progress, worked out from what they
 * did (src/core/acts.js) with the game's own rules (src/core/replay.js).
 *
 * Stage 1 of the server economy (/mnt/project-files/multiplayer/
 * server-economy-plan.md): the copy is a shadow. It decides nothing yet:
 * each time a player's game sends its progress, the room compares it with
 * its own copy, logs where they differ (audit 'drift'), and starts its copy
 * again from the game's. That shows whether the room and the game agree in
 * real play before the room's copy becomes the truth.
 *
 * The world it works in is the room's own (its mods and props), seen
 * through an overlay: what a replay changes stays in the overlay, since the
 * game's edits still change the room's world in this stage. */

import { joinState, blankState, createWorld, playFor, replayAct, advanceGoals, EXTRACTORS, RESOURCES } from '../../src/core/index.js';

const SLACK_MS = 2000;  // play time a game may be ahead of the room's clock (a late message)

// A map that reads through to `base` and keeps its own writes.
class Overlay {
  constructor(base) { this.base = base; this.own = new Map(); this.gone = new Set(); }
  get(k) { return this.own.has(k) ? this.own.get(k) : this.gone.has(k) ? undefined : this.base.get(k); }
  has(k) { return this.own.has(k) || (!this.gone.has(k) && this.base.has(k)); }
  set(k, v) { this.own.set(k, v); this.gone.delete(k); return this; }
  delete(k) { this.own.delete(k); this.gone.add(k); return true; }
}

export class Shadow {
  constructor(seed) {
    this.base = createWorld(seed); // its generated land, cached for every player
    this.players = new Map();      // id -> {s, at, checks, off, refused}
  }

  // A world to work in: the room's, with the room's edits under an overlay.
  view(room) {
    return { ...this.base, mods: new Overlay(room.mods), props: new Overlay(room.props), explored: new Map(), revealed: 0, holes: new Set(), edits: null };
  }

  // The player's progress as their game last sent it (null: nothing yet).
  start(id, save, room, now) {
    const make = () => blankState({ ...this.base, mods: new Map(), explored: new Map(), holes: new Set(), props: new Map() });
    const s = joinState({ save, seed: this.base.seed, mods: [], props: [], ext: room.ext, you: id }, room.id, null, null, make);
    if (!s) return null;
    s.world.edits = null;
    const old = this.players.get(id);
    // `acting`: their game sends what they do. A game from before that
    // doesn't, and there's nothing to compare its progress with.
    const sh = { s, at: now, checks: 0, off: 0, refused: 0, acting: false, ...(old ? { checks: old.checks, off: old.off, refused: old.refused, acting: old.acting } : {}) };
    this.players.set(id, sh);
    return sh;
  }

  forget(id) {
    this.players.delete(id);
  }

  // Brings player `id`'s copy up to play time `ms` (no further than the
  // room's clock allows) with acts `list` on the way. Returns how many the
  // rules refused.
  acts(id, ms, list, now, room) {
    // No copy yet: it starts from their progress as of when they came in.
    const sh = this.players.get(id) || this.start(id, room.players.get(id)?.save ?? null, room, room.acts.get(id)?.since ?? now);
    if (!sh) return 0;
    const s = sh.s;
    sh.acting = true;
    const limit = s.stats.playedMs + Math.max(0, now - sh.at) + SLACK_MS;
    sh.at = now;
    s.world = this.view(room);
    // The game's clock is the room's as it plays (keepTime in together.js),
    // and spent deposits grow back on its ticks: run the copy's clock so it
    // reads the room's time when it gets to `ms`, as the game's did.
    const to = Math.min(ms, limit);
    s.time = room.clock(now) - Math.max(0, to - s.stats.playedMs) / 1000;
    const pl = room.players.get(id);
    if (pl && pl.p) Object.assign(s.player, { x: pl.p.x, y: pl.p.y, z: pl.p.z });
    // Everyone's buildings stand in the way of new ones; only yours make things for you.
    const mine = s.extractors.filter((e) => e.owner === id);
    s.extractors = [...mine, ...room.ext.filter((e) => e[4] !== id && EXTRACTORS[e[0]])
      .map(([key, x, y, z, owner]) => ({ key, res: EXTRACTORS[key].res, x, y, z, buffer: 0, owner }))];
    let refused = 0;
    for (const a of list) {
      this.until(s, Math.min(a[1], limit));
      if (!replayAct(s, a)) refused++;
    }
    this.until(s, to);
    advanceGoals(s);
    s.extractors = s.extractors.filter((e) => e.owner === id);
    sh.refused += refused;
    return refused;
  }

  until(s, ms) {
    if (ms > s.stats.playedMs) playFor(s, (ms - s.stats.playedMs) / 1000);
  }

  // The game sent player `id`'s progress: how it differs from the room's
  // copy (null if it doesn't, or there's no copy yet), and the copy starts
  // again from it.
  check(id, save, now, room) {
    const sh = this.players.get(id);
    let theirs;
    try { theirs = JSON.parse(save); } catch { return null; }
    let drift = null;
    if (sh && sh.acting && theirs && typeof theirs === 'object') {
      this.acts(id, Number(theirs.stats?.playedMs) || 0, [], now, room);
      drift = differ(sh.s, theirs);
      sh.checks++;
      if (drift) sh.off++;
    }
    this.start(id, save, room, now);
    return drift;
  }

  // What the moderator sees per player: checks made, how many were off, acts refused.
  report(id) {
    const sh = this.players.get(id);
    return sh ? { checks: sh.checks, off: sh.off, refused: sh.refused } : null;
  }
}

// Where the game's progress (`theirs`, a parsed save) differs from the
// room's copy `s`: {res: [[resource, theirs, ours]], levels: [[what, theirs, ours]]},
// or null. Small differences in what's piling up (timing) don't count.
export function differ(s, theirs) {
  const res = [], levels = [];
  for (const r of RESOURCES) {
    const a = Number(theirs.inv?.[r]) || 0, b = s.inv[r];
    if (Math.abs(a - b) > Math.max(2, 0.02 * Math.max(Math.abs(a), Math.abs(b)))) res.push([r, round(a), round(b)]);
  }
  const same = (what, a, b) => { if ((a ?? 0) !== (b ?? 0)) levels.push([what, a ?? null, b ?? null]); };
  for (const k of Object.keys(s.tools)) same('tool.' + k, theirs.tools?.[k], s.tools[k]);
  for (const k of Object.keys(s.resUp)) same('refine.' + k, theirs.resUp?.[k], s.resUp[k]);
  for (const k of Object.keys(s.unlocks)) same('unlock.' + k, !!theirs.unlocks?.[k] || 0, s.unlocks[k] || 0);
  same('abundance', theirs.abundanceLv, s.abundanceLv);
  // The game checks milestones a few times a second, the room after every
  // act: only a game ahead of the room is off.
  const goals = Array.isArray(theirs.goalsDone) ? theirs.goalsDone.length : Number(theirs.goalIndex) || 0;
  if (goals > s.goalIndex) levels.push(['goals', goals, s.goalIndex]);
  return res.length || levels.length ? { res, levels } : null;
}

const round = (v) => Math.round(v * 100) / 100;
