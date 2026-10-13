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
 * What everything looks like comes from the texture pack (look.js): a tile's
 * top picture is stretched over its top face (`u` wide, `g * u` deep, where g
 * shrinks as the view tilts), its face picture repeats down its south face,
 * and what stands on it (trees, boulders) is drawn upright after the whole
 * row's ground, so it can lean over its neighbours without being cut off. */

import * as Core from '../../core/index.js';
import { FLAT_RISE_PX } from '../camera.js';
import { shade, tv, rgba } from './palette.js';
import { drawCliff, cliffDepthPx } from './strata.js';

const LOD_PX = 10;          // below this tile size, draw level-of-detail blocks
const FACE_DIM = 0.58;      // south faces are this much darker than tops
const RIM = 'rgba(255,255,255,0.09)';   // light catching a block's top edge
const CONTACT = 'rgba(0,0,0,0.28)';     // shade at the foot of a taller block
const SHADOW = 'rgba(0,0,0,0.28)';      // under things standing on the ground
const VARIATION = 0.035;    // up to this much darker, per tile, so ground doesn't look like a grid
const FOOT = 0.6;           // where on a tile's depth standing things put their feet
const PILE_FILL = 0.95;     // how much of its square's width a big pile fills
const STAND_MARGIN = 3;     // columns past each side of the screen whose standing things are drawn
const TAU = Math.PI * 2;
const TILE_LOOK = Core.TILE_KEY.map((k, t) => Core.tileLook(t));

// A tile's picture for `slot`. Forests come in kinds by region (see
// Core.forestKind), each with its own trees and maybe its own ground; what a
// kind leaves out comes from tile.forest.
function pickFor(look, w, t, slot, x, y, time) {
  if (t === Core.T.FOREST) {
    const pic = look.pick(Core.forestLook(w.seed, x, y), slot, x, y, time);
    if (pic) return pic;
  }
  return look.pick(TILE_LOOK[t], slot, x, y, time);
}

/* ---------------------------------------------------------------- holes */

// A hole in the floor. Tilted, you see down its far wall, in the dark of the
// hole's colour.
function drawPit(ctx, look, sx, sy, u, d, rise) {
  look.draw(ctx, look.pick('mark.hole', 'top'), sx, sy, u + 1, d + 1);
  if (rise > FLAT_RISE_PX) {
    ctx.fillStyle = rgba(look.color('mark.hole'), 0.85);
    ctx.fillRect(sx + u * 0.2, sy + d * 0.2, u * 0.6, Math.min(d * 0.6, rise * 0.9));
  }
}

// A hole in the ceiling: light from the layer above pooling on the floor, and
// when tilted a shaft of it falling from the opening.
function drawSkylight(ctx, look, sx, sy, u, g, rise) {
  const light = look.color('mark.skylight');
  const cx = sx + u * 0.5, cy = sy + u * g * 0.5;
  const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.8);
  pool.addColorStop(0, rgba(light, 0.45));
  pool.addColorStop(1, rgba(light, 0));
  ctx.fillStyle = pool;
  ctx.fillRect(sx - u * 0.3, sy - u * 0.3 * g, u * 1.6, u * 1.6 * g);
  if (rise <= FLAT_RISE_PX) return;
  const beam = ctx.createLinearGradient(0, cy - rise, 0, cy);
  beam.addColorStop(0, rgba(light, 0.3));
  beam.addColorStop(1, rgba(light, 0.05));
  ctx.fillStyle = beam;
  ctx.fillRect(sx + u * 0.18, cy - rise, u * 0.64, rise);
}

// A face picture repeated down a face `faceH` tall, one picture per layer of
// height (`layerPx`), the last one cut short.
function drawFace(ctx, look, pic, sx, top, u, faceH, layerPx) {
  const step = Math.max(1, layerPx);
  const bmp = look.bitmap(pic, u);
  for (let off = 0; off < faceH; off += step) {
    const part = Math.min(step, faceH - off);
    ctx.drawImage(bmp, 0, 0, bmp.width, Math.max(1, bmp.height * part / step), sx, top + off, u + 1, part + 1);
  }
}

/* ---------------------------------------------------------------- tiles */

// Light lips on the edges of tile (x, y) that face the dark to the north,
// west and east (the south edge is a cliff when tilted).
function drawLips(ctx, look, w, x, y, z, sx, sy, u, d) {
  const lip = Math.max(1, u * 0.04);
  ctx.fillStyle = rgba(look.color('color.edge'), 0.3);
  if (!Core.isExplored(w, x, y - 1, z)) ctx.fillRect(sx, sy, u, lip);
  if (!Core.isExplored(w, x - 1, y, z)) ctx.fillRect(sx, sy, lip, d);
  if (!Core.isExplored(w, x + 1, y, z)) ctx.fillRect(sx + u - lip, sy, lip, d);
}

