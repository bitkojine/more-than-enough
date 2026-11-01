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
// Every living crystal thing cracks above one temperature, at one rate per
// degree past it: colonies, chambers, the machine, and whatever the carrier
// holds (Watch, 2026-11-01: "same carrier, same rule").
export const CRACK_ABOVE = 22; // °C
export const HEAT_BURN = 0.8; // % cracked per second per °C past CRACK_ABOVE
export const heatDamage = (temperature) => Math.max(0, temperature - CRACK_ABOVE) * HEAT_BURN;
// The sealed carrier blocks light but not heat: the sun warms it while it
// holds something, and its temperature is its surroundings plus that warmth.
// Cool spots, night and the underground cool it. On the surface (18 °C) the
// line comes after ~40 s of unshaded noon sun. Playtest values.
export const HEART_WARM_RISE = 0.1; // °C per second in full sun
export const HEART_WARM_COOL = 0.15; // °C per second out of the sun or empty
export const HEART_WARM_LINE = 4; // °C of warmth that takes the surface to CRACK_ABOVE
export const HEART_WARM_MAX = 10; // the most the sun can add
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

// Water cools the carrier: standing in it or beside it stops the sun warming
// it, whatever the light (Watch, 2026-11-01: water cools; shade is the light
// field's own, see skyThrough in illumination.js).
export function waterCools(s, x, y, z = s.player.z) {
  if (tileAt(s.world, x, y, z) === T.WATER) return true;
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ].some(([dx, dy]) => tileAt(s.world, x + dx, y + dy, z) === T.WATER);
}
// How strongly the sun warms the carrier where Mica stands, 0 to 1: the
// sunlight that physically reaches the tile (a forest's shade halves it, a
// cave mouth or the underground stops it), unless water cools it. Lamps and
// lanterns light but don't warm.
export function carrierSun(s, p) {
  const sky = illuminationAt(s, p.x, p.y, p.z).sky;
  if (!sky || waterCools(s, p.x, p.y, p.z)) return 0;
  const lined = s.cultivation?.gear.lining ? HEART_LINING : 1;
  return (sky / LIGHT_MAX) * sunLightStrength(s) * lined;
}
// Whether tile (x, y, z) is close enough to the hiding place for its camp.
export function nearHidingPlace(s, x, y, z) {
  const h = hidingPlace(s.world.seed);
  return z === SURFACE && Math.hypot(x - h.x, y - h.y) <= BENCH_RANGE;
}
// Whether the carrier holds anything: the heart, a starter or crystal.
export function carrierLoaded(s) {
  const c = s.cultivation;
  return !!c?.gear.carrier && (c.heart?.where === 'carried' || !!c.starter || s.inv.crystal > 0);
}
// One step of the carrier's sun warmth (°C added to its surroundings); it
// warms only while loaded and in sun. Returns the average over the step, so
// a 4 Hz step cracks as a smooth climb would.
export function warmCarrier(c, sun, seconds, loaded = true) {
  const w = c.carrierWarmth || 0;
  c.carrierWarmth =
    loaded && sun > 0
      ? Math.min(HEART_WARM_MAX, w + HEART_WARM_RISE * sun * seconds)
      : Math.max(0, w - HEART_WARM_COOL * seconds);
  return (w + c.carrierWarmth) / 2;
}
