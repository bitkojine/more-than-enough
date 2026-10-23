/* The world: an endless stack of layers, generated lazily in chunks and cached.
 * Only player edits are stored — richness changes (`mods`), revealed fog
 * (`explored`) and the holes older versions let you dig (`holes`) — so a save
 * stays small however far anyone walks or digs. */

import { CHUNK_SIZE, SURFACE, packKey, unpackKey, chunkCoord, chunkIndex } from './coords.js';
import { generateChunk, wayDownInChunk, wayUpInChunk, HOME_HALF } from './terrain.js';
import { hash2 } from './noise.js';
import { ExploredChunks, visitNearestExploredChunks } from './explored-index.js';
import { createObservedTypes } from './observed-types.js';
import { VersionedMap } from './versioned-map.js';
import { TILE_INFO, T } from './tiles.js';

const MAX_CACHED_CHUNKS = 512;
const FOG_BYTES = (CHUNK_SIZE * CHUNK_SIZE) >> 3; // one bit per tile
const SPAWN_SEARCH_RADIUS = 200;
const observationVersions = new WeakMap();
const observedTypes = new WeakMap();

// Derived perception revisions: only newly revealed tiles and edits to known
// tiles invalidate knowledge-based caches. Hidden edits reveal nothing.
function noteObservation(w, z) {
  let entry = observationVersions.get(w);
  if (!entry || entry.fog !== w.explored) {
    entry = { fog: w.explored, layers: new Map() }; observationVersions.set(w, entry);
  }
  entry.layers.set(z, (entry.layers.get(z) || 0) + 1);
}
export function observationVersion(w, z) {
  const entry = observationVersions.get(w);
  return entry?.fog === w.explored ? entry.layers.get(z) || 0 : 0;
}
const ROUGH_SALT = 9100;     // hash salt for per-tile height variation

/**
 * @typedef {object} World
 * @property {number} seed
 * @property {Map<number, {type: Uint8Array, rich: Uint8Array}>} chunks  generated-chunk cache (LRU)
 * @property {Map<number, number>} mods      tile key -> richness, only where it differs from generation
 * @property {Map<number, Uint8Array>} explored  chunk key -> fog bitmask
 * @property {number} revealed  tiles explored since the world was created or loaded (a change counter, not saved)
 * @property {Set<number>} holes             tile keys (x, y, z) with a hole in layer z's floor, dug
 *                                           in older versions (now every way is generated; see terrain.js)
 * @property {Map<number, string>} props     tile key (x, y, z) -> the prop you placed there (a PROPS key)
 * @property {Array|null} edits              in a shared world, every change to it, for the room
 *                                           (see shared.js); null when playing alone
 */

/** @returns {World} */
export function createWorld(seed, cultivation=false) {
  return { cultivation, seed: (seed >>> 0) || 1, chunks: new Map(), mods: new Map(), explored: new ExploredChunks(), revealed: 0, holes: new Set(), props: new VersionedMap(), edits: null, hotKey: -1, hotChunk: null };
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
    if(w.cultivation)for(let i=0;i<chunk.type.length;i++){
      const t=chunk.type[i];
      if(z===0&&(t===T.ORE||t===T.CRYSTAL))chunk.type[i]=T.STONE;
      if(z===-1&&(t===T.CRYSTAL_SEAM||t===T.GEODE))chunk.type[i]=T.STONE_SEAM;
      if(z<=-2&&t===T.CRYSTAL_SEAM)chunk.type[i]=T.GEODE;
    }
    if (w.chunks.size >= MAX_CACHED_CHUNKS) w.chunks.delete(w.chunks.keys().next().value);
  }
  w.chunks.set(key, chunk);
  w.hotKey = key;
  w.hotChunk = chunk;
  return chunk;
}

// Richness as generated, before any player edits. Nothing grows back: once
// gathered, a tile stays as it was left, for good.
export function baseRichness(w, x, y, z) {
  return chunkAt(w, x, y, z).rich[chunkIndex(x, y)];
}

export function richness(w, x, y, z) {
  const mod = w.mods.get(packKey(x, y, z));
  return mod === undefined ? baseRichness(w, x, y, z) : mod;
}

export function setRichness(w, x, y, z, value) {
  const key = packKey(x, y, z);
  putRichness(w, key, x, y, z, value);
  if (w.edits) w.edits.push(['m', key, value]);
}

