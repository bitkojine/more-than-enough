/* One frame, back to front, drawn in the current texture pack (`look`).
 * `view` carries the UI state the picture depends on
 * (targets, the Trail, the joystick) so drawing never reaches into input or
 * the sheet. Nothing drawn here is text to read. Returns frame stats
 * ({ tiles }) for the performance panel.
 *
 * Terrain is drawn a row at a time from north to south; whatever stands in a
 * row (target outlines, buildings, the player) is drawn right after it, so
 * blocks nearer the viewer cover it.
 *
 * Each part of the picture runs through `layer` (src/game/faults.js): one
 * that throws is noted and left out, and the rest of the frame still draws. */

import {cultivationRows,drawCultivation,drawCrystalCargo} from './cultivation.js';
import * as Core from '../../core/index.js';
import { FLAT_RISE_PX } from '../camera.js';
import { drawTerrain, drawFarHoles, drawMerging } from './terrain.js';
import { drawExtractor, drawPlayer, drawFriend, drawGrave, drawNameTag, drawAutoTag, drawSign, signSide, drawProp, drawParticles, drawFloats, drawFlyers } from './sprites.js';
import { scene } from './scene.js';
import { drawFocus } from './focus.js';
import { drawDepots, drawSupports, drawHighlights, drawTrail, drawLighting, drawGlints, drawBeacons, drawFriendMarkers, drawJoystick } from './overlay.js';

const XRAY_ALPHA = 0.35;   // the player seen through whatever stands in front
const FLICKER = 0.25;        // how much a glowcap's reach swells and fades, in tiles
const SIGN_PAN = 0.22;       // of the screen's height: how far the view pans for your sign
const BODY_MID = 0.47;       // tiles above the feet: the middle of you, centred when zoomed right in

// The canvas as a frame starts: nothing saved, no fading or blending, the
// screen's own scale. Puts it back after a part of the picture throws.
export function resetCanvas(ctx, dpr) {
  for (let i = 0; i < 32; i++) ctx.restore(); // a no-op once nothing is saved
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.setLineDash?.([]);
}

const plain = (name, draw) => draw();

