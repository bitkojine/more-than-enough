/* Terrain: one tile at a time up close, flat sampled blocks when zoomed far
 * out (so the draw count stays bounded however far you pinch out). */

import * as Core from '../../core/index.js';

const { T } = Core;
const LOD_PX = 10;          // below this tile size, draw level-of-detail blocks
const FOG = '#04060a';
const TAU = Math.PI * 2;

// Stable per-tile variation for decoration.
const tv = (x, y, salt) => Core.hash2(x, y, salt);

const BASE_COLOR = [];
BASE_COLOR[T.GRASS] = '#243018';
BASE_COLOR[T.FOREST] = '#0e1a0c';
BASE_COLOR[T.STONE] = '#34372e';
BASE_COLOR[T.ORE] = '#34372e';
BASE_COLOR[T.CRYSTAL] = '#141d30';
BASE_COLOR[T.WATER] = '#0e2138';
BASE_COLOR[T.ROCK] = '#0b0e11';
BASE_COLOR[T.TUNNEL] = '#29251e';
BASE_COLOR[T.SOIL] = '#59452f';
BASE_COLOR[T.STONE_SEAM] = '#55524b';
BASE_COLOR[T.ORE_SEAM] = '#744629';
BASE_COLOR[T.CRYSTAL_SEAM] = '#27566a';
BASE_COLOR[T.FOSSIL] = '#554b62';
BASE_COLOR[T.BEDROCK] = '#14171a';
BASE_COLOR[T.SHAFT] = '#574b32';
BASE_COLOR[T.SHAFT_OPEN] = '#315747';

// Slight brightness variation so flat ground doesn't look like a grid.
function shade(hex, f) {
  const m = 0.84 + f * 0.34;
  const c = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * m);
  return `rgb(${c(1)},${c(3)},${c(5)})`;
}

export function roundRect(ctx, x, y, w, h, r) {
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

/* ------------------------------------------------------------- surface */

function drawGrass(ctx, sx, sy, u, x, y) {
  if (tv(x, y, 101) < 0.45) return;
  ctx.strokeStyle = 'rgba(150,185,110,0.35)';
  ctx.lineWidth = Math.max(1, u * 0.03);
  for (let k = 0; k < 2; k++) {
    const gx = sx + u * (0.25 + 0.5 * tv(x, y, 102 + k));
    const gy = sy + u * (0.4 + 0.4 * tv(x, y, 104 + k));
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + u * 0.03, gy - u * (0.08 + 0.05 * tv(x, y, 106 + k)));
    ctx.stroke();
  }
}

function drawTrees(ctx, sx, sy, u, x, y) {
  const n = tv(x, y, 1) > 0.55 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const cx = sx + u * 0.5 + (tv(x, y, 2 + k) - 0.5) * u * 0.55;
    const cy = sy + u * 0.52 + (tv(x, y, 9 + k) - 0.5) * u * 0.45;
    const w = u * 0.42, h = u * 0.52;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(cx, cy + u * 0.13, w * 0.5, u * 0.09, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = k ? '#2c5634' : '#3a6b41';
    ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx - w / 2, cy + h * 0.32); ctx.lineTo(cx + w / 2, cy + h * 0.32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3f2d1e';
    ctx.fillRect(cx - u * 0.04, cy + h * 0.3, u * 0.08, u * 0.12);
  }
}

