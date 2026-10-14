/* Everything drawn over the world: target highlights, the Trail stroke, day
 * and night lighting, finds glinting and beacons showing through the dark,
 * and the joystick. */

import * as Core from '../../core/index.js';
import { rgba } from './palette.js';

const TAU = Math.PI * 2;

// A rounded-rectangle path (the caller fills or strokes it).
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (w <= 0 || h <= 0) return; // nothing to draw (e.g. sub-pixel tiles when zoomed out)
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The rectangle of a tile's top on screen, inset by `inset` px.
function topRect(cam, s, tx, ty, inset) {
  const h = cam.z + Core.tileHeight(s.world, tx, ty, cam.z);
  const p = cam.project(tx, ty, h);
  const g = cam.depthPx / cam.tilePx;
  return { x: p.x + inset, y: p.y + inset * g, w: cam.tilePx - inset * 2, h: cam.depthPx - inset * 2 * g };
}

// Outline one tile's top. The inset is clamped so a sub-pixel tile when
// zoomed far out can't produce a negative size.
function outlineTile(ctx, cam, s, tx, ty, color) {
  const r = topRect(cam, s, tx, ty, Math.min(2, cam.tilePx * 0.2));
  if (r.w <= 0 || r.h <= 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, cam.tilePx * 0.05);
  roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(6, r.h / 2));
  ctx.stroke();
}

// Target outlines for the tiles in row y (drawn with that row, so blocks in
// front still cover them).
export function drawHighlights(ctx, cam, s, view, y) {
  const t = view.harvestTarget;
  if (t && t.y === y) outlineTile(ctx, cam, s, t.x, t.y, 'rgba(200,255,180,0.5)');
  for (const b of view.buildTargets) if (b.y === y) outlineTile(ctx, cam, s, b.x, b.y, 'rgba(140,220,255,0.6)');
}

