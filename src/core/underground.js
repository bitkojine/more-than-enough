/* Travelling between layers. The mine lies directly beneath the forest, and
 * every way between layers is a hole you can see: going down from the forest
 * digs one at your feet, climbing up digs one through the ceiling, and opened
 * shafts lead deeper. Dropping into a hole that sits on another hole keeps
 * falling, so a dug column rides straight to its bottom.
 *
 * A new hole takes work: startDig() begins it, and digOn() keeps at it while
 * you stay on the spot, for holeTime() seconds (quicker with a better
 * Pickaxe). A hole that's already there is a way straight through.
 * goDown()/goUp() are the moment of breaking through. */

import { SURFACE, Z_MIN, tileDist2 } from './coords.js';
import { TILE_INFO, T } from './tiles.js';
import { tileAt, setRichness, holeBelow, digHole } from './world.js';
import { REACH } from './content.js';
import { extractorAt } from './actions.js';

export function isUnderground(s) {
  return s.player.z < SURFACE;
}

const feet = (s) => ({ x: Math.floor(s.player.x), y: Math.floor(s.player.y) });

// Clears the tile at the player's feet and centres them on it, so a fresh
// arrival always has room to stand.
function arriveAt(s, x, y, z) {
  if (z < SURFACE && !TILE_INFO[tileAt(s.world, x, y, z)].walk) setRichness(s.world, x, y, z, 0);
  s.player.x = x + 0.5;
  s.player.y = y + 0.5;
  s.player.z = z;
  s.underground.deepest = Math.min(s.underground.deepest, z);
}

// Drops through (x, y) and on through every hole already stacked beneath it.
// (Landing on a closed shaft opens it, but that is not a hole to fall through.)
function fall(s, x, y) {
  let further;
  do {
    const below = s.player.z - 1;
    further = below > Z_MIN && holeBelow(s.world, x, y, below);
    arriveAt(s, x, y, below);
  } while (further);
}

// From the forest: dig down where you stand (open ground, or an old hole).
// Never through water, and never under a building: a way between layers never
// shares a tile with one (see also buildableTile in actions.js).
export function canGoDown(s) {
  if (isUnderground(s)) return false;
  const { x, y } = feet(s);
  if (holeBelow(s.world, x, y, SURFACE)) return true;
  return !!TILE_INFO[tileAt(s.world, x, y, SURFACE)].dig && !extractorAt(s, x, y, SURFACE);
}

export function goDown(s) {
  if (!canGoDown(s)) return false;
  const { x, y } = feet(s);
  digHole(s.world, x, y, SURFACE);
  fall(s, x, y);
  return true;
}

// Climb to the layer above, through the hole you came down or a new one dug
// through the ceiling. Bedrock can't be dug, you can't surface inside a
// mountain or up into water, and never into a building.
export function canGoUp(s) {
  if (!isUnderground(s)) return false;
  const { x, y } = feet(s);
  const z = s.player.z + 1;
  if (holeBelow(s.world, x, y, z)) return true;
  if (extractorAt(s, x, y, z)) return false;
  const above = tileAt(s.world, x, y, z);
  return z === SURFACE ? !!TILE_INFO[above].dig : above !== T.BEDROCK;
}

export function goUp(s) {
  if (!canGoUp(s)) return false;
  const { x, y } = feet(s);
  const z = s.player.z + 1;
  digHole(s.world, x, y, z);
  arriveAt(s, x, y, z);
  return true;
}

// A hole at (x, y) in the player's floor, within reach.
export function canDescendAt(s, x, y) {
  const p = s.player;
  return p.z > Z_MIN && holeBelow(s.world, x, y, p.z) && tileDist2(p, x, y, p.z) <= REACH * REACH;
}

// Drops through the hole at (x, y) to the same spot below (and further, if
// more holes are stacked under it).
export function descendAt(s, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (!canDescendAt(s, x, y)) return false;
  fall(s, x, y);
  return true;
}

/* -------------------------------------------------------- digging a hole */

export const HOLE_TIME = 2.5; // seconds to dig a new hole with the first Pickaxe

// How long a new hole takes: HOLE_TIME, divided by the square root of the
// Pickaxe level (level 6 digs in about a second).
export function holeTime(s) {
  return HOLE_TIME / Math.sqrt(s.tools.pickaxe);
}

// Whether there's already a hole to go through where you stand.
function holeHere(s) {
  const { x, y } = feet(s);
  return holeBelow(s.world, x, y, isUnderground(s) ? s.player.z + 1 : SURFACE);
}

const canGo = (s) => (isUnderground(s) ? canGoUp(s) : canGoDown(s));

/**
 * The layer button: go through a hole that's there, or start digging one.
 * @returns {'moved' | 'digging' | null}  null when there's no way here
 */
export function startDig(s) {
  if (s.digging) return 'digging';
  if (!canGo(s)) return null;
  if (holeHere(s)) {
    if (isUnderground(s)) goUp(s); else goDown(s);
    return 'moved';
  }
  const { x, y } = feet(s);
  s.digging = { x, y, z: s.player.z, up: isUnderground(s), t: 0 };
  return 'digging';
}

/**
 * Keeps digging for dt seconds. Stepping off the spot (or anything that
 * makes the way impossible) stops it. Returns true when you break through.
 */
export function digOn(s, dt) {
  const d = s.digging;
  if (!d) return false;
  const { x, y } = feet(s);
  if (x !== d.x || y !== d.y || s.player.z !== d.z || !canGo(s)) {
    s.digging = null;
    return false;
  }
  d.t += dt;
  if (d.t < holeTime(s)) return false;
  s.digging = null;
  return d.up ? goUp(s) : goDown(s);
}

// How far the hole being dug is, 0..1 (0 when not digging).
export function digProgress(s) {
  return s.digging ? Math.min(1, s.digging.t / holeTime(s)) : 0;
}
