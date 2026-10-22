/* Frozen scalar production tick from before the engine optimization. This is
 * a differential oracle, not a second gameplay path or an autoplay strategy. */
import { tileDist2 } from '../../src/core/coords.js';
import { noteWhere } from '../../src/core/acts.js';
import { RESOURCES } from '../../src/core/tiles.js';
import { EXTRACTORS } from '../../src/core/content.js';
import { productionMult, abundanceTrickle, earn, ownBuilding } from '../../src/core/economy.js';
import { tickBattery } from '../../src/core/light.js';

export function step(s, dt) {
  if (dt > 0.25) dt = 0.25;
  noteWhere(s);
  s.time += dt;
  s.stats.playedMs += dt * 1000;
  const mult = {};
  for (const e of s.extractors) {
    if (!ownBuilding(s, e)) continue;
    const def = EXTRACTORS[e.key];
    const base = mult[def.res] ??= productionMult(s, def.res);
    // Deliberately scan the whole layout: an independent slow oracle for the
    // indexed adjacency implementation, including same-length replacements.
    const supported = e.key === 'quarry' && s.extractors.some(b => b.key === 'stoneworks' && b.z === e.z && b.owner === e.owner && (b.x-e.x)**2+(b.y-e.y)**2 <= 4);
    const m = base * (supported ? 2 : 1);
    const cap = def.buffer * m;
    if (e.buffer < cap) e.buffer = Math.min(cap, e.buffer + def.rate * m * dt);
    if (e.buffer >= 1 && s.unlocks.logistics && ownBuilding(s, e)) {
      const amt = Math.floor(e.buffer);
      earn(s, e.res, amt, 'buildings');
      e.buffer -= amt;
      if (tileDist2(s.player, e.x, e.y, e.z) <= 144) s.events.push({ res: e.res, amt, x: e.x, y: e.y, z: e.z });
    }
  }
  tickBattery(s, dt);
  const trickle = abundanceTrickle(s) * dt;
  if (trickle > 0) for (const r of RESOURCES) earn(s, r, trickle, 'engine');
}
