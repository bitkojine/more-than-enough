/* Cliffs: the known world is a plateau over the dark. Wherever explored
 * ground has unexplored darkness in front of it, its edge drops away as a
 * cliff, and the cliff shows the layers beneath that spot, fading into the
 * dark as they go down. Explore further and new ground covers the old cliff.
 *
 * The cliff shows what you've found: rock you've seen on a layer is lit in
 * its own colours, layers you've been down to are dim earth, deeper ones are
 * dark bands. A hole between two layers shows as a bright gap. */

import * as Core from '../../core/index.js';
import { shade, tv, rgba } from './palette.js';

// Each layer on a cliff is at least this tall (in tile widths), so cliffs read
// as a long drop even at the slightest tilt. Nothing is drawn in the dark under
// an edge, so a cliff can hang deeper than the tilt alone would make it.
const MIN_BAND = 0.16;

// How far down a cliff can hang below its edge, in pixels.
export const cliffDepthPx = (cam) => Core.CLIFF_LAYERS * Math.max(cam.risePx, cam.tilePx * MIN_BAND);
const STRATUM_DIM = 0.78;           // seen rock on a cliff, a touch darker than tops
const SEAM = 'rgba(255,255,255,0.12)';

// Colours come from the texture pack: seen rock in its tile's colour, dug
// space, layers visited, and never-reached layers alternating a little so
// they can be counted.
function stratumColor(s, look, x, y, layer) {
  const visited = layer >= s.underground.deepest;
  if (visited && Core.isExplored(s.world, x, y, layer)) {
    const t = Core.tileAt(s.world, x, y, layer);
    return Core.TILE_INFO[t].walk ? look.color('color.cavity') : shade(look.color(Core.tileLook(t)), tv(x, y, 7), STRATUM_DIM);
  }
  return visited ? look.color('color.visited') : shade(look.color('color.unknown'), layer & 1 ? 0.2 : 0.6);
}

// The cliff under the south edge of tile (x, y) on layer z, starting at that
// layer's floor and going down until it fades or leaves the screen.
export function drawCliff(ctx, cam, s, look, x, y, z) {
  const u = cam.tilePx;
  const { x: left, y: floor } = cam.project(x, y + 1, z);
  const band = cliffDepthPx(cam) / Core.CLIFF_LAYERS;
  for (let k = 1; k <= Core.CLIFF_LAYERS && z - k >= Core.Z_MIN; k++) {
    const layer = z - k;
    const top = floor + (k - 1) * band;
    if (top > cam.height) break;
    const bottom = top + band;
    ctx.globalAlpha = 1 - (k - 1) / Core.CLIFF_LAYERS;
    ctx.fillStyle = stratumColor(s, look, x, y, layer);
    ctx.fillRect(left, top, u + 1, bottom - top + 1);
    ctx.fillStyle = SEAM;
    ctx.fillRect(left, top, u + 1, 1);
    if (Core.holeBelow(s.world, x, y, layer + 1)) {
      ctx.fillStyle = rgba(look.color('mark.skylight'), 0.7);
      ctx.fillRect(left + u * 0.3, top - 2, u * 0.4, 4);
    }
  }
  ctx.globalAlpha = 1;
}
