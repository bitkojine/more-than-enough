/* Things standing on the terrain: buildings, the wanderer (and their boat),
 * and the transient effects, all drawn from the texture pack. Standing things
 * keep their full height while the ground is foreshortened; their shadows lie flat. */

import * as Core from '../../core/index.js';
import { rgba } from './palette.js';
import { pose } from './motion.js';

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

// A building standing on its tile, showing what waits in it to be collected
// (its stages: a garden's mushrooms, a mine's cart of ore), and a small dial
// over it that fills as it does (gold when full).
export function drawExtractor(ctx, cam, s, look, e) {
  const u = cam.tilePx;
  const ground = cam.project(e.x + 0.5, e.y + FOOT, groundAt(cam, s, e.x, e.y));
  if (ground.x < -u * 2 || ground.y < -u || ground.x > cam.width + u * 2 || ground.y > cam.height + u * 3) return;
  // Only output that waits for you: what Logistics hauls in as it's made
  // never shows (it would blink on and off many times a second), so a
  // hauled building looks empty.
  const p = Core.holdsOutput(s, e) ? Math.min(1, e.buffer / Core.extractorCapacity(s, e.key, e)) : 0;
  const pic = look.stage('building.' + e.key, p);
  shadow(ctx, cam, ground.x, ground.y, Math.min(u * 0.5, pic.units * u * 0.45));
  const h = look.stand(ctx, pic, ground.x, ground.y, u);
  // Permanent material plaque: automatic collection must not erase output identity.
  if(Core.usesDepots(s) && Core.EXTRACTORS[e.key].rate>0) {
    const size=Math.max(10,u*.25);
    const x=ground.x-size*.5,y=ground.y-h*.48-size*.5;
    ctx.fillStyle='#24312b';ctx.fillRect(x-2,y-2,size+4,size+4);
    look.draw(ctx,look.pick(Core.resourceLook(e.res),'icon'),x,y,size,size);
  }
  if (!p) return;
  const r = Math.max(4, u * 0.13);
  const cx = ground.x + pic.units * u * 0.32, cy = ground.y - h - r * 0.2;
  ctx.fillStyle = 'rgba(10,12,14,0.72)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = look.color(p >= 1 ? 'color.dialFull' : 'color.dial');
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + p * TAU); ctx.closePath(); ctx.fill();
}

// The wanderer: facing the way they last walked, stepping through the walk
// frames while moving and acting out what you do (see motion.js). On water
// they ride the boat. They always hold what you play on (a phone or a
// laptop), and its screen lights the dark. Returns where they are (see
// drawCharacter), for the sign they may hold up.
export function drawPlayer(ctx, cam, s, look, view) {
  const p = s.player;
  const { x: sx, y: sy } = cam.project(p.x, p.y, groundAt(cam, s, p.x, p.y));
  return drawCharacter(ctx, cam, s, look, {
    x: p.x, sx, sy, flip: view.facing.x < -0.01, moving: view.moving, water: Core.onWater(s),
    device: s.emptyStart ? null : view.device, actor: view.actor, steady: view.sign > 0, equipment: s.tools
  });
}

// Someone standing at (sx, sy) on screen, or on their boat on water: their
// picture posed for what they're doing (see motion.js), with what they hold
// and any tool in hand. `nod` tips them forward a little more (dozing).
// Returns where their head is ({x, top}) and their hands ({handsX, hands}).
function drawCharacter(ctx, cam, s, look, { x, sx, sy, flip, moving, water, device, actor, steady = false, seed = 0, nod = 0, equipment = null }) {
  const u = cam.tilePx;
  const walk = look.frames('character.wanderer', 'image');
  const frame = moving && walk.pics.length > 1 ? 1 + Math.floor(s.time * (walk.fps || 6)) % (walk.pics.length - 1) : 0;
  const body = walk.pics[frame];
  const p = pose(actor, { moving, boat: water, steady, time: s.time, seed, equipment });
  const deck = water ? drawBoat(ctx, cam, s, look, x, sx, sy, flip, p.rock) : 0;
  // Off the ground (a hop, a fall) their shadow stays down and shrinks.
  if (!deck) shadow(ctx, cam, sx, sy, body.units * u * 0.42 * Math.max(0.5, 1 + Math.min(0, p.dy) * 0.6));
  const dir = flip ? -1 : 1, feet = sy - deck;
  const fx = sx + p.dx * u * dir, fy = feet + p.dy * u, rot = (p.rot + nod) * dir;
  ctx.save();
  if (p.clip) { ctx.beginPath(); ctx.rect(sx - u * 2, feet - u * 4, u * 4, u * 4); ctx.clip(); }
  ctx.translate(fx, fy);
  ctx.rotate(rot);
  const facing = p.turn ? !flip : flip;
  const tall = standWithHeld(ctx, look, body, device, 0, 0, u, facing);
  if (p.tool && (!equipment || equipment[p.tool.kind] > 0)) drawTool(ctx, look, body, u, p.tool, facing ? -1 : 1);
  ctx.restore();
  const sin = Math.sin(rot), cos = Math.cos(rot);
  return { x: fx + sin * tall, top: fy - cos * tall, foot: fy, handsX: fx + sin * tall * HANDS, hands: fy - cos * tall * HANDS };
}

