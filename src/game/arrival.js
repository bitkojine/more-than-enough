/* Coming into a shared world from its room's welcome (together.js): what
 * this phone kept of it is checked against the world the room has, and your
 * game for it is made. `read(key)` and `write(key, value)` are this phone's
 * storage (identity.js), so tests pass a Map's.
 *
 * Nothing kept is ever trusted over the room: your progress is the room's,
 * this phone's map is only where you've looked, and what you did that the
 * room never heard of is done again on its copy and sent. */

import * as Core from '../core/index.js';
import { cleanSave } from '../net/protocol.js';
import { playedTime } from './room-messages.js';
import { arrivalSpot, renewedSince } from './together-rules.js';
import { keptActsFrom, catchUp } from './outbox.js';
import { SAVE_PREFIX, FOG_PREFIX, GEN_PREFIX, ACTS_PREFIX } from './worlds.js';

// Notes which making of world `room` the welcome `w` is from. One made
// again since this phone was last in it (by the nuke, before v0.117.0)
// leaves its copies of your progress, map and unsent acts from a world
// that's gone: those are cleared. Says whether it was made again.
export function checkMaking(room, w, read, write) {
  const renewed = renewedSince(read(GEN_PREFIX + room), w.gen);
  if (renewed) {
    write(SAVE_PREFIX + room, '');
    write(FOG_PREFIX + room, '');
    write(ACTS_PREFIX + room, '');
  }
  write(GEN_PREFIX + room, String(w.gen));
  return renewed;
}

// Your game in world `room` from its welcome `w`: {state, fixed}, or null
// when the welcome doesn't make a world. `fixed`: this phone last showed far
// more than the room counts (games before v0.91.1 could run away), so the
// player is told the room's numbers are the real ones.
export function arrivalState(room, w, renewed, read) {
  const kept = cleanSave(read(SAVE_PREFIX + room));
  const fixed = !renewed && Core.overCounted(kept, w.save);
  let fog;
  try {
    fog = JSON.parse(read(FOG_PREFIX + room) || 'null');
  } catch {
    fog = null;
  }
  const state = Core.joinState(w, room, fog, arrivalSpot(w.players, w.p));
  if (!state) return null;
  // What you did here that the room never heard of (played offline,
  // then the game closed): done again on its copy, and sent to it.
  const behind = renewed ? [] : keptActsFrom(read(ACTS_PREFIX + room), playedTime(w.save));
  if (behind.length) catchUp(state, behind, w.time);
  state.acts = behind;
  return { state, fixed };
}
