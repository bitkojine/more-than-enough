/* The region you're in (see core/regions.js): its name shows as you walk
 * into it, once it has held for REGION_SETTLE seconds (so stepping back and
 * forth through a pass doesn't flash names), and its kind of land picks the
 * music. Underground you're still under the region above, but no names
 * show. Arriving on another layer says its name, briefly; coming up into the
 * forest names the region, which then counts as shown.
 *
 * `hud` is {place(kind, name), layer(z, name)}; no page needed. */

import * as Core from '../core/index.js';
import { sceneFor } from './music/score.js';

export const REGION_SETTLE = 1; // seconds in a region before its name shows

const regionUnder = (s) =>
  Core.regionAt(s.world.seed, Math.floor(s.player.x), Math.floor(s.player.y));

export function createRegionWatch({ hud }) {
  let region = null,
    shown = null,
    held = 0;

  return {
    // Every so often (a quarter second): where you are, and its name once settled.
    tick(s, dt) {
      const here = regionUnder(s);
      if (!region || here.key !== region.key) {
        region = here;
        held = 0;
      }
      held += dt;
      if (s.player.z === Core.SURFACE && held >= REGION_SETTLE && shown?.key !== region.key) {
        shown = region;
        hud.place(region.kind, region.name);
      }
    },

    // Arrived on another layer.
    arrived(s) {
      if (s.player.z !== Core.SURFACE) return hud.layer(s.player.z);
      shown = region = regionUnder(s);
      hud.layer(s.player.z, region.name);
    },

    // Which place's music fits where the player stands (see music/score.js).
    scene(s) {
      const land = Core.BIOMES[(shown || region || regionUnder(s)).biome].music;
      return sceneFor({ depth: -s.player.z, daylight: Core.daylight(s.time), land });
    },

    // Another world: nothing seen in it yet.
    reset() {
      region = shown = null;
      held = 0;
    }
  };
}
