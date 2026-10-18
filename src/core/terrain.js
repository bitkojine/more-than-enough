/* Terrain generation: one chunk at a time, as a pure function of
 * (chunk x, chunk y, layer z, seed). Chunks can be generated in any order and
 * always agree. A chunk holds each tile's type and baseline richness; player
 * edits live in the world's `mods` map on top of this. */

import { CHUNK_SIZE, CHUNK_TILES, SURFACE } from './coords.js';
import { hash2, fbm, fbmAbove } from './noise.js';
import { T, TILE_INFO } from './tiles.js';
import { FINDS, FINDS_PER_CHUNK } from './content.js';
import { landAt, BIOMES } from './regions.js';
import { t } from '../i18n/i18n.js';

const MAX_RICHNESS = 30;
// Every world starts on a square of home ground at the origin, HOME_HALF
// tiles out each way from its middle, where your stockpile is kept (see
// stockpile.js).
export const HOME_HALF = 11;

export function generateChunk(seed, cx, cy, cz) {
  return cz === SURFACE ? generateSurface(seed, cx, cy) : generateUnderground(seed, cx, cy, cz);
}

/* Resources are scarce and come in clusters, so finding them takes walking.
 * Forests grow in groves with open heath between them. Stone, ore and crystal
 * only crop up in mineral country, broad regions with barren land between
 * (LODE). Near home there's a little of everything to get started; further
 * out the land gets richer: more ore, crystal at all, and deeper deposits.
 * Each share below is the part of the land a resource takes, near home and
 * far out (see `far`). */
export const SURFACE_SHARE = {
  forest: { near: 0.4, far: 0.22 },
  lode: { near: 1, far: 0.4 },     // mineral country
  stone: { near: 0.16, far: 0.2 }, // of mineral country
  ore: { near: 0.05, far: 0.12 },  // of mineral country
  crystal: { near: 0, far: 0.03 }  // of mineral country: the hearts of ore veins
};
// Distances from the origin, in tiles: within NEAR it's all `near`, beyond
// FAR it's all `far`, and it shades between. Crystal never shows within
// CRYSTAL_FROM.
const NEAR = 20, FAR = 160, CRYSTAL_FROM = 40;

// How far out (x, y) is: 0 near home, 1 far out.
export function farness(x, y) {
  return Math.min(1, Math.max(0, (Math.hypot(x, y) - NEAR) / (FAR - NEAR)));
}

function share(key, far) {
  const s = SURFACE_SHARE[key];
  return s.near + (s.far - s.near) * far;
}

function surfaceType(seed, x, y) {
  if (Math.abs(x) <= HOME_HALF && Math.abs(y) <= HOME_HALF) return T.HOME;
  // Each region's kind of land sets its water, peaks, forest and minerals
  // (see regions.js); borders between regions are rivers, ridges, walls
  // and hedges, and a gap through one is open grass.
  const land = landAt(seed, x, y);
  if (land.border === 'river') return T.WATER;
  if (land.border === 'ridge') return T.ROCK;
  if (land.border === 'wall') return T.WALL;
  if (land.border === 'hedge') return T.HEDGE;
  if (land.border === 'pass') return T.GRASS;
  const biome = BIOMES[land.biome];
  const elevation = fbm(x * 0.06, y * 0.06, seed + 11, 4);
  if (elevation < biome.water) return T.WATER;
  if (elevation > biome.peaks) return T.ROCK;
  const far = farness(x, y);
  // Mineral country shades in over a short way past home, not all of FAR.
  const lodeFar = Math.min(1, far * 5);
  if (fbm(x * 0.02 + 90, y * 0.02 - 40, seed + 79, 3) > fbmAbove(share('lode', lodeFar) * biome.lode, 3)) {
    const ore = fbm(x * 0.09 + 53, y * 0.09 + 71, seed + 53, 3);
    if (x * x + y * y >= CRYSTAL_FROM * CRYSTAL_FROM && ore > fbmAbove(share('crystal', far), 3)) return T.CRYSTAL;
    if (ore > fbmAbove(share('ore', far), 3)) return T.ORE;
    if (fbm(x * 0.075 + 17, y * 0.075 + 31, seed + 37, 3) > fbmAbove(share('stone', far), 3)) return T.STONE;
  }
  if (fbm(x * 0.04, y * 0.04, seed + 23, 4) > fbmAbove(Math.min(0.85, share('forest', far) * biome.forest), 4)) return T.FOREST;
  return T.GRASS;
}

// Forests come in kinds, by region: what grows there changes how a forest
// looks, never what it yields. Two slow noises stand for cold..warm and
// dry..wet: cold land grows pine; warm land oak (wet) or maple (dry);
// in between, birch where it's wet and a mixed forest elsewhere. `in` names
// it inside "grows in ..." (the Lithuanian locative).
export const FOREST_KINDS = {
  pine: { name: t('forest.pine'), in: t('forest.pine.in'), does: t('forest.pine.does') },
  birch: { name: t('forest.birch'), in: t('forest.birch.in'), does: t('forest.birch.does') },
  oak: { name: t('forest.oak'), in: t('forest.oak.in'), does: t('forest.oak.does') },
  maple: { name: t('forest.maple'), in: t('forest.maple.in'), does: t('forest.maple.does') },
  mixed: { name: t('forest.mixed'), in: t('forest.mixed.in'), does: t('forest.mixed.does') }
};

