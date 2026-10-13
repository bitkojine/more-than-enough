/* Terrain: one tile at a time up close, flat sampled blocks when zoomed far
 * out (so the draw count stays bounded however far you pinch out).
 *
 * Rows are drawn north to south. Each tile draws its top, then its south face
 * down to the top of the tile in front, so nearer blocks cover farther ones.
 * After each row the caller draws whatever stands in it (the player,
 * buildings), which lets walls hide what is behind them when tilted.
 *
 * Unexplored tiles are not drawn at all: the known world is a plateau over
 * the dark. Where explored ground has darkness in front of it, its edge drops
 * as a cliff showing the layers below (strata.js); other edges over the dark
 * catch a light lip.
 *
 * Decoration takes the top face's rectangle: `u` wide and `g * u` deep, where
 * g shrinks as the view tilts. Things lying on the ground scale by g; things
 * standing up (trees, crystals, grass blades) keep their height. */

import * as Core from '../../core/index.js';
import { FLAT_RISE_PX } from '../camera.js';
import { BASE_COLOR, shade, tv } from './palette.js';
import { drawCliff, cliffDepthPx } from './strata.js';

const { T } = Core;
const LOD_PX = 10;          // below this tile size, draw level-of-detail blocks
const LIP = 'rgba(232,222,186,0.22)';   // the edge of the known world, over the dark
const FACE_DIM = 0.58;      // south faces are this much darker than tops
const RIM = 'rgba(255,255,255,0.09)';   // light catching a block's top edge
const CONTACT = 'rgba(0,0,0,0.28)';     // shade at the foot of a taller block
const TAU = Math.PI * 2;

// South faces that shouldn't just be a darker top (dark rock needs lifting).
const FACE_COLOR = [];
FACE_COLOR[T.ROCK] = '#1d2328';
FACE_COLOR[T.BEDROCK] = '#24282c';

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

function drawGrass(ctx, sx, sy, u, g, x, y) {
  if (tv(x, y, 101) < 0.45) return;
  ctx.strokeStyle = 'rgba(150,185,110,0.35)';
  ctx.lineWidth = Math.max(1, u * 0.03);
  for (let k = 0; k < 2; k++) {
    const gx = sx + u * (0.25 + 0.5 * tv(x, y, 102 + k));
    const gy = sy + u * g * (0.4 + 0.4 * tv(x, y, 104 + k));
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + u * 0.03, gy - u * (0.08 + 0.05 * tv(x, y, 106 + k)));
    ctx.stroke();
  }
}

function drawTrees(ctx, sx, sy, u, g, x, y) {
  const n = tv(x, y, 1) > 0.55 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const cx = sx + u * 0.5 + (tv(x, y, 2 + k) - 0.5) * u * 0.55;
    const cy = sy + u * g * (0.52 + (tv(x, y, 9 + k) - 0.5) * 0.45);
    const w = u * 0.42, h = u * 0.52;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(cx, cy + u * 0.13 * g, w * 0.5, u * 0.09 * g, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = k ? '#2c5634' : '#3a6b41';
    ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx - w / 2, cy + h * 0.32); ctx.lineTo(cx + w / 2, cy + h * 0.32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3f2d1e';
    ctx.fillRect(cx - u * 0.04, cy + h * 0.3, u * 0.08, u * 0.12);
  }
}

