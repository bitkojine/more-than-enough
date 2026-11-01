/* The Perfect brain walking (perfect.js): a step along a route to a tile,
 * marking what turns out out of reach, and exploring outward from home when
 * nothing known is worth going for. */

import { SURFACE } from './coords.js';
import { isExplored, nearestTile, nearestExploredTile, walkable } from './world.js';
import { canHarvest } from './actions.js';
import { canWade, swimsAt } from './sim.js';
import { findPath, routePosition } from './paths.js';
import { SEARCH, STUCK, key } from './perfect-util.js';

// A step toward tile (tx, ty) on this layer, along a route through what
// you've seen (underground, through rock you can dig). Null once you're on
// it, or when there's no way there (then it's remembered as out of reach).
export function walkTo(s, mind, tx, ty, badge, retried = false) {
  const z = s.player.z,
    px = Math.floor(s.player.x),
    py = Math.floor(s.player.y);
  if (px === tx && py === ty) return null;
  let r = mind.route;
  const i = r && r.tx === tx && r.ty === ty && r.z === z ? routePosition(r, px, py) : -1;
  if (i < 0) {
    const opts = { pad: 12, known: true, dig: z !== SURFACE, unknownDig: z !== SURFACE };
    // The long way round, and the very long way (out past where you've explored).
    const nodes =
      findPath(s, px, py, tx, ty, opts) ||
      findPath(s, px, py, tx, ty, { ...opts, pad: 40 }) ||
      findPath(s, px, py, tx, ty, { ...opts, pad: 120 });
    if (!nodes) {
      unreachable(s, mind, tx, ty);
      return null;
    }
    r = mind.route = { tx, ty, z, nodes, i: 0, from: { x: px, y: py }, last: -1, same: 0 };
  } else r.i = i;
  const next = r.nodes[r.i];
  if (!next) return null;
  const at = key(px, py, z);
  if (!mind.peek) {
    r.same = at === r.last ? r.same + 1 : 0;
    r.last = at;
  }
  if (r.same > STUCK) {
    unreachable(s, mind, tx, ty);
    return null;
  }
  // Walk toward an unknown frontier without looking through its rock. Moving
  // reveals it normally; a newly discovered obstacle triggers a fresh route.
  if (z !== SURFACE && !isExplored(s.world, next.x, next.y, z)) {
    return { type: 'walk', x: next.x, y: next.y, badge };
  }
  if (next.dig && !walkable(s.world, next.x, next.y, z)) {
    if (canHarvest(s, next.x, next.y))
      return { type: 'harvestAt', x: next.x, y: next.y, badge: 'tool.pickaxe' };
    mind.route = null;
    return !retried ? walkTo(s, mind, tx, ty, badge, true) : (unreachable(s, mind, tx, ty), null);
  }
  return { type: 'walk', x: next.x, y: next.y, badge };
}

export function unreachable(s, mind, x, y) {
  mind.bad.add(key(x, y, s.player.z));
  mind.route = null;
  mind.near = {};
  mind.frontier = null;
  const cave = mind.spots.cave && mind.spots.cave.tile;
  if (cave && cave.x === x && cave.y === y) delete mind.spots.cave;
}

// Somewhere new. On the surface, an edge of what you've seen, outward from
// home: a person exploring heads away from where they've been rather than
// filling in every corner near home. Underground, the nearest rock you
// haven't seen, dug toward.
// `beyond`: the search is for more of a resource, so past where buildings
// are looked for too (nothing grows back: near home runs out).
export function explore(s, mind, beyond = false) {
  const z = s.player.z;
  for (let tries = 0; tries < 3; tries++) {
    let f = mind.frontier;
    if (!f || f.z !== z || mind.bad.has(key(f.x, f.y, z))) {
      const tile =
        z === SURFACE
          ? outward(s, mind, beyond)
          : nearestTile(
              s.player.x,
              s.player.y,
              40,
              (x, y) => !isExplored(s.world, x, y, z) && !mind.bad.has(key(x, y, z))
            );
      if (!tile) return null;
      f = mind.frontier = { ...tile, z };
    }
    const step = walkTo(s, mind, f.x, f.y, 'ui.explore');
    if (step) return step;
    mind.frontier = null; // got there (or can't): the next edge
    if (z !== SURFACE) mind.bad.add(key(f.x, f.y, z));
  }
  return null;
}

const EDGE_LOOK = 24; // tiles around you an edge is looked for in

// The edge of what you've seen worth heading to: near you, far from home.
export function outward(s, mind, beyond) {
  const w = s.world,
    z = SURFACE,
    wade = canWade(s);
  const px = Math.floor(s.player.x),
    py = Math.floor(s.player.y),
    h = mind.home;
  const seen = (x, y) => isExplored(w, x, y, z);
  // Only as far out as buildings are looked for (further finds nothing to
  // use), unless it's more to gather that's wanted.
  const reach = beyond ? Infinity : SEARCH;
  const edge = (x, y) =>
    Math.hypot(x - h.x, y - h.y) < reach &&
    seen(x, y) &&
    !(seen(x + 1, y) && seen(x - 1, y) && seen(x, y + 1) && seen(x, y - 1)) &&
    walkable(w, x, y, z) &&
    (wade || !swimsAt(w, x, y, z)) &&
    !mind.bad.has(key(x, y, z));
  let best = null,
    bestScore = Infinity;
  for (let y = py - EDGE_LOOK; y <= py + EDGE_LOOK; y++) {
    for (let x = px - EDGE_LOOK; x <= px + EDGE_LOOK; x++) {
      if (!edge(x, y)) continue;
      const score = Math.hypot(x - px, y - py) - mind.k.outward * Math.hypot(x - h.x, y - h.y);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  // Nothing unseen close by: the nearest edge further off (much further when
  // it's more to gather that's wanted and all around has been seen).
  return best || nearestExploredTile(w, px + 0.5, py + 0.5, SURFACE, beyond ? 400 : 80, edge);
}
