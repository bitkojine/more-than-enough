/* Where the room service (server/) runs. Empty means playing together is not
 * set up yet, and the game doesn't offer it. */

export const ROOM_SERVICE = 'https://rooms.robertasrudys.com';

// On a developer's own machine, ?rooms=http://localhost:8787 points the game
// at a local `wrangler dev`. Never anywhere else: a link must not be able to
// send a player's game to a server of someone else's choosing.
export function roomService(loc = location) {
  const local = /^(localhost|127\.0\.0\.1)$/.test(loc.hostname);
  const asked = local ? new URLSearchParams(loc.search).get('rooms') : null;
  if (asked && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(asked)) return asked;
  return ROOM_SERVICE;
}
