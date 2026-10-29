import { contentLocked } from './progression.js';
/* Flares (Watch, 2026-10-26): a metal stick of ore dust, made and lit in
 * one go, carried in your hand, burning down in FLARE_TIME seconds of play.
 * It works on every layer and replaces the lantern while burning.
 * It lights FLARE_LIGHT tiles around you; underground that light is what
 * uncovers the rock, so one flare charts a whole cave. The lantern keeps
 * lighting close by for good. In a crystal world a flare's light cracks
 * crystal like the lantern's (cultivation.js), so you can put it out early;
 * the rest of it is spent. */

import { SURFACE } from './coords.js';
import { FLARE_COST, FLARE_TIME, FLARE_LIGHT, UNLIT_RADIUS } from './content.js';
import { canAfford, spend, exploreRadius } from './economy.js';
import { isDark, lightScale, activeCarriedLight, normalizeCarriedLight } from './light.js';
import { lightCrystal } from './cultivation.js';

export const flareLit = s => activeCarriedLight(s)==='flare';
const FLARE_EPSILON=1e-9; // discard sub-nanosecond floating residue at burnout
export const flareEndsWithin=(s,seconds)=>flareLit(s)&&s.flare<=seconds+FLARE_EPSILON;

// Makes and lights a flare, or puts out the one in your hand: 'lit', 'out',
// 'materials' (no metal) or 'invalid' (a shared world: its room doesn't
// check flares yet).
export function useFlare(s) {
  if (contentLocked(s,'flare')) return 'locked';
  if (s.flare > 0) { s.flare = 0; return 'out'; }
  if (s.shared) return 'invalid';
  if (!canAfford(s.inv, FLARE_COST)) return 'materials';
  spend(s, FLARE_COST, 'tools');
  s.flare = FLARE_TIME;
  normalizeCarriedLight(s);
  s.stats.flares = (s.stats.flares || 0) + 1;
  if (s.cultivation) lightCrystal(s);
  return 'lit';
}

// Burns the flare down by dt seconds of play; time away burns none.
export function burnFlare(s, dt) {
  if (flareLit(s)) {const left=s.flare-dt;s.flare=left<FLARE_EPSILON?0:left;}
}

// How far around you the land is uncovered, in tiles. In the dark a flare
// reaches FLARE_LIGHT. Underground in a crystal world it's light that
// uncovers: the lantern its usual reach, no light at all only the tiles
// beside you. Older worlds always carry their lantern, shrinking with its
// charge (light.js).
export function sightRadius(s) {
  const flare = flareLit(s) && isDark(s) ? FLARE_LIGHT : 0;
  if (s.cultivation && s.player.z < SURFACE && activeCarriedLight(s)!=='lantern') return Math.max(UNLIT_RADIUS, flare);
  return Math.max(exploreRadius(s) * lightScale(s), flare);
}
