/* Finding a way across a layer: the shortest route over tiles you can walk,
 * for the Perfect button's brain (perfect.js) and the tests' bot.
 *
 * A cheapest-first search inside a padded box around start and goal, so
 * a search never wanders off across the world. Water counts only once your
 * Boots take you onto it. Two options widen what counts as a step:
 *   known  only tiles you've explored (the brain never plans through fog)
 *   dig    underground rock you could dig counts too, at DIG_COST steps
 *          (the route then says which tiles need digging on the way) */

import { TILE_INFO } from './tiles.js';
import { tileAt, walkable, isExplored } from './world.js';
import { canWade, swimsAt } from './sim.js';
import { gearNeeded } from './actions.js';
import { packKey } from './coords.js';

const DIG_COST = 3; // a dug tile costs as much as this many steps: dig, then walk
const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

const routePositions = new WeakMap();

// Index immutable routes once. A walking decision need not rescan the whole
// route; last occurrence retains the original reverse-scan rule.
export function routePosition(r, x, y) {
  let cached = routePositions.get(r);
  if (!cached || cached.nodes !== r.nodes || cached.length !== r.nodes.length) {
    const positions = new Map([[packKey(r.from.x, r.from.y, r.z), 0]]);
    for (let i = 0; i < r.nodes.length; i++) positions.set(packKey(r.nodes[i].x, r.nodes[i].y, r.z), i + 1);
    cached = { nodes: r.nodes, length: r.nodes.length, positions }; routePositions.set(r, cached);
  }
  return cached.positions.get(packKey(x, y, r.z)) ?? -1;
}

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
export function findPath(s, sx, sy, tx, ty, { pad = 10, known = false, dig = false, unknownDig = false, heuristic = true, work = null } = {}) {
  const z = s.player.z, w = s.world, wade = canWade(s);
  const minX = Math.min(sx, tx) - pad, maxX = Math.max(sx, tx) + pad;
  const minY = Math.min(sy, ty) - pad, maxY = Math.max(sy, ty) + pad;
  const W = maxX - minX + 1;
  const at = (x, y) => (y - minY) * W + (x - minX);
  const cost = new Map([[at(sx, sy), 0]]);
  const prev = new Map();
  // Manhattan distance is an admissible, consistent integer lower bound.
  // Integer A* buckets avoid heap/logarithmic overhead. LIFO ties follow a
  // promising route through an equal-priority open area instead of flooding
  // its entire rectangle. The compatibility mode retains original FIFO ties.
  const estimate = (x, y) => heuristic ? Math.abs(tx - x) + Math.abs(ty - y) : 0;
  const first = estimate(sx, sy), buckets = [];
  buckets[first] = [[sx, sy, 0]];
  if (work) work.queued = (work.queued || 0) + 1;
  for (let priority = first; priority < buckets.length; priority++) {
    const bucket = buckets[priority];
    if (!bucket) continue;
    for (let i = 0; heuristic ? bucket.length > 0 : i < bucket.length; i++) {
      const [cx, cy, c] = heuristic ? bucket.pop() : bucket[i];
      if (cost.get(at(cx, cy)) !== c) continue; // reached cheaper since
      if (work) work.expanded = (work.expanded || 0) + 1;
      if (cx === tx && cy === ty) return route(prev, at, sx, sy, tx, ty, s, dig, unknownDig);
      for (let direction = 0; direction < 4; direction++) {
        const d = heuristic ? 3 - direction : direction;
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx < minX || ny < minY || nx > maxX || ny > maxY) continue;
        const k = at(nx, ny), old = cost.get(k);
        // Every edge costs at least one. A cheaper known route lets us
        // reject this edge before querying terrain, fog or digging gear.
        if (old !== undefined && old <= c + 1) continue;
        const goal = nx === tx && ny === ty;
        let step = 1;
        if (!goal) {
          const seen = !known && !unknownDig || isExplored(w, nx, ny, z);
          if (!seen && unknownDig && dig) step = DIG_COST; // belief, never inspect hidden rock
          else if (!seen) continue;
          else if (walkable(w, nx, ny, z)) {
            if (!wade && swimsAt(w, nx, ny, z)) continue;
          } else if (dig && diggable(s, nx, ny)) step = DIG_COST;
          else continue;
        }
        const nc = c + step;
        if (old !== undefined && old <= nc) continue;
        cost.set(k, nc);
        prev.set(k, [cx, cy]);
        const nextPriority = nc + estimate(nx, ny);
        (buckets[nextPriority] || (buckets[nextPriority] = [])).push([nx, ny, nc]);
        if (work) work.queued = (work.queued || 0) + 1;
      }
    }
  }
  return null;
}

function route(prev, at, sx, sy, tx, ty, s, dig, unknownDig) {
  const out = [];
  for (let node = [tx, ty]; node && !(node[0] === sx && node[1] === sy); node = prev.get(at(node[0], node[1]))) {
    const p = { x: node[0], y: node[1] };
    if (dig) p.dig = unknownDig && !isExplored(s.world, p.x, p.y, s.player.z) || !walkable(s.world, p.x, p.y, s.player.z);
    out.push(p);
  }
  return out.reverse();
}
