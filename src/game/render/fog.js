/* Clouds over the land you haven't explored, like the fog of war in a
 * strategy game. The bank is one seamless cloud picture over every unexplored
 * tile; each tile on its edge also gets a billowing puff a bit bigger than
 * itself (wider far out), so the edge rolls softly over the known land instead of running
 * along the grid. Clouds are drawn with the ground (and kept in the far map
 * when zoomed out), so they cost about what the tiles under them would.
 *
 * The bank is fixed to the land, so it zooms with it. Zoomed out, each
 * time the land shrinks fourfold a picture four times bigger fades in over
 * it, so far out you see wider cloud shapes instead of a fine weave, and
 * nothing jumps when the far map redraws at a new size.
 *
 * Only the surface has clouds: underground, what you haven't seen is rock.
 * The pictures are made once from the pack's two cloud colours, lit
 * from the north-west like everything else. */

import * as Core from '../../core/index.js';

const PUFF_PX = 128;    // a puff's picture, in pixels
const PUFF_SPAN = 1.75; // a puff's width, in tiles...
const PUFF_MIN = 14;    // ...but at least this many CSS pixels, so far out the edge still billows
const PUFFS = 6;        // different puffs
const BANK_PX = 256;    // the bank's picture, in pixels
const BANK_SPAN = 9;    // the bank's smallest picture's width, in tiles
const BANK_STEP = 4;    // each bigger picture is this many times wider
const BANK_SHOWN = 320; // a bigger picture is fully in by when the one below shows this small, in CSS pixels
// The most device pixels a side of the bank's kept copy may have. Zoomed in
// close the bank shows thousands of pixels wide; a copy that big is past
// what iOS Safari lets a canvas hold (16.7 M pixels, and then createPattern
// throws), and it's only the 256-pixel picture blown up anyway. Past this
// size the copy stays put and the pattern stretches it instead.
export const BANK_MAX = 1024;

let made = null;        // { version, puffs, bank }

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);

// Value noise in 0..1 over a grid of n cells across `size` pixels, wrapping
// so the picture tiles without seams.
function noise(n, size, seed) {
  const h = (a, b) => Core.hash2(((a % n) + n) % n, ((b % n) + n) % n, seed);
  return (x, y) => {
    const fx = x * n / size, fy = y * n / size, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const top = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * tx;
    const bot = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * tx;
    return top + (bot - top) * ty;
  };
}

// Four octaves of it, coarse to fine.
function fbm(size, seed, base) {
  const oct = [1, 2, 4, 8].map((f) => noise(base * f, size, seed + f));
  return (x, y) => (oct[0](x, y) * 8 + oct[1](x, y) * 4 + oct[2](x, y) * 2 + oct[3](x, y)) / 15;
}

// Paints a picture pixel by pixel: shadeAt(x, y) -> [k, alpha], with k from
// the shade colour (0) to the lit one (1).
function picture(size, light, dark, shadeAt) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const mix = (i, k) => channel(dark, i) + (channel(light, i) - channel(dark, i)) * k;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [k, a] = shadeAt(x, y);
      if (a <= 0) continue;
      const o = (y * size + x) * 4;
      img.data[o] = mix(1, k); img.data[o + 1] = mix(3, k); img.data[o + 2] = mix(5, k);
      img.data[o + 3] = 255 * a;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// One puff: a round billow covering its tile with a few smaller ones around
// it, each bright where it faces the sun and in shade beneath.
function puff(v, light, dark) {
  const rnd = (i) => Core.hash2(v, i, 97);
  const billows = [{ x: 0.5, y: 0.5, r: 0.44 }];
  for (let i = 0; i < 5; i++) {
    const a = rnd(i) * Math.PI * 2, d = 0.12 + rnd(i + 10) * 0.12;
    billows.push({ x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d * 0.9, r: 0.17 + rnd(i + 20) * 0.11 });
  }
  const n = fbm(PUFF_PX, 5 + v * 11, 6);
  return picture(PUFF_PX, light, dark, (px, py) => {
    const x = (px + 0.5) / PUFF_PX, y = (py + 0.5) / PUFF_PX;
    let inside = -1, lit = 0;
    for (const b of billows) {
      const dx = x - b.x, dy = y - b.y, f = 1 - Math.hypot(dx, dy) / b.r;
      if (f > inside) { inside = f; lit = (-dx - dy * 1.3) / b.r; }
    }
    const grain = n(px, py) - 0.5;
    const k = 0.62 + lit * 0.32 + grain * 0.4 + smooth(inside / 0.5) * 0.12;
    return [Math.min(1, Math.max(0, k)), smooth((inside + grain * 0.35) / 0.22)];
  });
}

// The inside of the bank: soft, wide swells of light and shade.
function bank(light, dark) {
  const n = fbm(BANK_PX, 1, 4);
  return picture(BANK_PX, light, dark, (x, y) => {
    const v = n(x, y), lit = (v - n(x + 6, y + 8)) * 5;
    return [Math.min(1, Math.max(0, 0.7 + (v - 0.5) * 0.6 + lit * 0.4)), 1];
  });
}

function pictures(look) {
  if (!made || made.version !== look.version) {
    const light = look.color('color.cloud'), dark = look.color('color.cloudShade');
    made = { version: look.version, puffs: Array.from({ length: PUFFS }, (_, v) => puff(v, light, dark)), bank: bank(light, dark) };
  }
  return made;
}

