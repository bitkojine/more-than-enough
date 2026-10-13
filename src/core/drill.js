/* Drilling: underground, walking into rock digs it. Keep pushing toward a wall
 * for DRILL_TIME and the tile in front of you is dug out, as if you had
 * tapped it, so you can tunnel without taking your thumb off the stick.
 * Only rock that can be dug by hand drills this way: bedrock never gives, and
 * a shaft still needs a deliberate tap (see TILE_INFO.sweep). */

import { TILE_INFO } from './tiles.js';
import { tileAt } from './world.js';
import { isUnderground } from './underground.js';
import { canHarvest, harvestAt } from './actions.js';

export const DRILL_TIME = 0.3;  // seconds of pushing into a wall to dig it
const PUSH = 0.5;               // how squarely you must push toward a wall

/**
 * The tile you're pushing into along (dx, dy), if pushing would dig it.
 * @returns {{x: number, y: number} | null}
 */
export function drillTarget(s, dx, dy) {
  if (!isUnderground(s)) return null;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return null;
  dx /= len; dy /= len;
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  // The square you push hardest toward first, then the other one.
  const steps = Math.abs(dx) >= Math.abs(dy)
    ? [[Math.sign(dx), 0, Math.abs(dx)], [0, Math.sign(dy), Math.abs(dy)]]
    : [[0, Math.sign(dy), Math.abs(dy)], [Math.sign(dx), 0, Math.abs(dx)]];
  for (const [ox, oy, push] of steps) {
    if (push < PUSH) continue;
    const x = px + ox, y = py + oy;
    const info = TILE_INFO[tileAt(s.world, x, y, s.player.z)];
    if (info.solid && info.sweep !== false && canHarvest(s, x, y)) return { x, y };
  }
  return null;
}

/**
 * Pushing along (dx, dy) for dt seconds. `drill` holds the progress between
 * calls ({ x, y, t }, reset when you stop or turn to another tile). Returns
 * the harvest once a tile is dug through, else null.
 */
export function drill(s, drillState, dx, dy, dt) {
  const t = drillTarget(s, dx, dy);
  if (!t) { drillState.t = 0; return null; }
  if (t.x !== drillState.x || t.y !== drillState.y) Object.assign(drillState, { x: t.x, y: t.y, t: 0 });
  drillState.t += dt;
  if (drillState.t < DRILL_TIME) return null;
  drillState.t = 0;
  return harvestAt(s, t.x, t.y);
}
