/* Everything drawn over the world: target highlights, the Trail stroke, day
 * and night lighting, the joystick, the compass hint and first-run prompts. */

import * as Core from '../../core/index.js';
import { roundRect } from './terrain.js';

const TAU = Math.PI * 2;

// Outline one tile. The inset is clamped so a sub-pixel tile when zoomed far
// out can't produce a negative size.
function outlineTile(ctx, cam, tx, ty, color) {
  const u = cam.tilePx;
  const inset = Math.min(2, u * 0.2);
  const size = u - inset * 2;
  if (size <= 0) return;
  const p = cam.project(tx, ty);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, u * 0.05);
  roundRect(ctx, p.x + inset, p.y + inset, size, size, Math.min(6, size / 2));
  ctx.stroke();
}

export function drawHighlights(ctx, cam, view) {
  if (view.harvestTarget) outlineTile(ctx, cam, view.harvestTarget.x, view.harvestTarget.y, 'rgba(200,255,180,0.5)');
  for (const t of view.buildTargets) outlineTile(ctx, cam, t.x, t.y, 'rgba(140,220,255,0.6)');
}

// The live Trail: a glowing stroke that turns green (amber underground) once it
// crosses tiles the sweep will take, with those tiles filled in.
export function drawTrail(ctx, cam, view) {
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
  trail.points.forEach((pt, i) => {
    const p = cam.project(pt.x, pt.y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  const end = cam.project(trail.points[trail.points.length - 1].x, trail.points[trail.points.length - 1].y);
  ctx.fillStyle = hits ? (dig ? '#ffe0a8' : '#caff9b') : '#b9f3ff';
  ctx.beginPath();
  ctx.arc(end.x, end.y, Math.max(7, u * 0.17), 0, TAU);
  ctx.fill();
  for (const t of view.trailTargets) {
    const p = cam.project(t.x, t.y);
    ctx.fillStyle = dig ? 'rgba(255,205,125,0.25)' : 'rgba(149,255,104,0.25)';
    roundRect(ctx, p.x + 2, p.y + 2, u - 4, u - 4, Math.min(9, u * 0.2));
    ctx.fill();
    outlineTile(ctx, cam, t.x, t.y, dig ? 'rgba(255,215,140,1)' : 'rgba(190,255,130,1)');
  }
  ctx.restore();
}

/* Night lighting tuning: how tight the flashlight pool is around the player
 * and how quickly darkness closes in beyond it. */
const FLASHLIGHT_RADIUS = 3.0;   // bright pool radius, in tiles
const FLASHLIGHT_FALLOFF = 0.14; // 0 = hard edge ... 1 = falloff spreads to screen
const NIGHT_DARK_MID = 0.5;      // darkness where the falloff begins
const NIGHT_DARK_EDGE = 0.9;     // darkness at the screen edges

// By day a gentle warm lift; after dusk the scene fades to dark except for a
// flashlight pool around the player, so you can always keep working.
export function drawLighting(ctx, cam, s) {
  const { width: W, height: H } = cam;
  const dl = Core.daylight(s.time);
  const glow = Math.max(0, (dl - 0.25) / 0.75) * 0.16;
  if (glow > 0.001) {
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,236,205,${glow.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (dl >= 0.6) return;
  const night = (0.6 - dl) / 0.6; // 0 = dusk ... 1 = midnight
  const { x: px, y: py } = cam.project(s.player.x, s.player.y);
  const pool = Math.max(W, H) * 0.8;
  // Keep the pool usable when zoomed far out, where tilePx * radius is tiny.
  const lit = Math.min(pool, Math.max(cam.tilePx * FLASHLIGHT_RADIUS, Math.min(W, H) * 0.28));
  const mid = lit + (pool - lit) * FLASHLIGHT_FALLOFF;
  const dark = ctx.createRadialGradient(px, py, 0, px, py, pool);
  dark.addColorStop(0, 'rgba(4,8,16,0)');
  dark.addColorStop(Math.min(1, lit / pool), 'rgba(4,8,16,0)');
  dark.addColorStop(Math.min(1, mid / pool), `rgba(4,8,16,${(night * NIGHT_DARK_MID).toFixed(3)})`);
  dark.addColorStop(1, `rgba(4,8,16,${(night * NIGHT_DARK_EDGE).toFixed(3)})`);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, W, H);
  // A warm tint so the pool reads as lamplight, not just a hole.
  ctx.globalCompositeOperation = 'lighter';
  const warm = ctx.createRadialGradient(px, py, 0, px, py, lit);
  warm.addColorStop(0, `rgba(255,214,150,${(night * 0.11).toFixed(3)})`);
  warm.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

export function drawJoystick(ctx, cam, view) {
  const joy = view.joy;
  if (!joy.active && !view.hasMoved) {
    const x = cam.width * 0.24, y = cam.height * 0.76;
    ctx.strokeStyle = 'rgba(190,220,190,0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 42, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(210,235,210,0.55)';
    ctx.font = '700 12px -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DRAG TO MOVE', x, y);
  }
  if (joy.active) {
    ctx.strokeStyle = 'rgba(190,220,190,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 62, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(120,190,130,0.55)';
    ctx.beginPath(); ctx.arc(joy.ox + joy.x * 62, joy.oy + joy.y * 62, 26, 0, TAU); ctx.fill();
  }
}

// A faint arrow at the edge of view pointing toward the next resource to find.
export function drawHint(ctx, cam, view) {
  const dir = view.hintDir;
  if (!dir) return;
  const mag = Math.hypot(dir.x, dir.y);
  if (mag < 2) return;
  const ax = dir.x / mag, ay = dir.y / mag;
  const radius = Math.min(cam.width, cam.height) * 0.34;
  ctx.save();
  ctx.translate(cam.width / 2 + ax * radius, cam.height / 2 + ay * radius);
  ctx.rotate(Math.atan2(ay, ax));
  ctx.fillStyle = 'rgba(230,180,90,0.85)';
  ctx.beginPath();
  ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawPrompt(ctx, cam, message) {
  if (!message) return;
  ctx.font = '700 13px -apple-system, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(message).width + 26;
  ctx.fillStyle = 'rgba(10,14,12,0.74)';
  roundRect(ctx, cam.width / 2 - w / 2, cam.height - 172, w, 30, 15);
  ctx.fill();
  ctx.fillStyle = '#cfe8cc';
  ctx.fillText(message, cam.width / 2, cam.height - 157);
}
