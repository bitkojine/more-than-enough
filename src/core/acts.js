/* What the player does, written down in a shared world so the room can do
 * the same with the same rules (src/core/replay.js, server/src/shadow.js)
 * and know what the player really has. Off (s.acts not an array) when
 * playing alone, and while the room replays.
 *
 * An act: [kind, ms, x, y, z, ...args], where ms is the player's play time
 * (stats.playedMs) and x, y, z where they stood:
 *   ['h', …, tx, ty]       worked tile (tx, ty) once (gather, dig, a find)
 *   ['c', …, tx?, ty?]     collected one contacted building (target if supported)
 *   ['b', …, key, tx, ty]  put up building `key` on tile (tx, ty)
 *   ['v', …, fx, fy, tx, ty] moved their building on (fx, fy) to (tx, ty)
 *   ['p', …, kind]         set down prop `kind` where they stand
 *   ['u', …, id]           bought upgrade `id`
 *   ['w', …]               walked here (every WHERE_STEP tiles)
 * and in a crystal room (0.194.0), where they stood before it:
 *   ['k', …, type, tx, ty, arg]  crystal command `type` (cultivation-commands.js)
 *                          at tile (tx, ty); arg: a building or tool kind, the
 *                          stop to teleport to, or 0
 *   ['m', …, fx, fy, tx, ty] moved their crystal building on (fx, fy) to (tx, ty)
 *   ['f', …]               made and lit a flare, or put out the one burning
 * and when someone else's crystal is shared (0.200.0, cultivation-share.js):
 *   ['t', …, n]            did job number `n` someone asked of their building
 *   ['g', …, n]            took in what came of their ask number `n`
 *   ['l', …, n]            someone else's light number `n` shone on them (0.202.0)
 *   ['j', …, fx, fy, tx, ty, tz] teleported from the machine on (fx, fy) to
 *                          someone else's shelter on (tx, ty, tz) (0.203.0) */

export const ACT_KINDS = Object.freeze([
  'h',
  'c',
  'b',
  'v',
  'p',
  'u',
  'w',
  'k',
  'm',
  'f',
  't',
  'g',
  'l',
  'j'
]);
const MAX_WAITING = 6000; // acts kept while they wait to be sent (minutes of walking)
const WHERE_STEP = 0.5; // tiles walked between two 'w' acts

const r3 = (v) => Math.round(v * 1000) / 1000;

export function noteAct(s, kind, ...args) {
  if (!Array.isArray(s.acts)) return;
  if (s.acts.length >= MAX_WAITING) s.acts.shift();
  const p = s.player;
  s.acts.push([kind, Math.round(s.stats.playedMs), r3(p.x), r3(p.y), p.z, ...args]);
  s.actedAt = { x: p.x, y: p.y, z: p.z };
}

// Notes act `kind` as done from where the player stands now, before it is
// done (a teleport moves them), and takes it back if it then didn't work.
// Returns what `run` returned.
export function noteIf(s, worked, run, kind, ...args) {
  noteAct(s, kind, ...args);
  const a = Array.isArray(s.acts) ? s.acts.at(-1) : null;
  const result = run();
  if (a && !worked(result) && s.acts.at(-1) === a) s.acts.pop();
  return result;
}

// Where the player is now, if they've walked WHERE_STEP since the last act.
export function noteWhere(s) {
  if (!Array.isArray(s.acts)) return;
  const p = s.player,
    l = s.actedAt;
  if (!l || l.z !== p.z || Math.hypot(p.x - l.x, p.y - l.y) >= WHERE_STEP) noteAct(s, 'w');
}

// The acts waiting to be sent, taken.
export function takeActs(s) {
  if (!Array.isArray(s.acts) || !s.acts.length) return [];
  const out = s.acts;
  s.acts = [];
  return out;
}
