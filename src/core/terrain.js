/* Terrain generation: one chunk at a time, as a pure function of
 * (chunk x, chunk y, layer z, seed). Chunks can be generated in any order and
 * always agree. A chunk holds each tile's type and baseline richness; player
 * edits live in the world's `mods` map on top of this. */

import { CHUNK_SIZE, CHUNK_TILES, SURFACE } from './coords.js';
import { hash2, fbm } from './noise.js';
import { T, TILE_INFO } from './tiles.js';
import { FINDS, FINDS_PER_CHUNK } from './content.js';

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

// Forests come in kinds, by region: what grows there changes how a forest
// looks, never what it yields. Two slow noises stand for cold..warm and
// dry..wet: cold land grows pine; warm land oak (wet) or maple (dry);
// in between, birch where it's wet and a mixed forest elsewhere.
export const FOREST_KINDS = {
  pine: { name: 'Pine forest', does: 'Cold country: pines and spruce, close and dark.' },
  birch: { name: 'Birch grove', does: 'Wet, mild country: pale birches, a pine here and there.' },
  oak: { name: 'Oak forest', does: 'Warm, wet country: broad oaks and the odd apple tree.' },
  maple: { name: 'Maple forest', does: 'Warm, dry country: maples in autumn colours.' },
  mixed: { name: 'Mixed forest', does: 'Where the others meet: a little of everything.' }
};

export function forestKind(seed, x, y) {
  const warm = fbm(x * 0.022, y * 0.022, seed + 61, 3);
  const wet = fbm(x * 0.026 + 40, y * 0.026 - 17, seed + 67, 3);
  if (warm < 0.43) return 'pine';
  if (warm > 0.59) return wet > 0.5 ? 'oak' : 'maple';
  return wet > 0.55 ? 'birch' : 'mixed';
}

// Starting richness for each surface deposit: base + random spread.
export const DEPOSIT = [];
DEPOSIT[T.FOREST] = { base: 5, spread: 9, salt: 101 };
DEPOSIT[T.STONE] = { base: 4, spread: 6, salt: 102 };
DEPOSIT[T.ORE] = { base: 3, spread: 6, salt: 103 };
DEPOSIT[T.CRYSTAL] = { base: 1, spread: 3, salt: 104 };

/* Ways between layers. Nothing is dug between layers: every way up or down
 * is generated with the world, and you find it by exploring. A way down is a
 * cave mouth in the forest or a shaft in the mine; directly beneath each one,
 * on the layer below, is a way up (T.RISE) back to it. Each chunk of every
 * layer has its way down (a forest chunk only where it has open land), so
 * every layer is connected to the next both ways, all over. */

const CAVE_TRIES = 8;

// The tile two in from a chunk's edges picked by draw `i` for layer z.
function wayCandidate(seed, cx, cy, z, i) {
  const span = CHUNK_SIZE - 4;
  return {
    x: cx * CHUNK_SIZE + 2 + Math.floor(hash2(cx, cy, seed + 3701 + z * 31 + i * 7027) * span),
    y: cy * CHUNK_SIZE + 2 + Math.floor(hash2(cx, cy, seed + 7919 + z * 31 + i * 7027) * span)
  };
}

// A forest chunk's cave mouth down to the first layer: on open land (never
// in water, a mountain or home ground), or none if a few draws find none.
export function caveInChunk(seed, cx, cy) {
  for (let i = 0; i < CAVE_TRIES; i++) {
    const c = wayCandidate(seed, cx, cy, SURFACE, i);
    if (TILE_INFO[surfaceType(seed, c.x, c.y)].land) return c;
  }
  return null;
}

// The way down out of chunk (cx, cy) of layer z: its cave mouth or its shaft.
export function wayDownInChunk(seed, cx, cy, cz) {
  return cz === SURFACE ? caveInChunk(seed, cx, cy) : shaftInChunk(seed, cx, cy, cz);
}

// The way up out of chunk (cx, cy) of underground layer z: beneath the way
// down of the layer above. Null on the surface, or under a chunk with no cave.
export function wayUpInChunk(seed, cx, cy, cz) {
  return cz < SURFACE ? wayDownInChunk(seed, cx, cy, cz + 1) : null;
}

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
  const cave = caveInChunk(seed, cx, cy);
  if (cave) {
    const i = (cave.y - oy) * CHUNK_SIZE + (cave.x - ox);
    type[i] = T.CAVE;
    rich[i] = 0;
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
  { type: T.SPORE_BED, below: 0.43, from: 4 }
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
  return wayCandidate(seed, cx, cy, cz, 0);
}

// The finds hidden in a chunk: FINDS_PER_CHUNK spots (never on its ways),
// each a geode where the layer is deep enough and the dice say so, else a
// buried cache. Returns [{x, y, type}].
export function findsInChunk(seed, cx, cy, cz) {
  const layer = SURFACE - cz;
  const shaft = shaftInChunk(seed, cx, cy, cz);
  const up = wayUpInChunk(seed, cx, cy, cz);
  const out = [];
  for (let i = 0; i < FINDS_PER_CHUNK; i++) {
    const salt = seed + 4241 + i * 97 + cz * 53;
    const x = cx * CHUNK_SIZE + Math.floor(hash2(cx, cy, salt) * CHUNK_SIZE);
    const y = cy * CHUNK_SIZE + Math.floor(hash2(cx, cy, salt + 11) * CHUNK_SIZE);
    if ((x === shaft.x && y === shaft.y) || (up && x === up.x && y === up.y) || out.some((f) => f.x === x && f.y === y)) continue;
    const geode = layer >= FINDS[T.GEODE].from && hash2(cx, cy, salt + 23) < 0.4;
    out.push({ x, y, type: geode ? T.GEODE : T.CACHE });
  }
  return out;
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
  // The way up first, so a shaft right beneath one wins: that tile is then a
  // way both up and down.
  const up = wayUpInChunk(seed, cx, cy, cz);
  if (up) type[(up.y - oy) * CHUNK_SIZE + (up.x - ox)] = T.RISE;
  const shaft = shaftInChunk(seed, cx, cy, cz);
  type[(shaft.y - oy) * CHUNK_SIZE + (shaft.x - ox)] = T.SHAFT;
  for (const f of findsInChunk(seed, cx, cy, cz)) type[(f.y - oy) * CHUNK_SIZE + (f.x - ox)] = f.type;
  return { type, rich };
}
