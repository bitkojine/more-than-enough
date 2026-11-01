/* The decisions behind playing together (together.js) that don't need the
 * page or the network: what a closed connection means, what the player is
 * told when the room takes something back, where you arrive, what your
 * position message says, and how a backlog of edits is cut into messages.
 * Pure, so test/unit/together-rules.test.js runs them in Node. */

import * as Core from '../core/index.js';
import { LIMITS, cleanPos, cleanEdits } from '../net/protocol.js';
import { t } from '../i18n/i18n.js';

// What a closed connection means for the game, from the close code and
// reason the room service uses (server/src/room.js, server/src/copy.js):
//   elsewhere  another screen plays this world now
//   removed    this character is gone from the world
//   frozen     the moderator froze it (its progress was hacked)
//   copyEnded  an admin's copy whose time was up
//   invite     the link no longer works
//   full       the world has as many players as it takes
//   lost       anything else: the line dropped
export function closeReason(code, reason) {
  if (code === 4001) return 'elsewhere';
  if (code === 4003) return 'removed';
  if (code === 4005 || reason === 'frozen') return 'frozen';
  if (code === 4006) return 'copyEnded';
  if (reason === 'invite') return 'invite';
  if (reason === 'full') return 'full';
  return 'lost';
}

// Why the room refused something (server/src/shadow.js whyNot), the most
// telling first; 'count' when it said nothing (only the counts differed).
export const UNDONE_WHY = ['full', 'spot', 'cost', 'pace'];

// The note for something the room took back (Core.takenBack): what, and why
// as the room saw it. Null when nothing was.
export function undoneText(lost, why) {
  if (!lost) return null;
  const what = lost.buildings
    ? t('together.undone.buildings', { count: lost.buildings })
    : lost.levels
      ? t('together.undone.levels', { count: lost.levels })
      : t('together.undone.res', { res: lost.res.map((r) => Core.RESOURCE_LOWER[r]).join(', ') });
  const reason = UNDONE_WHY.find((w) => Array.isArray(why) && why.includes(w)) || 'count';
  return what + '. ' + t('together.why.' + reason);
}

// Where you arrive in a shared world: beside the nearest friend who's
// online, else where the room last had you.
export function arrivalSpot(players, mine) {
  const at = mine || { x: 0, y: 0 };
  const far = (p) => Math.hypot(p.x - at.x, p.y - at.y);
  const online = [...players.values()].filter((f) => f.st === 'online' && f.p).map((f) => f.p);
  return online.sort((a, b) => far(a) - far(b))[0] || mine;
}

// Your position as friends see it, checked as the room checks it: where you
// stand and face, whether you walk, hold up your sign, carry a basket (1) or
// pickaxe (2), and what you're doing (render/motion.js act).
export function positionOf(s, facing, moving, sign, act) {
  const p = s.player;
  return cleanPos({
    x: p.x,
    y: p.y,
    z: p.z,
    fx: facing.x,
    fy: facing.y,
    m: moving,
    sign,
    gear: (s.tools.basket > 0 ? 1 : 0) | (s.tools.pickaxe > 0 ? 2 : 0),
    ...act
  });
}

// A backlog of edits cut into messages: `per` edits each, at most `most`
// messages now; what's left waits for the next turn (`later`, oldest first).
export function editBatches(edits, per = LIMITS.editsPerMessage, most = 3) {
  const now = edits.slice(0, per * most);
  const batches = [];
  for (let i = 0; i < now.length; i += per) {
    const batch = cleanEdits(now.slice(i, i + per));
    if (batch) batches.push(batch);
  }
  return { batches, later: edits.slice(per * most) };
}

// What the welcome's stored copies are worth: a world made again since this
// phone was last in it (by the nuke, before v0.117.0) leaves this phone's
// progress, map and unsent acts from a world that's gone.
export const renewedSince = (keptGen, gen) => keptGen !== null && keptGen !== String(gen);
