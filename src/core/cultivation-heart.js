import { generateChunk } from './terrain.js';
import { hash2 } from './noise.js';
import { CHUNK_SIZE, chunkCoord, chunkIndex } from './coords.js';
import { T, TILE_INFO } from './tiles.js';
import { illuminationAt, LIGHT_MAX } from './illumination.js';

/* The machine is a teleporter. Its heart was stolen and sent, in the last
 * teleport, to a hiding place far off on the surface; without it the machine
 * and all teleportation went dark (Watch, 2026-10-25). The heart cannot be
 * grown: it is carried home, and sunlight, lanterns and heat crack it. */
export const HEART_DISTANCE = 2500; // metres from home to the hiding place
export const HEART_MIN = 50; // the heart the machine accepts, % sound
export const HEART_SUN = 0.15; // % lost per second carried in full sun
export const HEART_MEND = 0.25; // % mended per second resting in a shelter
const hideouts = new Map();
// Where the last teleport landed: open grass about HEART_DISTANCE from home,
// chosen from the seed alone so it is the same before and after anyone looks.
export function hidingPlace(seed) {
  let at = hideouts.get(seed);
  if (at) return at;
  const a = hash2((hash2(seed, 17, 7717) * 1e9) | 0, 29, seed) * Math.PI * 2,
    bx = Math.round(Math.cos(a) * HEART_DISTANCE),
    by = Math.round(Math.sin(a) * HEART_DISTANCE),
    chunks = new Map();
  const type = (x, y) => {
    const k = chunkCoord(x) + ',' + chunkCoord(y);
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = generateChunk(seed, chunkCoord(x), chunkCoord(y), 0)));
    return c.type[chunkIndex(x, y)];
  };
  const grass = (x, y) =>
    type(x, y) === T.GRASS &&
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ].every(
      ([dx, dy]) => TILE_INFO[type(x + dx, y + dy)].walk && !TILE_INFO[type(x + dx, y + dy)].swim
    );
  at = nearestGrass(bx, by, grass) ?? { x: bx, y: by };
  hideouts.set(seed, at);
  return at;
}
function nearestGrass(x, y, ok) {
  for (let r = 0; r <= 4 * CHUNK_SIZE; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx += dy === -r || dy === r ? 1 : 2 * r || 1)
        if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  return null;
}
export const newHeart = () => ({ where: 'station', health: 100 });
export function heartAt(s, x, y, z = s.player.z) {
  const h = hidingPlace(s.world.seed);
  return z === 0 && x === h.x && y === h.y;
}

// A sealed carrier protects the heart exactly as it protects ordinary crystal.
export function heartLight(s, p) {
  if (s.cultivation.gear.carrier) return 0;
  return Math.min(1, illuminationAt(s, p.x, p.y, p.z).level / LIGHT_MAX);
}
