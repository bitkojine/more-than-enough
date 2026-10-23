/* Everything drawn over the world: target highlights, the Trail stroke, day
 * and night lighting, finds glinting and beacons showing through the dark,
 * and the joystick. */

import * as Core from '../../core/index.js';
import { chalkPath, chalkLine, chalkBox, chalkEllipse } from './chalk.js';
import { rgba } from './palette.js';
import { distance, number } from '../../i18n/i18n.js';

const TAU = Math.PI * 2;

// A rounded-rectangle path (the caller fills or strokes it).
function roundRect(ctx, x, y, w, h, r) {
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

// The rectangle of a tile's top on screen, inset by `inset` px.
function topRect(cam, s, tx, ty, inset) {
  const h = cam.z + Core.tileHeight(s.world, tx, ty, cam.z);
  const p = cam.project(tx, ty, h);
  const g = cam.depthPx / cam.tilePx;
  return { x: p.x + inset, y: p.y + inset * g, w: cam.tilePx - inset * 2, h: cam.depthPx - inset * 2 * g };
}

// Outline one tile's top. The inset is clamped so a sub-pixel tile when
// zoomed far out can't produce a negative size.
function outlineTile(ctx, cam, s, tx, ty, color) {
  const r = topRect(cam, s, tx, ty, Math.min(2, cam.tilePx * 0.2));
  if (r.w <= 0 || r.h <= 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, cam.tilePx * 0.05);
  roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(6, r.h / 2));
  ctx.stroke();
}

// Target outlines for the tiles in row y (drawn with that row, so blocks in
// front still cover them).
export function drawHighlights(ctx, cam, s, view, y) {
  const t = view.harvestTarget;
  if (t && t.y === y) outlineTile(ctx, cam, s, t.x, t.y, 'rgba(200,255,180,0.5)');
  for (const b of view.buildTargets) if (b.y === y) chalkBox(ctx, topRect(cam,s,b.x,b.y,Math.min(2,cam.tilePx*0.2)), true);
}

// White chalk service links; fog is checked at both ends. Shown while
// building, including the local placement preview, rather than all the time.
export function drawSupports(ctx, cam, s, view) {
  const seen = e => e.z === cam.z && Core.isExplored(s.world, e.x, e.y, e.z);
  const link = (from, to, preview) => {
    if (!seen(from) || !seen(to)) return;
    const a = cam.project(from.x+.5, from.y+.5, from.z), b = cam.project(to.x+.5, to.y+.5, to.z);
    if (Math.max(a.x,b.x) < 0 || Math.min(a.x,b.x) > cam.width || Math.max(a.y,b.y) < 0 || Math.min(a.y,b.y) > cam.height) return;
    chalkLine(ctx,a,b,preview);
    chalkBox(ctx,topRect(cam,s,to.x,to.y,Math.min(2,cam.tilePx*0.2)),preview);
  };
  ctx.save();
  for (const e of s.extractors) {
    if (e.key !== 'quarry' || !seen(e)) continue;
    const support = Core.supportingBuilding(s,e);
    if (support && (view.showSupports || Core.tileDist2(s.player,support.x,support.y,support.z)<=36)) link(support,e,false);
  }
  const at = view.showSupports && Core.buildTarget(s,'stoneworks');
  if (at) {
    const preview = { ...at, key: 'stoneworks', z: s.player.z, owner: s.me || undefined };
    for (const q of Core.supportTargets(s,preview)) if (!Core.supportingBuilding(s,q)) link(preview,q,true);
    chalkBox(ctx,topRect(cam,s,at.x,at.y,Math.min(2,cam.tilePx*0.2)),true);
  }
  ctx.restore();
}

// The live Trail: white chalk, dashed with no eligible tiles. Green/amber
// tile fills retain the surface/underground harvest feedback.
export function drawTrail(ctx, cam, s, view) {
  const trail = view.trail;
  if (!trail || !trail.points.length) return;
  const hits = view.trailTargets.length > 0;
  const dig = view.underground;
  const u = cam.tilePx;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = new Path2D();
  const at = (pt) => cam.project(pt.x, pt.y, cam.z + (pt.h || 0));
  trail.points.forEach((pt, i) => {
    const p = at(pt);
    if (i === 0) path.moveTo(p.x,p.y); else path.lineTo(p.x,p.y);
  });
  chalkPath(ctx,path,{preview:!hits,width:Math.max(4,Math.min(9,u*0.14))});
  const end = at(trail.points[trail.points.length - 1]);
  ctx.fillStyle = '#f5f2e9';
  ctx.beginPath();
  ctx.arc(end.x, end.y, Math.max(7, u * 0.17), 0, TAU);
  ctx.fill();
  for (const t of view.trailTargets) {
    const r = topRect(cam, s, t.x, t.y, 2);
    ctx.fillStyle = dig ? 'rgba(255,205,125,0.25)' : 'rgba(149,255,104,0.25)';
    roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(9, u * 0.2));
    ctx.fill();
    outlineTile(ctx, cam, s, t.x, t.y, dig ? 'rgba(255,215,140,1)' : 'rgba(190,255,130,1)');
  }
  ctx.restore();
}

