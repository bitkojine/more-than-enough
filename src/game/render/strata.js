/* The cutaway: tilted far enough, the world is sliced open along the cut row
 * in front of the player, showing every layer as a band on the cut face.
 * Below you they run down to the bottom of the screen; underground, the
 * layers above you sit over the cut, faint so the tunnels stay readable.
 *
 * What you've seen is lit in its own colours, layers you've been down to are
 * dim earth, and layers nobody has reached are near black. A hole between
 * two layers shows as a bright gap in the line that separates them. */

import * as Core from '../../core/index.js';
import { BASE_COLOR, shade, tv } from './terrain.js';

const STRATUM_DIM = 0.78;            // lit tiles on the cut, a touch darker than tops
const CAVITY = '#17120e';            // open (dug) space on the cut
const VISITED = '#33281e';           // a layer you've been down to, unseen here
const UNKNOWN = ['#15110e', '#1b1612']; // never reached; alternating so layers count
const SEAM = 'rgba(255,255,255,0.13)';
const HOLE_GAP = 'rgba(255,232,180,0.7)';
const GRASS = '#3c5a2a', GRASS_UNSEEN = '#0b0f09';
const ABOVE_ALPHA = 0.45;            // the layers over you, see-through

// One layer's band on the cut face, between screen rows top and bottom.
function drawStratum(ctx, cam, s, row, layer, top, bottom, x0, x1) {
  const w = s.world, u = cam.tilePx;
  const left = cam.project(x0, row).x, width = (x1 - x0 + 1) * u;
  const h = bottom - top;
  const visited = layer >= s.underground.deepest;
  ctx.fillStyle = visited ? VISITED : UNKNOWN[layer & 1];
  ctx.fillRect(left, top, width + 1, h + 1);
  if (visited) {
    // Only layers you've been to can hold anything you've seen.
    for (let x = x0; x <= x1; x++) {
      if (!Core.isExplored(w, x, row, layer)) continue;
      const t = Core.tileAt(w, x, row, layer);
      const sx = left + (x - x0) * u;
      ctx.fillStyle = Core.TILE_INFO[t].walk ? CAVITY : shade(BASE_COLOR[t], tv(x, row, 7), STRATUM_DIM);
      ctx.fillRect(sx, top, u + 1, h + 1);
      if (Core.holeBelow(w, x, row, layer)) {
        ctx.fillStyle = HOLE_GAP;
        ctx.fillRect(sx + u * 0.3, bottom - 2, u * 0.4, 4);
      }
    }
  }
  ctx.fillStyle = SEAM;
  ctx.fillRect(left, top, width + 1, 1);
}

// The grass line on the cut: the forest floor seen edge-on.
function drawTopsoil(ctx, cam, s, row, x0, x1) {
  const u = cam.tilePx;
  const y = cam.project(0, row + 1, Core.SURFACE).y;
  const thick = Math.max(2, cam.risePx * 0.14);
  const left = cam.project(x0, row).x;
  for (let x = x0; x <= x1; x++) {
    const seen = Core.isExplored(s.world, x, row, Core.SURFACE);
    ctx.fillStyle = seen ? GRASS : GRASS_UNSEEN;
    ctx.fillRect(left + (x - x0) * u, y - thick, u + 1, thick);
    if (seen && Core.holeBelow(s.world, x, row, Core.SURFACE)) {
      ctx.fillStyle = HOLE_GAP;
      ctx.fillRect(left + (x - x0) * u + u * 0.3, y - 2, u * 0.4, 4);
    }
  }
}

export function drawStrata(ctx, cam, s, row) {
  const v = cam.visibleTiles();
  const z = cam.z;
  const band = (layer) => [cam.project(0, row + 1, layer + 1).y, cam.project(0, row + 1, layer).y];

  // Down: every layer under this one, until the screen runs out.
  for (let layer = z - 1; layer >= Core.Z_MIN; layer--) {
    const [top, bottom] = band(layer);
    if (top > cam.height) break;
    drawStratum(ctx, cam, s, row, layer, top, bottom, v.x0, v.x1);
  }

  // Up: the layers over you, and the forest floor on top of them.
  if (z >= Core.SURFACE) return;
  ctx.globalAlpha = ABOVE_ALPHA;
  for (let layer = z + 1; layer < Core.SURFACE; layer++) {
    const [top, bottom] = band(layer);
    if (bottom < 0) break;
    drawStratum(ctx, cam, s, row, layer, top, bottom, v.x0, v.x1);
  }
  drawTopsoil(ctx, cam, s, row, v.x0, v.x1);
  ctx.globalAlpha = 1;
}
