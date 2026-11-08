/* What a company bot says (bot plan phase 5, 0.210.0): one of the room's
 * fixed lines (BOT_LINES in src/net/protocol.js), when something happens in
 * its own story, or hello to a person who comes near. Games show a line to
 * whoever is near the bot, in their own language (bots.say.* in src/i18n).
 *
 * `seen(state, rows)` looks at the bot's world after a frame, with the
 * Players rows from where it stands (friends.rows), and returns the line it
 * now has to say, or null. What it already had when it came in says
 * nothing: `start(state)` takes that as the baseline. */

import { SAY_MS } from '../../src/net/protocol.js';
import { HEAR_BOT } from '../../src/game/room-handlers.js';

// A person awake on its layer, near enough to hear it.
const heard = (r) =>
  !r.you && !r.bot && r.st === 'online' && r.dz === 0 && r.far !== null && r.far <= HEAR_BOT;

const count = (c, kind) => c.facilities.filter((b) => b.kind === kind).length;

function storyOf(s) {
  const c = s.cultivation;
  return {
    deep: Math.max(0, -s.player.z),
    crystal: (s.inv.crystal || 0) > 0,
    chamber: count(c, 'chamber'),
    shelter: count(c, 'shelter'),
    heart: c.heart?.where || null,
    woke: c.completed === true
  };
}

export function createLines() {
  let was = null,
    deepest = 0,
    grew = false;
  const greeted = new Set(); // people it said hello to on this visit
  const queue = [];
  let hello = false; // a person came near
  let saidAt = -Infinity;

  function changes(now) {
    const out = [];
    if (now.deep > deepest) {
      deepest = now.deep;
      out.push('down');
    }
    if (now.crystal && !grew) {
      grew = true;
      out.push('crystal');
    }
    if (now.chamber > was.chamber) out.push('chamber');
    if (now.shelter > was.shelter) out.push('shelter');
    if (now.heart === 'carried' && was.heart !== 'carried') out.push('heart');
    if (now.heart === 'installed' && was.heart !== 'installed') out.push('home');
    if (now.woke && !was.woke) out.push('woke');
    return out;
  }

  return {
    start(s) {
      was = storyOf(s);
      deepest = was.deep;
      grew = was.crystal;
      greeted.clear();
      queue.length = 0;
      hello = false;
    },
    // The line to say at time `secs` (seconds), or null. Hello comes first;
    // of its story, only the latest few are kept: old news isn't said.
    seen(s, rows, secs) {
      if (!was || !s.cultivation) return null;
      const now = storyOf(s);
      for (const k of changes(now)) if (!queue.includes(k)) queue.push(k);
      queue.splice(0, queue.length - 3);
      was = now;
      for (const r of rows)
        if (heard(r) && !greeted.has(r.id)) {
          greeted.add(r.id);
          hello = true;
        }
      if ((!hello && !queue.length) || (secs - saidAt) * 1000 < SAY_MS) return null;
      saidAt = secs;
      if (!hello) return queue.shift();
      hello = false;
      return 'hello';
    }
  };
}
