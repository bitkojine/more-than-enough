/* Travelling between layers. The mine lies directly beneath the forest, and
 * every way between layers is a hole you can see: going down from the forest
 * digs one at your feet, climbing up digs one through the ceiling, and opened
 * shafts lead deeper. Dropping into a hole that sits on another hole keeps
 * falling, so a dug column rides straight to its bottom. */

import { SURFACE, Z_MIN, tileDist2 } from './coords.js';
import { TILE_INFO, T } from './tiles.js';
import { tileAt, setRichness, holeBelow, digHole } from './world.js';
import { REACH } from './content.js';

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
export function canGoDown(s) {
  if (isUnderground(s)) return false;
  const { x, y } = feet(s);
  return holeBelow(s.world, x, y, SURFACE) || !!TILE_INFO[tileAt(s.world, x, y, SURFACE)].dig;
}

export function goDown(s) {
  if (!canGoDown(s)) return false;
  const { x, y } = feet(s);
  digHole(s.world, x, y, SURFACE);
  fall(s, x, y);
  return true;
}

// Climb to the layer above, through the hole you came down or a new one dug
// through the ceiling. Bedrock can't be dug, and you can't surface inside a
// mountain.
export function canGoUp(s) {
  if (!isUnderground(s)) return false;
  const { x, y } = feet(s);
  const z = s.player.z + 1;
  if (holeBelow(s.world, x, y, z)) return true;
  const above = tileAt(s.world, x, y, z);
  return z === SURFACE ? !!TILE_INFO[above].walk : above !== T.BEDROCK;
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
