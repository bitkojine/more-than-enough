/* Derived surface-type index. Classify each requested explored chunk once;
 * subsequent queries visit only matching types and newly observed chunks.
 * Observed edits update classified tiles. No hidden tile is classified, and
 * none of this cache is part of a save or world format. */
import { ExploredChunks } from './explored-index.js';
import { CHUNK_SIZE, SURFACE, packKey, unpackKey, chunkCoord, chunkIndex } from './coords.js';

export function createObservedTypes(fog, readType, readRichness = () => 255) {
  const pending = new ExploredChunks(), classified = new Map(), remaining = new Map(), types = new Map();
  let version = fog.revision;
  for (const [key, mask] of fog) if (Number.isSafeInteger(key) && key >= 0 && unpackKey(key).z === SURFACE) pending.set(key, mask);

  // Maintain masks at the only reserve boundaries used by gathering: any
  // remaining unit, or at least two when the last unit belongs to a building.
  function edit(x, y, type, amount, add) {
    for (let minimum = 0; minimum <= 2; minimum++) {
      if (amount < minimum) continue;
      const id = type * 3 + minimum;
      let index = types.get(id);
      if (!index) { if (!add) continue; index = new ExploredChunks(); types.set(id, index); }
      const key = packKey(chunkCoord(x), chunkCoord(y), SURFACE), bit = chunkIndex(x, y);
      let mask = index.get(key);
      if (add) {
        if (!mask) { mask = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE / 8); index.set(key, mask); }
        mask[bit >> 3] |= 1 << (bit & 7);
      } else if (mask) {
        mask[bit >> 3] &= ~(1 << (bit & 7));
        if (!mask.some(byte => byte !== 0)) index.delete(key);
      }
    }
  }
  function reveal(x, y, z) {
    if (z === SURFACE) {
      const key = packKey(chunkCoord(x), chunkCoord(y), z);
      const values = classified.get(key);
      if (values) { const type = readType(x, y), amount = readRichness(x, y), bit = chunkIndex(x, y); values[bit] = type; remaining.get(key)[bit] = Math.min(2, amount); edit(x, y, type, amount, true); }
      else if (!pending.has(key)) pending.set(key, fog.get(key));
    }
    version = fog.revision;
  }
  function changed(x, y) {
    const key = packKey(chunkCoord(x), chunkCoord(y), SURFACE), values = classified.get(key);
    if (!values) return;
    const bit = chunkIndex(x, y), before = values[bit], type = readType(x, y);
    const amounts = remaining.get(key), amount = readRichness(x, y);
    if (before === type && Math.min(2, amounts[bit]) === Math.min(2, amount)) { amounts[bit] = Math.min(2, amount); return; }
    edit(x, y, before, amounts[bit], false);
    values[bit] = type; amounts[bit] = Math.min(2, amount); edit(x, y, type, amount, true);
  }

  function query(type, px, py, radius, work, minimum = 0) {
    pending.visit(SURFACE, chunkCoord(px - radius), chunkCoord(py - radius),
      chunkCoord(px + radius), chunkCoord(py + radius), (cx, cy, mask) => {
        if (work) work.classifiedChunks = (work.classifiedChunks || 0) + 1;
        const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE;
        const values = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE), amounts = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) if (mask[i >> 3] & (1 << (i & 7))) {
          const x = ox + i % CHUNK_SIZE, y = oy + Math.floor(i / CHUNK_SIZE);
          if (work) work.classifiedCells = (work.classifiedCells || 0) + 1;
          const type = readType(x, y), amount = readRichness(x, y); values[i] = type; amounts[i] = Math.min(2, amount); edit(x, y, type, amount, true);
        }
        const key = packKey(cx, cy, SURFACE);
        classified.set(key, values); remaining.set(key, amounts); pending.delete(key);
      });
    return types.get(type * 3 + minimum) || empty;
  }
  const empty = new ExploredChunks();
  return { fog, reveal, changed, query, get version() { return version; } };
}
