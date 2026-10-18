/* What the player does, written down in a shared world so the room can do
 * the same with the same rules (src/core/replay.js, server/src/shadow.js)
 * and know what the player really has. Off (s.acts not an array) when
 * playing alone, and while the room replays.
 *
 * An act: [kind, ms, x, y, z, ...args], where ms is the player's play time
 * (stats.playedMs) and x, y, z where they stood:
 *   ['h', …, tx, ty]       worked tile (tx, ty) once (gather, dig, a find)
 *   ['c', …]               collected from their buildings in range
 *   ['b', …, key, tx, ty]  put up building `key` on tile (tx, ty)
 *   ['p', …, kind]         set down prop `kind` where they stand
 *   ['u', …, id]           bought upgrade `id`
 *   ['w', …]               walked here (every WHERE_STEP tiles) */

export const ACT_KINDS = Object.freeze(['h', 'c', 'b', 'p', 'u', 'w']);
const MAX_WAITING = 6000; // acts kept while they wait to be sent (minutes of walking)
const WHERE_STEP = 0.5;   // tiles walked between two 'w' acts

const r3 = (v) => Math.round(v * 1000) / 1000;

export function noteAct(s, kind, ...args) {
  if (!Array.isArray(s.acts)) return;
  if (s.acts.length >= MAX_WAITING) s.acts.shift();
  const p = s.player;
  s.acts.push([kind, Math.round(s.stats.playedMs), r3(p.x), r3(p.y), p.z, ...args]);
  s.actedAt = { x: p.x, y: p.y, z: p.z };
}

// Where the player is now, if they've walked WHERE_STEP since the last act.
export function noteWhere(s) {
  if (!Array.isArray(s.acts)) return;
  const p = s.player, l = s.actedAt;
  if (!l || l.z !== p.z || Math.hypot(p.x - l.x, p.y - l.y) >= WHERE_STEP) noteAct(s, 'w');
}

// The acts waiting to be sent, taken.
export function takeActs(s) {
  if (!Array.isArray(s.acts) || !s.acts.length) return [];
  const out = s.acts;
  s.acts = [];
  return out;
}