function drawStump(ctx, sx, sy, u, g) {
  const cx = sx + u * 0.5, cy = sy + u * g * 0.55;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy + u * 0.07 * g, u * 0.16, u * 0.07 * g, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a3826';
  ctx.beginPath(); ctx.ellipse(cx, cy, u * 0.13, u * 0.13 * g, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6a5236';
  ctx.beginPath(); ctx.ellipse(cx, cy - u * 0.01 * g, u * 0.07, u * 0.07 * g, 0, 0, TAU); ctx.fill();
}

function drawRocks(ctx, sx, sy, u, g, x, y, ore, depleted) {
  for (let k = 0; k < (depleted ? 1 : 2); k++) {
    const cx = sx + u * (0.3 + 0.4 * tv(x, y, 3 + k));
    const cy = sy + u * g * (0.42 + 0.32 * tv(x, y, 5 + k));
    const r = u * (depleted ? 0.13 : 0.19) * (0.85 + 0.35 * tv(x, y, 11 + k));
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.55 * g, r * 1.1, r * 0.4 * g, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#454a41';
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#737a6e';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.18, cy - r * 0.24, r * 0.62, r * 0.5, 0, 0, TAU); ctx.fill();
  }
  if (!ore || depleted) return;
  for (let j = 0; j < 3; j++) {
    const px = sx + u * (0.25 + 0.5 * tv(x, y, 21 + j));
    const py = sy + u * g * (0.3 + 0.45 * tv(x, y, 31 + j));
    ctx.fillStyle = '#e0903c';
    ctx.beginPath(); ctx.arc(px, py, u * 0.055, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,140,0.9)';
    ctx.beginPath(); ctx.arc(px - u * 0.014, py - u * 0.014, u * 0.022, 0, TAU); ctx.fill();
  }
}

function drawCrystal(ctx, sx, sy, u, g, x, y) {
  for (let k = 0; k < 3; k++) {
    const cx = sx + u * (0.28 + 0.44 * tv(x, y, 41 + k));
    const cy = sy + u * g * (0.38 + 0.38 * tv(x, y, 51 + k));
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

function drawWater(ctx, sx, sy, u, g, x, y, time) {
  ctx.fillStyle = 'rgba(30,60,95,0.5)';
  ctx.fillRect(sx, sy + u * g * 0.62, u + 1, u * g * 0.38);
  ctx.strokeStyle = 'rgba(90,150,200,0.22)';
  ctx.lineWidth = Math.max(1, u * 0.035);
  for (let k = 0; k < 2; k++) {
    const wy = sy + u * g * (0.32 + 0.34 * k + Math.sin((time + tv(x, y, 71 + k)) * 1.6) * 0.04);
    ctx.beginPath();
    ctx.moveTo(sx + u * 0.16, wy);
    ctx.lineTo(sx + u * 0.55, wy);
    ctx.stroke();
  }
}

function drawMountain(ctx, sx, sy, u, g) {
  ctx.fillStyle = '#1b2126';
  roundRect(ctx, sx + u * 0.12, sy + u * g * 0.16, u * 0.76, u * g * 0.68, u * g * 0.16);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, sx + u * 0.2, sy + u * g * 0.22, u * 0.5, u * g * 0.24, u * g * 0.1);
  ctx.fill();
}

/* --------------------------------------------------------- underground */

const SEAM_FLECK = { [T.STONE_SEAM]: '#86735c', [T.ORE_SEAM]: '#efa45c', [T.CRYSTAL_SEAM]: '#8fe9ff', [T.FOSSIL]: '#c3b0d8', [T.SOIL]: '#86735c' };

// A closed shaft: a gold ring in the rock. Once opened it is a hole (drawPit).
function drawShaft(ctx, sx, sy, u, g) {
  const cx = sx + u * 0.5, cy = sy + u * g * 0.5;
  ctx.strokeStyle = '#e4c77f';
  ctx.lineWidth = Math.max(2, u * 0.07);
  ctx.beginPath(); ctx.ellipse(cx, cy, u * 0.3, u * 0.3 * g, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath(); ctx.ellipse(cx, cy, u * 0.07, u * 0.07 * g, 0, 0, TAU); ctx.fill();
}

/* ---------------------------------------------------------------- holes */

const PIT_RIM = '#4a3a28', PIT_DARK = '#030202', PIT_WALL = '#2a2017';

// A hole in the floor: dug earth around a dark drop. Tilted, you see down its
// far wall.
function drawPit(ctx, sx, sy, u, g, rise) {
  const inset = u * 0.14, lip = u * 0.05;
  const x0 = sx + inset, y0 = sy + inset * g, w = u - inset * 2, h = (u - inset * 2) * g;
  ctx.fillStyle = PIT_RIM;
  roundRect(ctx, x0 - lip, y0 - lip * g, w + lip * 2, h + lip * 2 * g, u * 0.12 * g);
  ctx.fill();
  ctx.fillStyle = PIT_DARK;
  ctx.fillRect(x0, y0, w, h);
  if (rise > FLAT_RISE_PX) {
    ctx.fillStyle = PIT_WALL;
    ctx.fillRect(x0, y0, w, Math.min(h, rise * 0.9));
  }
}

// A hole in the ceiling: daylight (or lamplight from the layer above) pooling
// on the floor, and when tilted a shaft of it falling from the opening.
function drawSkylight(ctx, sx, sy, u, g, rise) {
  const cx = sx + u * 0.5, cy = sy + u * g * 0.5;
  const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.8);
  pool.addColorStop(0, 'rgba(255,238,200,0.45)');
  pool.addColorStop(1, 'rgba(255,238,200,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(sx - u * 0.3, sy - u * 0.3 * g, u * 1.6, u * 1.6 * g);
  if (rise <= FLAT_RISE_PX) return;
  const beam = ctx.createLinearGradient(0, cy - rise, 0, cy);
  beam.addColorStop(0, 'rgba(255,238,200,0.3)');
  beam.addColorStop(1, 'rgba(255,238,200,0.05)');
  ctx.fillStyle = beam;
  ctx.fillRect(sx + u * 0.18, cy - rise, u * 0.64, rise);
}

function drawUnderground(ctx, sx, sy, u, g, t) {
  if (t === T.SHAFT) return drawShaft(ctx, sx, sy, u, g);
  if (t === T.TUNNEL) {
    ctx.fillStyle = 'rgba(225,181,105,0.1)';
    ctx.fillRect(sx + u * 0.15, sy + u * g * 0.15, u * 0.7, u * g * 0.7);
    return;
  }
  if (t === T.BEDROCK) {
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = Math.max(1, u * 0.07);
    ctx.beginPath();
    ctx.moveTo(sx + u * 0.2, sy + u * g * 0.2); ctx.lineTo(sx + u * 0.8, sy + u * g * 0.75);
    ctx.moveTo(sx + u * 0.78, sy + u * g * 0.18); ctx.lineTo(sx + u * 0.28, sy + u * g * 0.82);
    ctx.stroke();
    return;
  }
  const r = u * (t === T.SOIL ? 0.09 : 0.2);
  ctx.fillStyle = SEAM_FLECK[t];
  ctx.beginPath(); ctx.ellipse(sx + u * 0.5, sy + u * g * 0.5, r, r * g, 0, 0, TAU); ctx.fill();
}

/* ---------------------------------------------------------------- tiles */

// A tile's look: its type, or fog for unexplored surface.
// A tile's look: its type, or -1 where it hasn't been seen yet.
// Light lips on the edges of tile (x, y) that face the dark to the north,
// west and east (the south edge is a cliff when tilted).
function drawLips(ctx, w, x, y, z, sx, sy, u, d) {
  const lip = Math.max(1, u * 0.04);
  ctx.fillStyle = LIP;
  if (!Core.isExplored(w, x, y - 1, z)) ctx.fillRect(sx, sy, u, lip);
  if (!Core.isExplored(w, x - 1, y, z)) ctx.fillRect(sx, sy, lip, d);
  if (!Core.isExplored(w, x + 1, y, z)) ctx.fillRect(sx + u - lip, sy, lip, d);
}

function drawTile(ctx, cam, s, x, y, z) {
  const w = s.world, u = cam.tilePx, d = cam.depthPx, g = d / u;
  if (!Core.isExplored(w, x, y, z)) return; // the dark below the known world
  const t = Core.tileAt(w, x, y, z);
  // Flat (or nearly), height moves nothing on screen: skip looking it up.
  const tilted = cam.risePx > FLAT_RISE_PX;
  const h = tilted ? Core.tileHeight(w, x, y, z) : 0;
  const { x: sx, y: sy } = cam.project(x, y, z + h);
  const color = BASE_COLOR[t];

  // The south face, down to the top of the tile in front, lit along its rim.
  // With the dark in front, it runs down to the floor and the cliff carries on.
  const edge = tilted && !Core.isExplored(w, x, y + 1, z);
  const front = !tilted || edge ? Math.min(h, 0) : Core.tileHeight(w, x, y + 1, z);
  if (edge) drawCliff(ctx, cam, s, x, y, z);
  if (h > front) {
    const faceH = (h - front) * cam.risePx;
    ctx.fillStyle = FACE_COLOR[t] ? shade(FACE_COLOR[t], tv(x, y, 8)) : shade(color, tv(x, y, 8), FACE_DIM);
    ctx.fillRect(sx, sy + d, u + 1, faceH + 1);
    ctx.fillStyle = RIM;
    ctx.fillRect(sx, sy + d, u + 1, Math.min(faceH, Math.max(1, u * 0.035)));
  }

  ctx.fillStyle = shade(color, tv(x, y, 7));
  ctx.fillRect(sx, sy, u + 1, d + 1);
  drawLips(ctx, w, x, y, z, sx, sy, u, d);
  // A taller block behind casts a little shade on this top's far edge.
  if (tilted && Core.tileHeight(w, x, y - 1, z) > h + 0.05) {
    ctx.fillStyle = CONTACT;
    ctx.fillRect(sx, sy, u + 1, d * 0.2);
  }
  if (Core.holeBelow(w, x, y, z)) return drawPit(ctx, sx, sy, u, g, cam.risePx);
  if (z !== Core.SURFACE) {
    drawUnderground(ctx, sx, sy, u, g, t);
    if (Core.holeAbove(w, x, y, z)) drawSkylight(ctx, sx, sy, u, g, cam.risePx);
    return;
  }
  const depleted = Core.richness(w, x, y, z) <= 0;
  if (t === T.FOREST && depleted) drawStump(ctx, sx, sy, u, g);
  else if (t === T.FOREST) drawTrees(ctx, sx, sy, u, g, x, y);
  else if (t === T.STONE) drawRocks(ctx, sx, sy, u, g, x, y, false, depleted);
  else if (t === T.ORE) drawRocks(ctx, sx, sy, u, g, x, y, true, false);
  else if (t === T.CRYSTAL) drawCrystal(ctx, sx, sy, u, g, x, y);
  else if (t === T.WATER) drawWater(ctx, sx, sy, u, g, x, y, s.time);
  else if (t === T.ROCK) drawMountain(ctx, sx, sy, u, g);
  else drawGrass(ctx, sx, sy, u, g, x, y);
}

// One flat block per `step` x `step` tiles, coloured by the tile at its centre.
function drawBlock(ctx, cam, s, bx, by, z, step) {
  const tx = bx * step + (step >> 1), ty = by * step + (step >> 1);
  if (!Core.isExplored(s.world, tx, ty, z)) return;
  const t = Core.tileAt(s.world, tx, ty, z);
  const p = cam.project(bx * step, by * step);
  ctx.fillStyle = shade(BASE_COLOR[t], tv(tx, ty, 7));
  ctx.fillRect(p.x, p.y, cam.tilePx * step + 1, cam.depthPx * step + 1);
}

const lodStep = (cam) => Math.max(1, Math.ceil(LOD_PX / cam.tilePx));

// Draws the visible terrain and calls onRow(y) after each row of tiles.
// Returns how many tiles (or far-zoom blocks) it drew.
export function drawTerrain(ctx, cam, s, onRow) {
  const z = cam.z;
  const v = cam.visibleTiles();
  const step = lodStep(cam);
  if (step === 1) {
    // Start high enough that cliffs hanging down from rows above the screen show.
    const y0 = v.y0 - Math.ceil(cliffDepthPx(cam) / cam.depthPx);
    for (let y = y0; y <= v.y1; y++) {
      for (let x = v.x0; x <= v.x1; x++) drawTile(ctx, cam, s, x, y, z);
      onRow(y);
    }
    return (v.y1 - y0 + 1) * (v.x1 - v.x0 + 1);
  }
  // Zoomed far out: flat blocks, no relief, then everything standing on them.
  const by0 = Math.floor(v.y0 / step), by1 = Math.ceil(v.y1 / step);
  const bx0 = Math.floor(v.x0 / step), bx1 = Math.ceil(v.x1 / step);
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) drawBlock(ctx, cam, s, bx, by, z, step);
  }
  for (let y = v.y0; y <= v.y1; y++) onRow(y);
  return (by1 - by0 + 1) * (bx1 - bx0 + 1);
}
