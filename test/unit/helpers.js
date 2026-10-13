/* Shared helpers for the unit tests: finding tiles and walking the player
 * through the real movement rules. */

import * as C from '../../src/core/index.js';

export { C };
export const T = C.T;

export function typeAt(s, x, y, z = s.player.z) {
  return C.tileAt(s.world, x, y, z);
}

export function richAt(s, x, y, z = s.player.z) {
  return C.richness(s.world, x, y, z);
}

// Nearest tile on the player's layer matching pred(s, x, y).
export function findNear(s, pred, maxR = 140) {
  return C.nearestTile(s.player.x, s.player.y, maxR, (x, y) => pred(s, x, y));
}

export function standOn(s, t) {
  s.player.x = t.x + 0.5;
  s.player.y = t.y + 0.5;
}

// Breadth-first path over walkable tiles inside a padded box around start and goal.
export function findPath(s, sx, sy, tx, ty, pad = 10) {
  const minX = Math.min(sx, tx) - pad, maxX = Math.max(sx, tx) + pad;
  const minY = Math.min(sy, ty) - pad, maxY = Math.max(sy, ty) + pad;
  const key = (x, y) => x + ',' + y;
  const prev = new Map([[key(sx, sy), null]]);
  const queue = [[sx, sy]];
  for (let head = 0; head < queue.length; head++) {
    const [cx, cy] = queue[head];
    if (cx === tx && cy === ty) break;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < minX || ny < minY || nx > maxX || ny > maxY || prev.has(key(nx, ny))) continue;
      if (!C.walkable(s.world, nx, ny, s.player.z)) continue;
      prev.set(key(nx, ny), [cx, cy]);
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const path = [];
  for (let node = [tx, ty]; node && !(node[0] === sx && node[1] === sy); node = prev.get(key(node[0], node[1]))) {
    path.push({ x: node[0], y: node[1] });
  }
  return path.reverse();
}

// Walks the path with real movement for up to `budget` seconds; returns time used.
export function walkPath(s, path, dt, budget) {
  let used = 0, i = 0;
  while (i < path.length && used < budget) {
    const wp = path[i];
    const dx = wp.x + 0.5 - s.player.x, dy = wp.y + 0.5 - s.player.y;
    if (Math.hypot(dx, dy) < 0.25) { i++; continue; }
    const moved = C.move(s, dx, dy, dt);
    C.revealAround(s);
    used += dt;
    if (!moved) break;
  }
  return used;
}

// Runs the simulation for `seconds` in 0.1 s steps.
export function run(s, seconds) {
  for (let t = 0; t < seconds * 10 - 1e-9; t++) C.step(s, 0.1);
}

export function lumberCamp(x, y, buffer = 0) {
  return { key: 'lumber', res: 'wood', x, y, z: C.SURFACE, buffer };
}

// Every world upgrade bought (tools, refineries, unlocks, Abundance to the
// embark level): a mastered world.
export function master(s) {
  for (const k in s.tools) s.tools[k] = C.TOOLS[k].levels.length;
  for (const k in s.resUp) s.resUp[k] = C.REFINERIES[k].levels.length;
  for (const k in s.unlocks) s.unlocks[k] = true;
  s.abundanceLv = C.EMBARK_ABUNDANCE;
  return s;
}

// The player moved to the nearest diggable ground outside home (home ground
// is sealed: no holes there), with the view revealed around them.
export function away(s) {
  const t = C.nearestTile(s.player.x, s.player.y, 60, (x, y) => !!C.TILE_INFO[C.tileAt(s.world, x, y, C.SURFACE)].dig);
  standOn(s, t);
  C.revealAround(s);
  return s;
}