// Where tile (x, y)'s top sits on screen, and its height.
function tileTop(cam, w, x, y, z) {
  // Flat (or nearly), height moves nothing on screen: skip looking it up.
  const h = cam.risePx > FLAT_RISE_PX ? Core.tileHeight(w, x, y, z) : 0;
  const p = cam.project(x, y, z + h);
  return { h, sx: p.x, sy: p.y };
}

// The ground of one tile: cliff, south face, top, and any hole or skylight.
function drawTile(ctx, cam, s, look, x, y, z) {
  const w = s.world, u = cam.tilePx, d = cam.depthPx, g = d / u;
  if (!Core.isExplored(w, x, y, z)) return; // the dark below the known world
  const t = Core.tileAt(w, x, y, z);
  const id = TILE_LOOK[t];
  const tilted = cam.risePx > FLAT_RISE_PX;
  const { h, sx, sy } = tileTop(cam, w, x, y, z);
  const color = look.color(id);

  // The south face, down to the top of the tile in front, lit along its rim.
  // With the dark in front, it runs down to the floor and the cliff carries on.
  const edge = tilted && !Core.isExplored(w, x, y + 1, z);
  const front = !tilted || edge ? Math.min(h, 0) : Core.tileHeight(w, x, y + 1, z);
  if (edge) drawCliff(ctx, cam, s, look, x, y, z);
  if (h > front) {
    const faceH = (h - front) * cam.risePx;
    const face = look.pick(id, 'face', x, y, s.time);
    if (face) drawFace(ctx, look, face, sx, sy + d, u, faceH, cam.risePx);
    else {
      ctx.fillStyle = shade(color, tv(x, y, 8), FACE_DIM);
      ctx.fillRect(sx, sy + d, u + 1, faceH + 1);
    }
    ctx.fillStyle = RIM;
    ctx.fillRect(sx, sy + d, u + 1, Math.min(faceH, Math.max(1, u * 0.035)));
  }

  const top = pickFor(look, w, t, 'top', x, y, s.time);
  if (top) look.draw(ctx, top, sx, sy, u + 1, d + 1);
  else { ctx.fillStyle = color; ctx.fillRect(sx, sy, u + 1, d + 1); }
  ctx.fillStyle = `rgba(0,0,0,${(tv(x, y, 7) * VARIATION).toFixed(3)})`;
  ctx.fillRect(sx, sy, u + 1, d + 1);
  drawLips(ctx, look, w, x, y, z, sx, sy, u, d);
  // A taller block behind casts a little shade on this top's far edge.
  if (tilted && Core.tileHeight(w, x, y - 1, z) > h + 0.05) {
    ctx.fillStyle = CONTACT;
    ctx.fillRect(sx, sy, u + 1, d * 0.2);
  }
  if (Core.holeBelow(w, x, y, z)) return drawPit(ctx, look, sx, sy, u, d, cam.risePx);
  if (z !== Core.SURFACE && Core.holeAbove(w, x, y, z)) drawSkylight(ctx, look, sx, sy, u, g, cam.risePx);
}

// A stockpile pile standing in the middle of its square of tiles, as big as
// the square, growing in if it's new.
function drawPile(ctx, cam, s, look, yard, p) {
  const u = cam.tilePx, d = cam.depthPx;
  const front = p.y + p.span - 1;
  const h = cam.risePx > FLAT_RISE_PX ? Core.tileHeight(s.world, p.x + (p.span >> 1), front, Core.SURFACE) : 0;
  const foot = cam.project(p.x + p.span / 2, front + FOOT, Core.SURFACE + h);
  const pic = look.tier('pile.' + p.res, p.tier);
  // One tile: the picture's own size. A square: fitted to the square's width.
  const fit = p.span === 1 ? 1 : (p.span * PILE_FILL) / pic.units;
  const size = u * fit * yard.growth(p, s.time);
  if (size < 1) return;
  const fx = foot.x, fy = foot.y;
  const r = Math.min(u * 0.48 * p.span, pic.units * size * 0.45);
  ctx.fillStyle = SHADOW;
  ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.38 * (d / u), 0, 0, TAU); ctx.fill();
  look.stand(ctx, pic, fx, fy, size);
}