/* Light and dark. Underground it is always dark; on the surface it gets dark
 * at night. What lights the dark: the screen of the wanderer's phone or laptop,
 * glowcaps and lamps you placed, and daylight falling through holes in the
 * ceiling. The dark is drawn as one mask at low resolution with every light
 * cut out of it, then each light adds a warm tint of its own colour.
 *
 * Down in the mine the screen is only a small pool at your feet: the rock you
 * have uncovered a few steps away sinks back into the dark, and it takes a
 * glowcap to keep a stretch of tunnel lit. */
const SCREEN_LIGHT = 3.0;       // how far your screen lights the night forest, in tiles
const MINE_SCREEN_LIGHT = 1.7;  // how far it lights in the mine
const SKYLIGHT_LIGHT = 2.0;     // how far light falling through a hole spreads
const UNDERGROUND_DARK = 0.95;  // how dark the mine is away from any light
const NIGHT_DARK = 0.9;         // how dark the forest gets at midnight
const MASK_SCALE = 0.25;        // the dark mask's resolution against the screen
const TINT = 0.12;              // how warm a light's pool is

let mask = null;

/**
 * @param {Array<{x: number, y: number, r: number, color: string, strength?: number}>} lights
 *   lights on this layer besides your screen and skylights (glowcaps, lamps), in tiles.
 *   `core` (0..1, default 0.5) is how much of the radius is lit fully before
 *   the light fades out.
 */
