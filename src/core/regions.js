/* Regions: the surface is split into big named places, each a few minutes'
 * walk across, the way RuneScape's world is a patchwork of areas you learn by
 * name and by ear. Each region has a kind of land (BIOMES) that shapes what
 * grows and stands there, a name, and its own music; between two regions runs
 * a border you can see: a river, a rocky ridge, a dry stone wall or a hedge,
 * with gaps to get through (all but rivers, which you swim).
 *
 * Regions are a pure function of (seed, x, y), like the terrain. Each lies
 * around a site: one per REGION_SIZE square, jittered, the home region's on
 * the origin. A tile belongs to the nearest site, measured in coordinates
 * bent by noise so borders wander instead of running straight. */

import { hash2, fbm, valueNoise } from './noise.js';
import { t } from '../i18n/i18n.js';

export const REGION_SIZE = 500;    // tiles: one region per square this wide, on average
const JITTER = 0.6;                // how far a site strays from its square's middle (share of the square)
const WARP = 90;                   // tiles: how far borders bend
const WARP_SCALE = 0.0045;
// Each kind of border: how many tiles across it is, and how much of its
// length is open (a pass through a ridge, a gap in a wall or hedge).
export const BORDERS = {
  river: { width: 3, open: 0 },
  ridge: { width: 3, open: 0.3 },
  wall: { width: 1.6, open: 0.22 },
  hedge: { width: 1.6, open: 0.22 }
};
const WIDEST = Math.max(...Object.values(BORDERS).map((b) => b.width));
const NEAR_BORDER = WIDEST * 3;   // closer than this, a border's width is measured in tiles

/* Kinds of land. `water` and `peaks` are the elevation cut-offs for lakes and
 * mountains (higher water, more lakes; lower peaks, more mountains); `forest`
 * and `lode` scale how much of the land is forest and mineral country (see
 * terrain.js); `music` is the track that plays there (game/music/score.js);
 * `names` how many names it has (region.<kind>.<n> in the i18n files);
 * `borders` the kinds of border it likes at its edges (see BORDERS). */
export const BIOMES = {
  meadow: { water: 0.28, peaks: 0.8, forest: 0.8, lode: 1, music: 'meadow', weight: 3, names: 10, borders: ['hedge', 'wall', 'river'] },
  woods: { water: 0.26, peaks: 0.82, forest: 3, lode: 0.5, music: 'forest', weight: 3, names: 10, borders: ['hedge', 'river'] },
  lakes: { water: 0.45, peaks: 0.84, forest: 1, lode: 0.7, music: 'water', weight: 2, names: 10, borders: ['river'] },
  highlands: { water: 0.2, peaks: 0.64, forest: 0.5, lode: 1.8, music: 'highlands', weight: 2, names: 10, borders: ['ridge', 'wall'] },
  fen: { water: 0.4, peaks: 0.88, forest: 1.8, lode: 0.3, music: 'fen', weight: 2, names: 10, borders: ['river', 'hedge'] },
  heath: { water: 0.22, peaks: 0.74, forest: 0.2, lode: 1.4, music: 'heath', weight: 2, names: 10, borders: ['wall', 'ridge'] }
};
export const BIOME_KEYS = Object.keys(BIOMES);
// The home region is always gentle meadow, so every world starts the same way.
const HOME_BIOME = 'meadow';

// The site of square (cx, cy): where its region is centred.
export function regionSite(seed, cx, cy) {
  if (cx === 0 && cy === 0) return { x: 0, y: 0 };
  const j = (salt) => (0.5 + (hash2(cx, cy, seed + salt) - 0.5) * JITTER) * REGION_SIZE;
  return { x: cx * REGION_SIZE - REGION_SIZE / 2 + j(811), y: cy * REGION_SIZE - REGION_SIZE / 2 + j(823) };
}

// Square (cx, cy) covers x from (cx - 0.5) * REGION_SIZE, so the home square is
// centred on the origin.
const square = (v) => Math.floor(v / REGION_SIZE + 0.5);