// The live Trail: a glowing stroke that turns green (amber underground) once it
// crosses tiles the sweep will take, with those tiles filled in.
export function drawTrail(ctx, cam, s, view) {
  const trail = view.trail;
  if (!trail || !trail.points.length) return;
  const hits = view.trailTargets.length > 0;
  const dig = view.underground;
  const u = cam.tilePx;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = hits ? (dig ? 'rgba(255,205,125,0.95)' : 'rgba(157,255,117,0.95)') : 'rgba(120,232,255,0.88)';
  ctx.shadowColor = hits ? (dig ? 'rgba(255,190,90,0.9)' : 'rgba(143,255,88,0.9)') : 'rgba(88,215,255,0.85)';
  ctx.lineWidth = Math.max(5, Math.min(12, u * 0.18));
  ctx.shadowBlur = 18;
  ctx.beginPath();
  const at = (pt) => cam.project(pt.x, pt.y, cam.z + (pt.h || 0));
  trail.points.forEach((pt, i) => {
    const p = at(pt);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  const end = at(trail.points[trail.points.length - 1]);
  ctx.fillStyle = hits ? (dig ? '#ffe0a8' : '#caff9b') : '#b9f3ff';
  ctx.beginPath();
  ctx.arc(end.x, end.y, Math.max(7, u * 0.17), 0, TAU);
  ctx.fill();
  for (const t of view.trailTargets) {
    const r = topRect(cam, s, t.x, t.y, 2);
    ctx.fillStyle = dig ? 'rgba(255,205,125,0.25)' : 'rgba(149,255,104,0.25)';
    roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(9, u * 0.2));
    ctx.fill();
    outlineTile(ctx, cam, s, t.x, t.y, dig ? 'rgba(255,215,140,1)' : 'rgba(190,255,130,1)');
  }
  ctx.restore();
}

/* Light and dark. Underground it is always dark; on the surface it gets dark
 * at night. What lights the dark: the wanderer's lantern (carried only then),
 * glowcaps and lamps you placed, and daylight falling through holes in the
 * ceiling. The dark is drawn as one mask at low resolution with every light
 * cut out of it, then each light adds a warm tint of its own colour.
 *
 * Down in the mine the lantern is only a small pool at your feet: the rock you
 * have uncovered a few steps away sinks back into the dark, and it takes a
 * glowcap to keep a stretch of tunnel lit. */
const LANTERN_LIGHT = 3.0;      // how far the lantern lights the night forest, in tiles
const MINE_LANTERN_LIGHT = 1.7; // how far it lights in the mine
const SKYLIGHT_LIGHT = 2.0;     // how far light falling through a hole spreads
const UNDERGROUND_DARK = 0.95;  // how dark the mine is away from any light
const NIGHT_DARK = 0.9;         // how dark the forest gets at midnight
const MASK_SCALE = 0.25;        // the dark mask's resolution against the screen
const TINT = 0.12;              // how warm a light's pool is

let mask = null;

/**
 * @param {Array<{x: number, y: number, r: number, color: string, strength?: number}>} lights
 *   lights on this layer besides the lantern and skylights (glowcaps, lamps), in tiles.
 *   `core` (0..1, default 0.5) is how much of the radius is lit fully before
 *   the light fades out.
 */
export function drawLighting(ctx, cam, s, look, lights) {
  const { width: W, height: H } = cam;
  const dl = Core.daylight(s.time);
  const under = cam.z < Core.SURFACE;
  if (!under) {
    // By day a gentle warm lift.
    const glow = Math.max(0, (dl - 0.25) / 0.75) * 0.16;
    if (glow > 0.001) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,236,205,${glow.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  const dark = under ? UNDERGROUND_DARK : Math.max(0, (0.6 - dl) / 0.6) * NIGHT_DARK;
  if (dark < 0.01) return;

  const all = lights.slice();
  if (Core.needsLantern(s)) {
    // Kept usable when zoomed far out, where tiles are tiny.
    all.push({
      x: s.player.x, y: s.player.y, r: under ? MINE_LANTERN_LIGHT : LANTERN_LIGHT,
      color: look.color('character.lantern'), min: Math.min(W, H) * (under ? 0.12 : 0.28), core: under ? 0.3 : 0.5
    });
  }
  if (under) {
    const sky = look.color('mark.skylight');
    const strength = cam.z + 1 === Core.SURFACE ? 0.35 + 0.65 * dl : 0.4;
    const v = cam.visibleTiles();
    for (const t of Core.waysIn(s.world, cam.z, v.x0, v.y0, v.x1, v.y1)) {
      if (Core.holeAbove(s.world, t.x, t.y, cam.z)) all.push({ x: t.x + 0.5, y: t.y + 0.5, r: SKYLIGHT_LIGHT, color: sky, strength });
    }
  }

  const mw = Math.max(1, Math.ceil(W * MASK_SCALE)), mh = Math.max(1, Math.ceil(H * MASK_SCALE));
  if (!mask) mask = document.createElement('canvas');
  if (mask.width !== mw || mask.height !== mh) { mask.width = mw; mask.height = mh; }
  const m = mask.getContext('2d');
  m.globalCompositeOperation = 'source-over';
  m.clearRect(0, 0, mw, mh);
  m.fillStyle = `rgba(4,8,16,${dark.toFixed(3)})`;
  m.fillRect(0, 0, mw, mh);
  m.globalCompositeOperation = 'destination-out';
  const pools = [];
  for (const l of all) {
    const p = cam.project(l.x, l.y);
    const r = Math.max(l.r * cam.tilePx, l.min || 0);
    if (p.x < -r || p.y < -r || p.x > W + r || p.y > H + r) continue;
    pools.push({ ...l, sx: p.x, sy: p.y, pr: r });
    const cx = p.x * MASK_SCALE, cy = p.y * MASK_SCALE, mr = r * MASK_SCALE;
    const a = l.strength === undefined ? 1 : l.strength;
    const g = m.createRadialGradient(cx, cy, 0, cx, cy, mr);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(l.core === undefined ? 0.5 : l.core, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = g;
    m.fillRect(cx - mr, cy - mr, mr * 2, mr * 2);
  }
  m.globalCompositeOperation = 'source-over';
  ctx.drawImage(mask, 0, 0, W, H);

  // Warm pools, so light reads as light, not just a gap in the dark.
  ctx.globalCompositeOperation = 'lighter';
  for (const l of pools) {
    const g = ctx.createRadialGradient(l.sx, l.sy, 0, l.sx, l.sy, l.pr);
    g.addColorStop(0, rgba(l.color, (TINT * dark).toFixed(3)));
    g.addColorStop(1, rgba(l.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(l.sx - l.pr, l.sy - l.pr, l.pr * 2, l.pr * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* Finds glinting in the dark: a twinkle over each find still in the rock
 * within range, drawn over the dark (and over ground you haven't uncovered)
 * so there's always something close to dig toward. Fainter further off. */
const GLINT_SIZE = 0.2;   // the twinkle's arm, in tiles

// A four-pointed twinkle of arm r at (x, y).
function star(ctx, x, y, r, color) {
  const k = r * 0.22;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + k, y - k); ctx.lineTo(x + r, y); ctx.lineTo(x + k, y + k);
  ctx.lineTo(x, y + r); ctx.lineTo(x - k, y + k); ctx.lineTo(x - r, y); ctx.lineTo(x - k, y - k);
  ctx.closePath(); ctx.fill();
}

export function drawGlints(ctx, cam, s, look) {
  if (cam.z >= Core.SURFACE) return;
  const u = cam.tilePx;
  for (const f of Core.findsNear(s)) {
    const seed = f.x * 7.31 + f.y * 3.17;
    const tw = 0.5 + 0.5 * Math.sin(s.time * 3.2 + seed);
    const near = 1 - 0.55 * (f.d / Core.GLINT_RANGE);
    const p = cam.project(f.x + 0.5, f.y + 0.45, cam.z + 1);
    const r = Math.max(4, u * GLINT_SIZE) * (0.7 + 0.5 * tw);
    if (p.x < -r || p.y < -r || p.x > cam.width + r || p.y > cam.height + r) continue;
    const color = look.color(Core.tileLook(f.type));
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.6);
    halo.addColorStop(0, rgba(color, 0.55 * near * (0.5 + 0.5 * tw)));
    halo.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(p.x - r * 1.6, p.y - r * 1.6, r * 3.2, r * 3.2);
    ctx.globalAlpha = near * (0.45 + 0.55 * tw);
    star(ctx, p.x, p.y, r, color);
    star(ctx, p.x, p.y, r * 0.5, '#fffbe8');
    ctx.globalAlpha = 1;
  }
}

/* Beacons (marker flags): a pin of the flag's colour over the dark wherever
 * one stands on screen, so you can find your way back to it. Kept on screen
 * at the edge, pointing the way, when it's off it. */
const BEACON_PIN = 7;     // the pin's radius, in CSS pixels
const BEACON_EDGE = 28;   // how far in from the screen's edge an off-screen pin sits

export function drawBeacons(ctx, cam, s, look, beacons) {
  for (const b of beacons) {
    const color = look.color('mark.' + b.kind);
    const p = cam.project(b.x + 0.5, b.y + 0.5, cam.z);
    const off = p.x < 0 || p.y < 0 || p.x > cam.width || p.y > cam.height;
    const x = Math.max(BEACON_EDGE, Math.min(cam.width - BEACON_EDGE, p.x));
    const y = Math.max(BEACON_EDGE, Math.min(cam.height - BEACON_EDGE, p.y - (off ? 0 : cam.tilePx * 1.1)));
    const pulse = 0.5 + 0.5 * Math.sin(s.time * 2.4 + b.x + b.y);
    const halo = ctx.createRadialGradient(x, y, 0, x, y, BEACON_PIN * 3);
    halo.addColorStop(0, rgba(color, 0.35 + 0.25 * pulse));
    halo.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(x - BEACON_PIN * 3, y - BEACON_PIN * 3, BEACON_PIN * 6, BEACON_PIN * 6);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(10,8,6,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (off) {
      // An arrowhead at the edge, pointing at the flag.
      const a = Math.atan2(p.y - y, p.x - x), r = BEACON_PIN * 1.4;
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a + 2.4) * r, y + Math.sin(a + 2.4) * r);
      ctx.lineTo(x + Math.cos(a - 2.4) * r, y + Math.sin(a - 2.4) * r);
      ctx.closePath();
    } else {
      ctx.arc(x, y, BEACON_PIN, 0, TAU);
    }
    ctx.fill(); ctx.stroke();
  }
}

export function drawJoystick(ctx, cam, view) {
  const joy = view.joy;
  if (!joy.active) return;
  ctx.strokeStyle = 'rgba(190,220,190,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 62, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(120,190,130,0.55)';
  ctx.beginPath(); ctx.arc(joy.ox + joy.x * 62, joy.oy + joy.y * 62, 26, 0, TAU); ctx.fill();
}
