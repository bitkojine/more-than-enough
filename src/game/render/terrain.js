/* Terrain: visible faces are shaded immediately after their artwork. The
 * atlas handles distant map zoom; gameplay terrain stays live as lights move.
 *
 * Rows are drawn north to south. Each tile draws its top, then its south face
 * down to the top of the tile in front, so nearer blocks cover farther ones.
 * Floors finish first. Standing objects retain north-to-south order, clipped
 * against genuinely higher foreground terrain rather than equal-height floor.
 *
 * In the forest, unexplored tiles are under clouds (fog.js), drawn over the
 * ground once the rows are done. In the mine, unexplored tiles are dark rock
 * (see drawUnseenRock).
 *
 * What everything looks like comes from the game's pack (look.js): a tile's
 * top picture is stretched over its top face (`u` wide, `g * u` deep, where g
 * is the view's foreshortening), its face picture repeats down its south face,
 * and what stands on it (trees, boulders) is drawn upright after the whole
 * row's ground, so it can lean over its neighbours without being cut off. */

import * as Core from '../../core/index.js';
import { FLAT_RISE_PX } from '../camera.js';
import { shade, tv, rgba } from './palette.js';
import {lightBrightness,shadeFace,lightObject,faceRect,spriteLight} from './lighting.js';
import { drawFog } from './fog.js';

const FACE_DIM = 0.58;      // south faces are this much darker than tops
const RIM = 'rgba(255,255,255,0.09)';   // light catching a block's top edge
const SHADOW = 'rgba(0,0,0,0.28)';      // under things standing on the ground
const VARIATION = 0.035;    // up to this much darker, per tile, so ground doesn't look like a grid
const FOOT = 0.6;           // where on a tile's depth standing things put their feet
const PILE_FILL = 0.95;     // how much of its square's width a big pile fills
const STAND_MARGIN = 3;     // columns past each side of the screen whose standing things are drawn
const TAU = Math.PI * 2;
const TILE_LOOK = Core.TILE_KEY.map((k, t) => Core.tileLook(t));
// Deposits whose rocks wear down as they're mined: drawn smaller the less is
// left in them, down to MINED_MIN of full size before they're worked out.
const WEARS = new Set([Core.T.STONE, Core.T.ORE, Core.T.CRYSTAL]);
const MINED_MIN = 0.5;
const SHAKE = 0.05;         // how far a struck rock or tree jolts, in tiles
const CROP_AHEAD = 0.18;    // how far in front of a forest's trees its mushrooms grow, in tile depths

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

// Every hole has a ladder in it. A pit shows it going down, a skylight shows
// it going up into the light, and a hole with another hole above it (part of
// a column straight up or down) shows both: light pouring down into the
// pit past the ladder, so a way on down never hides the way back up.

const LADDER_W = 0.24; // a ladder's width, in tiles

// The ladder from screen height `top` down to `bottom`, centred on cx.
function drawLadder(ctx, look, cx, top, bottom, u) {
  if (bottom - top < 2) return;
  look.draw(ctx, look.pick('mark.ladder', 'image'), cx - u * LADDER_W / 2, top, u * LADDER_W, bottom - top);
}

// A hole in the floor, with its ladder leaning on the far wall. Unless zoomed
// far out, you see down that wall, in the dark of the hole's colour.
function drawPit(ctx, look, sx, sy, u, d, rise) {
  look.draw(ctx, look.pick('mark.hole', 'top'), sx, sy, u + 1, d + 1);
  const wall = rise > FLAT_RISE_PX ? Math.min(d * 0.6, rise * 0.9) : 0;
  if (wall) {
    ctx.fillStyle = rgba(look.color('mark.hole'), 0.85);
    ctx.fillRect(sx + u * 0.2, sy + d * 0.2, u * 0.6, wall);
  }
  drawLadder(ctx, look, sx + u / 2, sy + d * 0.1, sy + d * 0.2 + Math.max(wall, d * 0.55), u);
}

// Light from the layer above pooling on the floor around (cx, cy).
function drawPool(ctx, light, cx, cy, u, g, alpha) {
  const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.8);
  pool.addColorStop(0, rgba(light, alpha));
  pool.addColorStop(1, rgba(light, 0));
  ctx.fillStyle = pool;
  ctx.fillRect(cx - u * 0.8, cy - u * 0.8 * g, u * 1.6, u * 1.6 * g);
}

