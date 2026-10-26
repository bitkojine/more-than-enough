/* Basic anti-cheat on where players walk (server/src/room.js keeps one
 * watch per player and acts on what these say).
 *
 * Nobody walks faster than MAX_SPEED tiles a second (the fastest boots with
 * many Nomad perks are well under it); a player's steps draw on a budget of
 * that much distance a second, up to MOVE_BURST, so steps that arrive bunched
 * up after a hiccup still pass. A step past the budget or an edit out of
 * reach is a cheat: the step is refused, and CHEATS_TO_FREEZE cheats (at most
 * one a second, one forgiven every CHEAT_FORGIVE_MS) freeze the character
 * (Watch's rule: nobody cheats in a shared world). A freeze deletes nothing
 * and the moderator can thaw it: nothing in a room ever deletes a player,
 * their progress or their buildings (Watch, 2026-10-20).
 *
 * Reconnecting doesn't start a player afresh: their first step after it may
 * cover only their budget, or the distance they could have walked since the
 * room last saw them. A first step further than that isn't counted as a
 * cheat (a phone that was offline, or another device, may simply be
 * elsewhere): the room tells the game where the player stands (`place`) and
 * refuses their steps and edits, quietly, until one starts from there.
 * Edits draw on a budget per player, not per connection, so a reconnect
 * doesn't refill it either. */

import { editBucket } from './limits.js';

export const MAX_SPEED = 40;
export const MOVE_BURST = 120;
export const CHEATS_TO_FREEZE = 10;
export const CHEAT_FORGIVE_MS = 30_000;

// A player's watch, the first time the room sees them (not kept: a restart
// starts it again): {at, budget, fresh, placing, cheats, cheatAt, edits}.
export function newWatch(now) {
  return { at: now, budget: MOVE_BURST, fresh: true, placing: false, cheats: 0, cheatAt: 0, edits: editBucket(now) };
}

// Whether a player on watch `w` could step from `from` (null: nowhere yet,
// a new player) to `to`, taking it from their budget. `lastAt`: when the
// room last saw them step. 'ok', 'far' (a cheat), 'place' (the first step
// after connecting starts somewhere else: not a cheat) or 'wait' (still
// not where the room has them). A climb or fall keeps them on the same spot.
export function step(w, from, to, lastAt, now) {
  w.budget = Math.min(MOVE_BURST, w.budget + (now - w.at) / 1000 * MAX_SPEED);
  w.at = now;
  if (!from) { w.fresh = w.placing = false; return 'ok'; }
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (w.fresh || w.placing) {
    const since = Number.isSafeInteger(lastAt) ? Math.max(0, now - lastAt) / 1000 * MAX_SPEED : 0;
    const ok = dist <= (w.placing ? w.budget : Math.max(w.budget, since));
    const was = w.fresh;
    w.fresh = false;
    w.placing = !ok;
    if (!ok) return was ? 'place' : 'wait';
    w.budget = Math.max(0, w.budget - dist);
    return 'ok';
  }
  if (dist > w.budget) return 'far';
  w.budget -= dist;
  return 'ok';
}

// A cheat on watch `w`: counted, at most one a second, with older ones
// forgiven slowly. Whether it was counted (then it goes in the log);
// `w.cheats >= CHEATS_TO_FREEZE` then says the character is frozen.
export function countCheat(w, now) {
  if (now - w.cheatAt < 1000) return false;
  w.cheats = Math.max(0, w.cheats - Math.floor((now - w.cheatAt) / CHEAT_FORGIVE_MS)) + 1;
  w.cheatAt = now;
  return true;
}
