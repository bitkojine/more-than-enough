/* Calling the company bots (bot plan phase 3, 0.209.0): when a person comes
 * into a crystal world and none of its bots is awake, the room asks GitHub
 * to start them (.github/workflows/bots.yml, scripts/bots/run.mjs). They
 * stay while a person is awake there and leave asleep two minutes after the
 * last one goes, so the world never moves on without people (time away
 * makes nothing).
 *
 * Off unless the Worker has the BOTS_GITHUB_TOKEN secret (rooms.yml puts it
 * there from the repository secret of that name): a token for this
 * repository with Actions: read and write, nothing else. BOTS_REPO says
 * which repository's workflow to start, so a fork starts its own. */

export const CALL_EVERY_MS = 10 * 60_000; // one call per world at most this often
export const BOTS_WORKFLOW = 'bots.yml';
const REPO = 'bitkojine/more-than-enough';

// Whether room `room` should call its bots now that player `id` was let in
// at `now`, the last call having been at `calledAt` (ms, 0 for never): a
// person (not a bot) in a crystal world, no bot of it awake, and no call
// lately (the bots take about a minute to come in).
export function botsWanted(room, id, now, calledAt) {
  if (room.eco !== 'crystal' || room.copy) return false;
  const pl = room.players.get(id);
  if (!pl || pl.bot) return false;
  if (now - calledAt < CALL_EVERY_MS) return false;
  for (const p of room.players.values()) if (p.bot && p.st !== 'offline') return false;
  return true;
}

// Asks GitHub to start the bots in world `roomId`. True if it took it.
export async function callBots(env, roomId, fetchFn = fetch) {
  const repo = env.BOTS_REPO || REPO;
  try {
    const res = await fetchFn(
      `https://api.github.com/repos/${repo}/actions/workflows/${BOTS_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + env.BOTS_GITHUB_TOKEN,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'mica-and-wiki-rooms',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({ ref: 'main', inputs: { room: roomId } })
      }
    );
    return res.status === 204;
  } catch {
    return false;
  }
}