function drawStump(ctx, sx, sy, u) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(sx + u * 0.5, sy + u * 0.62, u * 0.16, u * 0.07, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a3826';
  ctx.beginPath(); ctx.arc(sx + u * 0.5, sy + u * 0.55, u * 0.13, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6a5236';
  ctx.beginPath(); ctx.arc(sx + u * 0.5, sy + u * 0.54, u * 0.07, 0, TAU); ctx.fill();
}

function drawRocks(ctx, sx, sy, u, x, y, ore, depleted) {
  for (let k = 0; k < (depleted ? 1 : 2); k++) {
    const cx = sx + u * (0.3 + 0.4 * tv(x, y, 3 + k));
    const cy = sy + u * (0.42 + 0.32 * tv(x, y, 5 + k));
    const r = u * (depleted ? 0.13 : 0.19) * (0.85 + 0.35 * tv(x, y, 11 + k));
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.55, r * 1.1, r * 0.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#454a41';
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#737a6e';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.18, cy - r * 0.24, r * 0.62, r * 0.5, 0, 0, TAU); ctx.fill();
  }
  if (!ore || depleted) return;
  for (let j = 0; j < 3; j++) {
    const px = sx + u * (0.25 + 0.5 * tv(x, y, 21 + j));
    const py = sy + u * (0.3 + 0.45 * tv(x, y, 31 + j));
    ctx.fillStyle = '#e0903c';
    ctx.beginPath(); ctx.arc(px, py, u * 0.055, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,140,0.9)';
    ctx.beginPath(); ctx.arc(px - u * 0.014, py - u * 0.014, u * 0.022, 0, TAU); ctx.fill();
  }
}

function drawCrystal(ctx, sx, sy, u, x, y) {
  for (let k = 0; k < 3; k++) {
    const cx = sx + u * (0.28 + 0.44 * tv(x, y, 41 + k));
    const cy = sy + u * (0.38 + 0.38 * tv(x, y, 51 + k));
    const h = u * (0.16 + 0.13 * tv(x, y, 61 + k));
    const diamond = (hw, hh) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = 'rgba(110,220,255,0.14)'; // soft halo (cheap, no shadowBlur)
    diamond(h * 0.75, h * 1.5);
    ctx.fillStyle = k === 0 ? '#8fefff' : '#5cc4e0';
    diamond(h * 0.45, h);
  }
}

function drawWater(ctx, sx, sy, u, x, y, time) {
  ctx.fillStyle = 'rgba(30,60,95,0.5)';
  ctx.fillRect(sx, sy + u * 0.62, u + 1, u * 0.38);
  ctx.strokeStyle = 'rgba(90,150,200,0.22)';
  ctx.lineWidth = Math.max(1, u * 0.035);
  for (let k = 0; k < 2; k++) {
    const wy = sy + u * (0.32 + 0.34 * k) + Math.sin((time + tv(x, y, 71 + k)) * 1.6) * u * 0.04;
    ctx.beginPath();
    ctx.moveTo(sx + u * 0.16, wy);
    ctx.lineTo(sx + u * 0.55, wy);
    ctx.stroke();
  }
}

function drawMountain(ctx, sx, sy, u) {
  ctx.fillStyle = '#1b2126';
  roundRect(ctx, sx + u * 0.12, sy + u * 0.16, u * 0.76, u * 0.68, u * 0.16);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, sx + u * 0.2, sy + u * 0.22, u * 0.5, u * 0.24, u * 0.1);
  ctx.fill();
}

/* --------------------------------------------------------- underground */

const SEAM_FLECK = { [T.STONE_SEAM]: '#86735c', [T.ORE_SEAM]: '#efa45c', [T.CRYSTAL_SEAM]: '#8fe9ff', [T.FOSSIL]: '#c3b0d8', [T.SOIL]: '#86735c' };

function drawShaft(ctx, sx, sy, u, open) {
  ctx.strokeStyle = open ? '#a8efb3' : '#e4c77f';
  ctx.lineWidth = Math.max(2, u * 0.07);
  ctx.beginPath(); ctx.arc(sx + u * 0.5, sy + u * 0.5, u * 0.3, 0, TAU); ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = 'bold ' + Math.max(12, u * 0.42) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(open ? '↓' : '•', sx + u * 0.5, sy + u * 0.5);
}