export function forestKind(seed, x, y) {
  const warm = fbm(x * 0.022, y * 0.022, seed + 61, 3);
  const wet = fbm(x * 0.026 + 40, y * 0.026 - 17, seed + 67, 3);
  if (warm < 0.43) return 'pine';
  if (warm > 0.59) return wet > 0.5 ? 'oak' : 'maple';
  return wet > 0.55 ? 'birch' : 'mixed';
}

// Starting richness for each surface deposit: base + random spread, times
// WEALTH: thin near home, rich far out.
export const DEPOSIT = [];
DEPOSIT[T.FOREST] = { base: 5, spread: 9, salt: 101 };
DEPOSIT[T.STONE] = { base: 4, spread: 6, salt: 102 };
DEPOSIT[T.ORE] = { base: 3, spread: 6, salt: 103 };
DEPOSIT[T.CRYSTAL] = { base: 1, spread: 3, salt: 104 };
export const WEALTH = { near: 0.6, far: 1.6 };

/* Ways between layers. Nothing is dug between layers: every way up or down
 * is generated with the world, and you find it by exploring. A way down is a
 * cave mouth in the forest or a shaft in the mine; directly beneath each one,
 * on the layer below, is a way up (T.RISE) back to it. Each chunk of every
 * layer has its way down (a forest chunk only where it has open land), so
 * every layer is connected to the next both ways, all over. */

const CAVE_TRIES = 12;
// Ways down sit in one band of each chunk's columns, alternating by layer:
// even layers (the forest too) in BAND_X[0], odd ones in BAND_X[1]. A layer's
// ways up lie beneath the ways down of the layer above, in the other band, so
// a way up and a way down are always at least WAYS_APART tiles apart, within
// a chunk and across chunk edges alike.
const BAND_X = [2, 10];
const BAND_W = 4;
export const WAYS_APART = BAND_X[1] - (BAND_X[0] + BAND_W - 1);

// The tile picked by draw `i` for layer z's way down: in its band across,
// two in from the chunk's top and bottom edges.
function wayCandidate(seed, cx, cy, z, i) {
  const span = CHUNK_SIZE - 4;
  return {
    x: cx * CHUNK_SIZE + BAND_X[z & 1] + Math.floor(hash2(cx, cy, seed + 3701 + z * 31 + i * 7027) * BAND_W),
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
      if (d) {
        const wealth = WEALTH.near + (WEALTH.far - WEALTH.near) * farness(x, y);
        rich[i] = Math.max(1, Math.min(MAX_RICHNESS, Math.round((d.base + hash2(x, y, seed + d.salt) * d.spread) * wealth)));
      }
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

// Geology below the forest. Bedrock is scattered tile by tile, so it never
// walls a way off. Every other kind of rock runs in veins and beds, each from
// its own noise: a band shows from layer `from` down (layer 1 is z = -1),
// taking `share` of the rock there and more the deeper you go, up to `deep`
// by DEEP layers further down. Rarer bands come first in the list and win
// where veins cross. Everything else is plain soil. Every underground tile
// starts solid with richness 1; digging it to zero clears it.
export const GEOLOGY = [
  { type: T.BEDROCK, share: 0.13, deep: 0.13, from: 1, scatter: true },
  { type: T.CRYSTAL_SEAM, share: 0.012, deep: 0.035, from: 3, scale: 0.16 },
  { type: T.ORE_SEAM, share: 0.035, deep: 0.07, from: 1, scale: 0.13 },
  { type: T.SPORE_BED, share: 0.035, deep: 0.06, from: 4, scale: 0.1 },
  { type: T.STONE_SEAM, share: 0.09, deep: 0.1, from: 1, scale: 0.1 }
];
const DEEP = 8;

// A band's share of the rock on mine layer `layer` (0 above its `from`).
export function geologyShare(g, layer) {
  if (layer < g.from) return 0;
  return g.share + (g.deep - g.share) * Math.min(1, (layer - g.from) / DEEP);
}

function undergroundType(seed, x, y, layer) {
  const depth = layer - 1;
  for (let i = 0; i < GEOLOGY.length; i++) {
    const g = GEOLOGY[i];
    const share = geologyShare(g, layer);
    if (!share) continue;
    if (g.scatter) {
      if (hash2(x + depth * 977, y - depth * 613, seed + depth * 7919) < share) return g.type;
    } else {
      const salt = seed + 307 + i * 131 + depth * 7919;
      if (fbm(x * g.scale + depth * 37, y * g.scale - depth * 53, salt, 3) > fbmAbove(share, 3)) return g.type;
    }
  }
  return T.SOIL;
}

// Each underground chunk hides one shaft down to the next layer (see
// wayCandidate for where).
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
  const up = wayUpInChunk(seed, cx, cy, cz);
  if (up) type[(up.y - oy) * CHUNK_SIZE + (up.x - ox)] = T.RISE;
  const shaft = shaftInChunk(seed, cx, cy, cz);
  type[(shaft.y - oy) * CHUNK_SIZE + (shaft.x - ox)] = T.SHAFT;
  for (const f of findsInChunk(seed, cx, cy, cz)) type[(f.y - oy) * CHUNK_SIZE + (f.x - ox)] = f.type;
  return { type, rich };
}
