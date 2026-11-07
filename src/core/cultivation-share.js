/* Tending and harvesting someone else's crystal in a crystal room (0.200.0,
 * Watch, 2026-11-05: "crystal is fully shared"). Each player's crystal stays
 * in their own progress, so a job at someone else's building goes three
 * ways, each written down as an act at the same point in a player's play as
 * in the room's copy of them, so the two never disagree:
 *
 *   1. you ask: crystal command 'tend' or 'collect' at their building ('k',
 *      result 'asked'); you pay for a tend there and then;
 *   2. the owner takes it: the room tells their game ('take'), which does it
 *      to its own building and writes it down ('t'); the room's copy of them
 *      does the same at the same point;
 *   3. you get what came of it: the room tells your game ('given'), which
 *      takes it in and writes it down ('g'): the crystal collected, or a
 *      tend's cost back when it couldn't be done.
 *
 * An owner who isn't there takes it at once in the room's copy, and someone
 * who asked and isn't there gets it the same way: their next welcome has it.
 * Nothing is ever taken twice: a job is done to the building as it is when
 * the owner takes it, and what came of it is what you get. */

import { CULTIVATION_RECIPES, COOL } from './cultivation-model.js';
import {
  qualityMean,
  exposeCargo,
  earnCultivation as earned,
  forgetCultivationIndex,
  askShared
} from './cultivation.js';
import { noteAct } from './acts.js';
import { TILE_INFO } from './tiles.js';
import { tileAt } from './world.js';
import { packKey } from './coords.js';
import { theirsAt, SHARED_JOBS } from './cultivation-theirs.js';
import { seatAt } from './cultivation-seats.js';

export { SHARED_JOBS, askShared };

// The asks made since last taken, taken (the room's copy of a player).
export function takeAsked(s) {
  const out = s.asked || [];
  s.asked = [];
  return out;
}

// Does job `req` ({type, x, y, z}) to your own building there, as it is
// now. Returns what came of it: {ok, n, q} (n crystal of quality q).
export function doShared(s, req) {
  const b = s.cultivation?.facilities.find((f) => f.x === req.x && f.y === req.y && f.z === req.z);
  if (!b || !SHARED_JOBS[req.type]?.includes(b.kind)) return { ok: false, n: 0, q: 0 };
  if (req.type === 'tend') {
    if (!b.health || b.temperature > COOL) return { ok: false, n: 0, q: 0 };
    b.needsTend = false;
    return { ok: true, n: 0, q: 0 };
  }
  if (req.type === 'move') {
    if (!freeFor(s, req.tx, req.ty, b.z)) return { ok: false, n: 0, q: 0 };
    b.x = req.tx;
    b.y = req.ty;
    forgetCultivationIndex(s.cultivation);
    return { ok: true, n: 0, q: 0 };
  }
  const n = Math.floor(b.buffer || 0);
  if (n < 1) return { ok: false, n: 0, q: 0 };
  b.buffer -= n;
  return { ok: true, n, q: b.quality ?? 100 };
}

// Takes in what came of your ask `req` ({type}) at play time now: the
// crystal collected, or a tend's cost back when it couldn't be done.
export function gotShared(s, req, got) {
  if (req.type === 'tend') {
    if (!got.ok) for (const [r, n] of Object.entries(CULTIVATION_RECIPES.tend)) earned(s, r, n);
    return;
  }
  if (req.type === 'move' || !got.ok || !(got.n > 0) || !s.cultivation) return;
  const c = s.cultivation;
  c.quality = s.inv.crystal ? qualityMean(c.quality, s.inv.crystal, got.q, got.n) : got.q;
  earned(s, 'crystal', got.n);
  exposeCargo(s);
}

/* ------------------------------------------- the game's side of it */

// The owner's game: the room says someone wants `req` done ('take', number
// `n`): done, and written down ('t') for the room's copy to do the same.
export function takeShared(s, n, req) {
  noteAct(s, 't', n);
  return doShared(s, req);
}

// Your game: what came of your ask number `n` ('given'): taken in, and
// written down ('g') for the room's copy to take in the same.
export function receiveShared(s, n, req, got) {
  noteAct(s, 'g', n);
  gotShared(s, req, got);
}

// A job's message parts, checked: {type, x, y, z, tx?, ty?}, or null.
export function cleanJob(d) {
  if (!d || !Object.hasOwn(SHARED_JOBS, d.k)) return null;
  if (![d.x, d.y, d.z].every(Number.isSafeInteger)) return null;
  const job = { type: d.k, x: d.x, y: d.y, z: d.z };
  if (d.k !== 'move') return job;
  return [d.tx, d.ty].every(Number.isSafeInteger) ? { ...job, tx: d.tx, ty: d.ty } : null;
}

// Whether the owner's building may stand on tile (x, y, z) of their world as
// it is: open ground nothing else stands on (facilitySite's tile checks; the
// owner needn't have seen it, or stand there).
function freeFor(s, x, y, z) {
  const info = TILE_INFO[tileAt(s.world, x, y, z)];
  if (!info?.walk || info.rise || info.descend) return false;
  const c = s.cultivation;
  if (c.facilities.some((f) => f.x === x && f.y === y && f.z === z)) return false;
  if (s.extractors.some((e) => e.x === x && e.y === y && e.z === z)) return false;
  if (s.world.props.has(packKey(x, y, z))) return false;
  return !theirsAt(s, x, y, z) && !(s.shared && seatAt(s.world, x, y, z));
}
// What came of one, checked: {ok, n, q}, or null.
export function cleanGot(d) {
  if (!d || typeof d.ok !== 'boolean') return null;
  if (!Number.isSafeInteger(d.c) || d.c < 0 || d.c > 1e6) return null;
  if (!Number.isFinite(d.q) || d.q < 0 || d.q > 100) return null;
  return { ok: d.ok, n: d.c, q: d.q };
}
