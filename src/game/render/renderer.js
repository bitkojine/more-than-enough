/* One frame, back to front. `view` carries the UI state the picture depends on
 * (targets, the Trail, the joystick) so drawing never reaches into input or
 * the sheet. Nothing drawn here is text to read. Returns frame stats
 * ({ tiles }) for the performance panel.
 *
 * Terrain is drawn a row at a time from north to south; whatever stands in a
 * row (target outlines, buildings, the player) is drawn right after it, so
 * blocks nearer the viewer cover it when the view is tilted. */

import { FLAT_RISE_PX } from '../camera.js';
import { drawTerrain } from './terrain.js';
import { drawExtractor, drawPlayer, drawParticles, drawFloats, drawFlyers } from './sprites.js';
import { drawHighlights, drawTrail, drawLighting, drawJoystick } from './overlay.js';

const BACKDROP = '#04060a';
const XRAY_ALPHA = 0.35;   // the player seen through whatever stands in front

export function render(cam, s, fx, view) {
  const ctx = cam.ctx;
  cam.follow(s.player);
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, cam.width, cam.height);

  const byRow = new Map();
  for (const e of s.extractors) {
    if (e.z !== cam.z) continue;
    const row = byRow.get(e.y);
    if (row) row.push(e); else byRow.set(e.y, [e]);
  }
  const playerRow = Math.floor(s.player.y);

  const tiles = drawTerrain(ctx, cam, s, (y) => {
    drawHighlights(ctx, cam, s, view, y);
    const row = byRow.get(y);
    if (row) for (const e of row) drawExtractor(ctx, cam, s, e);
    if (y === playerRow) drawPlayer(ctx, cam, s, view.facing);
  });
  // Tilted, a wall in front can hide the player: show them faintly through it.
  if (cam.risePx > FLAT_RISE_PX) {
    ctx.globalAlpha = XRAY_ALPHA;
    drawPlayer(ctx, cam, s, view.facing);
    ctx.globalAlpha = 1;
  }
  drawTrail(ctx, cam, s, view);
  drawParticles(ctx, cam, fx);
  drawFloats(ctx, cam, fx);
  drawFlyers(ctx, cam, fx);
  drawLighting(ctx, cam, s);
  drawJoystick(ctx, cam, view);
  return { tiles };
}