// The boat under someone on water, bobbing and rocking by `rock` radians,
// with its shadow. Returns how far above (sx, sy) its deck is, for them to
// stand or lie on.
function drawBoat(ctx, cam, s, look, x, sx, sy, flip, rock = 0) {
  const u = cam.tilePx;
  const bob = Math.sin(s.time * 2.6 + x * 7.3) * u * 0.04;
  const boat = look.pick('character.boat', 'image');
  shadow(ctx, cam, sx, sy, boat.units * u * 0.45);
  ctx.save();
  ctx.translate(sx, sy + bob);
  ctx.rotate(rock * (flip ? -1 : 1));
  const h = look.stand(ctx, boat, 0, 0, u, flip);
  ctx.restore();
  return h * BOAT_DECK - bob;
}

// A figure and what they hold (a phone or a laptop, or nothing for a friend
// on an older game), drawn over them at the same size and place so it lines
// up with their hand. Returns their height. Everyone (you and friends, awake,
// dozing or asleep) is drawn at this one size, `u` px per tile.
function standWithHeld(ctx, look, body, device, x, y, size, flip) {
  const tall = look.stand(ctx, body, x, y, size, flip);
  if (device) {
    const pic = look.pick('character.' + device, 'image');
    look.stand(ctx, pic, x, y, size * body.units / pic.units, flip);
  }
  return tall;
}

// Where the wanderer's front hand is on their picture, as a share of its
// width from the middle and of its height from the feet.
const HAND = { x: 0.35, y: 0.43 };

// A tool in their front hand (`dir` 1 facing right, -1 left), drawn from the
// tool's icon: the pickaxe held by the grip near its handle's end and
// turned by `angle` (0 points it up and forward), the basket hanging from
// the hand.
function drawTool(ctx, look, body, u, tool, dir) {
  const w = body.units * u, h = w * body.aspect;
  const pic = look.pick('tool.' + tool.kind, 'icon');
  ctx.save();
  ctx.translate(dir * w * HAND.x, -h * HAND.y);
  ctx.scale(dir, 1);
  ctx.rotate(tool.angle);
  if (tool.kind === 'basket') { const size = u * 0.42; look.draw(ctx, pic, -size / 2, -size * 0.15, size, size); }
  else { const size = u * 0.6; look.draw(ctx, pic, -size * 0.27, -size * 0.78, size, size); }
  ctx.restore();
}

/* ------------------------------------------------------------ friends */

const HANDS = 0.55;              // how far up a figure their hands are, of its height
const SIGN_COLOR = '#3f9bd6';   // the invite's friendly sky blue (style.css #btnInvite)
const ease = (t) => 1 - (1 - t) ** 3 + Math.sin(t * Math.PI) * 0.15; // up with a little bounce

