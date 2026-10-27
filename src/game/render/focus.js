/* What Wiki is talking about, outlined: one ring around the whole of it
 * (whatever stands on its tile, else its square of ground), never its
 * inner edges: Wiki's own teal over a dark ink line, so it reads on bright
 * ground and at night alike, and says whose focus it is. The thing is painted once into a small off-screen canvas,
 * grown a few pixels in every direction for the ring, and its own shape cut
 * out of the middle. That is redone only when the view's scale changes, or
 * now and then for a thing that changes as it is worked; moving the camera
 * only moves the ring. */
import * as Core from '../../core/index.js';
import { drawStand, groundHeight } from './terrain.js';
import { drawExtractor } from './sprites.js';
import { drawCultivation } from './cultivation.js';
import { FLAT_RISE_PX } from '../camera.js';

const TEAL = '#7fe6c4';              // Wiki's cap (render/wiki-model.js)
const INK = 'rgba(18,26,22,0.85)';
const STEPS = 12;                    // directions the shape is grown in
const MAX_PX = 560;                  // the off-screen canvas's longest side, in device px
const REFRESH_MS = 400;              // a thing being worked changes: repaint this often

let paper = null, kept = '';

function canvases() {
  if (!paper) paper = [0, 1, 2].map(() => document.createElement('canvas'));
  return paper;
}

// `shape` grown by r px (canvas px) into `out`, in one colour.
function grow(out, shape, r, color) {
  const g = out.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, out.width, out.height);
  for (let i = 0; i < STEPS; i++) {
    const a = i * Math.PI * 2 / STEPS;
    g.drawImage(shape, Math.cos(a) * r, Math.sin(a) * r);
  }
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, out.width, out.height);
  g.globalCompositeOperation = 'source-over';
}

// The ring around what paint(g) draws, for a thing inside `box` (screen px).
// `key` names what is painted, so an unchanged thing isn't painted again.
export function drawRing(ctx, cam, box, key, paint, alpha = 1) {
  const teal = Math.max(2, Math.min(4, cam.tilePx * 0.04)), ink = teal + 1.6;
  const pad = Math.ceil(ink + 2);
  const k = Math.min(cam.dpr || 1, MAX_PX / (Math.max(box.w, box.h) + pad * 2));
  const W = Math.ceil((box.w + pad * 2) * k), H = Math.ceil((box.h + pad * 2) * k);
  if (W < 2 || H < 2) return;
  const [shape, lit, ring] = canvases();
  const full = [key, W, H, k.toFixed(3), cam.tilePx.toFixed(2), cam.depthPx.toFixed(2), cam.risePx.toFixed(2), Math.floor(performance.now() / REFRESH_MS)].join('|');
  if (full !== kept || ring.width !== W || ring.height !== H) {
    kept = full;
    for (const c of [shape, lit, ring]) { c.width = W; c.height = H; }
    const g = shape.getContext('2d');
    g.setTransform(k, 0, 0, k, (pad - box.x) * k, (pad - box.y) * k);
    paint(g);
    grow(ring, shape, ink * k, INK);
    grow(lit, shape, teal * k, TEAL);
    const r = ring.getContext('2d');
    r.drawImage(lit, 0, 0);
    r.globalCompositeOperation = 'destination-out';
    r.drawImage(shape, 0, 0);
    r.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(ring, 0, 0, W, H, box.x - pad, box.y - pad, W / k, H / k);
  ctx.restore();
}

// The outline for Wiki's world focus ({x, y, z}); characters have no focus.
export function drawFocus(ctx, cam, s, look, ground, focus) {
  if (!focus) return;
  const u = cam.tilePx, d = cam.depthPx;
  const { x, y, z } = focus;
  if (z !== cam.z || !Core.isExplored(s.world, x, y, z)) return;
  const showsHeight = cam.risePx > FLAT_RISE_PX;
  const h = showsHeight ? Core.tileHeight(s.world, x, y, z) : 0;
  const p = cam.project(x, y, z + h);
  if (p.x < -u * 2 || p.y < -u * 3 || p.x > cam.width + u || p.y > cam.height + u) return;
  const front = showsHeight ? groundHeight(s.world, x, y + 1, z) : Math.min(h, 0);
  const face = h > front ? (h - front) * cam.risePx : 0;
  const box = { x: p.x - u, y: p.y - u * 2.6, w: u * 3, h: u * 2.6 + d + face + u * 0.1 };
  const hiding = s.cultivation && z === Core.SURFACE ? Core.hidingPlace(s.world.seed) : null;
  const facility = Core.cultivationAt(s, x, y, z) || (hiding && hiding.x === x && hiding.y === y ? { kind: 'station', x, y, z } : null);
  const building = facility ? null : Core.extractorAt(s, x, y, z);
  drawRing(ctx, cam, box, [x, y, z, Core.tileAt(s.world, x, y, z)].join(','), (g) => {
    // What stands there; with nothing standing, its square of ground (and
    // its south face, if it rises as a block).
    if (facility) drawCultivation(g, cam, s, look, facility);
    else if (building) drawExtractor(g, cam, s, look, building, false);
    else if (!drawStand(g, cam, s, look, ground, x, y, z, false)) { g.fillStyle = '#000'; g.fillRect(p.x, p.y, u, d + face); }
  }, focus.alpha);
}
