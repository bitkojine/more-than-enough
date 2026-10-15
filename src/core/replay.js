/* The room doing what a player did (see acts.js): the same rules on its own
 * copy of that player's state, so what they have follows from what they did.
 * Nothing here trusts the act: each goes through the same checks as in the
 * game (reach, tools, costs, free tiles), from where the act says they stood. */

import { SURFACE, Z_MIN } from './coords.js';
import { harvestAt, collect, place } from './actions.js';
import { placeProp } from './underground.js';
import { buy, UPGRADES } from './upgrades.js';
import { EXTRACTORS, PROPS } from './content.js';
import { step, revealAround } from './sim.js';
import { advanceGoals } from './goals.js';

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

// Does act `a` on state `s` (time already brought up to the act's). Returns
// whether it worked: an act the rules refuse changes nothing.
export function replayAct(s, a) {
  const [kind, , x, y, z] = a;
  if (z > SURFACE || z < Z_MIN) return false;
  s.player.x = x; s.player.y = y; s.player.z = z;
  s.underground.deepest = Math.min(s.underground.deepest, z);
  revealAround(s);
  let ok = false;
  if (kind === 'h') ok = !!harvestAt(s, a[5], a[6]);
  else if (kind === 'c') ok = !!collect(s);
  else if (kind === 'b') ok = Object.hasOwn(EXTRACTORS, a[5]) && place(s, a[5], { x: a[6], y: a[7] }).ok;
  else if (kind === 'p') ok = Object.hasOwn(PROPS, a[5]) && placeProp(s, a[5]).ok;
  else if (kind === 'u') ok = Object.hasOwn(UPGRADES, a[5]) && buy(s, a[5]).ok;
  else if (kind === 'w') return true; // only where they are
  if (ok) advanceGoals(s);
  return ok;
}
