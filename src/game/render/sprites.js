/* Things standing on the terrain: buildings, the wanderer (and their boat),
 * and the transient effects, all drawn from the texture pack. Standing things
 * keep their height as the view tilts; their shadows flatten. */

import * as Core from '../../core/index.js';

const TAU = Math.PI * 2;

// Height of the ground under (x, y) in the camera's layer, as absolute height.
const groundAt = (cam, s, x, y) => cam.z + Core.tileHeight(s.world, Math.floor(x), Math.floor(y), cam.z);

const FOOT = 0.6;           // where on a tile's depth standing things put their feet
const SHADOW = 'rgba(0,0,0,0.38)';
const BOAT_DECK = 0.3;      // how far up the boat picture the wanderer stands (see the catalog)
const IN_BOAT = 0.8;        // the wanderer's size in the boat

function shadow(ctx, cam, x, y, r) {
  ctx.fillStyle = SHADOW;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.38 * (cam.depthPx / cam.tilePx), 0, 0, TAU); ctx.fill();
}

// A building: its picture standing on its tile, and a small dial over it
// that fills as it holds output (gold when full).
export function drawExtractor(ctx, cam, s, look, e) {
  const u = cam.tilePx;
  const ground = cam.project(e.x + 0.5, e.y + FOOT, groundAt(cam, s, e.x, e.y));
  if (ground.x < -u * 2 || ground.y < -u || ground.x > cam.width + u * 2 || ground.y > cam.height + u * 3) return;
  const pic = look.pick('building.' + e.key, 'image');
  shadow(ctx, cam, ground.x, ground.y, Math.min(u * 0.5, pic.units * u * 0.45));
  const h = look.stand(ctx, pic, ground.x, ground.y, u);
  const def = Core.EXTRACTORS[e.key];
  if (e.buffer < 0.5) return;
  const p = Math.min(1, e.buffer / def.buffer);
  const r = Math.max(4, u * 0.13);
  const cx = ground.x + pic.units * u * 0.32, cy = ground.y - h - r * 0.2;
  ctx.fillStyle = 'rgba(10,12,14,0.72)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = p >= 1 ? '#ffd166' : '#7fd07a';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + p * TAU); ctx.closePath(); ctx.fill();
}

// The wanderer: facing the way they last walked, stepping through the walk
// frames while moving. On water they ride the boat.
export function drawPlayer(ctx, cam, s, look, view) {
  const u = cam.tilePx;
  const p = s.player;
  const { x: sx, y: sy } = cam.project(p.x, p.y, groundAt(cam, s, p.x, p.y));
  const flip = view.facing.x < -0.01;
  const walk = look.frames('character.wanderer', 'image');
  const frame = view.moving && walk.pics.length > 1 ? 1 + Math.floor(s.time * (walk.fps || 6)) % (walk.pics.length - 1) : 0;
  const body = walk.pics[frame];
  if (Core.onWater(s)) {
    const bob = Math.sin(s.time * 2.6 + p.x * 7.3) * u * 0.04;
    const boat = look.pick('character.boat', 'image');
    shadow(ctx, cam, sx, sy, boat.units * u * 0.45);
    const bh = look.stand(ctx, boat, sx, sy + bob, u, flip);
    look.stand(ctx, body, sx, sy + bob - bh * BOAT_DECK, u * IN_BOAT, flip);
    return;
  }
  shadow(ctx, cam, sx, sy, body.units * u * 0.42);
  const step = view.moving ? Math.abs(Math.sin(s.time * 12)) * u * 0.03 : 0;
  look.stand(ctx, body, sx, sy - step, u, flip);
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

// Floating numbers, with the icon of what they count after them.
export function drawFloats(ctx, cam, look, fx) {
  const size = Math.round(Math.max(12, cam.tilePx * 0.34));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '700 ' + size + 'px -apple-system, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  for (const f of fx.floats) {
    const { x, y } = cam.project(f.x, f.y);
    const tw = ctx.measureText(f.text).width;
    const iw = f.icon ? size * 1.15 : 0;
    const left = x - (tw + iw) / 2;
    ctx.globalAlpha = Math.min(1, (f.life / f.max) * 1.6);
    ctx.strokeText(f.text, left, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, left, y);
    if (f.icon) look.draw(ctx, look.pick(f.icon, 'icon'), left + tw + size * 0.15, y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

// Gathered items zipping into the pack, as their resource's icon.
export function drawFlyers(ctx, cam, look, fx) {
  const size = Math.max(10, cam.tilePx * 0.3);
  for (const f of fx.flyers) {
    const { x, y } = cam.project(f.x, f.y);
    ctx.globalAlpha = Math.min(1, 0.3 + f.t * 2.5);
    look.draw(ctx, look.pick(Core.resourceLook(f.res), 'icon'), x - size / 2, y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}
