/* Travelling between layers. The mine lies directly beneath the forest: you
 * arrive below where you stood, dig tunnels through solid rock, and drop down
 * an opened shaft to reach the layer under it. */

import { SURFACE, Z_MIN, tileDist2 } from './coords.js';
import { TILE_INFO } from './tiles.js';
import { tileAt, setRichness } from './world.js';
import { REACH } from './content.js';

export function isUnderground(s) {
  return s.player.z < SURFACE;
}

// Clears the tile at the player's feet and centres them on it, so a fresh
// arrival always has room to stand.
function arriveAt(s, x, y, z) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!TILE_INFO[tileAt(s.world, tx, ty, z)].walk) setRichness(s.world, tx, ty, z, 0);
  s.player.x = tx + 0.5;
  s.player.y = ty + 0.5;
  s.player.z = z;
}

// Rides down to the deepest layer reached so far, directly beneath the player.
export function enterMine(s) {
  if (isUnderground(s)) return false;
  s.underground.entry = { x: s.player.x, y: s.player.y };
  arriveAt(s, s.player.x, s.player.y, s.underground.deepest);
  return true;
}

// Rides back up to the forest spot the player entered from.
export function leaveMine(s) {
  if (!isUnderground(s)) return false;
  const entry = s.underground.entry || { x: s.player.x, y: s.player.y };
  s.player.x = entry.x;
  s.player.y = entry.y;
  s.player.z = SURFACE;
  s.underground.entry = null;
  return true;
}

// An opened shaft at (x, y) on the player's layer, within reach.
export function canDescendAt(s, x, y) {
  const p = s.player;
  return isUnderground(s) && p.z > Z_MIN &&
    !!TILE_INFO[tileAt(s.world, x, y, p.z)].descend &&
    tileDist2(p, x, y, p.z) <= REACH * REACH;
}

// Drops through the shaft at (x, y) to the same spot one layer down.
export function descendAt(s, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (!canDescendAt(s, x, y)) return false;
  const z = s.player.z - 1;
  arriveAt(s, x, y, z);
  s.underground.deepest = Math.min(s.underground.deepest, z);
  return true;
}
