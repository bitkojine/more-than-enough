/* Derived surface-type index. Classify each requested explored chunk once;
 * subsequent queries visit only matching types and newly observed chunks.
 * Observed edits update classified tiles. No hidden tile is classified, and
 * none of this cache is part of a save or world format. */
import { ExploredChunks } from './explored-index.js';
import { CHUNK_SIZE, SURFACE, packKey, unpackKey, chunkCoord, chunkIndex } from './coords.js';

export function createObservedTypes(fog, readType) {
  const pending = new ExploredChunks(), classified = new Map(), types = new Map();
  let version = fog.revision;
  for (const [key, mask] of fog) if (Number.isSafeInteger(key) && key >= 0 && unpackKey(key).z === SURFACE) pending.set(key, mask);

  function add(x, y, type) {
    let index = types.get(type);
    if (!index) { index = new ExploredChunks(); types.set(type, index); }
    const key = packKey(chunkCoord(x), chunkCoord(y), SURFACE);
    let mask = index.get(key);
    if (!mask) { mask = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE / 8); index.set(key, mask); }
    const bit = chunkIndex(x, y); mask[bit >> 3] |= 1 << (bit & 7);
  }
  function reveal(x, y, z) {
    if (z === SURFACE) {
      const key = packKey(chunkCoord(x), chunkCoord(y), z);
      const values = classified.get(key);
      if (values) { const type = readType(x, y); values[chunkIndex(x, y)] = type; add(x, y, type); }
      else if (!pending.has(key)) pending.set(key, fog.get(key));
    }
    version = fog.revision;
  }
  function changed(x, y) {
    const key = packKey(chunkCoord(x), chunkCoord(y), SURFACE), values = classified.get(key);
    if (!values) return;
    const bit = chunkIndex(x, y), before = values[bit], type = readType(x, y);
    if (before === type) return;
    const old = types.get(before), mask = old.get(key);
    mask[bit >> 3] &= ~(1 << (bit & 7));
    if (!mask.some(byte => byte !== 0)) old.delete(key);
    values[bit] = type; add(x, y, type);
  }
  function query(type, px, py, radius, work) {
    pending.visit(SURFACE, chunkCoord(px - radius), chunkCoord(py - radius),
      chunkCoord(px + radius), chunkCoord(py + radius), (cx, cy, mask) => {
        if (work) work.classifiedChunks = (work.classifiedChunks || 0) + 1;
        const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE;
        const values = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) if (mask[i >> 3] & (1 << (i & 7))) {
          const x = ox + i % CHUNK_SIZE, y = oy + Math.floor(i / CHUNK_SIZE);
          if (work) work.classifiedCells = (work.classifiedCells || 0) + 1;
          const type = readType(x, y); values[i] = type; add(x, y, type);
        }
        const key = packKey(cx, cy, SURFACE);
        classified.set(key, values); pending.delete(key);
      });
    return types.get(type) || empty;
  }
  const empty = new ExploredChunks();
  return { fog, reveal, changed, query, get version() { return version; } };
}
