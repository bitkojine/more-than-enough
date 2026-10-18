/* Travelling between layers. The mine lies directly beneath the forest, and
 * you can't dig your way up or down: every way between layers is generated
 * with the world (see terrain.js), and you find them by exploring. A cave
 * mouth in the forest or a shaft in the mine is a way down; beneath each one,
 * a ladder leads back up to it. Dropping into a hole that sits on another
 * hole keeps falling, so a column rides straight to its bottom.
 * goDown()/goUp() take the way where you stand; descendAt()/climbAt() take
 * one within reach. */

import { SURFACE, Z_MIN, tileDist2, packKey, chunkCoord } from './coords.js';
import { TILE_INFO } from './tiles.js';
import { tileAt, setRichness, holeBelow, wayUp } from './world.js';
import { REACH, PROPS, GLINT_RANGE } from './content.js';
import { findsInChunk } from './terrain.js';
import { landAt } from './regions.js';
import { canAfford, pay } from './economy.js';
import { noteAct } from './acts.js';

export function isUnderground(s) {
  return s.player.z < SURFACE;
}

const feet = (s) => ({ x: Math.floor(s.player.x), y: Math.floor(s.player.y) });

// Clears the tile at the player's feet (a shaft not yet opened, say) and
// centres them on it, so a fresh arrival always has room to stand.
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

// From the forest: down the cave mouth you stand in.
export function canGoDown(s) {
  if (isUnderground(s)) return false;
  const { x, y } = feet(s);
  return holeBelow(s.world, x, y, SURFACE);
}

export function goDown(s) {
  if (!canGoDown(s)) return false;
  const { x, y } = feet(s);
  fall(s, x, y);
  return true;
}

// Underground: up the ladder you stand at the foot of.
export function canGoUp(s) {
  if (!isUnderground(s)) return false;
  const { x, y } = feet(s);
  return wayUp(s.world, x, y, s.player.z);
}

export function goUp(s) {
  if (!canGoUp(s)) return false;
  const { x, y } = feet(s);
  arriveAt(s, x, y, s.player.z + 1);
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

// The foot of a ladder up at (x, y) on the player's layer, within reach.
export function canClimbAt(s, x, y) {
  const p = s.player;
  return wayUp(s.world, x, y, p.z) && !!TILE_INFO[tileAt(s.world, x, y, p.z)].walk && tileDist2(p, x, y, p.z) <= REACH * REACH;
}

// Climbs the ladder at (x, y) to the same spot on the layer above.
export function climbAt(s, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (!canClimbAt(s, x, y)) return false;
  arriveAt(s, x, y, s.player.z + 1);
  return true;
}

/**
 * The way the layer button would take right now: the nearest way down or up
 * within reach (the one you stand on first), or null when there's none, and
 * the button hides. Where one tile is a way both up and down (a column of
 * holes from an older version), the button goes up: a tap on it goes down.
 * @returns {{up: boolean, x: number, y: number} | null}
 */
export function layerWay(s) {
  const p = s.player, px = Math.floor(p.x), py = Math.floor(p.y);
  let best = null, bestD = Infinity;
  for (let y = py - 2; y <= py + 2; y++) {
    for (let x = px - 2; x <= px + 2; x++) {
      const d = x === px && y === py ? -1 : tileDist2(p, x, y, p.z);
      if (d >= bestD) continue;
      const up = canClimbAt(s, x, y);
      if (up || canDescendAt(s, x, y)) { best = { up, x, y }; bestD = d; }
    }
  }
  return best;
}

// The layer button: takes the way layerWay() finds. Returns true if you moved.
export function takeWay(s) {
  const way = layerWay(s);
  if (!way) return false;
  return way.up ? climbAt(s, way.x, way.y) : descendAt(s, way.x, way.y);
}

/* ----------------------------------------------------------------- props */

// Props (PROPS) go where you stand, one per tile: tunnel props on open mine
// floor, never on a way between layers; water power on the surface's water
// (a water wheel only on a river, whose water flows).
export function canPlaceProp(s, kind) {
  if (!Object.hasOwn(PROPS, kind)) return false;
  const { x, y } = feet(s), z = s.player.z, w = s.world, on = PROPS[kind].on;
  if (w.props.has(packKey(x, y, z))) return false;
  if (on === 'tunnel') return isUnderground(s) && !!TILE_INFO[tileAt(w, x, y, z)].walk && !holeBelow(w, x, y, z) && !wayUp(w, x, y, z);
  if (z !== SURFACE || !TILE_INFO[tileAt(w, x, y, z)].swim) return false;
  return on === 'water' || landAt(w.seed, x, y).border === 'river';
}

/** @returns {{ok: true, x: number, y: number} | {ok: false}} */
export function placeProp(s, kind) {
  if (!canPlaceProp(s, kind) || !canAfford(s.inv, PROPS[kind].cost)) return { ok: false };
  noteAct(s, 'p', kind);
  pay(s.inv, PROPS[kind].cost);
  const { x, y } = feet(s);
  const key = packKey(x, y, s.player.z);
  s.world.props.set(key, kind);
  if (s.world.edits) s.world.edits.push(['p', key, kind]);
  return { ok: true, x, y };
}

/* ----------------------------------------------------------------- finds */

// Finds still in the rock within GLINT_RANGE of the player, on their layer,
// explored or not: they glint in the dark so there's always something close
// to dig toward. Returns [{x, y, type, d}], d the distance in tiles.
export function findsNear(s, range = GLINT_RANGE) {
  if (!isUnderground(s)) return [];
  const p = s.player, out = [];
  const c0x = chunkCoord(Math.floor(p.x - range)), c1x = chunkCoord(Math.floor(p.x + range));
  const c0y = chunkCoord(Math.floor(p.y - range)), c1y = chunkCoord(Math.floor(p.y + range));
  for (let cy = c0y; cy <= c1y; cy++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      for (const f of findsInChunk(s.world.seed, cx, cy, p.z)) {
        const d = Math.sqrt(tileDist2(p, f.x, f.y, p.z));
        if (d <= range && tileAt(s.world, f.x, f.y, p.z) === f.type) out.push({ ...f, d });
      }
    }
  }
  return out;
}