function drawUnderground(ctx, sx, sy, u, t) {
  if (t === T.SHAFT || t === T.SHAFT_OPEN) return drawShaft(ctx, sx, sy, u, t === T.SHAFT_OPEN);
  if (t === T.TUNNEL) {
    ctx.fillStyle = 'rgba(225,181,105,0.1)';
    ctx.fillRect(sx + u * 0.15, sy + u * 0.15, u * 0.7, u * 0.7);
    return;
  }
  if (t === T.BEDROCK) {
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = Math.max(1, u * 0.07);
    ctx.beginPath();
    ctx.moveTo(sx + u * 0.2, sy + u * 0.2); ctx.lineTo(sx + u * 0.8, sy + u * 0.75);
    ctx.moveTo(sx + u * 0.78, sy + u * 0.18); ctx.lineTo(sx + u * 0.28, sy + u * 0.82);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = SEAM_FLECK[t];
  ctx.beginPath(); ctx.arc(sx + u * 0.5, sy + u * 0.5, u * (t === T.SOIL ? 0.09 : 0.2), 0, TAU); ctx.fill();
}

/* ---------------------------------------------------------------- tiles */

function drawTile(ctx, s, x, y, z, sx, sy, u) {
  const w = s.world;
  if (z === Core.SURFACE && !Core.isExplored(w, x, y, z)) {
    ctx.fillStyle = FOG;
    ctx.fillRect(sx, sy, u + 1, u + 1);
    return;
  }
  const t = Core.tileAt(w, x, y, z);
  ctx.fillStyle = shade(BASE_COLOR[t], tv(x, y, 7));
  ctx.fillRect(sx, sy, u + 1, u + 1);
  if (z !== Core.SURFACE) return drawUnderground(ctx, sx, sy, u, t);
  const depleted = Core.richness(w, x, y, z) <= 0;
  if (t === T.FOREST && depleted) drawStump(ctx, sx, sy, u);
  else if (t === T.FOREST) drawTrees(ctx, sx, sy, u, x, y);
  else if (t === T.STONE) drawRocks(ctx, sx, sy, u, x, y, false, depleted);
  else if (t === T.ORE) drawRocks(ctx, sx, sy, u, x, y, true, false);
  else if (t === T.CRYSTAL) drawCrystal(ctx, sx, sy, u, x, y);
  else if (t === T.WATER) drawWater(ctx, sx, sy, u, x, y, s.time);
  else if (t === T.ROCK) drawMountain(ctx, sx, sy, u);
  else drawGrass(ctx, sx, sy, u, x, y);
}

// One flat block per `step` x `step` tiles, coloured by the tile at its centre.
function drawBlock(ctx, s, bx, by, z, step, sx, sy, size) {
  const tx = bx * step + (step >> 1), ty = by * step + (step >> 1);
  const hidden = z === Core.SURFACE && !Core.isExplored(s.world, tx, ty, z);
  ctx.fillStyle = hidden ? FOG : shade(BASE_COLOR[Core.tileAt(s.world, tx, ty, z)], tv(tx, ty, 7));
  ctx.fillRect(sx, sy, size + 1, size + 1);
}

export function drawTerrain(ctx, cam, s) {
  const z = cam.z, u = cam.tilePx;
  const v = cam.visibleTiles();
  const step = Math.max(1, Math.ceil(LOD_PX / u));
  if (step === 1) {
    for (let y = v.y0; y <= v.y1; y++) {
      for (let x = v.x0; x <= v.x1; x++) {
        const p = cam.project(x, y);
        drawTile(ctx, s, x, y, z, p.x, p.y, u);
      }
    }
    return;
  }
  const by0 = Math.floor(v.y0 / step), by1 = Math.ceil(v.y1 / step);
  const bx0 = Math.floor(v.x0 / step), bx1 = Math.ceil(v.x1 / step);
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const p = cam.project(bx * step, by * step);
      drawBlock(ctx, s, bx, by, z, step, p.x, p.y, u * step);
    }
  }
}
