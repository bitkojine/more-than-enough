/* Everyone else's crystal buildings in a crystal shared world (0.199.0):
 * what you see of them and where they stand in your way. Each player's
 * buildings stay in their own progress (cultivation-model.js), worked out
 * by the room from what they did (server/src/shadow.js); the room tells
 * everyone else where they stand and how they look, and your own game (and
 * the room's copy of you) keeps that as `s.theirs`: never saved, it comes
 * again with every welcome.
 *
 * A building in the list is [kind, x, y, z, look], and the room adds its
 * owner's id to each one it sends: `look` is the picture's phase (lookOf). */

import { CULTIVATION_LOOK, machineSections } from './cultivation-model.js';

export const THEIRS_EACH = 200; // one player's buildings anyone else is told of, at most
const ID = /^[0-9a-f]{16}$/;

// Which look building `b` of world `s` wears: the machine by its sections,
// a shelter lit while the heart rests in it, the rest by whether they hold
// anything alive.
export function lookOf(s, b) {
  const c = s.cultivation;
  if (b.kind === 'machine') return c.completed ? 4 : machineSections(b);
  if (b.kind === 'station') return c.heart?.where === 'station' ? 1 : 0;
  if (b.kind === 'shelter') return c.heart?.where === b.id ? 1 : 0;
  if (b.kind === 'chamber') return b.health > 0 ? 1 : 0;
  return b.buffer > 0 ? 1 : 0;
}

/** @returns {Array<[string, number, number, number, number]>} what others are told of `s`'s buildings */
export function builtOf(s) {
  return (s.cultivation?.facilities || [])
    .slice(0, THEIRS_EACH)
    .map((b) => [b.kind, b.x, b.y, b.z, lookOf(s, b)]);
}

const cleanOne = (e, by) =>
  Array.isArray(e) &&
  Object.hasOwn(CULTIVATION_LOOK, e[0]) &&
  e[0] !== 'station' &&
  [1, 2, 3, 4].every((i) => Number.isSafeInteger(e[i])) &&
  e[4] >= 0 &&
  e[4] <= 4 &&
  ID.test(by)
    ? { kind: e[0], x: e[1], y: e[2], z: e[3], look: e[4], by }
    : null;

// Player `by`'s buildings from a 'built' message: a list as builtOf makes
// it, or null when any part of it doesn't fit.
export function cleanBuilt(list, by) {
  if (!Array.isArray(list) || list.length > THEIRS_EACH) return null;
  const out = list.map((e) => cleanOne(e, by));
  return out.every(Boolean) ? out : null;
}

// Everyone's buildings from a welcome ([kind, x, y, z, look, owner] each),
// but `me`'s own; [] when it says nothing, or any part doesn't fit.
export function theirsFrom(list, me) {
  if (!Array.isArray(list) || list.length > THEIRS_EACH * 100) return [];
  const out = [];
  for (const e of list) {
    const b = Array.isArray(e) && cleanOne(e, e[5]);
    if (!b) return [];
    if (b.by !== me) out.push(b);
  }
  return out;
}

// Puts player `by`'s buildings in `s.theirs` in place of the ones it had.
// Says whether anything changed.
export function setTheirs(s, by, list) {
  if (!s.cultivation || by === s.me) return false;
  const before = s.theirs || [];
  const kept = before.filter((b) => b.by !== by);
  if (kept.length === before.length && !list.length) return false;
  s.theirs = [...kept, ...list];
  return true;
}

// Someone else's building on tile (x, y, z), or null. Looked up by tile:
// a list is never changed, only replaced, so each one is indexed once.
const indexes = new WeakMap();
export function theirsAt(s, x, y, z) {
  if (!s.theirs?.length) return null;
  let at = indexes.get(s.theirs);
  if (!at) {
    at = new Map();
    for (const b of s.theirs) at.set(b.x + ',' + b.y + ',' + b.z, b);
    indexes.set(s.theirs, at);
  }
  const b = at.get(x + ',' + y + ',' + z);
  return b && b.by !== s.me ? b : null;
}
