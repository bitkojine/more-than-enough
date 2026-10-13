/* Everything drawn over the world: target highlights, the Trail stroke, day
 * and night lighting, and the joystick. */

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
 * torches you placed, and daylight falling through holes in the ceiling. The
 * dark is drawn as one mask at low resolution with every light cut out of it,
 * then each light adds a warm tint of its own colour. */
const LANTERN_LIGHT = 3.0;      // how far the lantern lights, in tiles
const SKYLIGHT_LIGHT = 2.0;     // how far light falling through a hole spreads
const UNDERGROUND_DARK = 0.94;  // how dark the mine is away from any light
const NIGHT_DARK = 0.9;         // how dark the forest gets at midnight
const MASK_SCALE = 0.25;        // the dark mask's resolution against the screen
const TINT = 0.12;              // how warm a light's pool is

let mask = null;

/**
 * @param {Array<{x: number, y: number, r: number, color: string, strength?: number}>} lights
 *   lights on this layer besides the lantern and skylights (torches), in tiles
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
    all.push({ x: s.player.x, y: s.player.y, r: LANTERN_LIGHT, color: look.color('character.lantern'), min: Math.min(W, H) * 0.28 });
  }
  if (under) {
    const sky = look.color('mark.skylight');
    const strength = cam.z + 1 === Core.SURFACE ? 0.35 + 0.65 * dl : 0.4;
    for (const k of s.world.holes) {
      const t = Core.unpackKey(k);
      if (t.z === cam.z + 1) all.push({ x: t.x + 0.5, y: t.y + 0.5, r: SKYLIGHT_LIGHT, color: sky, strength });
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
    g.addColorStop(0.5, `rgba(0,0,0,${a})`);
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

export function drawJoystick(ctx, cam, view) {
  const joy = view.joy;
  if (!joy.active) return;
  ctx.strokeStyle = 'rgba(190,220,190,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 62, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(120,190,130,0.55)';
  ctx.beginPath(); ctx.arc(joy.ox + joy.x * 62, joy.oy + joy.y * 62, 26, 0, TAU); ctx.fill();
}
