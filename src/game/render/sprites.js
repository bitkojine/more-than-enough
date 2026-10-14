/* Things standing on the terrain: buildings, the wanderer (and their boat),
 * and the transient effects, all drawn from the texture pack. Standing things
 * keep their full height while the ground is foreshortened; their shadows lie flat. */

import * as Core from '../../core/index.js';
import { rgba } from './palette.js';

const TAU = Math.PI * 2;

// Height of the ground under (x, y) in the camera's layer, as absolute height.
const groundAt = (cam, s, x, y) => cam.z + Core.tileHeight(s.world, Math.floor(x), Math.floor(y), cam.z);

const FOOT = 0.6;           // where on a tile's depth standing things put their feet
const SHADOW = 'rgba(0,0,0,0.38)';
const FLOAT_FADE = 0.6;     // seconds a floating label takes to fade out
// The wanderer stands on the boat's deck at full size, so the boat (its hull
// and mast) is drawn to the same scale as them.
const BOAT_DECK = Core.BOAT_DECK;

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
  // Only output that waits for you: what Logistics hauls in as it's made
  // never shows (a dial for it would blink on and off many times a second).
  if (!Core.holdsOutput(s, e)) return;
  const p = Math.min(1, e.buffer / def.buffer);
  const r = Math.max(4, u * 0.13);
  const cx = ground.x + pic.units * u * 0.32, cy = ground.y - h - r * 0.2;
  ctx.fillStyle = 'rgba(10,12,14,0.72)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = look.color(p >= 1 ? 'color.dialFull' : 'color.dial');
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
  // The lantern only comes out when it's needed: at night and underground.
  const lantern = Core.needsLantern(s) ? look.pick('character.lantern', 'image') : null;
  const figure = (fy, size) => {
    look.stand(ctx, body, sx, fy, size, flip);
    if (lantern) look.stand(ctx, lantern, sx, fy, size * body.units / lantern.units, flip);
  };
  if (Core.onWater(s)) {
    const bob = Math.sin(s.time * 2.6 + p.x * 7.3) * u * 0.04;
    const boat = look.pick('character.boat', 'image');
    shadow(ctx, cam, sx, sy, boat.units * u * 0.45);
    const bh = look.stand(ctx, boat, sx, sy + bob, u, flip);
    figure(sy + bob - bh * BOAT_DECK, u);
    return;
  }
  shadow(ctx, cam, sx, sy, body.units * u * 0.42);
  const step = view.moving ? Math.abs(Math.sin(s.time * 12)) * u * 0.03 : 0;
  figure(sy - step, u);
  if (view.sign > 0) drawSign(ctx, sx, sy - step - body.units * u * body.aspect, u, view.sign, s.time, 0);
}

/* ------------------------------------------------------------ friends */

const ease = (t) => 1 - (1 - t) ** 3 + Math.sin(t * Math.PI) * 0.15; // up with a little bounce

// The sign you hold up to invite a friend: a mushroom-cap board on a stalk,
// with a tiny QR on it (the real one fills the screen). `t` 0..1 raises it.
export function drawSign(ctx, x, top, u, t, time, seed) {
  const lift = ease(t);
  const w = u * 0.62, h = u * 0.62;
  const bx = x + u * 0.18, by = top - u * 0.15 - lift * u * 0.55 + Math.sin(time * 3) * u * 0.02;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, t * 2);
  ctx.strokeStyle = '#e8dcc0';
  ctx.lineWidth = Math.max(2, u * 0.06);
  ctx.beginPath(); ctx.moveTo(bx, by + h / 2); ctx.lineTo(bx, top + u * 0.25); ctx.stroke();
  ctx.fillStyle = '#c0583a';
  ctx.beginPath(); ctx.roundRect(bx - w / 2 - u * 0.06, by - h / 2 - u * 0.06, w + u * 0.12, h + u * 0.12, u * 0.12); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx - w / 2, by - h / 2, w, h);
  // A QR-ish pattern: three finder squares and some dots.
  const cell = w / 9;
  ctx.fillStyle = '#111';
  const finder = (cx, cy) => {
    ctx.fillRect(bx - w / 2 + cx * cell, by - h / 2 + cy * cell, cell * 3, cell * 3);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx - w / 2 + (cx + 1) * cell, by - h / 2 + (cy + 1) * cell, cell, cell); ctx.fillStyle = '#111';
  };
  finder(0.5, 0.5); finder(5.5, 0.5); finder(0.5, 5.5);
  for (let i = 0; i < 12; i++) {
    const cx = 4 + ((i * 7 + seed) % 5), cy = 4 + ((i * 3 + seed * 5) % 5);
    if ((i + seed) % 3) ctx.fillRect(bx - w / 2 + cx * cell - cell / 2, by - h / 2 + cy * cell - cell / 2, cell, cell);
  }
  ctx.restore();
}

