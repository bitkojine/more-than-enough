/* The room doing what a player did (see acts.js): the same rules on its own
 * copy of that player's state, so what they have follows from what they did.
 * Nothing here trusts the act: each goes through the same checks as in the
 * game (reach, tools, costs, free tiles), from where the act says they stood. */

import { SURFACE, Z_MIN } from './coords.js';
import { harvestAt, collect, place, moveExtractor } from './actions.js';
import { placeProp } from './underground.js';
import { buy, UPGRADES } from './upgrades.js';
import { EXTRACTORS, PROPS } from './content.js';
import { step, revealAround } from './sim.js';
import { advanceGoals } from './goals.js';
import { cultivationCommand, commandOfAct, COMMAND_DONE } from './cultivation-commands.js';
import { moveFacility } from './cultivation.js';
import { useFlare } from './flare.js';

const STEP = 0.25; // seconds per step, as the game's longest frame

// Lets `seconds` of play pass for state `s`: its buildings make things and
// the engine trickles, in steps no longer than the game's.
export function playFor(s, seconds) {
  while (seconds > 1e-9) {
    const dt = Math.min(STEP, seconds);
    step(s, dt);
    seconds -= dt;
  }
  s.events.length = 0;
}

// How each kind of act is done again (acts.js): whether it worked.
const DO = {
  h: (s, a) => !!harvestAt(s, a[5], a[6]),
  c(s, a) {
    const targeted = a.length === 7;
    if (targeted) s.roomCollectAt = true;
    return !!collect(s, targeted ? { x: a[5], y: a[6] } : null);
  },
  b: (s, a) => Object.hasOwn(EXTRACTORS, a[5]) && place(s, a[5], { x: a[6], y: a[7] }).ok,
  v(s, a) {
    const e = s.extractors.find(
      (b) => b.x === a[5] && b.y === a[6] && b.z === a[4] && b.owner === s.me
    );
    return !!e && moveExtractor(s, e, a[7], a[8]).ok;
  },
  p: (s, a) => Object.hasOwn(PROPS, a[5]) && placeProp(s, a[5]).ok,
  u: (s, a) => Object.hasOwn(UPGRADES, a[5]) && buy(s, a[5]).ok,
  // A crystal room's (0.194.0): a command, a crystal building moved, a flare.
  k: (s, a) => COMMAND_DONE.includes(cultivationCommand(s, commandOfAct(a))),
  m(s, a) {
    const b = s.cultivation?.facilities.find((f) => f.x === a[5] && f.y === a[6] && f.z === a[4]);
    return !!b && moveFacility(s, b, a[7], a[8]) === 'ok';
  },
  f: (s) => ['lit', 'out'].includes(useFlare(s))
};

// Does act `a` on state `s` (time already brought up to the act's). Returns
// whether it worked: an act the rules refuse changes nothing.
export function replayAct(s, a) {
  const [kind, , x, y, z] = a;
  if (z > SURFACE || z < Z_MIN) return false;
  s.player.x = x;
  s.player.y = y;
  s.player.z = z;
  s.underground.deepest = Math.min(s.underground.deepest, z);
  revealAround(s);
  if (kind === 'w') return true; // only where they are
  const ok = Object.hasOwn(DO, kind) && DO[kind](s, a);
  if (ok) advanceGoals(s);
  return ok;
}
