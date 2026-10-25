/* Finding a way across a layer: the shortest route over tiles you can walk,
 * for the Perfect button's brain (perfect.js) and the tests' bot.
 *
 * A cheapest-first search inside a padded box around start and goal, so
 * a search never wanders off across the world. Water counts only once your
 * Boots take you onto it. Two options widen what counts as a step:
 *   known  only tiles you've explored (the brain never plans through fog)
 *   dig    underground rock you could dig counts too, at DIG_COST steps
 *          (the route then says which tiles need digging on the way)
 *   fog    with known: on the surface, ground you haven't seen counts as
 *          walkable, so a tap into the fog heads that way without the
 *          route giving away what's there (it's planned again on sight)
 *
 * planWalk() and walkAim() walk a tap's route: around what's in the way,
 * cutting straight across where nothing is. */

import { TILE_INFO } from './tiles.js';
import { tileAt, walkable, isExplored } from './world.js';
import { canWade, swimsAt, clearLine } from './sim.js';
import { gearNeeded } from './actions.js';
import { packKey, SURFACE } from './coords.js';

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
export function findPath(s, sx, sy, tx, ty, { pad = 10, known = false, dig = false, unknownDig = false, fog = false, heuristic = true, work = null } = {}) {
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
          else if (!seen && fog) step = 1; // nor hidden ground: hoped walkable
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

/* ------------------------------------------------------------ walking */

const LOOK_AHEAD = 6; // route tiles ahead a walk looks to cut straight across to

// Whether the player could walk onto tile (x, y) of their layer, as far as
// they know: ground not yet seen counts, on the surface.
function passable(s, x, y) {
  const w = s.world, z = s.player.z;
  if (!isExplored(w, x, y, z)) return z === SURFACE;
  return walkable(w, x, y, z) && (canWade(s) || !swimsAt(w, x, y, z));
}

/**
 * A walk to tile (tx, ty) on the player's layer around whatever is in the
 * way, through what they've seen (and, on the surface, the fog), or null
 * when there's no way there. Walk it with walkAim().
 * @returns {{tx: number, ty: number, z: number, from: {x: number, y: number}, nodes: Array<{x: number, y: number}>, i: number} | null}
 */
export function planWalk(s, tx, ty) {
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  const opts = { known: true, fog: s.player.z === SURFACE };
  const nodes = findPath(s, px, py, tx, ty, { ...opts, pad: 16 }) || findPath(s, px, py, tx, ty, { ...opts, pad: 40 });
  return nodes ? { tx, ty, z: s.player.z, from: { x: px, y: py }, nodes, i: 0 } : null;
}

/**
 * Where to head next along walk `w`: the furthest of the next few tiles on
 * it in a clear straight line, so the walk goes round corners but straight
 * across open ground. 'done' once only the goal is left and it can't be
 * stood on (a deposit, a wall): you're beside it. Null when the way has
 * turned out blocked, or you're on another layer: plan it again.
 * @returns {{x: number, y: number} | 'done' | null}
 */
export function walkAim(s, w) {
  const p = s.player;
  if (p.z !== w.z) return null;
  const at = routePosition(w, Math.floor(p.x), Math.floor(p.y));
  if (at > w.i) w.i = at;
  const n = w.nodes.length;
  if (!n) return 'done'; // planned from the goal's own tile: already there
  const end = Math.min(n - 1, w.i + LOOK_AHEAD);
  for (let j = w.i; j <= end; j++) if (j < n - 1 && !passable(s, w.nodes[j].x, w.nodes[j].y)) return null;
  const goal = w.nodes[n - 1];
  const last = passable(s, goal.x, goal.y) ? n - 1 : n - 2;
  if (w.i > last) return 'done';
  for (let j = Math.min(end, last); j > w.i; j--) {
    const c = { x: w.nodes[j].x + 0.5, y: w.nodes[j].y + 0.5 };
    if (clearLine(s, p.x, p.y, c.x, c.y)) return c;
  }
  return { x: w.nodes[w.i].x + 0.5, y: w.nodes[w.i].y + 0.5 };
}
