/* Small shared measures of the Perfect brain (perfect.js and its parts):
 * how far it searches, how often it retries, distances and layers. */

import { SURFACE, packKey } from './coords.js';
import { TILE_INFO, RESOURCES } from './tiles.js';
import { BASE_SPEED } from './content.js';
import { speedMult } from './economy.js';

export const SEARCH = 120; // tiles out the brain looks for a deposit or a spot
export const STUCK = 6; // tries at the same step before a target counts as out of reach
export const key = (x, y, z) => packKey(x, y, z);
export const wait = (why, badge = 'ui.wait') => ({ type: 'wait', why, badge });
export const speed = (s) => BASE_SPEED * speedMult(s);
export const dist = (s, x, y) => Math.hypot(x + 0.5 - s.player.x, y + 0.5 - s.player.y);
export const layerOf = (s) => SURFACE - s.player.z;
export const SURFACE_TYPES = Object.fromEntries(
  RESOURCES.map((res) => [
    res,
    TILE_INFO.findIndex((info) => info && info.res === res && !info.solid)
  ])
);
