/* Going between layers, you see yourself go: the layer you left slides away,
 * the rock you pass through goes by (one slab per layer, with the shaft and
 * its ladder down the middle), and the new layer slides in. Going down, the
 * world moves up past you; going up, it moves down. So a new layer never just
 * appears like another room: it is plainly below or above the last.
 *
 * Works on finished frames: start() keeps the last frame of the old layer,
 * and draw() runs after each new frame is rendered and moves it into place. */

import { shade, rgba } from './palette.js';

const DURATION = 0.55;  // seconds for one layer
const PER_LAYER = 0.12; // more for each extra layer in a fall
const MAX_DURATION = 1.1;
const SLAB = 0.32;      // a layer of rock, as a share of the screen height
const SHAFT_W = 0.64;   // the shaft's width, in tiles
const LADDER_W = 0.24;  // the ladder's, as in terrain.js

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function createDescent(canvas) {
  let old = null, now = null, run = null;

  // A copy of what's on the canvas, into `into` (reused) or a new canvas.
  function copy(into) {
    const c = into || document.createElement('canvas');
    if (c.width !== canvas.width || c.height !== canvas.height) { c.width = canvas.width; c.height = canvas.height; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(canvas, 0, 0);
    return c;
  }

  // The rock passed through, `layers` slabs from y0, with the shaft down the
  // middle of the screen.
  function drawRock(ctx, cam, look, y0, layers, slab, dpr) {
    const w = canvas.width;
    for (let i = 0; i < layers; i++) {
      const top = y0 + i * slab;
      ctx.fillStyle = shade(look.color('color.unknown'), i & 1 ? 0.2 : 0.6);
      ctx.fillRect(0, top, w, slab + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, top, w, Math.max(1, dpr));
    }
    const u = cam.tilePx * dpr, cx = w / 2, h = layers * slab;
    ctx.fillStyle = rgba(look.color('mark.hole'), 0.9);
    ctx.fillRect(cx - u * SHAFT_W / 2, y0, u * SHAFT_W, h);
    ctx.fillStyle = rgba(look.color('mark.skylight'), 0.18);
    ctx.fillRect(cx - u * SHAFT_W / 2, y0, u * SHAFT_W, h);
    const ladder = look.pick('mark.ladder', 'image');
    const lw = u * LADDER_W, step = Math.max(8, u * 1.2);
    for (let y = y0; y < y0 + h; y += step) look.draw(ctx, ladder, cx - lw / 2, y, lw, Math.min(step + 1, y0 + h - y));
  }

  return {
    get active() { return !!run; },

    // The player has just left layer `from` for layer `to`; the canvas still
    // shows `from`.
    start(from, to) {
      if (from === to) return;
      old = copy(old);
      const layers = Math.abs(to - from);
      run = { down: to < from, layers, t: 0, dur: Math.min(MAX_DURATION, DURATION + PER_LAYER * (layers - 1)) };
    },

    // After the new layer's frame is drawn: slide everything into place.
    draw(cam, look, dt) {
      if (!run) return;
      run.t += dt;
      const k = ease(Math.min(1, run.t / run.dur));
      now = copy(now);
      const ctx = cam.ctx, H = canvas.height, dpr = canvas.width / cam.width;
      const slab = H * SLAB, rock = run.layers * slab, off = k * (H + rock);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = look.color('color.backdrop');
      ctx.fillRect(0, 0, canvas.width, H);
      if (run.down) {
        // The world moves up: old on top, rock, then the new layer below.
        ctx.drawImage(old, 0, -off);
        drawRock(ctx, cam, look, H - off, run.layers, slab, dpr);
        ctx.drawImage(now, 0, H + rock - off);
      } else {
        // The world moves down: the new layer above, rock, then the old.
        ctx.drawImage(now, 0, off - H - rock);
        drawRock(ctx, cam, look, off - rock, run.layers, slab, dpr);
        ctx.drawImage(old, 0, off);
      }
      ctx.restore();
      if (run.t >= run.dur) run = null;
    }
  };
}