// Where heights show, the shaft of light falling from the opening above down to cy.
function drawBeam(ctx, light, sx, cy, u, rise) {
  const beam = ctx.createLinearGradient(0, cy - rise, 0, cy);
  beam.addColorStop(0, rgba(light, 0.3));
  beam.addColorStop(1, rgba(light, 0.05));
  ctx.fillStyle = beam;
  ctx.fillRect(sx + u * 0.18, cy - rise, u * 0.64, rise);
}

// A hole in the ceiling: light from the layer above pooling on the floor, and
// the ladder standing in it, up to the opening where heights show. Under a shaft
// not yet opened, the ladder stands in the dark.
function drawSkylight(ctx, look, sx, sy, u, g, rise, strength = 1) {
  const light = look.color('mark.skylight');
  const cx = sx + u * 0.5, cy = sy + u * g * 0.5;
  const showsHeight = rise > FLAT_RISE_PX;
  if (strength > 0) {
    ctx.save();ctx.globalAlpha *= strength;
    drawPool(ctx, light, cx, cy, u, g, 0.45);
    if (showsHeight) drawBeam(ctx, light, sx, cy, u, rise);
    ctx.restore();
  }
  drawLadder(ctx, look, cx, showsHeight ? cy - rise : sy + u * g * 0.1, sy + u * g * 0.85, u);
}

