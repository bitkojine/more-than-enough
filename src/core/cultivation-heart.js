import { generateChunk } from './terrain.js';
import { hash2 } from './noise.js';
import { CHUNK_SIZE, SURFACE, chunkCoord, chunkIndex } from './coords.js';
import { T, TILE_INFO } from './tiles.js';
import { illuminationAt, sunLightStrength, LIGHT_MAX } from './illumination.js';
import { tileAt } from './world.js';

/* The machine is a teleporter. Its heart was stolen and sent, in the last
 * teleport, to a hiding place far off on the surface; without it the machine
 * and all teleportation went dark (Watch, 2026-10-25). The heart cannot be
 * grown: it is carried home, and sunlight, lanterns and heat crack it. */
export const HEART_DISTANCE = 2500; // metres from home to the hiding place
export const HEART_MIN = 50; // the heart the machine accepts, % sound
export const HEART_SUN = 0.15; // % lost per second carried in full sun
export const HEART_MEND = 0.25; // % mended per second resting in a shelter
// The sealed carrier blocks light but not heat (Watch, 2026-11-01): the sun
// warms it, and warmth past HEART_WARM_LINE cracks the heart at the same rate
// as any other heat. Shade, night, the underground and shelters cool it.
// Playtest values: unshaded, the line comes after ~40 s of noon sun.
export const HEART_WARM_RISE = 0.1; // °C per second in full sun
export const HEART_WARM_COOL = 0.15; // °C per second out of the sun
export const HEART_WARM_REST = 0.3; // °C per second resting in a shelter
export const HEART_WARM_LINE = 4; // °C of sun warmth where cracking starts
export const HEART_WARM_MAX = 10; // the most the sun can add
export const HEART_BURN = 0.8; // % cracked per second per °C past the line
export const HEART_LINING = 0.5; // a mycelium-lined carrier warms half as fast
export const BENCH_RANGE = 24; // metres from the hiding place a carrier bench may stand
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
export const newHeart = () => ({ where: 'station', health: 100, warmth: 0 });
export function heartAt(s, x, y, z = s.player.z) {
  const h = hidingPlace(s.world.seed);
  return z === 0 && x === h.x && y === h.y;
}

// A sealed carrier protects the heart exactly as it protects ordinary crystal.
export function heartLight(s, p) {
  if (s.cultivation.gear.carrier) return 0;
  return Math.min(1, illuminationAt(s, p.x, p.y, p.z).level / LIGHT_MAX);
}

// How much of the sun reaches the carrier where Mica stands, 0 to 1. Water,
// a riverbank and a cave mouth are full shade; a forest is dappled
// and lets half through. Only the land already there decides, so no played
// world changes (AGENTS.md).
const FULL_SHADE = new Set([T.WATER, T.CAVE, T.RISE]);
export function carrierShade(s, x, y, z = s.player.z) {
  if (z !== SURFACE) return 1;
  const here = tileAt(s.world, x, y, z);
  if (FULL_SHADE.has(here)) return 1;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ])
    if (tileAt(s.world, x + dx, y + dy, z) === T.WATER) return 1;
  return here === T.FOREST ? 0.5 : 0;
}
export function carrierSun(s, p) {
  if (p.z !== SURFACE) return 0;
  const lined = s.cultivation?.gear.lining ? HEART_LINING : 1;
  return sunLightStrength(s) * (1 - carrierShade(s, p.x, p.y, p.z)) * lined;
}
// Whether tile (x, y, z) is close enough to the hiding place for its camp.
export function nearHidingPlace(s, x, y, z) {
  const h = hidingPlace(s.world.seed);
  return z === SURFACE && Math.hypot(x - h.x, y - h.y) <= BENCH_RANGE;
}
// One step of the carried heart's warmth; returns the % it cracks this step.
export function warmCarrier(h, sun, seconds) {
  const w = h.warmth || 0;
  h.warmth =
    sun > 0
      ? Math.min(HEART_WARM_MAX, w + HEART_WARM_RISE * sun * seconds)
      : Math.max(0, w - HEART_WARM_COOL * seconds);
  // The average over the step, so a 4 Hz step cracks as a smooth climb would.
  const past = ((w + h.warmth) / 2 - HEART_WARM_LINE) * HEART_BURN;
  return Math.max(0, past) * seconds;
}
