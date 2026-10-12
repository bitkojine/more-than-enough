/* One frame, back to front. `view` carries the UI state the picture depends on
 * (targets, the Trail, the joystick, hints) so drawing never reaches into
 * input or the sheet. */

import { drawTerrain } from './terrain.js';
import { drawExtractors, drawPlayer, drawParticles, drawFloats, drawFlyers } from './sprites.js';
import { drawHighlights, drawTrail, drawLighting, drawJoystick, drawHint, drawPrompt } from './overlay.js';

const BACKDROP = '#04060a';

export function render(cam, s, fx, view) {
  const ctx = cam.ctx;
  cam.follow(s.player);
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, cam.width, cam.height);

  drawTerrain(ctx, cam, s);
  drawHighlights(ctx, cam, view);
  drawTrail(ctx, cam, view);
  drawExtractors(ctx, cam, s);
  drawParticles(ctx, cam, fx);
  drawPlayer(ctx, cam, s, view.facing);
  drawFloats(ctx, cam, fx);
  drawFlyers(ctx, cam, fx);
  drawLighting(ctx, cam, s);
  drawJoystick(ctx, cam, view);
  drawHint(ctx, cam, view);
  drawPrompt(ctx, cam, view.prompt);
}
