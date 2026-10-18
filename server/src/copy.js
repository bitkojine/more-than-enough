/* An admin's copy of a shared world: the room's every entry, in a room of
 * its own, played as one of its players to see what they would see coming
 * back now (Watch's ask). Nothing in it reaches the real room or player.
 *
 * - The copy has its own random id: it's never in the Registry, so it isn't
 *   listed, and it's deleted at `until` (COPY_MS), sockets and all.
 * - Only one key gets in: a new one made for the admin, never the player's
 *   own (the room has only a hash of that, see playerId). The copy knows
 *   that key's id there (`key`) and plays it as the copied player (`as`):
 *   their id, colour, progress, buildings and time away are the room's.
 * - Nobody else joins: there are no invite links in it, and none are made.
 * - It keeps no audit log (Room.audit), so no cheat, ban or drift of the
 *   real player is ever written.
 *
 * The rest is the room's own rules (room.js), so the return plays as it
 * would for them: away-time credit and the room setting the game straight. What was on their phone (the numbers
 * it last showed, the version it ran) only their phone knows: the copy
 * plays as their character coming back on a phone that has nothing. */

export const COPY_MS = 2 * 3600_000; // a copy lasts this long

// The room's entries, as storage would hold them if it wrote everything
// now: its own copy of each player's progress where it's working one out
// (newer than the progress kept). Reads only; the room is left as it was.
export function snapshot(room) {
  const entries = room.entries();
  for (const [id, pl] of room.players) {
    const save = room.saveFor(id, pl);
    if (save !== pl.save) entries.get('p:' + id).save = save;
  }
  return entries;
}

// The entries of a copy of the room in `entries` (snapshot), played as
// player `as` by whoever's key has id `key` in the copy, until `until`
// (ms). Null if there's no such player, or nothing to copy.
// (The real links are left out: nobody comes in through them, and their
// codes would let the copy's player into the real world.)
export function copyEntries(entries, as, key, until) {
  const meta = entries.get('meta');
  const pl = entries.get('p:' + as);
  if (!meta || !pl) return null;
  const out = new Map(entries);
  out.set('meta', { ...meta, inv: [], copy: { as, key, until } });
  return out;
}
