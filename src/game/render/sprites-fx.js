/* The short-lived effects over the world (fx.js keeps them): chips and
 * sparks, floating numbers with their icons, and gathered things flying home. */

import * as Core from '../../core/index.js';

const TAU = Math.PI * 2;
const FLOAT_FADE = 0.6; // seconds a floating label takes to fade out

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

// Floating numbers, with the icon of what they count after them.
export function drawFloats(ctx, cam, look, fx) {
  const font = (px) => '700 ' + px + 'px -apple-system, sans-serif'; // i18n-ok: a font
  const size = Math.round(Math.max(14, cam.tilePx * 0.42));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(size);
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  for (const f of fx.floats) {
    const { x, y } = cam.project(f.x, f.y);
    // A label that just grew pops a little bigger.
    const px = f.pop > 0 ? Math.round(size * (1 + 0.3 * f.pop)) : size;
    if (px !== size) ctx.font = font(px);
    const tw = ctx.measureText(f.text).width;
    const iw = f.icon ? px * 1.15 : 0;
    const left = x - (tw + iw) / 2;
    ctx.globalAlpha = Math.min(1, f.life / FLOAT_FADE);
    ctx.strokeText(f.text, left, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, left, y);
    if (f.icon)
      look.draw(ctx, look.pick(f.icon, 'icon'), left + tw + px * 0.15, y - px / 2, px, px);
    if (px !== size) ctx.font = font(size);
  }
  ctx.globalAlpha = 1;
}

// Gathered items floating home to the stockpile, as their resource's icon.
export function drawFlyers(ctx, cam, look, fx) {
  const size = Math.max(12, cam.tilePx * 0.36);
  for (const f of fx.flyers) {
    const { x, y } = cam.project(f.x, f.y);
    if (x < -size || y < -size || x > cam.width + size || y > cam.height + size) continue;
    ctx.globalAlpha = Math.min(1, 0.3 + f.t * 1.5);
    look.draw(
      ctx,
      look.pick(Core.resourceLook(f.res), 'icon'),
      x - size / 2,
      y - size / 2,
      size,
      size
    );
  }
  ctx.globalAlpha = 1;
}