// A hole with a hole above it: the pit, ringed with the light falling into
// it, a glow down its middle, and the ladder running on up into the beam.
function drawThroughShaft(ctx, look, sx, sy, u, d, rise, strength) {
  const light = look.color('mark.skylight'), g = d / u;
  const cx = sx + u * 0.5, cy = sy + d * 0.5;
  drawPool(ctx, light, cx, cy, u, g, 0.5 * strength);
  look.draw(ctx, look.pick('mark.hole', 'top'), sx, sy, u + 1, d + 1);
  drawPool(ctx, light, cx, cy, u * 0.4, g, 0.35 * strength);
  const showsHeight = rise > FLAT_RISE_PX;
  if (showsHeight && strength > 0) {ctx.save();ctx.globalAlpha *= strength;drawBeam(ctx, light, sx, cy, u, rise);ctx.restore();}
  drawLadder(ctx, look, cx, showsHeight ? cy - rise : sy + d * 0.02, sy + d * 0.85, u);
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

/* Underground, everything is rock until you dig it out, seen or not. So the
 * mine is drawn as one mass of rock with your tunnels cut down into it: rock
 * you haven't seen is a dark block (not a drop into nothing), rock you have
 * seen is a little darker than the floors you dug, and no cliffs fall away at
 * the edge of what you know. Digging carves a space out; nothing goes up. */
export const UNSEEN_DIM = 0.4;  // rock you haven't seen, against the colour of the unknown
export const ROCK_SHADE = 0.45; // how much darker the top of seen rock is than open floor

// How high tile (x, y) stands for drawing (and tapping): its height, or a
// full layer for rock in the mine you haven't seen yet.
export function groundHeight(w, x, y, z) {
  return z < Core.SURFACE && !Core.isExplored(w, x, y, z) ? 1 : Core.tileHeight(w, x, y, z);
}

// An unseen tile of the mine: a dark block of rock.
function drawUnseenRock(ctx, cam, look, s, x, y, z) {
  const w=s.world;
  const u = cam.tilePx, d = cam.depthPx;
  const showsHeight = cam.risePx > FLAT_RISE_PX;
  const projected=cam.project(x,y,z+(showsHeight?1:0));
  const p=faceRect(ctx,projected.x,projected.y,u+1,d+1);
  const rock = look.color('color.unknown');
  const front = showsHeight ? groundHeight(w, x, y + 1, z) : 1;
  if (front < 1) {
    ctx.fillStyle = shade(rock, tv(x, y, 8), UNSEEN_DIM * FACE_DIM);
    ctx.fillRect(p.x, p.y + d, u + 1, (1 - front) * cam.risePx + 1);
    shadeFace(ctx,cam,s,x,y,{x:p.x,y:p.y+d,width:u+1,height:(1-front)*cam.risePx+1});
  }
  ctx.fillStyle = shade(rock, tv(x, y, 7), UNSEEN_DIM);
  ctx.fillRect(p.x,p.y,p.width,p.height);
  shadeFace(ctx,cam,s,x,y,p);
}

// Where tile (x, y)'s top sits on screen, and its height.
function tileTop(cam, w, x, y, z) {
  // Flat (or nearly), height moves nothing on screen: skip looking it up.
  const h = cam.risePx > FLAT_RISE_PX ? Core.tileHeight(w, x, y, z) : 0;
  const p = cam.project(x, y, z + h);
  return { h, sx: p.x, sy: p.y };
}

// The ground of one tile: south face, top, and any hole or skylight.
function drawTile(ctx, cam, s, look, x, y, z) {
  const w = s.world, u = cam.tilePx, d = cam.depthPx, g = d / u;
  const under = z < Core.SURFACE;
  if (!Core.isExplored(w, x, y, z)) {
    // In the forest, clouds come over it later; in the mine, rock.
    if (under) drawUnseenRock(ctx, cam, look, s, x, y, z);
    return;
  }
  const t = Core.tileAt(w, x, y, z);
  const id = TILE_LOOK[t];
  const showsHeight = cam.risePx > FLAT_RISE_PX;
  const tile=tileTop(cam,w,x,y,z),h=tile.h;
  const topBounds=faceRect(ctx,tile.sx,tile.sy,u+1,d+1),{x:sx,y:sy}=topBounds;
  const color = look.color(id);

  // The south face, down to the top of the tile in front, lit along its rim.
  const front = showsHeight ? groundHeight(w, x, y + 1, z) : Math.min(h, 0);
  if (h > front) {
    const faceBounds=faceRect(ctx,sx,sy+d,u+1,(h-front)*cam.risePx+1),faceH=faceBounds.height-1;
    const face = look.pick(id, 'face', x, y, s.time);
    if (face) drawFace(ctx,look,face,faceBounds.x,faceBounds.y,u,faceH,cam.risePx);
    else {
      ctx.fillStyle = shade(color, tv(x, y, 8), FACE_DIM);
      ctx.fillRect(faceBounds.x,faceBounds.y,faceBounds.width,faceBounds.height);
    }
    ctx.fillStyle = RIM;
    ctx.fillRect(faceBounds.x,faceBounds.y,faceBounds.width,Math.min(faceH,Math.max(1,u*.035)));
    shadeFace(ctx,cam,s,x,y,faceBounds);
  }

  const top = pickFor(look, w, t, 'top', x, y, s.time);
  if (top) look.draw(ctx,top,sx,sy,topBounds.width,topBounds.height);
  else { ctx.fillStyle = color; ctx.fillRect(sx,sy,topBounds.width,topBounds.height); }
  ctx.fillStyle = `rgba(0,0,0,${(tv(x, y, 7) * VARIATION).toFixed(3)})`;
  ctx.fillRect(sx,sy,topBounds.width,topBounds.height);
  if (under && !Core.TILE_INFO[t].walk) {
    ctx.fillStyle = `rgba(0,0,0,${ROCK_SHADE})`;
    ctx.fillRect(sx,sy,topBounds.width,topBounds.height);
  }
  // A taller block behind casts a little shade on this top's far edge.
  if (showsHeight && groundHeight(w, x, y - 1, z) > h + 0.05) {
    const gap=groundHeight(w,x,y-1,z)-h;
    const length=Math.min(d*.08,gap*cam.risePx*.35);
    const contact=ctx.createLinearGradient(0,sy,0,sy+length);
    contact.addColorStop(0,'rgba(0,0,0,0.18)');contact.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=contact;ctx.fillRect(sx,sy,u+1,length);
  }
  const down = Core.holeBelow(w, x, y, z), up = Core.holeAbove(w, x, y, z);
  const incoming=up?lightBrightness(Core.illuminationAt(s,x,y,z+1).level):0;
  if (down && up) drawThroughShaft(ctx, look, sx, sy, u, d, cam.risePx, incoming);
  else if (down) drawPit(ctx, look, sx, sy, u, d, cam.risePx);
  else if (up) drawSkylight(ctx, look, sx, sy, u, g, cam.risePx, incoming);
  else if (Core.wayUp(w, x, y, z)) drawSkylight(ctx, look, sx, sy, u, g, cam.risePx, false);
  shadeFace(ctx,cam,s,x,y,topBounds);
}

// Include the whole upright picture, its ground shadow and an antialiasing
// margin. Test screen pixels before tint lookups, occlusion queries or drawing;
// a tile's foot can be off screen while its tall art still reaches into view.
export function sceneryVisible(cam, pic, fx, fy, size, shadow = 0) {
  const half = Math.max(pic.units * size / 2, shadow), pad = 2;
  return fx + half >= -pad && fx - half <= cam.width + pad &&
    fy + shadow * .38 * cam.depthPx / cam.tilePx >= -pad &&
    fy - Math.max(pic.units * size * pic.aspect, shadow * .38 * cam.depthPx / cam.tilePx) <= cam.height + pad;
}

// A stockpile pile standing in the middle of its square of tiles, as big as
// the square, growing in if it's new, sliding if it moves. `at` overrides
// where it stands and how big it is (a pile sliding into a merge).
function drawPile(ctx, cam, s, look, yard, p, at = yard.at(p, s.time), shade = true) {
  const u = cam.tilePx, d = cam.depthPx;
  const front = at.y + p.span - 1;
  const h = cam.risePx > FLAT_RISE_PX ? Core.tileHeight(s.world, Math.floor(at.x + p.span / 2), Math.round(front), Core.SURFACE) : 0;
  const foot = cam.project(at.x + p.span / 2, front + FOOT, Core.SURFACE + h);
  const pic = look.tier('pile.' + p.res, p.tier);
  // A small pile: the picture's own size. A big one: fitted to its square's width.
  const fit = p.span === 1 && p.tier < Core.SPAN_FROM ? 1 : (p.span * PILE_FILL) / pic.units;
  const size = u * fit * at.size;
  if (size < 1) return;
  const fx = foot.x, fy = foot.y;
  const r = Math.min(u * 0.48 * p.span, pic.units * size * 0.45);
  if (!sceneryVisible(cam,pic,fx,fy,size,shade?r:0)) return;
  if (shade) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.38 * (d / u), 0, 0, TAU); ctx.fill();
  }
  look.stand(ctx, pic, fx, fy, size);
}