function pickBiome(seed, cx, cy) {
  if (cx === 0 && cy === 0) return HOME_BIOME;
  const total = BIOME_KEYS.reduce((n, k) => n + BIOMES[k].weight, 0);
  let h = hash2(cx, cy, seed + 839) * total;
  for (const k of BIOME_KEYS) if ((h -= BIOMES[k].weight) < 0) return k;
  return BIOME_KEYS[0];
}

/** The region of square (cx, cy): its key, kind of land, name and site. */
export function region(seed, cx, cy) {
  const biome = pickBiome(seed, cx, cy);
  // Names step along a lattice (cx + 3 cy), so no two regions within two
  // squares of each other share one; the seed picks where the steps start.
  const count = BIOMES[biome].names;
  const n = (((cx + 3 * cy + Math.floor(hash2(0, 0, seed + 853) * count)) % count) + count) % count;
  const site = regionSite(seed, cx, cy);
  return { key: cx + ',' + cy, cx, cy, biome, name: t(`region.${biome}.${n + 1}`), kind: t('biome.' + biome), x: site.x, y: site.y };
}

/**
 * Where (x, y) falls among the regions: the square of the region it's in,
 * the one nearest across the border, and how far it is from that border in
 * tiles.
 */
const warped = (seed, x, y) => ({
  x: x + (fbm(x * WARP_SCALE, y * WARP_SCALE, seed + 863, 3) - 0.5) * 2 * WARP,
  y: y + (fbm(x * WARP_SCALE + 40, y * WARP_SCALE - 70, seed + 877, 3) - 0.5) * 2 * WARP
});

export function regionPlace(seed, x, y) {
  const w = warped(seed, x, y);
  const qx = square(w.x), qy = square(w.y);
  let a = null, b = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const s = regionSite(seed, qx + dx, qy + dy);
      const d = (s.x - w.x) ** 2 + (s.y - w.y) ** 2;
      const c = { cx: qx + dx, cy: qy + dy, x: s.x, y: s.y, d };
      if (!a || d < a.d) { b = a; a = c; } else if (!b || d < b.d) b = c;
    }
  }
  // Distance to the line halfway between the two sites. The bending
  // stretches the land in places, so near a border it's measured back in
  // tiles: divided by how far one tile's step moves the bent point there.
  let edge = (b.d - a.d) / (2 * Math.hypot(b.x - a.x, b.y - a.y));
  if (edge < NEAR_BORDER) {
    const ex = warped(seed, x + 1, y), ey = warped(seed, x, y + 1);
    edge /= Math.max(1, Math.hypot(ex.x - w.x, ex.y - w.y), Math.hypot(ey.x - w.x, ey.y - w.y));
  }
  return { cx: a.cx, cy: a.cy, ox: b.cx, oy: b.cy, edge };
}

// What kind of border runs between squares a and b, picked from the kinds
// either side likes: the same seen from either side.
export function borderKind(seed, ax, ay, bx, by) {
  const [p, q] = ax < bx || (ax === bx && ay < by) ? [[ax, ay], [bx, by]] : [[bx, by], [ax, ay]];
  const kinds = [...new Set([...BIOMES[pickBiome(seed, p[0], p[1])].borders, ...BIOMES[pickBiome(seed, q[0], q[1])].borders])];
  return kinds[Math.floor(hash2(p[0] * 31 + q[0], p[1] * 31 + q[1], seed + 887) * kinds.length)];
}

/**
 * The land at (x, y), for the terrain: its kind of land, and the border tile
 * there if it's on one ('river', 'ridge', 'wall', 'hedge', or 'pass' for a gap
 * in one), else null.
 */
export function landAt(seed, x, y) {
  const p = regionPlace(seed, x, y);
  const biome = pickBiome(seed, p.cx, p.cy);
  let border = null;
  if (p.edge < WIDEST / 2) {
    const kind = borderKind(seed, p.cx, p.cy, p.ox, p.oy);
    const b = BORDERS[kind];
    if (p.edge < b.width / 2) border = valueNoise(x * 0.08, y * 0.08, seed + 893) < b.open ? 'pass' : kind;
  }
  return { biome, border, cx: p.cx, cy: p.cy };
}

/** The region the tile (x, y) is in. */
export function regionAt(seed, x, y) {
  const p = regionPlace(seed, x, y);
  return region(seed, p.cx, p.cy);
}