// Whatever stands on tile (x, y): a stockpile pile, else its stand picture,
// or its cut picture once worked out. Holes and built tiles have nothing else
// standing on them.
function drawStand(ctx, cam, s, look, ground, x, y, z) {
  const w = s.world;
  if (!Core.isExplored(w, x, y, z)) return;
  const key = Core.packKey(x, y, z);
  const pile = z === Core.SURFACE && ground.yard.piles.get(key);
  if (pile) return drawPile(ctx, cam, s, look, ground.yard, pile);
  if (z === Core.SURFACE && ground.yard.covered.has(key)) return; // under a big pile
  if (Core.holeBelow(w, x, y, z) || ground.built.has(key)) return;
  const t = Core.tileAt(w, x, y, z);
  const id = TILE_LOOK[t];
  const slot = Core.LOOK[id].slots.cut !== undefined && Core.richness(w, x, y, z) <= 0 ? 'cut' : 'stand';
  const pic = pickFor(look, w, t, slot, x, y, s.time);
  if (!pic) return;
  const u = cam.tilePx, d = cam.depthPx;
  const { sx, sy } = tileTop(cam, w, x, y, z);
  const fx = sx + u / 2, fy = sy + d * FOOT;
  const r = Math.min(u * 0.45, pic.units * u * 0.42);
  ctx.fillStyle = SHADOW;
  ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.38 * (d / u), 0, 0, TAU); ctx.fill();
  look.stand(ctx, pic, fx, fy, u, tv(x, y, 17) < 0.5);
}

// One flat block per `step` x `step` tiles, coloured by the tile at its centre.
function drawBlock(ctx, cam, s, look, bx, by, z, step) {
  const tx = bx * step + (step >> 1), ty = by * step + (step >> 1);
  if (!Core.isExplored(s.world, tx, ty, z)) return;
  const t = Core.tileAt(s.world, tx, ty, z);
  const p = cam.project(bx * step, by * step);
  ctx.fillStyle = shade(look.color(TILE_LOOK[t]), tv(tx, ty, 7));
  ctx.fillRect(p.x, p.y, cam.tilePx * step + 1, cam.depthPx * step + 1);
}

// Zoomed far out, each stockpile pile is a dot of its resource's colour
// (bigger for bigger piles), so the yard reads as a patch spreading over the map.
function drawFarPiles(ctx, cam, s, look, yard, v) {
  const u = cam.tilePx;
  for (const p of yard.piles.values()) {
    if (p.x + p.span < v.x0 || p.x > v.x1 || p.y + p.span < v.y0 || p.y > v.y1) continue;
    const size = Math.max(1.5, u * (p.span - 1 + Math.min(1, 0.5 + p.tier * 0.08)));
    const c = cam.project(p.x + p.span / 2, p.y + p.span / 2);
    ctx.fillStyle = look.color(Core.resourceLook(p.res));
    ctx.fillRect(c.x - size / 2, c.y - size / 2, size, size);
  }
}

const lodStep = (cam) => Math.max(1, Math.ceil(LOD_PX / cam.tilePx));

// Draws the visible terrain and calls onRow(y) after each row of tiles.
// `ground` holds what else stands on tiles: `built` (packed keys of tiles with
// buildings) and the stockpile `yard`. Returns how many tiles (or far-zoom
// blocks) it drew.
export function drawTerrain(ctx, cam, s, look, ground, onRow) {
  const z = cam.z;
  const v = cam.visibleTiles();
  const step = lodStep(cam);
  if (step === 1) {
    // Start high enough that cliffs hanging down from rows above the screen show.
    const y0 = v.y0 - Math.ceil(cliffDepthPx(cam) / cam.depthPx);
    for (let y = y0; y <= v.y1; y++) {
      for (let x = v.x0; x <= v.x1; x++) drawTile(ctx, cam, s, look, x, y, z);
      // A little past the sides: trees lean and big piles are wide.
      for (let x = v.x0 - STAND_MARGIN; x <= v.x1 + STAND_MARGIN; x++) drawStand(ctx, cam, s, look, ground, x, y, z);
      onRow(y);
    }
    return (v.y1 - y0 + 1) * (v.x1 - v.x0 + 1);
  }
  // Zoomed far out: flat blocks, no relief, then everything standing on them.
  const by0 = Math.floor(v.y0 / step), by1 = Math.ceil(v.y1 / step);
  const bx0 = Math.floor(v.x0 / step), bx1 = Math.ceil(v.x1 / step);
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) drawBlock(ctx, cam, s, look, bx, by, z, step);
  }
  if (z === Core.SURFACE) drawFarPiles(ctx, cam, s, look, ground.yard, v);
  for (let y = v.y0; y <= v.y1; y++) onRow(y);
  return (by1 - by0 + 1) * (bx1 - bx0 + 1);
}