// Piles sliding into a bigger one (ten becoming one), over the ground.
export function drawMerging(ctx, cam, s, look, yard) {
  for (const m of yard.merging(s.time)) spriteLight(ctx,cam,s,m.x+m.pile.span/2,m.y+m.pile.span-1+FOOT,c=>drawPile(c,cam,s,look,yard,m.pile,m));
}

// Whatever stands on tile (x, y): a stockpile pile, else its stand picture
// (worn smaller as a rock is mined, shaking when struck), or its cut picture
// once worked out. A forest's trees always stand, with its kind of mushroom
// in front of them while there is some left, smaller as it's foraged. Holes
// and built tiles have nothing else standing on them. Returns whether
// anything was drawn. `shade`: false leaves out the shadow under it.
export function drawStand(ctx, cam, s, look, ground, x, y, z, shade = true) {
  const w = s.world;
  if (!Core.isExplored(w, x, y, z)) return false;
  const key = Core.packKey(x, y, z);
  const pile = z === Core.SURFACE && ground.yard.piles.get(key);
  if (pile) {
    const at=ground.yard.at(pile,s.time),draw=c=>drawPile(c,cam,s,look,ground.yard,pile,at,shade);
    if(ground.clip)onGround(ctx,cam,s,at.x+pile.span/2,at.y+pile.span-1+FOOT,draw,{width:Math.max(2,pile.span),height:Math.max(4,pile.span*2),lit:'sprites'});else spriteLight(ctx,cam,s,at.x+pile.span/2,at.y+pile.span-1+FOOT,draw);
    return true;
  }
  if (z === Core.SURFACE && ground.yard.covered.has(key)) return false; // under a big pile
  if (Core.holeBelow(w, x, y, z) || ground.built.has(key)) return false;
  const t = Core.tileAt(w, x, y, z);
  const id = TILE_LOOK[t];
  const left = Core.richness(w, x, y, z);
  const slot = Core.LOOK[id].slots.cut !== undefined && left <= 0 ? 'cut' : 'stand';
  const pic = pickFor(look, w, t, slot, x, y, s.time);
  if (!pic) return false;
  const u = cam.tilePx, d = cam.depthPx;
  const { sx, sy } = tileTop(cam, w, x, y, z);
  const size = slot === 'stand' && WEARS.has(t) ? u * (MINED_MIN + (1 - MINED_MIN) * Math.min(1, left / Core.baseRichness(w, x, y, z))) : u;
  const fx = sx + u / 2 + ground.shake(key) * SHAKE * u, fy = sy + d * FOOT;
  const r = Math.min(u * 0.45, pic.units * size * 0.42);
  const crop = Core.TILE_INFO[t].forage && left > 0
    ? look.pick(Core.mushroomLook(Core.mushroomAt(w.seed, t, x, y, z)), 'image', x, y, s.time) : null;
  const grown = crop ? MINED_MIN + (1 - MINED_MIN) * Math.min(1, left / Core.baseRichness(w, x, y, z)) : 0;
  const cropX = fx + (tv(x, y, 23) - 0.5) * u * 0.4, cropY = fy + d * CROP_AHEAD;
  if (!sceneryVisible(cam,pic,fx,fy,size,shade?r:0) &&
      !(crop && sceneryVisible(cam,crop,cropX,cropY,u*grown))) return false;
  const draw=(ctx)=>{
  if (shade) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.38 * (d / u), 0, 0, TAU); ctx.fill();
  }
  look.stand(ctx, pic, fx, fy, size, tv(x, y, 17) < 0.5);
  if (crop) look.stand(ctx,crop,cropX,cropY,u*grown,tv(x,y,29)<0.5);
  return true;
  };
  return ground.clip?onGround(ctx,cam,s,x+.5,y+FOOT,draw,{width:Math.max(2,pic.units),height:Math.max(4,pic.units*pic.aspect),lit:'sprites'}):spriteLight(ctx,cam,s,x+.5,y+FOOT,draw);
}

