/* The room's own copy of each player's progress, worked out from what they
 * did (src/core/acts.js) with the game's own rules (src/core/replay.js).
 *
 * This copy is the truth (stage 2 of /mnt/project-files/multiplayer/
 * server-economy-plan.md). What a player has is what follows from what they
 * did, checked here: where they stood (no faster than anyone can move), how
 * often they worked a tile (no faster than the game lets them), and how much
 * play time has passed (no more than on the room's clock). The progress a
 * game sends is only compared: where it differs, the game is sent the room's
 * numbers (room.js, 'econ'), and the room keeps its own.
 *
 * The world it works in is the room's own (its mods and props), seen
 * through an overlay. Buildings and props it puts up go to the room's world
 * from here (room.js), not from the game's edits; gathering's changes to the
 * land still come from the game's edits. */

import { joinState, blankState, createWorld, playFor, replayAct, advanceGoals, progressOf, produceAway, canAfford, extractorCost, EXTRACTORS, RESOURCES, AWAY_CAP } from '../../src/core/index.js';

const SLACK_MS = 2000;     // play time a game may be ahead of the room's clock (a late message)
// Gathering by hand: holding Gather works a tile every 0.25 s (the game's
// GATHER_COOLDOWN), but one Trail stroke works every tile it crosses at once.
// So a budget: HAND_BURST tiles at once, HAND_RATE a second after that.
const HAND_BURST = 40;
const HAND_RATE = 24;
const STRIDE = 40;         // tiles a second anyone may cover between acts (room.js MAX_SPEED)
const STRIDE_SLACK = 4;    // tiles: rounding, a boat's drift

// A map that reads through to `base` and keeps its own writes.
class Overlay {
  constructor(base) { this.base = base; this.own = new Map(); this.gone = new Set(); }
  get(k) { return this.own.has(k) ? this.own.get(k) : this.gone.has(k) ? undefined : this.base.get(k); }
  has(k) { return this.own.has(k) || (!this.gone.has(k) && this.base.has(k)); }
  set(k, v) { this.own.set(k, v); this.gone.delete(k); return this; }
  delete(k) { this.own.delete(k); this.gone.add(k); return true; }
}

const spot = (e) => e.x + ',' + e.y + ',' + e.z;

export class Shadow {
  constructor(seed) {
    this.base = createWorld(seed); // its generated land, cached for every player
    this.players = new Map();      // id -> {s, at, hand, last, checks, off, refused, why}
    this.bare = { ...this.base, mods: new Map(), explored: new Map(), holes: new Set(), props: new Map() };
  }

  // A world to work in: the room's, with the room's edits under an overlay.
  view(room) {
    return { ...this.base, mods: new Overlay(room.mods), props: new Overlay(room.props), explored: new Map(), revealed: 0, holes: new Set(), edits: null };
  }

  has(id) {
    return this.players.has(id);
  }

  // The player's copy, started from `save` (the room's own, or null: from
  // nothing) as of time `at`.
  start(id, save, room, at) {
    const make = () => blankState({ ...this.bare, mods: new Map(), explored: new Map(), holes: new Set(), props: new Map() });
    const s = joinState({ save, seed: this.base.seed, mods: [], props: [], ext: room.ext, you: id }, room.id, null, null, make);
    if (!s) return null;
    s.world.edits = null;
    const old = this.players.get(id);
    // Where they were last: where their progress says, or anywhere for the
    // first act of someone new (the game puts them by a friend).
    const last = save ? { x: s.player.x, y: s.player.y, z: s.player.z, ms: s.stats.playedMs } : null;
    const sh = { s, at, hand: { n: HAND_BURST, ms: s.stats.playedMs }, last, checks: 0, off: 0, refused: 0, why: new Set(), ...(old ? { checks: old.checks, off: old.off, refused: old.refused } : {}) };
    this.players.set(id, sh);
    return sh;
  }

  // The copy of player `id`, started from what the room kept if there's none.
  of(id, room, now) {
    const pl = room.players.get(id);
    return this.players.get(id) || this.start(id, pl?.save ?? null, room, pl?.savedAt ?? room.acts.get(id)?.since ?? now);
  }

