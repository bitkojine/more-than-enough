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
<<<<<<< HEAD
import { drawTerrain, drawFarHoles } from './terrain.js';
import { drawExtractor, drawDigging, drawPlayer, drawTorch, drawParticles, drawFloats, drawFlyers } from './sprites.js';
import { drawHighlights, drawTrail, drawLighting, drawGlints, drawJoystick } from './overlay.js';
=======
import { drawTerrain } from './terrain.js';
import { drawExtractor, drawDigging, drawPlayer, drawProp, drawParticles, drawFloats, drawFlyers } from './sprites.js';
import { drawHighlights, drawTrail, drawLighting, drawGlints, drawBeacons, drawJoystick } from './overlay.js';
>>>>>>> 1a39aa6 (v0.39.0: more to place in the mine: crystal lamps and marker flags)

const XRAY_ALPHA = 0.35;   // the player seen through whatever stands in front
const FLICKER = 0.12;      // how much a flame's reach wavers, in tiles

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
  // Props on this layer, by row; the ones that light, as lights (a torch's
  // flame flickers), and the beacons.
  const propRows = new Map();
  const lights = [], beacons = [];
  for (const [k, kind] of s.world.props) {
    const t = Core.unpackKey(k);
    if (t.z !== cam.z) continue;
    const row = propRows.get(t.y);
    if (row) row.push([t.x, kind]); else propRows.set(t.y, [[t.x, kind]]);
    const def = Core.PROPS[kind];
    if (def.light) {
      const flicker = kind === 'torch' ? FLICKER * Math.sin(s.time * 9 + t.x * 1.7 + t.y * 2.3) : 0;
      lights.push({ x: t.x + 0.5, y: t.y + 0.5, r: def.light + flicker, color: look.color('mark.' + kind) });
    }
    if (def.beacon) beacons.push({ x: t.x, y: t.y, kind });
  }

  const tiles = drawTerrain(ctx, cam, s, look, { built, yard: view.yard, shake: fx.shake }, (y) => {
    drawHighlights(ctx, cam, s, view, y);
    const row = byRow.get(y);
    if (row) for (const e of row) drawExtractor(ctx, cam, s, look, e);
    const props = propRows.get(y);
    if (props) for (const [x, kind] of props) drawProp(ctx, cam, s, look, kind, x, y);
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
  drawLighting(ctx, cam, s, look, lights);
  drawGlints(ctx, cam, s, look);
<<<<<<< HEAD
  drawFarHoles(ctx, cam, s, look);
=======
  drawBeacons(ctx, cam, s, look, beacons);
>>>>>>> 1a39aa6 (v0.39.0: more to place in the mine: crystal lamps and marker flags)
  drawJoystick(ctx, cam, view);
  return { tiles };
}