// Rows y0..y1 of ground, north to south, with what stands on them (and on
// `side` columns past each side: trees lean and big piles are wide), calling
// onRow(y) after each row.
function drawRows(ctx, cam, s, look, ground, x0, y0, x1, y1, side, onRow) {
  const z = cam.z;
  // Finish all floor rows before any object can overhang their boundaries.
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) drawTile(ctx, cam, s, look, x, y, z);
  const objects={...ground,clip:true};
  for (let y = y0; y <= y1; y++) {
    for (let x = x0 - side; x <= x1 + side; x++) drawStand(ctx, cam, s, look, objects, x, y, z);
    if (onRow) onRow(y);
  }
}

// Draw a standing object against the already-painted terrain. Only genuinely
// higher foreground blocks occlude it. The query covers its local footprint,
// not the explored world; cost is bounded at every zoom. Successive clips
// subtract the union of overlapping blocks (one even-odd path would XOR them).
export function onGround(ctx,cam,s,x,y,draw,{width=2,height=4,lit=false}={}) {
  let clipped=false;
  if(cam.risePx>FLAT_RISE_PX){
    const z=cam.z,w=s.world,h=groundHeight(w,Math.floor(x),Math.floor(y),z);
    const p=cam.project(x,y,z+h),u=cam.tilePx,d=cam.depthPx;
    const left=p.x-width*u,right=p.x+width*u,top=p.y-height*u,bottom=p.y+u;
    const lift=(Core.RELIEF_MAX-Core.RELIEF_MIN)*cam.risePx/d;
    const last=Math.min(Math.ceil(y+1+lift),Math.ceil(y+(cam.height-p.y)/d+lift));
    const firstX=Math.max(Math.floor(x-width),Math.floor(x-p.x/u)-1);
    const lastX=Math.min(Math.ceil(x+width),Math.ceil(x+(cam.width-p.x)/u));
    for(let ty=Math.floor(y)+1;ty<=last;ty++)for(let tx=firstX;tx<=lastX;tx++){
      if(z===Core.SURFACE&&!Core.isExplored(w,tx,ty,z))continue;
      const higher=groundHeight(w,tx,ty,z);if(higher<=h+1e-6)continue;
      const a=cam.project(tx,ty,z+higher),front=groundHeight(w,tx,ty+1,z);
      const b=a.y+d+Math.max(0,higher-front)*cam.risePx+1;
      if(a.x>right||a.x+u+1<left||a.y>bottom||b<top)continue;
      if(!clipped){ctx.save();clipped=true;}
      ctx.beginPath();ctx.rect(0,0,cam.width,cam.height);
      ctx.rect(a.x,a.y,u+1,b-a.y);ctx.clip('evenodd');
    }
  }
  try{return lit==='sprites'?spriteLight(ctx,cam,s,x,y,draw):lit?lightObject(ctx,cam,s,x,y,draw,{width,height}):draw(ctx);}finally{if(clipped)ctx.restore();}
}

// A type of tile's colour in one flat swatch (the world map's), or null.
export function tileColor(look, type) {
  return look.color(TILE_LOOK[type]);
}

// The atlas owns distant map rendering. Keeping gameplay faces live avoids
// caching the light from an earlier lantern position or daylight phase.
export function drawTerrain(ctx, cam, s, look, ground, onRow) {
  const v=cam.visibleTiles();
  drawRows(ctx,cam,s,look,ground,v.x0,v.y0,v.x1,v.y1,STAND_MARGIN,onRow);
  const layer=ground.layer||((name,draw)=>draw());
  layer('fog',()=>drawFog(ctx,cam,s,look,v.x0,v.y0,v.x1,v.y1));
  return (v.y1-v.y0+1)*(v.x1-v.x0+1);
}