  forget(id) {
    this.players.delete(id);
  }

  // Brings player `id`'s copy up to play time `ms` (no further than the
  // room's clock allows) with acts `list` on the way. Returns how many acts
  // were refused and the buildings and props put up ([edit], for the room's
  // world).
  acts(id, ms, list, now, room) {
    const sh = this.of(id, room, now);
    if (!sh) return { refused: list.length, made: [] };
    const s = sh.s;
    const limit = s.stats.playedMs + Math.max(0, now - sh.at) + SLACK_MS;
    sh.at = now;
    s.world = this.view(room);
    // The game's clock is the room's as it plays (keepTime in together.js),
    // and day and night follow it: run the copy's clock so it reads the
    // room's time when it gets to `ms`, as the game's did.
    const to = Math.min(ms, limit);
    s.time = room.clock(now) - Math.max(0, to - s.stats.playedMs) / 1000;
    // Everyone's buildings stand in the way of new ones; only yours make things for you.
    const mine = s.extractors.filter((e) => e.owner === id);
    const had = new Set(mine.map(spot));
    s.extractors = [...mine, ...room.ext.filter((e) => e[4] !== id && EXTRACTORS[e[0]])
      .map(([key, x, y, z, owner]) => ({ key, res: EXTRACTORS[key].res, x, y, z, buffer: 0, owner }))];
    let refused = 0;
    for (const a of list) {
      if (!this.allowed(sh, a, limit)) { refused++; sh.why.add('pace'); continue; }
      this.until(s, a[1]);
      sh.last = { x: a[2], y: a[3], z: a[4], ms: a[1] };
      if (!replayAct(s, a)) { refused++; sh.why.add(whyNot(s, a)); }
    }
    this.until(s, to);
    advanceGoals(s);
    s.extractors = s.extractors.filter((e) => e.owner === id);
    for (const e of s.extractors) e.owner = id;
    const made = [
      ...s.extractors.filter((e) => !had.has(spot(e))).map((e) => ['x', e.key, e.x, e.y, e.z]),
      ...[...s.world.props.own].filter(([k]) => !room.props.has(k)).map(([k, kind]) => ['p', k, kind])
    ];
    sh.refused += refused;
    return { refused, made };
  }

  // Whether act `a` could have happened: in play-time order, no later than
  // the room's clock allows, no further from the last than anyone can go,
  // and gathering no faster than the game lets anyone.
  allowed(sh, a, limit) {
    const s = sh.s;
    if (a[1] < s.stats.playedMs - 1 || a[1] > limit) return false;
    if (a[0] === 'h') {
      const h = sh.hand;
      h.n = Math.min(HAND_BURST, h.n + Math.max(0, a[1] - h.ms) / 1000 * HAND_RATE);
      h.ms = Math.max(h.ms, a[1]);
      if (h.n < 1) return false;
      h.n--;
    }
    const l = sh.last;
    if (!l) return true;
    const secs = Math.max(0, a[1] - l.ms) / 1000;
    if (Math.hypot(a[2] - l.x, a[3] - l.y) > STRIDE * secs + STRIDE_SLACK) return false;
    return Math.abs(a[4] - l.z) <= 1 + Math.floor(secs);
  }

  // A building or prop the room's world had no room for: gone from the copy too.
  unmake(id, e) {
    const sh = this.players.get(id);
    if (!sh || e[0] !== 'x') return;
    sh.s.extractors = sh.s.extractors.filter((b) => !(b.x === e[2] && b.y === e[3] && b.z === e[4]));
    sh.why.add('full');
  }

  until(s, ms) {
    if (ms > s.stats.playedMs) playFor(s, (ms - s.stats.playedMs) / 1000);
  }