export function drawLighting(ctx, cam, s, look, lights, device) {
  const { width: W, height: H } = cam;
  const dl = Core.daylight(s.time);
  const under = cam.z < Core.SURFACE;
  if (!under) {
    // By day a gentle warm lift.
    const glow = Math.max(0, (dl - 0.25) / 0.75) * 0.16;
    if (glow > 0.001) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,236,205,${glow.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  const dark = under ? (s.cultivation&&!s.cultivation.lantern?0.58:UNDERGROUND_DARK) : Math.max(0, (0.6 - dl) / 0.6) * NIGHT_DARK;
  if (dark < 0.01) return;

  const all = lights.slice();
  if (Core.isDark(s)&&(!s.cultivation||s.cultivation.lantern)) {
    // Kept usable when zoomed far out, where tiles are tiny.
    all.push({
      x: s.player.x, y: s.player.y, r: (under ? MINE_SCREEN_LIGHT : SCREEN_LIGHT) * Core.lightScale(s),
      color: look.color('character.' + device), min: Math.min(W, H) * (under ? 0.12 : 0.28) * Core.lightScale(s), core: under ? 0.3 : 0.5
    });
  }
  if (under) {
    const sky = look.color('mark.skylight');
    const strength = cam.z + 1 === Core.SURFACE ? 0.35 + 0.65 * dl : 0.4;
    const v = cam.visibleTiles();
    for (const t of Core.waysIn(s.world, cam.z, v.x0, v.y0, v.x1, v.y1)) {
      if (Core.holeAbove(s.world, t.x, t.y, cam.z)) all.push({ x: t.x + 0.5, y: t.y + 0.5, r: SKYLIGHT_LIGHT, color: sky, strength });
    }
  }

  const mw = Math.max(1, Math.ceil(W * MASK_SCALE)), mh = Math.max(1, Math.ceil(H * MASK_SCALE));
  if (!mask) mask = document.createElement('canvas');
  if (mask.width !== mw || mask.height !== mh) { mask.width = mw; mask.height = mh; }
  const m = mask.getContext('2d');
  m.globalCompositeOperation = 'source-over';
  m.clearRect(0, 0, mw, mh);
  m.fillStyle = `rgba(4,8,16,${dark.toFixed(3)})`;
  m.fillRect(0, 0, mw, mh);
  m.globalCompositeOperation = 'destination-out';
  const pools = [];
  for (const l of all) {
    const p = cam.project(l.x, l.y);
    const r = Math.max(l.r * cam.tilePx, l.min || 0);
    if (p.x < -r || p.y < -r || p.x > W + r || p.y > H + r) continue;
    pools.push({ ...l, sx: p.x, sy: p.y, pr: r });
    const cx = p.x * MASK_SCALE, cy = p.y * MASK_SCALE, mr = r * MASK_SCALE;
    const a = l.strength === undefined ? 1 : l.strength;
    const g = m.createRadialGradient(cx, cy, 0, cx, cy, mr);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(l.core === undefined ? 0.5 : l.core, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = g;
    m.fillRect(cx - mr, cy - mr, mr * 2, mr * 2);
  }
  m.globalCompositeOperation = 'source-over';
  ctx.drawImage(mask, 0, 0, W, H);

  // Warm pools, so light reads as light, not just a gap in the dark.
  ctx.globalCompositeOperation = 'lighter';
  for (const l of pools) {
    const g = ctx.createRadialGradient(l.sx, l.sy, 0, l.sx, l.sy, l.pr);
    g.addColorStop(0, rgba(l.color, (TINT * dark).toFixed(3)));
    g.addColorStop(1, rgba(l.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(l.sx - l.pr, l.sy - l.pr, l.pr * 2, l.pr * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* Finds glinting in the dark: a twinkle over each find still in the rock
 * within range, drawn over the dark (and over ground you haven't uncovered)
 * so there's always something close to dig toward. Fainter further off. */
const GLINT_SIZE = 0.2;   // the twinkle's arm, in tiles

// A four-pointed twinkle of arm r at (x, y).
function star(ctx, x, y, r, color) {
  const k = r * 0.22;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + k, y - k); ctx.lineTo(x + r, y); ctx.lineTo(x + k, y + k);
  ctx.lineTo(x, y + r); ctx.lineTo(x - k, y + k); ctx.lineTo(x - r, y); ctx.lineTo(x - k, y - k);
  ctx.closePath(); ctx.fill();
}

export function drawGlints(ctx, cam, s, look) {
  if (cam.z >= Core.SURFACE) return;
  const u = cam.tilePx;
  for (const f of Core.findsNear(s)) {
    const seed = f.x * 7.31 + f.y * 3.17;
    const tw = 0.5 + 0.5 * Math.sin(s.time * 3.2 + seed);
    const near = 1 - 0.55 * (f.d / Core.GLINT_RANGE);
    const p = cam.project(f.x + 0.5, f.y + 0.45, cam.z + 1);
    const r = Math.max(4, u * GLINT_SIZE) * (0.7 + 0.5 * tw);
    if (p.x < -r || p.y < -r || p.x > cam.width + r || p.y > cam.height + r) continue;
    const color = look.color(Core.tileLook(f.type));
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.6);
    halo.addColorStop(0, rgba(color, 0.55 * near * (0.5 + 0.5 * tw)));
    halo.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(p.x - r * 1.6, p.y - r * 1.6, r * 3.2, r * 3.2);
    ctx.globalAlpha = near * (0.45 + 0.55 * tw);
    star(ctx, p.x, p.y, r, color);
    star(ctx, p.x, p.y, r * 0.5, '#fffbe8');
    ctx.globalAlpha = 1;
  }
}

/* Beacons (marker flags): a pin of the flag's colour over the dark wherever
 * one stands on screen, so you can find your way back to it. Kept on screen
 * at the edge, pointing the way, when it's off it. */
const BEACON_PIN = 7;     // the pin's radius, in CSS pixels
const BEACON_EDGE = 28;   // how far in from the screen's edge an off-screen pin sits

export function drawBeacons(ctx, cam, s, look, beacons) {
  for (const b of beacons) {
    const color = look.color('mark.' + b.kind);
    const p = cam.project(b.x + 0.5, b.y + 0.5, cam.z);
    const off = p.x < 0 || p.y < 0 || p.x > cam.width || p.y > cam.height;
    const x = Math.max(BEACON_EDGE, Math.min(cam.width - BEACON_EDGE, p.x));
    const y = Math.max(BEACON_EDGE, Math.min(cam.height - BEACON_EDGE, p.y - (off ? 0 : cam.tilePx * 1.1)));
    const pulse = 0.5 + 0.5 * Math.sin(s.time * 2.4 + b.x + b.y);
    const halo = ctx.createRadialGradient(x, y, 0, x, y, BEACON_PIN * 3);
    halo.addColorStop(0, rgba(color, 0.35 + 0.25 * pulse));
    halo.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(x - BEACON_PIN * 3, y - BEACON_PIN * 3, BEACON_PIN * 6, BEACON_PIN * 6);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(10,8,6,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (off) {
      // An arrowhead at the edge, pointing at the flag.
      const a = Math.atan2(p.y - y, p.x - x), r = BEACON_PIN * 1.4;
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a + 2.4) * r, y + Math.sin(a + 2.4) * r);
      ctx.lineTo(x + Math.cos(a - 2.4) * r, y + Math.sin(a - 2.4) * r);
      ctx.closePath();
    } else {
      ctx.arc(x, y, BEACON_PIN, 0, TAU);
    }
    ctx.fill(); ctx.stroke();
  }
}

// Friends you can't see (off screen, or on another layer): their badge at
// the screen's edge on the way to them. A circle in their colour with their
// wanderer's face in it and their name on a tag, an arrow on the rim
// pointing at them, and a small up or down arrow when they're on another
// layer. Under the name, how far away they are (a tile is 1 m), and for
// another layer how many layers up or down. Asleep (offline) friends' badges are faded and grey. With a crowd
// in the world only the nearest few get a badge, so the edges stay readable,
// and a badge that would cover another, or anything in `taken` (boxes round
// you and the names shown), gives way to the next nearest.
const BADGE = 22;          // the badge's radius, in CSS pixels
const MAX_BADGES = 6;
export function drawFriendMarkers(ctx, cam, s, look, friends, clear, taken = []) {
  const edge = BADGE + 14;
  const face = look.pick('character.wanderer', 'image');
  const cx = cam.width / 2, cy = cam.height / 2;
  const away = [];
  for (const f of friends) {
    const p = cam.project(f.x, f.y, cam.z);
    const other = f.z !== cam.z;
    const off = p.x < 0 || p.y < 0 || p.x > cam.width || p.y > cam.height;
    if (off || other) away.push({ f, p, other, off, d: Math.hypot(p.x - cx, p.y - cy) + (other ? 1e6 : 0) });
  }
  away.sort((a, b) => a.d - b.d);
  const placed = [...taken];
  let shown = 0;
  for (const { f, p, other, off } of away) {
    if (shown >= MAX_BADGES) break;
    let x = Math.max(edge, Math.min(cam.width - edge, p.x));
    let y = Math.max(edge + 92, Math.min(cam.height - edge - 130, p.y)); // below the top bar and chips
    if (!off) y -= cam.tilePx * 1.4; // on another layer, right above where they are
    // Beside the zoom pill, not under it: the badge, its name and distance.
    if (clear && x + edge + 16 > clear.left && y + BADGE + 40 > clear.top && y - BADGE - 40 < clear.bottom) x = Math.min(x, clear.left - edge - 16);
    const a = Math.atan2(p.y - y, p.x - x);   // which way they are
    // Their name goes under the badge, or over it when the arrow points down,
    // and the distance beyond it: all that must be clear of the others.
    const nameUp = off && Math.sin(a) > 0.4;
    ctx.font = '800 11px system-ui, sans-serif'; // i18n-ok: a font
    const tw = Math.ceil(ctx.measureText(f.name).width) + 12;
    const half = Math.max(BADGE + 12, tw / 2) + 2;
    const box = { l: x - half, r: x + half, t: y - BADGE - (nameUp ? 38 : 14), b: y + BADGE + (nameUp ? 14 : 38) };
    if (placed.some((o) => o.l < box.r && box.l < o.r && o.t < box.b && box.t < o.b)) continue;
    placed.push(box);
    shown++;
    const color = f.color;
    const asleep = f.st === 'offline';
    ctx.save();
    ctx.globalAlpha = asleep ? 0.75 : 1;
    // The badge: their colour, and their face.
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(10,8,6,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, BADGE, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath(); ctx.arc(x, y, BADGE - 4, 0, TAU); ctx.fill();
    ctx.save();
    ctx.clip();
    if (asleep && 'filter' in ctx) ctx.filter = 'grayscale(1)';
    // Their head fills the circle: the figure, big, with its top near the rim.
    const size = BADGE * 4.6 / (face.units * face.aspect);
    look.stand(ctx, face, x, y - BADGE * 0.9 + BADGE * 4.6, size);
    ctx.restore();
    // Their name on a tag, as on their chip in the top bar: under the badge,
    // or over it when the arrow points down.
    const ty = nameUp ? y - BADGE - 4 : y + BADGE + 4;
    ctx.font = '800 11px system-ui, sans-serif'; // i18n-ok: a font
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tx = Math.max(tw / 2 + 4, Math.min(cam.width - tw / 2 - 4, x));
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(tx - tw / 2, ty - 8, tw, 16, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0c0a08';
    ctx.fillText(f.name, tx, ty + 0.5);
    // How far: a dark pill beyond the name, away from the badge, with the
    // layers between you (an up or down triangle and how many) on another layer.
    const below = ty > y;
    const dy = ty + (below ? 17 : -17);
    const dz = Math.abs(f.z - cam.z), up = f.z > cam.z;
    const far = distance(Math.hypot(f.x - s.player.x, f.y - s.player.y));
    ctx.font = '700 10px system-ui, sans-serif'; // i18n-ok: a font
    const layers = dz ? number(dz) : '';
    const fw = ctx.measureText(far).width, lw = dz ? ctx.measureText(layers).width + 13 : 0;
    const dw = Math.ceil(fw + lw) + 12;
    const dx = Math.max(dw / 2 + 4, Math.min(cam.width - dw / 2 - 4, x));
    ctx.fillStyle = 'rgba(12,10,8,0.82)';
    ctx.beginPath(); ctx.roundRect(dx - dw / 2, dy - 7, dw, 14, 7); ctx.fill();
    ctx.fillStyle = '#f4efe4';
    ctx.textAlign = 'left';
    const left = dx - dw / 2 + 6;
    ctx.fillText(far, left, dy + 0.5);
    if (dz) {
      const ax = left + fw + 7, r = 3.6;
      ctx.beginPath();
      ctx.moveTo(ax, dy + (up ? -r : r));
      ctx.lineTo(ax + r, dy + (up ? r * 0.7 : -r * 0.7));
      ctx.lineTo(ax - r, dy + (up ? r * 0.7 : -r * 0.7));
      ctx.closePath(); ctx.fill();
      ctx.fillText(layers, ax + r + 2, dy + 0.5);
    }
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(10,8,6,0.85)';
    if (other) {
      // Up or down: which way the layer they're on is.
      const up = f.z > cam.z, ax = x + BADGE * 0.78, ay = y - BADGE * 0.78, r = 7;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ax, ay, r + 2, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0c0a08';
      ctx.beginPath();
      ctx.moveTo(ax, ay + (up ? -r * 0.7 : r * 0.7));
      ctx.lineTo(ax + r * 0.65, ay + (up ? r * 0.45 : -r * 0.45));
      ctx.lineTo(ax - r * 0.65, ay + (up ? r * 0.45 : -r * 0.45));
      ctx.closePath(); ctx.fill();
    }
    // The arrow on the rim, toward them.
    if (off) {
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(10,8,6,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (BADGE + 12), y + Math.sin(a) * (BADGE + 12));
      ctx.lineTo(x + Math.cos(a + 0.45) * (BADGE + 1), y + Math.sin(a + 0.45) * (BADGE + 1));
      ctx.lineTo(x + Math.cos(a - 0.45) * (BADGE + 1), y + Math.sin(a - 0.45) * (BADGE + 1));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawJoystick(ctx, cam, view) {
  const joy = view.joy;
  if (!joy.active) return;
  ctx.strokeStyle = 'rgba(190,220,190,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 62, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(120,190,130,0.55)';
  ctx.beginPath(); ctx.arc(joy.ox + joy.x * 62, joy.oy + joy.y * 62, 26, 0, TAU); ctx.fill();
}

// Physical collection service: radius and recipients, not fictional cart routes.
export function drawDepots(ctx,cam,s,view) {
  if(!Core.usesDepots(s))return;
  const seen=e=>e.z===cam.z&&Core.isExplored(s.world,e.x,e.y,e.z);
  const visible=d=>seen(d)&&(view.showSupports||Core.tileDist2(s.player,d.x,d.y,d.z)<=100);
  const paint=(d,preview)=>{
    if(!visible(d))return;
    const p=cam.project(d.x+.5,d.y+.5,d.z),r=Core.EXTRACTORS.depot.depot.radius;
    chalkEllipse(ctx,p.x,p.y,r*cam.tilePx,r*cam.depthPx,preview);
    for(const e of Core.depotTargets(s,d)) {
      if(!seen(e)||(preview?!!Core.depotFor(s,e):Core.depotFor(s,e)!==d))continue;
      const q=cam.project(e.x+.5,e.y+.5,e.z);
      chalkLine(ctx,p,q,preview);
      chalkBox(ctx,topRect(cam,s,e.x,e.y,Math.min(2,cam.tilePx*0.2)),preview);
    }
  };
  ctx.save();
  for(const d of s.extractors)if(d.key==='depot'&&(!d.owner||d.owner===s.me))paint(d,false);
  if(view.showSupports){const at=Core.buildTarget(s,'depot');if(at)paint({...at,z:s.player.z,owner:s.me||undefined},true);}
  ctx.restore();
}
