/* Frozen path search for exact route/tie-break parity checks. */
/* Finding a way across a layer: the shortest route over tiles you can walk,
 * for the Perfect button's brain (perfect.js) and the tests' bot.
 *
 * A cheapest-first search inside a padded box around start and goal, so
 * a search never wanders off across the world. Water counts only once your
 * Boots take you onto it. Two options widen what counts as a step:
 *   known  only tiles you've explored (the brain never plans through fog)
 *   dig    underground rock you could dig counts too, at DIG_COST steps
 *          (the route then says which tiles need digging on the way) */

import { TILE_INFO } from '../../src/core/tiles.js';
import { tileAt, walkable, isExplored } from '../../src/core/world.js';
import { canWade, swimsAt } from '../../src/core/sim.js';
import { gearNeeded } from '../../src/core/actions.js';

const DIG_COST = 3; // a dug tile costs as much as this many steps: dig, then walk

// Whether tile (x, y) on the player's layer is rock you could dig through
// now (never bedrock, nor a shaft, which is only opened on purpose).
export function diggable(s, x, y) {
  const info = TILE_INFO[tileAt(s.world, x, y, s.player.z)];
  return !!(info.solid && info.harvest && info.sweep !== false && !gearNeeded(s, x, y));
}

/**
 * The route from tile (sx, sy) to tile (tx, ty) on the player's layer, as the
 * tiles to step onto in order (start left out, goal last), or null if there
 * is none inside the box. The goal itself may be any tile (a deposit, a wall
 * to dig into). With `dig`, each step says whether it must be dug first.
 * @returns {Array<{x: number, y: number, dig?: boolean}> | null}
 */
export function findPath(s, sx, sy, tx, ty, { pad = 10, known = false, dig = false } = {}) {
  const z = s.player.z, w = s.world, wade = canWade(s);
  const minX = Math.min(sx, tx) - pad, maxX = Math.max(sx, tx) + pad;
  const minY = Math.min(sy, ty) - pad, maxY = Math.max(sy, ty) + pad;
  const W = maxX - minX + 1;
  const at = (x, y) => (y - minY) * W + (x - minX);
  const cost = new Map([[at(sx, sy), 0]]);
  const prev = new Map();
  // Costs are whole steps, so a bucket per cost is a priority queue.
  const buckets = [[[sx, sy]]];
  for (let c = 0; c < buckets.length; c++) {
    const bucket = buckets[c];
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      const [cx, cy] = bucket[i];
      if (cost.get(at(cx, cy)) !== c) continue; // reached cheaper since
      if (cx === tx && cy === ty) return route(prev, at, sx, sy, tx, ty, s, dig);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < minX || ny < minY || nx > maxX || ny > maxY) continue;
        const goal = nx === tx && ny === ty;
        let step = 1;
        if (!goal) {
          if (known && !isExplored(w, nx, ny, z)) continue;
          if (walkable(w, nx, ny, z)) {
            if (!wade && swimsAt(w, nx, ny, z)) continue;
          } else if (dig && diggable(s, nx, ny)) step = DIG_COST;
          else continue;
        }
        const k = at(nx, ny), nc = c + step;
        if (cost.has(k) && cost.get(k) <= nc) continue;
        cost.set(k, nc);
        prev.set(k, [cx, cy]);
        (buckets[nc] || (buckets[nc] = [])).push([nx, ny]);
      }
    }
  }
  return null;
}

function route(prev, at, sx, sy, tx, ty, s, dig) {
  const out = [];
  for (let node = [tx, ty]; node && !(node[0] === sx && node[1] === sy); node = prev.get(at(node[0], node[1]))) {
    const p = { x: node[0], y: node[1] };
    if (dig) p.dig = !walkable(s.world, p.x, p.y, s.player.z);
    out.push(p);
  }
  return out.reverse();
}