  // The game sent player `id`'s progress (`save`, checked by protocol.js).
  // Returns {drift: how it differs from the room's copy, or null; why: what
  // the room refused since the last check, for the player (whyNot); save: the
  // room's progress to keep, with the game's own bits (where they stand,
  // what they've seen); ms: the play time it's as of; away: what their
  // buildings made while they were away, or null}. `gone`: [when, play time]
  // they last left (room.js left), if this is their first progress since.
  settle(id, save, now, room, gone = null, awayProduce = false) {
    let theirs;
    try { theirs = JSON.parse(save); } catch { theirs = null; }
    if (!theirs || typeof theirs !== 'object') return { drift: null, save: null };
    const sh = this.of(id, room, now);
    if (!sh) return { drift: null, save: null };
    // Ore and crystal count as found once seen, which the game sees as the
    // player walks (src/core/sim.js revealAround), not only where they act:
    // the game's word is taken for that (it opens two milestones, nothing more).
    for (const k of ['ore', 'crystal']) if (theirs.discovered?.[k] === true) sh.s.discovered[k] = true;
    const ms = Math.round(Number(theirs.stats?.playedMs) || 0);
    this.acts(id, ms, [], now, room);
    const drift = differ(sh.s, theirs);
    sh.checks++;
    if (drift) sh.off++;
    const why = [...sh.why];
    sh.why.clear();
    // After what they sent is compared: their game hears of it separately.
    const away = gone ? this.away(sh.s, gone, now, awayProduce) : null;
    return { drift, why, save: this.saveOf(id, theirs), ms, away };
  }

  // Away time (stage 3): the wall time since they left that their play time
  // doesn't account for (a game playing on through a lost connection is not
  // away). Their buildings make what they would have meanwhile, capped like
  // a solo world's (src/core/sim.js produceAway) — but only if they opted in
  // (freeze season: `awayProduce`, their own Setting, told to the room when
  // they joined). Comes once their game has sent its progress, so its play
  // time is known: {secs, made} or null.
  away(s, [when, played], now, awayProduce = false) {
    const secs = (now - when) / 1000 - Math.max(0, s.stats.playedMs - played) / 1000;
    const made = produceAway(s, secs, awayProduce === true);
    if (!made || !RESOURCES.some((r) => made[r] > 0)) return null;
    return { secs: Math.round(Math.min(secs, AWAY_CAP)), made };
  }

  // When player `id`'s copy was last brought up to date (room time), if the room is working it out.
  atOf(id) {
    return this.players.get(id)?.at ?? null;
  }

  // Player `id`'s play time as of now, if the room is working out their copy.
  playedOf(id) {
    return this.players.get(id)?.s.stats.playedMs ?? null;
  }

  // The room's copy as a save (where they stand: their last act), with the
  // game's own bits from `theirs`.
  saveOf(id, theirs = null) {
    const sh = this.players.get(id);
    if (!sh) return null;
    // Progress leaves the world out: a bare one does (the overlay can't be listed).
    const world = sh.s.world;
    sh.s.world = this.bare;
    const ours = JSON.parse(progressOf(sh.s));
    sh.s.world = world;
    if (theirs) {
      for (const k of ['discovered', 'time']) if (theirs[k] !== undefined) ours[k] = theirs[k];
    }
    return JSON.stringify(ours);
  }

  // What the moderator sees per player: checks made, how many were off, acts refused.
  report(id) {
    const sh = this.players.get(id);
    return sh ? { checks: sh.checks, off: sh.off, refused: sh.refused } : null;
  }
}

// Why the rules refused act `a` on copy `s`, in a word the player's game
// explains (together.js, 'econ'): 'spot' (someone else built or worked
// there first), 'cost' (the room's count couldn't pay for it). Besides
// these, 'pace' is an act out of time order or further than anyone can go
// (allowed), and 'full' a building the world had no room for (unmake).
function whyNot(s, a) {
  if (a[0] === 'b' && EXTRACTORS[a[5]]) return canAfford(s.inv, extractorCost(s, a[5])) ? 'spot' : 'cost';
  return a[0] === 'u' || a[0] === 'p' ? 'cost' : 'spot';
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
  const mine = Array.isArray(theirs.extractors) ? theirs.extractors.length : 0;
  const ours = s.extractors.length;
  if (mine !== ours) levels.push(['buildings', mine, ours]);
  return res.length || levels.length ? { res, levels } : null;
}

const round = (v) => Math.round(v * 100) / 100;

// The play time progress `save` (JSON) is as of.
export function playedIn(save) {
  try { return Math.max(0, Number(JSON.parse(save).stats.playedMs) || 0); } catch { return 0; }
}
