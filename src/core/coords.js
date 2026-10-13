/* World coordinates.
 *
 * Every position in the game is (x, y, z). x and y run across the map; z is the
 * layer. The forest surface is z = 0 and each mine layer below it is one lower
 * (-1, -2, ...). Layers share x/y, so the tile at (5, 9, -2) sits directly
 * beneath the forest tile at (5, 9, 0).
 *
 * Tiles are integer coordinates; entities (the player, effects) use floats and
 * occupy the tile at their floor. */

export const SURFACE = 0;
export const CHUNK_SIZE = 16;
export const CHUNK_TILES = CHUNK_SIZE * CHUNK_SIZE;

// Numeric key packing: |x|, |y| < 2^20 and z in [-512, 511]. The result stays
// below 2^52, inside the exactly-representable integer range of a double.
const XY_OFFSET = 2 ** 20;
const XY_SPAN = 2 ** 21;
const Z_OFFSET = 2 ** 9;
export const Z_MIN = -Z_OFFSET;

export function packKey(x, y, z) {
  return ((z + Z_OFFSET) * XY_SPAN + (x + XY_OFFSET)) * XY_SPAN + (y + XY_OFFSET);
}

export function unpackKey(key) {
  const y = (key % XY_SPAN) - XY_OFFSET;
  const rest = Math.floor(key / XY_SPAN);
  const x = (rest % XY_SPAN) - XY_OFFSET;
  const z = Math.floor(rest / XY_SPAN) - Z_OFFSET;
  return { x, y, z };
}

export function chunkCoord(v) {
  return Math.floor(v / CHUNK_SIZE);
}

// Index of tile (x, y) inside its chunk's flat arrays.
export function chunkIndex(x, y) {
  const lx = x - chunkCoord(x) * CHUNK_SIZE;
  const ly = y - chunkCoord(y) * CHUNK_SIZE;
  return ly * CHUNK_SIZE + lx;
}

export function tileOf(v) {
  return Math.floor(v);
}

// Squared distance between two positions, or Infinity on different layers, so
// "within range" checks can never reach across layers.
export function layerDist2(ax, ay, az, bx, by, bz) {
  if (az !== bz) return Infinity;
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

// Squared distance from a position to the centre of tile (tx, ty, tz).
export function tileDist2(p, tx, ty, tz) {
  return layerDist2(tx + 0.5, ty + 0.5, tz, p.x, p.y, p.z);
}
