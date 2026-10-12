/* Things standing on the terrain: extractors, the player (and their boat),
 * and the transient effects. */

import * as Core from '../../core/index.js';
import { roundRect } from './terrain.js';
import { RES_COLOR } from '../effects.js';

const TAU = Math.PI * 2;

export function drawExtractors(ctx, cam, s) {
  const u = cam.tilePx;
  for (const e of s.extractors) {
    if (e.z !== cam.z) continue;
    const { x: sx, y: sy } = cam.project(e.x + 0.5, e.y + 0.5);
    if (sx < -u || sy < -u || sx > cam.width + u || sy > cam.height + u) continue;
    const size = u * 0.74;
    const def = Core.EXTRACTORS[e.key];
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, sx - size / 2, sy - size / 2 + size * 0.12, size, size, 8); ctx.fill();
    ctx.fillStyle = '#1e2822';
    roundRect(ctx, sx - size / 2, sy - size / 2, size, size, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = Math.round(size * 0.56) + 'px -apple-system, sans-serif';
    ctx.fillText(def.icon, sx, sy + size * 0.03);
    if (e.buffer >= 0.5) { // fill ring: gold when full
      const p = Math.min(1, e.buffer / def.buffer);
      ctx.beginPath();
      ctx.arc(sx, sy, size * 0.66, -Math.PI / 2, -Math.PI / 2 + p * TAU);
      ctx.strokeStyle = p >= 1 ? '#ffd166' : '#7fd07a';
      ctx.lineWidth = Math.max(2, size * 0.11);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }
}

// A proper boat: hull, mast and sail drawn large so the silhouette reads as a
// ship, with the character tiny on deck to sell the scale.
function drawShip(ctx, sx, sy, half) {
  const wd = half * 0.52; // half-width of the hull
  ctx.fillStyle = 'rgba(12,24,34,0.42)';
  ctx.beginPath(); ctx.ellipse(sx, sy + wd * 0.7, half * 1.05, wd * 0.72, 0, 0, TAU); ctx.fill();
  // hull: pointed bow to the right, rounded stern to the left
  ctx.fillStyle = '#7a5230';
  ctx.beginPath();
  ctx.moveTo(sx + half, sy);
  ctx.quadraticCurveTo(sx + half * 0.2, sy - wd, sx - half * 0.8, sy - wd);
  ctx.quadraticCurveTo(sx - half, sy - wd * 0.6, sx - half, sy);
  ctx.quadraticCurveTo(sx - half, sy + wd * 0.6, sx - half * 0.8, sy + wd);
  ctx.quadraticCurveTo(sx + half * 0.2, sy + wd, sx + half, sy);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a3a1e';
  ctx.lineWidth = Math.max(1.5, half * 0.09);
  ctx.stroke();
  // deck and planks
  ctx.fillStyle = '#9a6d42';
  ctx.beginPath(); ctx.ellipse(sx - half * 0.08, sy, half * 0.68, wd * 0.62, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,225,180,0.35)';
  ctx.lineWidth = Math.max(1, half * 0.05);
  for (let p = -1; p <= 1; p++) {
    ctx.beginPath();
    ctx.moveTo(sx - half * 0.68, sy + wd * 0.28 * p);
    ctx.lineTo(sx + half * 0.5, sy + wd * 0.28 * p);
    ctx.stroke();
  }
  // mast and sail
  ctx.strokeStyle = '#5a3a1e';
  ctx.lineWidth = Math.max(1.5, half * 0.08);
  ctx.beginPath();
  ctx.moveTo(sx - half * 0.08, sy - wd * 0.1);
  ctx.lineTo(sx - half * 0.08, sy - half * 0.85);
  ctx.stroke();
  ctx.fillStyle = '#ece7d4';
  ctx.beginPath();
  ctx.moveTo(sx - half * 0.06, sy - half * 0.8);
  ctx.quadraticCurveTo(sx + half * 0.7, sy - half * 0.58, sx + half * 0.55, sy - wd * 0.45);
  ctx.quadraticCurveTo(sx + half * 0.12, sy - wd * 0.32, sx - half * 0.06, sy - wd * 0.18);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(90,58,30,0.5)';
  ctx.lineWidth = Math.max(1, half * 0.04);
  ctx.stroke();
}

export function drawPlayer(ctx, cam, s, facing) {
  const u = cam.tilePx;
  const { x: sx, y: sy } = cam.project(s.player.x, s.player.y);
  const afloat = Core.onWater(s);
  let bob = 0;
  if (afloat) {
    bob = Math.sin(s.time * 2.6 + s.player.x * 7.3) * u * 0.04;
    drawShip(ctx, sx, sy + bob, Math.max(9, u * 0.95));
  }
  const r = afloat ? Math.max(2, u * 0.1) : Math.max(3, u * 0.27);
  const py = sy + bob;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath(); ctx.ellipse(sx, py + r * 0.8, r * 1.05, r * 0.45, 0, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(sx - r * 0.3, py - r * 0.4, r * 0.1, sx, py, r);
  g.addColorStop(0, '#fdf4d8');
  g.addColorStop(1, '#d9b877');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, py, r, 0, TAU); ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.strokeStyle = '#5a4a2a';
  ctx.stroke();
  const len = Math.hypot(facing.x, facing.y) || 1;
  ctx.fillStyle = '#8a6f3f';
  ctx.beginPath();
  ctx.arc(sx + (facing.x / len) * r * 0.6, py + (facing.y / len) * r * 0.6, r * 0.22, 0, TAU);
  ctx.fill();
}

export function drawParticles(ctx, cam, fx) {
  for (const p of fx.particles) {
    const a = Math.max(0, p.life / p.max);
    const { x, y } = cam.project(p.x, p.y);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, p.size * (0.5 + a * 0.7), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawFloats(ctx, cam, fx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 ' + Math.round(Math.max(12, cam.tilePx * 0.34)) + 'px -apple-system, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  for (const f of fx.floats) {
    const { x, y } = cam.project(f.x, f.y);
    ctx.globalAlpha = Math.min(1, (f.life / f.max) * 1.6);
    ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
}

// Gathered items zipping into the pack, each in its material's shape.
export function drawFlyers(ctx, cam, fx) {
  for (const f of fx.flyers) {
    const { x, y } = cam.project(f.x, f.y);
    ctx.globalAlpha = Math.min(1, 0.3 + f.t * 2.5);
    ctx.fillStyle = RES_COLOR[f.res];
    if (f.res === 'wood' || f.res === 'crystal') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.t * (f.res === 'wood' ? 5 : 4) + f.seed);
      if (f.res === 'wood') ctx.fillRect(-3.5, -1.4, 7, 2.8);
      else {
        ctx.beginPath();
        ctx.moveTo(0, -4.2); ctx.lineTo(3.2, 0); ctx.lineTo(0, 4.2); ctx.lineTo(-3.2, 0);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, f.res === 'ore' ? 3.4 : 3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