// A picture scaled to w x h pixels, kept for the last few sizes asked for
// (the view and the far map each want their own, up to two each).
const scaled = [];
function sized(pic, w, h) {
  let hit = scaled.find((c) => c.pic === pic && c.w === w && c.h === h);
  if (!hit) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, w); canvas.height = Math.max(1, h);
    canvas.getContext('2d').drawImage(pic, 0, 0, canvas.width, canvas.height);
    hit = { pic, w, h, canvas };
    scaled.unshift(hit);
    scaled.length = Math.min(scaled.length, 4);
  }
  return hit.canvas;
}

// Which of the puffs tile (x, y)'s edge billows with.
const puffOf = (x, y) => Math.floor(Core.hash2(x, y, 41) * PUFFS);

// The puff picture for tile (x, y) on the edge of the clouds (the world map
// draws the same ones the view does).
export function puffFor(look, x, y) {
  return pictures(look).puffs[puffOf(x, y)];
}

// The bank's fills for tiles u x d CSS pixels, as patterns for ctx (drawn
// through its current transform), biggest last, each with how opaque it is
// laid. Each picture is fixed to the land: project(x, y) is where tile
// corner (x, y) is in CSS pixels, and they're each a little apart, so their
// swells don't line up. A picture is kept at the size it shows at, in device
// pixels, so filling with it is a plain copy rather than a resample of every
// pixel (up to BANK_MAX; zoomed in closer it is stretched).
export function bankFills(ctx, look, u, d, project) {
  const { bank } = pictures(look), a = ctx.getTransform().a;
  return bankLayers(u).map(({ k, span, alpha }) => {
    const copy = bankCopy(span * u * a, span * d * a);
    const fill = ctx.createPattern(sized(bank, copy.w, copy.h), 'repeat');
    const o = project(k * 37, k * 53);
    fill.setTransform(new DOMMatrix().translate(Math.round(o.x * a) / a, Math.round(o.y * a) / a).scale(copy.sx / a, copy.sy / a));
    return { fill, alpha };
  });
}

// How many tiles wide a puff is for tiles u CSS pixels wide.
export function puffSpan(u) {
  return Math.max(PUFF_SPAN, PUFF_MIN / u);
}

// The bank's pictures for tiles u CSS pixels wide, biggest last: each with
// its width in tiles (always BANK_SPAN times a power of BANK_STEP, so fixed
// to the land) and how opaque it is laid over the ones before.
export function bankLayers(u) {
  const n = Math.max(0, Math.log(BANK_SHOWN / (BANK_SPAN * u)) / Math.log(BANK_STEP));
  const k = Math.floor(n), t = n - k;
  const layers = [{ k, span: BANK_SPAN * BANK_STEP ** k, alpha: 1 }];
  if (t > 0.01) layers.push({ k: k + 1, span: BANK_SPAN * BANK_STEP ** (k + 1), alpha: t });
  return layers;
}

// The bank's kept copy for a picture shown w x h device pixels: its size,
// never more than BANK_MAX a side, and how much the pattern stretches it.
export function bankCopy(w, h) {
  const cw = Math.max(1, Math.min(BANK_MAX, Math.round(w))), ch = Math.max(1, Math.min(BANK_MAX, Math.round(h)));
  return { w: cw, h: ch, sx: w / cw, sy: h / ch };
}

// The clouds over tiles x0..x1, y0..y1 of the layer `cam` looks at.
export function drawFog(ctx, cam, s, look, x0, y0, x1, y1) {
  if (cam.z !== Core.SURFACE) return;
  const w = s.world, z = cam.z, u = cam.tilePx, d = cam.depthPx;
  const fog = (x, y) => !Core.isExplored(w, x, y, z);
  const { puffs } = pictures(look);

  // The bank, a run of tiles at a time, each of its pictures fixed to the
  // land (see bankFills).
  for (const { fill, alpha } of bankFills(ctx, look, u, d, (x, y) => cam.project(x, y))) {
    ctx.fillStyle = fill;
    ctx.globalAlpha = alpha;
    // One path for all the runs, so where they overlap a see-through
    // picture isn't laid twice (that striped every row).
    ctx.beginPath();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!fog(x, y)) continue;
        let end = x;
        while (end < x1 && fog(end + 1, y)) end++;
        const p = cam.project(x, y);
        // Whole pixels, one over, so runs and rows meet without seams.
        ctx.rect(Math.floor(p.x), Math.floor(p.y), Math.ceil((end - x + 1) * u) + 1, Math.ceil(d) + 1);
        x = end;
      }
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Puffs along its edge, north to south so nearer ones cover farther ones.
  // Far out they're wider than a tile or two, so those of tiles past the
  // area reaching into it are drawn too.
  const span = puffSpan(u), pw = u * span, ph = d * span, r = Math.ceil(span / 2 - 0.5);
  for (let y = y0 - r; y <= y1 + r; y++) {
    for (let x = x0 - r; x <= x1 + r; x++) {
      if (!fog(x, y) || (fog(x - 1, y) && fog(x + 1, y) && fog(x, y - 1) && fog(x, y + 1))) continue;
      const p = cam.project(x + 0.5, y + 0.5);
      ctx.drawImage(puffs[puffOf(x, y)], p.x - pw / 2, p.y - ph / 2, pw, ph);
    }
  }
}
