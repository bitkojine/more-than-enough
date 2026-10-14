/* One frame, back to front, drawn in the current texture pack (`look`).
 * `view` carries the UI state the picture depends on
 * (targets, the Trail, the joystick) so drawing never reaches into input or
 * the sheet. Nothing drawn here is text to read. Returns frame stats
 * ({ tiles }) for the performance panel.
 *
 * Terrain is drawn a row at a time from north to south; whatever stands in a
 * row (target outlines, buildings, the player) is drawn right after it, so
 * blocks nearer the viewer cover it. */

import * as Core from '../../core/index.js';
import { FLAT_RISE_PX } from '../camera.js';
import { drawTerrain, drawFarHoles } from './terrain.js';
import { drawExtractor, drawPlayer, drawFriend, drawSign, signSide, drawProp, drawParticles, drawFloats, drawFlyers } from './sprites.js';
import { drawHighlights, drawTrail, drawLighting, drawGlints, drawBeacons, drawFriendMarkers, drawJoystick } from './overlay.js';

const XRAY_ALPHA = 0.35;   // the player seen through whatever stands in front
const FLICKER = 0.25;
const SIGN_PAN = 0.22;       // of the screen's height: how far the view pans for your sign      // how much a glowcap's reach swells and fades, in tiles

export function render(cam, s, fx, view, look) {
  const ctx = cam.ctx;
  cam.follow(s.player);
  // Holding up your sign, the view pans so you stand low on the screen and
  // the sign is clear of the top bar and the messages under it.
  if (view.sign > 0) {
    const k = view.sign * view.sign * (3 - 2 * view.sign);
    cam.y -= k * cam.height * SIGN_PAN / cam.depthPx;
  }
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
  // Friends in a shared world, on this layer, by row.
  const friendRows = new Map();
  for (const f of view.friends || []) {
    if (f.z !== cam.z) continue;
    const y = Math.floor(f.y), row = friendRows.get(y);
    if (row) row.push(f); else friendRows.set(y, [f]);
  }
  // Props on this layer, by row; the ones that light, as lights (a glowcap
  // pulses slowly, like something alive), and the beacons.
  const propRows = new Map();
  const lights = [], beacons = [];
  for (const [k, kind] of s.world.props) {
    const t = Core.unpackKey(k);
    if (t.z !== cam.z) continue;
    const row = propRows.get(t.y);
    if (row) row.push([t.x, kind]); else propRows.set(t.y, [[t.x, kind]]);
    const def = Core.PROPS[kind];
    if (def.light) {
      const flicker = kind === 'glowcap' ? FLICKER * Math.sin(s.time * 1.6 + t.x * 1.7 + t.y * 2.3) : 0;
      lights.push({ x: t.x + 0.5, y: t.y + 0.5, r: def.light + flicker, color: look.color('mark.' + kind) });
    }
    if (def.beacon) beacons.push({ x: t.x, y: t.y, kind });
  }

  let head = null;   // where your head is, for the sign you may hold up
  const tiles = drawTerrain(ctx, cam, s, look, { built, yard: view.yard, shake: fx.shake }, (y) => {
    drawHighlights(ctx, cam, s, view, y);
    const row = byRow.get(y);
    if (row) for (const e of row) drawExtractor(ctx, cam, s, look, e);
    const props = propRows.get(y);
    if (props) for (const [x, kind] of props) drawProp(ctx, cam, s, look, kind, x, y);
    const friends = friendRows.get(y);
    if (friends) for (const f of friends) drawFriend(ctx, cam, s, look, f, view.friendColors[f.c]);
    if (y === playerRow) head = drawPlayer(ctx, cam, s, look, view);
  });
  // Unless zoomed far out, a wall in front can hide the player: show them faintly through it.
  if (cam.risePx > FLAT_RISE_PX) {
    ctx.globalAlpha = XRAY_ALPHA;
    drawPlayer(ctx, cam, s, look, view);
    ctx.globalAlpha = 1;
  }
  drawTrail(ctx, cam, s, view);
  drawParticles(ctx, cam, fx);
  drawFloats(ctx, cam, look, fx);
  drawFlyers(ctx, cam, look, fx);
  drawLighting(ctx, cam, s, look, lights, view.device);
  drawGlints(ctx, cam, s, look);
  drawFarHoles(ctx, cam, s, look);
  drawBeacons(ctx, cam, s, look, beacons);
  // Your sign, over the dark: a QR code has to read at night too.
  if (view.sign > 0 && view.signFace && head) drawSign(ctx, head.x, head.top, cam.tilePx, view.sign, s.time, view.signFace, signSide(cam), view.signCaption);
  if (view.friends && view.friends.length) drawFriendMarkers(ctx, cam, s, view.friends, view.friendColors);
  drawJoystick(ctx, cam, view);
  return { tiles };
}
