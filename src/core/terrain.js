/* Terrain generation: one chunk at a time, as a pure function of
 * (chunk x, chunk y, layer z, seed). Chunks can be generated in any order and
 * always agree. A chunk holds each tile's type and baseline richness; player
 * edits live in the world's `mods` map on top of this. */

import { CHUNK_SIZE, CHUNK_TILES, SURFACE } from './coords.js';
import { hash2, fbm } from './noise.js';
import { T } from './tiles.js';

const MAX_RICHNESS = 30;
// Every world starts in a round clearing of home ground at the origin, where
// your stockpile is kept (see stockpile.js).
export const HOME_RADIUS = 5.5;

export function generateChunk(seed, cx, cy, cz) {
  return cz === SURFACE ? generateSurface(seed, cx, cy) : generateUnderground(seed, cx, cy, cz);
}

function surfaceType(seed, x, y) {
  if (x * x + y * y <= HOME_RADIUS * HOME_RADIUS) return T.HOME;
  const elevation = fbm(x * 0.06, y * 0.06, seed + 11, 4);
  const moisture = fbm(x * 0.055, y * 0.055, seed + 23, 4);
  const rock = fbm(x * 0.075 + 17, y * 0.075 + 31, seed + 37, 3);
  const ore = fbm(x * 0.09 + 53, y * 0.09 + 71, seed + 53, 3);
  // Past the home clearing, the whole plane is equally random.
  if (elevation < 0.28) return T.WATER;
  if (elevation > 0.79) return T.ROCK;
  if (ore > 0.775) return T.CRYSTAL;
  if (ore > 0.675) return T.ORE;
  if (rock > 0.605) return T.STONE;
  if (moisture > 0.505) return T.FOREST;
  return T.GRASS;
}

// Starting richness for each surface deposit: base + random spread.
export const DEPOSIT = [];
DEPOSIT[T.FOREST] = { base: 5, spread: 9, salt: 101 };
DEPOSIT[T.STONE] = { base: 4, spread: 6, salt: 102 };
DEPOSIT[T.ORE] = { base: 3, spread: 6, salt: 103 };
DEPOSIT[T.CRYSTAL] = { base: 1, spread: 3, salt: 104 };

function generateSurface(seed, cx, cy) {
  const type = new Uint8Array(CHUNK_TILES);
  const rich = new Uint8Array(CHUNK_TILES);
  const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = ox + lx, y = oy + ly, i = ly * CHUNK_SIZE + lx;
      const t = surfaceType(seed, x, y);
      type[i] = t;
      const d = DEPOSIT[t];
      if (d) rich[i] = Math.max(1, Math.min(MAX_RICHNESS, Math.round(d.base + hash2(x, y, seed + d.salt) * d.spread)));
    }
  }
  return { type, rich };
}

// Geology below the forest. Each tile draws h in [0, 1) and takes the first
// band with h < below. A band only appears from layer `from` down (layer 1 is
// z = -1); above that its share is plain soil. Everything else is soil. Every
// underground tile starts solid with richness 1; digging it to zero clears it.
export const GEOLOGY = [
  { type: T.BEDROCK, below: 0.13, from: 1 },
  { type: T.STONE_SEAM, below: 0.27, from: 1 },
  { type: T.ORE_SEAM, below: 0.34, from: 1 },
  { type: T.CRYSTAL_SEAM, below: 0.37, from: 3 },
  { type: T.FOSSIL, below: 0.43, from: 4 }
];

function undergroundType(seed, x, y, layer) {
  const depth = layer - 1;
  const h = hash2(x + depth * 977, y - depth * 613, seed + depth * 7919);
  const band = GEOLOGY.find((g) => h < g.below);
  return band && layer >= band.from ? band.type : T.SOIL;
}

// Each underground chunk hides one shaft down to the next layer, kept two tiles
// in from the chunk edge.
export function shaftInChunk(seed, cx, cy, cz) {
  const span = CHUNK_SIZE - 4;
  return {
    x: cx * CHUNK_SIZE + 2 + Math.floor(hash2(cx, cy, seed + 3701 + cz * 31) * span),
    y: cy * CHUNK_SIZE + 2 + Math.floor(hash2(cx, cy, seed + 7919 + cz * 31) * span)
  };
}

function generateUnderground(seed, cx, cy, cz) {
  const type = new Uint8Array(CHUNK_TILES);
  const rich = new Uint8Array(CHUNK_TILES).fill(1);
  const layer = SURFACE - cz; // 1 for the first layer below the forest
  const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      type[ly * CHUNK_SIZE + lx] = undergroundType(seed, ox + lx, oy + ly, layer);
    }
  }
  const shaft = shaftInChunk(seed, cx, cy, cz);
  type[(shaft.y - oy) * CHUNK_SIZE + (shaft.x - ox)] = T.SHAFT;
  return { type, rich };
}
