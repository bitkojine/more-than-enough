/* What the world map knows of each layer, without drawing anything: which
 * layers you've explored, what each tile shows as, and where the clouds'
 * edge is (for its puffs). Pure, so the tests can hold it. */

import * as Core from '../core/index.js';

const CS = Core.CHUNK_SIZE;
const { T } = Core;

// The ways between layers stay where you find them, not on the map: a cave
// mouth, the foot of a ladder, a shaft and an old dug hole show as the
// ground beside them.
const WAYS = new Set([T.CAVE, T.RISE, T.SHAFT, T.SHAFT_OPEN]);

// The layers the map can show, top first: every one you've explored any of,
// and the one you're on.
export function mapLayers(w, here = Core.SURFACE) {
  const zs = new Set([Core.SURFACE, here]);
  for (const key of w.explored.keys()) zs.add(Core.unpackKey(key).z);
  return [...zs].sort((a, b) => b - a);
}

// The layer next to z up (dir 1) or down (dir -1) among `layers`, or z.
export function stepLayer(layers, z, dir) {
  const i = layers.indexOf(z);
  if (i < 0)
    return layers.reduce((best, k) => (Math.abs(k - z) < Math.abs(best - z) ? k : best), layers[0]);
  return layers[Math.min(layers.length - 1, Math.max(0, i - dir))];
}

function isWay(w, x, y, z) {
  return WAYS.has(Core.tileAt(w, x, y, z)) || Core.holeBelow(w, x, y, z) || Core.wayUp(w, x, y, z);
}

// The type tile (x, y, z) shows as on the map: its own, or for a way
// between layers the ground beside it.
export function shownType(w, x, y, z) {
  if (!isWay(w, x, y, z)) return Core.tileAt(w, x, y, z);
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ]) {
    if (!isWay(w, x + dx, y + dy, z)) return Core.tileAt(w, x + dx, y + dy, z);
  }
  return z < Core.SURFACE ? T.TUNNEL : T.GRASS;
}

// The tiles of chunk (cx, cy, z) on the clouds' edge, as the view finds
// them: unexplored, beside one you've explored. Flat [x, y, x, y, ...].
export function edgeTiles(w, cx, cy, z) {
  const out = [];
  const fog = (x, y) => !Core.isExplored(w, x, y, z);
  for (let y = cy * CS; y < (cy + 1) * CS; y++) {
    for (let x = cx * CS; x < (cx + 1) * CS; x++) {
      if (fog(x, y) && !(fog(x - 1, y) && fog(x + 1, y) && fog(x, y - 1) && fog(x, y + 1)))
        out.push(x, y);
    }
  }
  return out;
}

// One edge tile per step x step square, so zoomed far out the map draws a
// puff every few pixels rather than one per tile, thousands to a pixel.
export function sampleEdges(edges, step) {
  const seen = new Set(),
    out = [];
  for (const list of edges) {
    for (let i = 0; i < list.length; i += 2) {
      const key = Math.floor(list[i] / step) + ',' + Math.floor(list[i + 1] / step);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(list[i], list[i + 1]);
    }
  }
  return out;
}