// Keep the edit map minimal: drop entries that match the generated baseline.
export function putRichness(w, key, x, y, z, value) {
  const before = w.mods.get(key);
  if (value === baseRichness(w, x, y, z)) w.mods.delete(key);
  else w.mods.set(key, value);
  if (before !== w.mods.get(key) && isExplored(w, x, y, z)) {
    noteObservation(w, z);
    if (z === SURFACE) {
      const typed = observedTypes.get(w);
      if (typed?.fog === w.explored && typed.version === w.explored.revision) typed.changed(x, y);
    }
  }
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
// z - 1: a cave mouth, an open shaft, or a hole dug in an older version.
export function holeBelow(w, x, y, z) {
  return w.holes.has(packKey(x, y, z)) || !!TILE_INFO[tileAt(w, x, y, z)].descend;
}

// A hole in the ceiling: light from the layer above.
export function holeAbove(w, x, y, z) {
  return z < SURFACE && holeBelow(w, x, y, z + 1);
}

// A way up from (x, y, z): under a hole in the ceiling, or under a shaft
// above that hasn't been opened yet (climbing up through it opens it).
export function wayUp(w, x, y, z) {
  if (z >= SURFACE) return false;
  if (holeBelow(w, x, y, z + 1)) return true;
  const cleared = TILE_INFO[tileAt(w, x, y, z + 1)].cleared;
  return cleared !== undefined && !!TILE_INFO[cleared].descend;
}

// The tiles of layer z between (x0, y0) and (x1, y1) where a way up or down
// may be: every generated one, and the holes dug in older versions, in this
// floor or this ceiling. Returns [{x, y}], each tile once.
export function waysIn(w, z, x0, y0, x1, y1) {
  const out = [], seen = new Set();
  const add = (p) => {
    if (!p || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return;
    const key = packKey(p.x, p.y, z);
    if (!seen.has(key)) { seen.add(key); out.push({ x: p.x, y: p.y }); }
  };
  for (let cy = chunkCoord(y0); cy <= chunkCoord(y1); cy++) {
    for (let cx = chunkCoord(x0); cx <= chunkCoord(x1); cx++) {
      add(wayDownInChunk(w.seed, cx, cy, z));
      add(wayUpInChunk(w.seed, cx, cy, z));
    }
  }
  for (const k of w.holes) {
    const h = unpackKey(k);
    if (h.z === z || h.z === z + 1) add(h);
  }
  return out;
}

/* ---------------------------------------------------------------- fog */

export function isExplored(w, x, y, z) {
  const mask = w.explored.get(packKey(chunkCoord(x), chunkCoord(y), z));
  if (!mask) return false;
  const i = chunkIndex(x, y);
  return (mask[i >> 3] & (1 << (i & 7))) !== 0;
}

export function markExplored(w, x, y, z) {
  const typed = observedTypes.get(w);
  const typedValid = typed?.fog === w.explored && typed.version === w.explored.revision;
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
  noteObservation(w, z);
  if (typedValid) typed.reveal(x, y, z);
  else if (typed) observedTypes.delete(w);
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
      // Only the ring: every tile of the top and bottom rows, the two ends of the others.
      const edge = dy === -r || dy === r;
      for (let dx = -r; dx <= r; dx += edge ? 1 : 2 * r) {
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

// The same ring/distance/row-order choice as nearestTile, restricted to fog
// already revealed on this layer. Skip whole unseen chunks instead of
// probing every tile of an empty search square (common while in a mine).
export function nearestExploredTile(w, x, y, z, maxR, pred, work = null, type = null, minimum = 0) {
  maxR = Math.floor(maxR);
  const px = Math.floor(x), py = Math.floor(y);
  const close = nearestTile(x, y, Math.min(4, maxR), (tx, ty) => isExplored(w, tx, ty, z) &&
    (type === null || tileAt(w, tx, ty, z) === type) && (!minimum || richness(w, tx, ty, z) >= minimum) && pred(tx, ty));
  if (close || maxR <= 4) return close;
  let best = null, bestR = maxR + 1, bestD = Infinity;
  let index = w.explored;
  if (type !== null && z === SURFACE && w.explored instanceof ExploredChunks) {
    let typed = observedTypes.get(w);
    if (!typed || typed.fog !== w.explored || typed.version !== w.explored.revision) {
      typed = createObservedTypes(w.explored, (tx, ty) => tileAt(w, tx, ty, SURFACE), (tx, ty) => richness(w, tx, ty, SURFACE)); observedTypes.set(w, typed);
    }
    index = typed.query(type, px, py, maxR, work, minimum === 1 || minimum === 2 ? minimum : 0);
  }
  visitNearestExploredChunks(index, z, px, py, maxR, (cx, cy, mask) => {
    const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE;
    const radius = Math.min(maxR, bestR);
    const left = Math.max(ox, px - radius), right = Math.min(ox + CHUNK_SIZE - 1, px + radius);
    const top = Math.max(oy, py - radius), bottom = Math.min(oy + CHUNK_SIZE - 1, py + radius);
    for (let ty = top; ty <= bottom; ty++) for (let tx = left; tx <= right; tx++) {
      const r = Math.max(Math.abs(tx - px), Math.abs(ty - py));
      if (r <= 4 || r > bestR) continue;
      if (work) work.cells++;
      const i = (ty - oy) * CHUNK_SIZE + tx - ox;
      if (!(mask[i >> 3] & (1 << (i & 7)))) continue;
      if (type !== null && tileAt(w, tx, ty, z) !== type) continue;
      if (minimum && richness(w, tx, ty, z) < minimum) continue;
      const ex = tx + 0.5 - x, ey = ty + 0.5 - y, d = ex * ex + ey * ey;
      if (r === bestR && (d > bestD || (d === bestD && best && (ty > best.y || (ty === best.y && tx >= best.x))))) continue;
      if (!pred(tx, ty)) continue;
      best = { x: tx, y: ty }; bestR = r; bestD = d;
    }
    return bestR;
  }, work);
  return best;
}

// Where a new world starts you: on the edge of home ground, by the forest
// nearest its middle, so there's something to gather in view straight away
// (the middle, where the stockpile stands, is bare ground). No terrain is
// sculpted and no resources are guaranteed.
export function findSpawn(w) {
  const f = nearestTile(0.5, 0.5, SPAWN_SEARCH_RADIUS, (x, y) => tileAt(w, x, y, SURFACE) === T.FOREST);
  if (!f) return { x: 0, y: 0 };
  const edge = (v) => Math.max(-HOME_HALF, Math.min(HOME_HALF, v));
  return { x: edge(f.x), y: edge(f.y) };
}
