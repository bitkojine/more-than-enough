/* The world: an endless stack of layers, generated lazily in chunks and cached.
 * Only player edits are stored — richness changes (`mods`), revealed fog
 * (`explored`) and holes between layers (`holes`) — so a save stays small
 * however far anyone walks or digs. */

import { CHUNK_SIZE, SURFACE, packKey, chunkCoord, chunkIndex } from './coords.js';
import { generateChunk } from './terrain.js';
import { hash2 } from './noise.js';
import { TILE_INFO, T } from './tiles.js';

const MAX_CACHED_CHUNKS = 512;
const FOG_BYTES = (CHUNK_SIZE * CHUNK_SIZE) >> 3; // one bit per tile
const SPAWN_SEARCH_RADIUS = 200;
const ROUGH_SALT = 9100;     // hash salt for per-tile height variation

/**
 * @typedef {object} World
 * @property {number} seed
 * @property {Map<number, {type: Uint8Array, rich: Uint8Array}>} chunks  generated-chunk cache (LRU)
 * @property {Map<number, number>} mods      tile key -> richness, only where it differs from generation
 * @property {Map<number, Uint8Array>} explored  chunk key -> fog bitmask
 * @property {number} revealed  tiles explored since the world was created or loaded (a change counter, not saved)
 * @property {Set<number>} holes             tile keys (x, y, z) with a hole in layer z's floor
 * @property {Set<number>} torches           tile keys (x, y, z) with a torch you placed
 */

/** @returns {World} */
export function createWorld(seed) {
  return { seed: (seed >>> 0) || 1, chunks: new Map(), mods: new Map(), explored: new Map(), revealed: 0, holes: new Set(), torches: new Set(), hotKey: -1, hotChunk: null };
}

// Least-recently-used cache. Consecutive lookups usually hit the same chunk, so
// that case skips the Map entirely.
function chunkAt(w, x, y, z) {
  const key = packKey(chunkCoord(x), chunkCoord(y), z);
  if (key === w.hotKey) return w.hotChunk;
  let chunk = w.chunks.get(key);
  if (chunk) {
    w.chunks.delete(key);
  } else {
    chunk = generateChunk(w.seed, chunkCoord(x), chunkCoord(y), z);
    if (w.chunks.size >= MAX_CACHED_CHUNKS) w.chunks.delete(w.chunks.keys().next().value);
  }
  w.chunks.set(key, chunk);
  w.hotKey = key;
  w.hotChunk = chunk;
  return chunk;
}

// Richness as generated, before any player edits. Also the regrowth ceiling.
export function baseRichness(w, x, y, z) {
  return chunkAt(w, x, y, z).rich[chunkIndex(x, y)];
}

export function richness(w, x, y, z) {
  const mod = w.mods.get(packKey(x, y, z));
  return mod === undefined ? baseRichness(w, x, y, z) : mod;
}

export function setRichness(w, x, y, z, value) {
  // Keep the edit map minimal: drop entries that match the generated baseline.
  if (value === baseRichness(w, x, y, z)) w.mods.delete(packKey(x, y, z));
  else w.mods.set(packKey(x, y, z), value);
}

export function tileAt(w, x, y, z) {
  const t = chunkAt(w, x, y, z).type[chunkIndex(x, y)];
  const cleared = TILE_INFO[t].cleared;
  if (cleared !== undefined && richness(w, x, y, z) === 0) return cleared;
  return t;
}

export function walkable(w, x, y, z) {
  return !!TILE_INFO[tileAt(w, x, y, z)].walk;
}

// How far the tile's top stands above its layer's floor, in layers.
// Unexplored tiles never give away their shape: they read as flat.
export function tileHeight(w, x, y, z) {
  if (!isExplored(w, x, y, z)) return 0;
  const info = TILE_INFO[tileAt(w, x, y, z)];
  if (!info.rough) return info.height || 0;
  return info.height + (hash2(x, y, w.seed + ROUGH_SALT + z) - 0.5) * info.rough;
}

/* -------------------------------------------------------------- holes */

// A hole in the floor of layer z at (x, y) leads down to the same spot on
// z - 1. Open shafts are holes by nature; the rest are dug by the player
// going down from the surface or climbing up through a ceiling.
export function holeBelow(w, x, y, z) {
  return w.holes.has(packKey(x, y, z)) || !!TILE_INFO[tileAt(w, x, y, z)].descend;
}

// A hole in the ceiling: light from the layer above.
export function holeAbove(w, x, y, z) {
  return z < SURFACE && holeBelow(w, x, y, z + 1);
}

export function digHole(w, x, y, z) {
  w.holes.add(packKey(x, y, z));
}

/* ---------------------------------------------------------------- fog */

export function isExplored(w, x, y, z) {
  const mask = w.explored.get(packKey(chunkCoord(x), chunkCoord(y), z));
  if (!mask) return false;
  const i = chunkIndex(x, y);
  return (mask[i >> 3] & (1 << (i & 7))) !== 0;
}

export function markExplored(w, x, y, z) {
  const key = packKey(chunkCoord(x), chunkCoord(y), z);
  let mask = w.explored.get(key);
  if (!mask) {
    mask = new Uint8Array(FOG_BYTES);
    w.explored.set(key, mask);
  }
  const i = chunkIndex(x, y);
  const bit = 1 << (i & 7);
  if (mask[i >> 3] & bit) return;
  mask[i >> 3] |= bit;
  w.revealed++;
}

export function isValidFogMask(mask) {
  return mask instanceof Uint8Array && mask.length === FOG_BYTES;
}

/* -------------------------------------------------------------- search */

// Nearest tile on layer z satisfying pred(x, y), searching square rings outward
// from (x, y). Returns the first ring's closest match, or null within maxR.
export function nearestTile(x, y, maxR, pred) {
  const px = Math.floor(x), py = Math.floor(y);
  for (let r = 0; r <= maxR; r++) {
    let best = null, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = px + dx, ty = py + dy;
        if (!pred(tx, ty)) continue;
        const ex = tx + 0.5 - x, ey = ty + 0.5 - y;
        const d = ex * ex + ey * ey;
        if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
      }
    }
    if (best) return best;
  }
  return null;
}

// Fully random birth: the nearest walkable surface tile to the origin,
// preferring dry land. No terrain is sculpted and no resources are guaranteed.
export function findSpawn(w) {
  const dry = nearestTile(0.5, 0.5, SPAWN_SEARCH_RADIUS, (x, y) => walkable(w, x, y, SURFACE) && tileAt(w, x, y, SURFACE) !== T.WATER);
  return dry || nearestTile(0.5, 0.5, SPAWN_SEARCH_RADIUS, (x, y) => walkable(w, x, y, SURFACE)) || { x: 0, y: 0 };
}
