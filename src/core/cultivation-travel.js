/* Teleporting, once the machine wakes (Watch, 2026-11-01: "Any of your heart
 * shelters"). Every heart shelter you built on the way home becomes a stop:
 * beside one, you can go to the machine, and beside the machine, to any of
 * them, so the route you built is the network you keep. Mica goes with all
 * she carries, as she is: a teleport is a doorway, not a rest, so the
 * carrier's warmth and whatever it holds arrive unchanged.
 *
 * The woken machine also shows where the thief went (Watch, 2026-11-01:
 * "Follow the thief"): a place on the surface farther out than the hiding
 * place, chosen from the seed alone. Its chapter is designed later; for now
 * it is a mark on the map. */
import { hash2 } from './noise.js';
import { SURFACE } from './coords.js';
import { TILE_INFO } from './tiles.js';
import { tileAt } from './world.js';
import { hidingPlace, nearSurfaceGrass } from './cultivation-heart.js';

export const THIEF_DISTANCE = 5000; // metres from home to where the thief went

const trails = new Map();
// Farther out than the hiding place, never back toward it: somewhere in the
// half of the compass that faces away from it.
export function thiefTrail(seed) {
  let at = trails.get(seed);
  if (at) return at;
  const h = hidingPlace(seed),
    away = Math.atan2(-h.y, -h.x),
    a = away + (hash2(seed, 41, 9157) - 0.5) * Math.PI;
  at = nearSurfaceGrass(
    seed,
    Math.round(Math.cos(a) * THIEF_DISTANCE),
    Math.round(Math.sin(a) * THIEF_DISTANCE)
  );
  trails.set(seed, at);
  return at;
}

const machineOf = (c) => c.facilities.find((f) => f.kind === 'machine');

// The shelters you can teleport to, nearest the machine last: none before
// the machine wakes.
export function teleportStops(s) {
  const c = s.cultivation;
  if (!c?.completed || !machineOf(c)) return [];
  const m = machineOf(c),
    far = (b) => Math.hypot(b.x - m.x, b.y - m.y) + Math.abs(b.z - m.z);
  return c.facilities.filter((f) => f.kind === 'shelter').sort((a, b) => far(b) - far(a));
}

// Where you land beside building `b`: a dry floor tile next to it, one that
// no other building stands on if there is one. You built it or found it, so
// you have seen beside it: that is not asked again (a room, doing the same,
// doesn't keep the map you saw: src/game/together.js).
function landing(s, b) {
  const w = s.world,
    taken = (x, y) => s.cultivation.facilities.some((f) => f.x === x && f.y === y && f.z === b.z),
    floor = (x, y) => {
      const info = TILE_INFO[tileAt(w, x, y, b.z)];
      return info.walk && !info.swim;
    };
  const sides = [
    [b.x, b.y + 1],
    [b.x + 1, b.y],
    [b.x, b.y - 1],
    [b.x - 1, b.y]
  ].filter(([x, y]) => floor(x, y));
  const spot = sides.find(([x, y]) => !taken(x, y)) ?? sides[0];
  return spot ? { x: spot[0], y: spot[1] } : null;
}

// Teleports from building `from` (a shelter or the machine, beside you): from
// a shelter to the machine; from the machine to the shelter with id `to`.
export function teleportFrom(s, from, to) {
  const c = s.cultivation;
  if (!c.completed) return 'asleep';
  const stops = teleportStops(s),
    target =
      from.kind === 'shelter'
        ? machineOf(c)
        : from.kind === 'machine'
          ? stops.find((b) => b.id === to)
          : null;
  if (!target || (from.kind === 'shelter' && !stops.includes(from))) return 'invalid';
  const spot = landing(s, target);
  if (!spot) return 'landing';
  s.player.x = spot.x + 0.5;
  s.player.y = spot.y + 0.5;
  s.player.z = target.z;
  if (target.z < SURFACE) s.underground.deepest = Math.min(s.underground.deepest, target.z);
  return 'teleported';
}
