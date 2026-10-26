/* How a room is laid out in its Durable Object's storage (server/src/room.js
 * writes it, worker.js puts it): one entry each for 'meta', 'props' and
 * 'ext', the land's richness edits in MOD_BUCKETS pieces 'mods:<n>', and one
 * 'p:<id>' per player. What changed since the last write is marked in a
 * dirty set ({meta, buckets, props, ext, players}), so a write carries only
 * that, and a write that failed is marked again (redo). */

// Richness edits are stored in this many pieces, each well under a storage
// value's 128 KiB however full the world (LIMITS.mods). A world stored in
// fewer (16 before v0.126.0) is spread over these on its first write.
export const MOD_BUCKETS = 512;

export const bucketOf = (key) => key % MOD_BUCKETS;
const allBuckets = () => new Set(Array.from({ length: MOD_BUCKETS }, (_, i) => i));

// Nothing changed.
export const clean = () => ({ meta: false, buckets: new Set(), props: false, ext: false, players: new Set() });

// Everything, for players `ids`: a world's first write, or a copy of all of it.
export const everything = (ids) => ({ meta: true, buckets: allBuckets(), props: true, ext: true, players: new Set(ids) });

export const isDirty = (d) => d.meta || d.props || d.ext || d.buckets.size > 0 || d.players.size > 0;

// Every storage key a world with players `ids` takes.
export const keysOf = (ids) => ['meta', 'props', 'ext', ...[...allBuckets()].map((i) => 'mods:' + i), ...[...ids].map((id) => 'p:' + id)];

// Marks in `d` the parts storage keys `keys` hold (a write that didn't land).
export function markKeys(d, keys) {
  for (const k of keys) {
    if (k === 'meta') d.meta = true;
    else if (k === 'props') d.props = true;
    else if (k === 'ext') d.ext = true;
    else if (k.startsWith('mods:')) d.buckets.add(Number(k.slice(5)));
    else if (k.startsWith('p:')) d.players.add(k.slice(2));
  }
}

// The pieces `buckets` of the edits `mods` ([key, richness]...), each
// written whole: 'mods:<n>' -> list (empty for a piece with none).
export function piecesOf(mods, buckets) {
  const pieces = new Map([...buckets].map((b) => [b, []]));
  for (const m of mods) pieces.get(bucketOf(m[0]))?.push(m);
  return new Map([...pieces].map(([b, list]) => ['mods:' + b, list]));
}

// The edits stored in `entries` (key -> value), and whether any sits in a
// piece other than bucketOf gives it (then every piece is written again,
// so none keeps an edit that now lives in another).
export function modsIn(entries) {
  const mods = new Map();
  let moved = false;
  for (const [k, v] of entries) {
    if (!k.startsWith('mods:')) continue;
    const b = Number(k.slice(5));
    for (const [key, rich] of v) { mods.set(key, rich); if (bucketOf(key) !== b) moved = true; }
  }
  return { mods, moved };
}