// The sign you hold up to invite a friend: a board held in both hands in
// front of you (hands at `hands` px down the screen), `side` px across.
// Yours carries the real QR code (`face`, a canvas of its modules), big
// enough for a friend's camera to scan; a friend's shows a small QR-like
// pattern (`face` a number to vary it). `caption` is written along the
// board's bottom edge. `t` 0..1 raises it from your hands' height.
export function drawSign(ctx, x, hands, u, t, time, face, side = u * 0.62, caption = '') {
  const lift = ease(t);
  const rim = Math.max(u * 0.06, side * 0.05);
  const foot = caption ? Math.round(side * 0.13) : 0;   // room for the caption
  const bottom = hands + rim * 0.5 + (1 - lift) * side * 0.3 + Math.sin(time * 3) * u * 0.02;
  const left = x - side / 2, upper = bottom - rim - foot - side;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, t * 2);
  ctx.fillStyle = SIGN_COLOR;
  ctx.beginPath(); ctx.roundRect(left - rim, upper - rim, side + rim * 2, side + rim * 2 + foot, rim * 2); ctx.fill();
  if (caption) {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(foot * 0.62)}px system-ui, sans-serif`; // i18n-ok: a font
    ctx.fillText(caption, x, upper + side + rim * 0.4 + foot / 2, side);
  }
  // Both hands gripping its bottom edge.
  const hr = Math.max(3, u * 0.08), hx = Math.min(side * 0.3, u * 0.24);
  ctx.fillStyle = '#f2c9a0';
  ctx.strokeStyle = 'rgba(40,24,14,0.85)';
  ctx.lineWidth = Math.max(1.5, u * 0.03);
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * hx, bottom - rim * 0.2, hr, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#fff';
  ctx.fillRect(left, upper, side, side);
  if (typeof face === 'object' && face) {
    // The real code, square pixels and no blur, so cameras read it.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(face, left, upper, side, side);
  } else {
    // A QR-ish pattern: three finder squares and some dots.
    const seed = face || 0, cell = side / 9;
    ctx.fillStyle = '#111';
    const finder = (cx, cy) => {
      ctx.fillRect(left + cx * cell, upper + cy * cell, cell * 3, cell * 3);
      ctx.fillStyle = '#fff'; ctx.fillRect(left + (cx + 1) * cell, upper + (cy + 1) * cell, cell, cell); ctx.fillStyle = '#111';
    };
    finder(0.5, 0.5); finder(5.5, 0.5); finder(0.5, 5.5);
    for (let i = 0; i < 12; i++) {
      const cx = 4 + ((i * 7 + seed) % 5), cy = 4 + ((i * 3 + seed * 5) % 5);
      if ((i + seed) % 3) ctx.fillRect(left + cx * cell - cell / 2, upper + cy * cell - cell / 2, cell, cell);
    }
  }
  ctx.restore();
  // Where it stands on screen, to catch taps on it.
  return { x: left - rim, y: upper - rim, w: side + rim * 2, h: side + rim * 2 + foot };
}

// How big your own sign is on screen: as big as fits above you, so a friend's
// phone can scan it from a step away.
export function signSide(cam) {
  return Math.round(Math.min(cam.width * 0.62, cam.height * 0.36, 340));
}

// A friend, drawn like the wanderer (holding what they play on) with a ring
// of their colour at their feet, on a boat on
// water like you. How they're doing shows in how they look, always at full
// size: online as normal; away dozing on their feet, head nodding, with a
// little "z z"; connection lost flickering under a spinning signal; offline
// asleep where they left (see drawSleeper). Coming back sparkles. Returns
// where their name goes ({x, y}, see drawNameTag), or null when off screen.
export function drawFriend(ctx, cam, s, look, f, color) {
  const u = cam.tilePx;
  const { x: sx, y: sy } = cam.project(f.x, f.y, groundAt(cam, s, f.x, f.y));
  if (sx < -u * 2 || sy < -u * 3 || sx > cam.width + u * 2 || sy > cam.height + u * 2) return null;
  const flip = facesLeft(f);
  const water = Core.swimsAt(s.world, f.x, f.y, cam.z);
  if (f.st === 'offline') {
    const body = look.frames('character.wanderer', 'image').pics[0];
    const deck = water ? drawBoat(ctx, cam, s, look, f.x, sx, sy, flip) : 0;
    return drawSleeper(ctx, cam, s, look, body, f, color, sx, sy - deck, !deck);
  }
  const time = s.time;
  ctx.save();
  if (f.st === 'lost') ctx.globalAlpha = 0.35 + 0.3 * Math.abs(Math.sin(time * 5));
  // The ring at their feet.
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, u * 0.06);
  ctx.beginPath(); ctx.ellipse(sx, sy, u * 0.36, u * 0.36 * 0.38 * (cam.depthPx / cam.tilePx), 0, 0, TAU); ctx.stroke();
  // Away: dozing on their feet, leaning forward a little and nodding.
  const nod = f.st === 'away' ? 0.1 + 0.05 * Math.sin(time * 1.3) : 0;
  const { x: hx, top: head, handsX, hands } = drawCharacter(ctx, cam, s, look, {
    x: f.x, sx, sy, flip, moving: f.st === 'online' && f.m, water, device: f.dev, nod,
    equipment: f.gear === undefined ? null : { basket: f.gear & 1, pickaxe: f.gear & 2 },
    actor: f.st === 'online' ? f.actor : STILL, steady: f.sign, seed: f.c * 2.3 + 1
  });
  ctx.restore();
  const sign = f.sign && f.st === 'online' ? drawSign(ctx, handsX, hands, u, 1, time, f.c + 1) : null;
  const my = head - u * (sign ? 0.6 : 0.2);
  const r = Math.max(5, u * 0.12);
  // Away: little z's drifting up.
  if (f.st === 'away') drawSnore(ctx, 'z', hx + u * 0.25, my, 1, u, time, { speed: 0.6, size: 0.16, rise: 0.6, drift: 0.3, weight: 800 });
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
  // Their name over their sign, never on it.
  return { x: hx, y: sign ? Math.min(my, sign.y - 12) : my };
}

// An offline friend, asleep where they left like a sleeper in Rust: lying on
// the ground, tucked under a blanket in their colour that rises and falls,
// with slow big Z's floating up. Always solid, in the world and at full size,
// never a ghost, so everyone can see where a friend will wake up.
function drawSleeper(ctx, cam, s, look, body, f, color, sx, sy, onGround) {
  const u = cam.tilePx, time = s.time;
  const len = body.units * u * body.aspect;     // their height, now lying down
  const thick = body.units * u;
  const head = facesLeft(f) ? 1 : -1;           // which side their head lies
  const feet = sx - head * len / 2;
  const breath = 1 + 0.06 * Math.sin(time * 1.8);
  if (onGround) shadow(ctx, cam, sx, sy, len * 0.55);
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
  standWithHeld(ctx, look, body, f.dev, 0, 0, u, head > 0);
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
  // Big slow Z's over the pillow end, where their name goes.
  const mx = sx + head * len * 0.42, my = sy - thick * 0.75;
  const r = Math.max(4, u * 0.09);
  drawSnore(ctx, 'Z', mx + head * r, my - r * 2, head, u, time, { speed: 0.3, size: 0.22, rise: 0.9, drift: 0.45, weight: 900, outline: true });
  return { x: mx, y: my };
}

// A tombstone where a banned or frozen character last stood (Watch's rule:
// everyone knows where they were): a grey headstone on a mound, with a band
// in their colour; a frozen one (k 'ice') sits in a block of ice with a
// frosty glint. Returns where their name goes, or null when off screen.
export function drawGrave(ctx, cam, s, g) {
  const u = cam.tilePx;
  const { x: sx, y: sy } = cam.project(g.x, g.y, groundAt(cam, s, g.x, g.y));
  if (sx < -u * 2 || sy < -u * 3 || sx > cam.width + u * 2 || sy > cam.height + u * 2) return null;
  const w = u * 0.5, h = u * 0.7, top = sy - h;
  shadow(ctx, cam, sx, sy, u * 0.42);
  ctx.save();
  ctx.lineWidth = Math.max(1.5, u * 0.035);
  ctx.strokeStyle = 'rgba(10,8,6,0.8)';
  // The mound of earth.
  ctx.fillStyle = '#5b4a3a';
  ctx.beginPath(); ctx.ellipse(sx, sy - u * 0.02, u * 0.42, u * 0.12, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
  // The headstone, round at the top.
  ctx.fillStyle = '#9aa0a6';
  ctx.beginPath();
  ctx.moveTo(sx - w / 2, sy - u * 0.05);
  ctx.lineTo(sx - w / 2, top + w / 2);
  ctx.arc(sx, top + w / 2, w / 2, Math.PI, TAU);
  ctx.lineTo(sx + w / 2, sy - u * 0.05);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // A cross cut into it, and a band in their colour across it.
  ctx.strokeStyle = 'rgba(40,44,48,0.85)';
  ctx.beginPath();
  ctx.moveTo(sx, top + h * 0.16); ctx.lineTo(sx, top + h * 0.5);
  ctx.moveTo(sx - w * 0.2, top + h * 0.28); ctx.lineTo(sx + w * 0.2, top + h * 0.28);
  ctx.stroke();
  ctx.fillStyle = g.color;
  ctx.fillRect(sx - w / 2, top + h * 0.62, w, h * 0.12);
  if (g.k === 'ice') {
    // Frozen: a block of ice around it, catching the light now and then.
    ctx.fillStyle = 'rgba(170, 225, 255, 0.38)';
    ctx.strokeStyle = 'rgba(220, 245, 255, 0.85)';
    ctx.beginPath(); ctx.roundRect(sx - w * 0.78, top - u * 0.1, w * 1.56, h + u * 0.06, u * 0.06); ctx.fill(); ctx.stroke();
    const glint = 0.5 + 0.5 * Math.sin(s.time * 1.3 + g.x);
    ctx.strokeStyle = `rgba(255,255,255,${(0.35 + 0.5 * glint).toFixed(2)})`; // i18n-ok: a colour
    ctx.beginPath(); ctx.moveTo(sx - w * 0.6, top + u * 0.05); ctx.lineTo(sx - w * 0.3, top + u * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - w * 0.6, top + u * 0.05); ctx.lineTo(sx - w * 0.6, top + u * 0.3); ctx.stroke();
  }
  ctx.restore();
  return { x: sx, y: top - u * (g.k === 'ice' ? 0.32 : 0.22) };
}

// Someone doing nothing in particular (a friend away or out of touch).
const STILL = { act: null, t: 0, idle: 0 };

// Whether a friend faces left (their sprite is mirrored).
const facesLeft = (f) => f.fx < -0.01;

// A player's name over their head: a tag in their colour, the same size at
// every zoom, drawn over the night so it always reads. (x, y) is its centre.
// `taken`: boxes of the tags already drawn; one that would cover any of
// them isn't drawn (returns false), so a crowd's names stay readable.
export function drawNameTag(ctx, x, y, name, color, taken = null) {
  ctx.save();
  ctx.font = '800 12px system-ui, sans-serif'; // i18n-ok: a font
  const w = Math.ceil(ctx.measureText(name).width) + 14;
  if (taken) {
    const box = { l: x - w / 2 - 2, r: x + w / 2 + 2, t: y - 11, b: y + 11 };
    if (taken.some((o) => o.l < box.r && box.l < o.r && o.t < box.b && box.t < o.b)) { ctx.restore(); return false; }
    taken.push(box);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(10,8,6,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 9, w, 18, 9); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0c0a08';
  ctx.fillText(name, x, y + 0.5);
  ctx.restore();
  return true;
}

// AUTO's tag over your head while it plays: gold, with a star that slowly
// turns, the same size at every zoom. (x, y) is its centre.
export function drawAutoTag(ctx, x, y, label, time, taken = null) {
  ctx.save();
  ctx.font = '800 12px system-ui, sans-serif'; // i18n-ok: a font
  const w = Math.ceil(ctx.measureText(label).width) + 30;
  if (taken) taken.push({ l: x - w / 2 - 2, r: x + w / 2 + 2, t: y - 11, b: y + 11 });
  ctx.shadowColor = 'rgba(255,209,102,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#33280f';
  ctx.strokeStyle = '#ffe39a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 10); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // the star
  const sx = x - w / 2 + 11, r = 5.5, a0 = time * 1.5 - Math.PI / 2;
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = a0 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(sx + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fbeec4';
  ctx.fillText(label, x + 8, y + 0.5);
  ctx.restore();
}

// Three letters drifting up and away from (x, y), fading in and out: a doze
// (small z's) or deep sleep (big Z's). `dir` is which way they drift.
function drawSnore(ctx, letter, x, y, dir, u, time, { speed, size, rise, drift, weight, outline = false }) {
  ctx.save();
  ctx.fillStyle = '#dfe9ff';
  ctx.strokeStyle = 'rgba(10,8,6,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const k = (time * speed + i / 3) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.font = `${weight} ${Math.round(u * size * (1 + k))}px system-ui, sans-serif`; // i18n-ok: a font
    const lx = x + dir * k * u * drift, ly = y - k * u * rise;
    if (outline) ctx.strokeText(letter, lx, ly);
    ctx.fillText(letter, lx, ly);
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

// Gathered items floating home to the stockpile, as their resource's icon.
export function drawFlyers(ctx, cam, look, fx) {
  const size = Math.max(12, cam.tilePx * 0.36);
  for (const f of fx.flyers) {
    const { x, y } = cam.project(f.x, f.y);
    if (x < -size || y < -size || x > cam.width + size || y > cam.height + size) continue;
    ctx.globalAlpha = Math.min(1, 0.3 + f.t * 1.5);
    look.draw(ctx, look.pick(Core.resourceLook(f.res), 'icon'), x - size / 2, y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}
