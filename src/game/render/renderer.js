/* One frame, back to front, drawn in the current texture pack (`look`).
 * `view` carries the UI state the picture depends on
 * (targets, the Trail, the joystick) so drawing never reaches into input or
 * the sheet. Nothing drawn here is text to read. Returns frame stats
 * ({ tiles }) for the performance panel.
 *
 * Terrain is drawn a row at a time from north to south; whatever stands in a
 * row (target outlines, buildings, the player) is drawn right after it, so
 * blocks nearer the viewer cover it when the view is tilted. */

import * as Core from '../../core/index.js';
import { FLAT_RISE_PX } from '../camera.js';
import { drawTerrain } from './terrain.js';
import { drawExtractor, drawDigging, drawPlayer, drawParticles, drawFloats, drawFlyers } from './sprites.js';
import { drawHighlights, drawTrail, drawLighting, drawJoystick } from './overlay.js';

const XRAY_ALPHA = 0.35;   // the player seen through whatever stands in front

export function render(cam, s, fx, view, look) {
  const ctx = cam.ctx;
  cam.follow(s.player);
  ctx.fillStyle = look.color('color.backdrop');
  ctx.fillRect(0, 0, cam.width, cam.height);

  const byRow = new Map();
  const built = new Set(); // tiles with a building on them show no trees or boulders
  for (const e of s.extractors) {
    if (e.z !== cam.z) continue;
    built.add(Core.packKey(e.x, e.y, e.z));
    const row = byRow.get(e.y);
    if (row) row.push(e); else byRow.set(e.y, [e]);
  }
  const playerRow = Math.floor(s.player.y);

  const tiles = drawTerrain(ctx, cam, s, look, { built, yard: view.yard }, (y) => {
    drawHighlights(ctx, cam, s, view, y);
    const row = byRow.get(y);
    if (row) for (const e of row) drawExtractor(ctx, cam, s, look, e);
    if (y === playerRow) { drawDigging(ctx, cam, s, look); drawPlayer(ctx, cam, s, look, view); }
  });
  // Tilted, a wall in front can hide the player: show them faintly through it.
  if (cam.risePx > FLAT_RISE_PX) {
    ctx.globalAlpha = XRAY_ALPHA;
    drawPlayer(ctx, cam, s, look, view);
    ctx.globalAlpha = 1;
  }
  drawTrail(ctx, cam, s, view);
  drawParticles(ctx, cam, fx);
  drawFloats(ctx, cam, look, fx);
  drawFlyers(ctx, cam, look, fx);
  drawLighting(ctx, cam, s);
  drawJoystick(ctx, cam, view);
  return { tiles };
}