// A friend, drawn like the wanderer with a ring of their colour at their feet
// and a marker over their head. How they're doing shows in how they look:
// online as normal; away sitting with a little "z z"; connection lost
// flickering under a spinning signal; offline asleep on the ground where they
// left (see drawSleeper). Coming back sparkles.
export function drawFriend(ctx, cam, s, look, f, color) {
  const u = cam.tilePx;
  const { x: sx, y: sy } = cam.project(f.x, f.y, groundAt(cam, s, f.x, f.y));
  if (sx < -u * 2 || sy < -u * 3 || sx > cam.width + u * 2 || sy > cam.height + u * 2) return;
  const walk = look.frames('character.wanderer', 'image');
  if (f.st === 'offline') { drawSleeper(ctx, cam, s, look, walk.pics[0], f, color, sx, sy); return; }
  const moving = f.st === 'online' && f.m;
  const frame = moving && walk.pics.length > 1 ? 1 + Math.floor(s.time * (walk.fps || 6)) % (walk.pics.length - 1) : 0;
  const body = walk.pics[frame];
  const flip = f.fx < -0.01;
  const time = s.time;
  ctx.save();
  let squash = 1;
  if (f.st === 'away') { squash = 0.78; }
  if (f.st === 'lost') ctx.globalAlpha = 0.35 + 0.3 * Math.abs(Math.sin(time * 5));
  // The ring at their feet.
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, u * 0.06);
  ctx.beginPath(); ctx.ellipse(sx, sy, u * 0.36, u * 0.36 * 0.38 * (cam.depthPx / cam.tilePx), 0, 0, TAU); ctx.stroke();
  shadow(ctx, cam, sx, sy, body.units * u * 0.42);
  const step = moving ? Math.abs(Math.sin(time * 12)) * u * 0.03 : 0;
  const size = u * squash;
  const tall = look.stand(ctx, body, sx, sy - step, size, flip);
  const head = sy - step - tall;
  ctx.restore();
  if (f.sign && f.st === 'online') drawSign(ctx, sx, head, u, 1, time, f.c + 1);
  // Their marker: a diamond in their colour.
  const my = head - u * (f.sign && f.st === 'online' ? 1.25 : 0.2);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(10,8,6,0.8)';
  ctx.lineWidth = 2;
  const r = Math.max(5, u * 0.12);
  ctx.beginPath(); ctx.moveTo(sx, my - r); ctx.lineTo(sx + r * 0.75, my); ctx.lineTo(sx, my + r); ctx.lineTo(sx - r * 0.75, my); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  if (f.st === 'away') {
    // Little z's drifting up.
    ctx.save();
    ctx.fillStyle = '#dfe9ff';
    for (let i = 0; i < 3; i++) {
      const k = (time * 0.6 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.font = `800 ${Math.round(u * (0.16 + k * 0.14))}px system-ui, sans-serif`; // i18n-ok: a font
      ctx.fillText('z', sx + u * 0.25 + k * u * 0.3, my - k * u * 0.6); // i18n-ok: a sleeping sound, not a word
    }
    ctx.restore();
  }
  if (f.st === 'lost') {
    // A spinning arc: still trying to reach them.
    ctx.save();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = Math.max(2, u * 0.05);
    const a = time * 6;
    ctx.beginPath(); ctx.arc(sx, my - r * 2.4, r * 1.1, a, a + Math.PI * 1.3); ctx.stroke();
    ctx.restore();
  }
  if (f.st === 'online' && f.since < 1.2) {
    // Back: a burst of sparkles.
    ctx.save();
    ctx.fillStyle = color;
    const k = f.since / 1.2;
    ctx.globalAlpha = 1 - k;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, d = u * (0.3 + k * 0.8);
      ctx.beginPath(); ctx.arc(sx + Math.cos(a) * d, sy - u * 0.5 + Math.sin(a) * d * 0.7, Math.max(2, u * 0.05), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

// An offline friend, asleep where they left like a sleeper in Rust: lying on
// the ground, tucked under a blanket in their colour that rises and falls,
// with slow big Z's floating up. Always solid and in the world, never a ghost,
// so everyone can see where a friend will wake up.
function drawSleeper(ctx, cam, s, look, body, f, color, sx, sy) {
  const u = cam.tilePx, time = s.time;
  const scale = 0.85;
  const len = body.units * u * body.aspect * scale; // their height, now lying down
  const thick = body.units * u;
  const head = f.fx < -0.01 ? 1 : -1;            // which side their head lies
  const feet = sx - head * len / 2;
  const breath = 1 + 0.06 * Math.sin(time * 1.8);
  shadow(ctx, cam, sx, sy, len * 0.55);
  // A bedroll under them, in their colour.
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.ellipse(sx, sy - thick * 0.12, len * 0.62, thick * 0.32, 0, 0, TAU); ctx.fill();
  ctx.restore();
  // The body on its side: feet at one end, head at the other.
  ctx.save();
  ctx.translate(feet, sy - thick * 0.22);
  ctx.rotate(head * Math.PI / 2);
  look.stand(ctx, body, 0, 0, u * scale, head > 0);
  ctx.restore();
  // The blanket over their legs, breathing; the head stays out on the pillow.
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(10,8,6,0.7)';
  ctx.lineWidth = Math.max(1.5, u * 0.03);
  const bx = feet + head * len * 0.3, bw = len * 0.32, by = sy - thick * 0.12;
  ctx.beginPath(); ctx.ellipse(bx, by, bw, thick * 0.3 * breath, 0, Math.PI, TAU); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  // Their marker, small, over the pillow end.
  const mx = sx + head * len * 0.42, my = sy - thick * 0.75;
  const r = Math.max(4, u * 0.09);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(10,8,6,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(mx, my - r); ctx.lineTo(mx + r * 0.75, my); ctx.lineTo(mx, my + r); ctx.lineTo(mx - r * 0.75, my); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Big slow Z's.
  ctx.fillStyle = '#dfe9ff';
  ctx.strokeStyle = 'rgba(10,8,6,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const k = (time * 0.3 + i / 3) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.font = `900 ${Math.round(u * (0.22 + k * 0.22))}px system-ui, sans-serif`; // i18n-ok: a font
    const zx = mx + head * (r + k * u * 0.45), zy = my - r - k * u * 0.9;
    ctx.strokeText('Z', zx, zy); // i18n-ok: a snore, not a word
    ctx.fillText('Z', zx, zy); // i18n-ok: a snore, not a word
  }
  ctx.restore();
}

// A prop (glowcap, lamp, flag) standing in a tunnel.
export function drawProp(ctx, cam, s, look, kind, x, y) {
  const u = cam.tilePx;
  const at = cam.project(x + 0.5, y + FOOT, groundAt(cam, s, x, y));
  look.stand(ctx, look.pick('mark.' + kind, 'image', x, y, s.time), at.x, at.y, u);
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
  const font = (px) => '700 ' + px + 'px -apple-system, sans-serif';  // i18n-ok: a font
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
    if (f.icon) look.draw(ctx, look.pick(f.icon, 'icon'), left + tw + px * 0.15, y - px / 2, px, px);
    if (px !== size) ctx.font = font(size);
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