export function render(cam, s, fx, view, look, guard = plain) {
  const ctx = cam.ctx;
  const reset = () => resetCanvas(ctx, cam.dpr);
  const layer = (name, draw) => guard(name, draw, reset);
  cam.follow(s.player);
  // Zoomed in close, the view centres on your middle instead of your feet, so
  // all of you stays on screen. From 2x it eases in, in full by 5x.
  const close = Math.min(1, Math.max(0, (cam.zoom - 2) / 3));
  if (close > 0) cam.y -= close * BODY_MID * cam.tilePx / cam.depthPx;
  // Holding up your sign, the view pans so you stand low on the screen and
  // the sign is clear of the top bar and the messages under it.
  if (view.sign > 0) {
    const k = view.sign * view.sign * (3 - 2 * view.sign);
    cam.y -= k * cam.height * SIGN_PAN / cam.depthPx;
  }
  ctx.fillStyle = look.color('color.backdrop');
  ctx.fillRect(0, 0, cam.width, cam.height);

  // Props that light, as lights (a glowcap pulses slowly, like something
  // alive), and the beacons.
  const { buildings, built, friends: friendRows, aloft, graves: graveRows, props: propRows, placed } = scene(s, view, cam.z);
  const playerRow = Math.floor(s.player.y);
  const crystalRows=cultivationRows(s,cam.z);
  const lights = [], beacons = [];
  for (const { x, y, kind } of placed) {
    const def = Core.PROPS[kind];
    if (def.light && !s.cultivation?.shaded?.[Core.packKey(x,y,cam.z)]) {
      const flicker = kind === 'glowcap' ? FLICKER * Math.sin(s.time * 1.6 + x * 1.7 + y * 2.3) : 0;
      lights.push({ x: x + 0.5, y: y + 0.5, r: def.light + flicker, color: look.color('mark.' + kind) });
    }
    if (def.beacon) beacons.push({ x, y, kind });
  }

  let you = null;    // where your head and hands are, for your name and sign
  const tags = [];   // friends' names, drawn last, over the night
  const friend = (f) => {
    const at = drawFriend(ctx, cam, s, look, f, f.color);
    if (at) tags.push({ ...at, name: f.name, color: f.color });
  };
  const ground = { built, yard: view.yard, shake: fx.shake, layer };
  const tiles = layer('terrain', () => drawTerrain(ctx, cam, s, look, ground, (y) => layer('row', () => {
    drawHighlights(ctx, cam, s, view, y);
    const row = buildings.get(y);
    if (row) for (const e of row) drawExtractor(ctx, cam, s, look, e);
    for(const b of crystalRows.get(y)||[])drawCultivation(ctx,cam,s,look,b);
    const props = propRows.get(y);
    if (props) for (const [x, kind] of props) {
      drawProp(ctx,cam,s,look,kind,x,y);
      if(s.cultivation?.shaded?.[Core.packKey(x,y,cam.z)]){
        const p=cam.project(x+.5,y+.6,cam.z),u=cam.tilePx;
        ctx.fillStyle='#283337';ctx.strokeStyle='#b8c7b2';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(p.x-u*.23,p.y-u*.3);ctx.quadraticCurveTo(p.x,p.y-u*.95,p.x+u*.23,p.y-u*.3);ctx.closePath();ctx.fill();ctx.stroke();
      }
    }
    const stones = graveRows.get(y);
    if (stones) {
      for (const g of stones) {
        const at = drawGrave(ctx, cam, s, g);
        if (at && g.name) tags.push({ ...at, name: g.name, color: g.color, grave: true });
      }
    }
    const friends = friendRows.get(y);
    if (friends) for (const f of friends) friend(f);
    if (y === playerRow) {you = drawPlayer(ctx, cam, s, look, view);drawCrystalCargo(ctx,cam,s,look,you);}
  }))) || 0;
  layer('aloft', () => { for (const f of aloft) friend(f); });
  // Unless zoomed far out, a wall in front can hide the player: show them faintly through it.
  if (cam.risePx > FLAT_RISE_PX) {
    layer('xray', () => {
      ctx.globalAlpha = XRAY_ALPHA;
      drawPlayer(ctx, cam, s, look, view);
      ctx.globalAlpha = 1;
    });
  }
  if (cam.z === Core.SURFACE) layer('merging', () => drawMerging(ctx, cam, s, look, view.yard));
  layer('supports', () => drawSupports(ctx, cam, s, view));
  layer('depots', () => drawDepots(ctx, cam, s, view));
  layer('trail', () => drawTrail(ctx, cam, s, view));
  layer('particles', () => drawParticles(ctx, cam, fx));
  layer('floats', () => drawFloats(ctx, cam, look, fx));
  layer('flyers', () => drawFlyers(ctx, cam, look, fx));
  layer('lighting', () => drawLighting(ctx, cam, s, look, lights));
  layer('glints', () => drawGlints(ctx, cam, s, look));
  layer('farHoles', () => drawFarHoles(ctx, cam, s, look));
  layer('beacons', () => drawBeacons(ctx, cam, s, look, beacons));
  // What Wiki is talking about, outlined over everything in the world.
  if (view.wiki?.focus) layer('focus', () => drawFocus(ctx, cam, s, look, ground, view.wiki.focus, you));
  // Everyone's name over their head (yours too, in a shared world, unless
  // your sign is up in front of it). In a crowd, yours first, then the
  // living nearest you, then tombstones: a name that would cover one
  // already shown waits until its player steps clear.
  const taken = [];
  layer('names', () => {
    if (view.me && you && !(view.sign > 0)) drawNameTag(ctx, you.x, you.top - cam.tilePx * 0.2, view.me.name, view.me.color, taken);
    // While AUTO plays, its tag floats over you (over your name, if shown).
    if (view.auto && you) drawAutoTag(ctx, you.x, you.top - cam.tilePx * 0.2 - (view.me && !(view.sign > 0) ? 22 : 0), view.auto, s.time, taken);
    if (tags.length > 1) {
      const cx = you ? you.x : cam.width / 2, cy = you ? you.top : cam.height / 2;
      for (const tag of tags) tag.d = Math.hypot(tag.x - cx, tag.y - cy) + (tag.grave ? 1e6 : 0);
      tags.sort((a, b) => a.d - b.d);
    }
    for (const tag of tags) drawNameTag(ctx, tag.x, tag.y, tag.name, tag.color, taken);
    // Badges at the edge for friends out of sight, kept off you, the names
    // shown and each other.
    if (you) taken.push({ l: you.x - cam.tilePx * 0.5, r: you.x + cam.tilePx * 0.5, t: you.top - cam.tilePx * 0.2 - 11, b: you.foot });
    if (view.friends && view.friends.length) drawFriendMarkers(ctx, cam, s, look, view.friends, view.keepClear, taken);
  });
  // Your sign last, over the dark and over every name and badge: a QR code
  // has to read at night too, and nothing may cover it.
  let sign = null;
  if (view.sign > 0 && view.signFace && you) sign = layer('sign', () => drawSign(ctx, you.handsX, you.hands, cam.tilePx, view.sign, s.time, view.signFace, signSide(cam), view.signCaption)) ?? null;
  layer('joystick', () => drawJoystick(ctx, cam, view));
  // Wiki on the hood, or Mica's head when the 2D figure stands in.
  return { tiles, sign, wiki: you ? you.wiki ?? { x: you.x, y: you.top, r: 0 } : null };
}
