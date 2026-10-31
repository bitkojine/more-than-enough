/* Zoomed out past MAP_ZOOM (camera.js), the view is the world map: the
 * layer you look at as far as you've explored it, a square of colour per
 * tile; on the surface, the names of the regions you've set foot in or seen,
 * home and the hiding place; you, and friends on that layer. This replaced
 * the world map sheet (v0.158.0): src/game/mapview.js pans it, steps through
 * the layers and brings you back.
 *
 * What you haven't explored looks as it does closer in: clouds on the
 * surface (the same bank and edge puffs, fixed to the land), unseen rock
 * underground. The ways between layers aren't marked: they show as the
 * ground beside them (worldmap-layers.js).
 *
 * Deposits you've emptied show faded: nothing grows back, so the map is a
 * record of where you've gathered (Watch, 2026-10-19).
 *
 * What you've explored is painted into pages of PAGE x PAGE tiles, each its
 * own small canvas (one big one would pass iOS Safari's canvas limit on a
 * long trip), a chunk at a time, and kept: every REFRESH_MS only the chunks
 * whose fog or gathered tiles changed since are repainted. */

import * as Core from '../../core/index.js';
import { tileColor, ROCK_SHADE, UNSEEN_DIM } from './terrain.js';
import { bankFills, puffFor, puffSpan } from './fog.js';
import { shade } from './palette.js';
import { drawNameTag } from './sprites.js';
import { sampleEdges, shownType, edgeTiles } from '../worldmap-layers.js';
import { t, distance } from '../../i18n/i18n.js';

const CS = Core.CHUNK_SIZE;
const PAGE = 128; // tiles a side of one page of the painted land
const REFRESH_MS = 500; // how often what you've explored is looked at again
const PUFF_GAP = 3; // CSS pixels between the edge's puffs, at least, far out
const LABEL_INK = '#fff6dc';
const LABEL_EDGE = 'rgba(20, 16, 10, 0.85)';
const KIND_FONT = '-apple-system, BlinkMacSystemFont, sans-serif'; // i18n-ok: a font list
const NAME_FONT = "Georgia, 'Times New Roman', serif"; // i18n-ok: a font list
// Clear of the top bar and the thumb cluster: where marks at the screen's
// edge may sit (like friends' badges, overlay.js).
const EDGE_TOP = 100,
  EDGE_BOTTOM = 150,
  EDGE = 18;

const FADE = 0.65; // how far an emptied deposit's colour fades to grey
const DIM = 0.85;

const bits = (mask) =>
  mask.reduce((n, b) => {
    for (; b; b &= b - 1) n++;
    return n;
  }, 0);
const pageOf = (n) => Math.floor(n / PAGE);

export function createAtlas() {
  let layers = new Map(); // z -> what's painted of that layer; see layer()
  let known = new Map(); // region key -> region (named on the map)
  let seed = null,
    version = null,
    refreshed = -Infinity;

  // Layer z's painting: its pages (packed page key -> { canvas, ctx }), what
  // each chunk was when last painted (explored tiles and gathering), the
  // clouds' edge tiles per chunk, and those thinned out per step.
  function layer(z) {
    let L = layers.get(z);
    if (!L)
      layers.set(
        z,
        (L = { z, pages: new Map(), painted: new Map(), edges: new Map(), sampled: new Map() })
      );
    return L;
  }

  function page(L, px, py) {
    const key = px + ',' + py;
    let P = L.pages.get(key);
    if (!P) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = PAGE;
      L.pages.set(key, (P = { canvas, ctx: canvas.getContext('2d'), px, py }));
    }
    return P;
  }

  function paintChunk(L, w, look, cx, cy) {
    const x0 = cx * CS,
      y0 = cy * CS,
      z = L.z;
    const P = page(L, pageOf(x0), pageOf(y0));
    const img = P.ctx.createImageData(CS, CS);
    const px = img.data;
    for (let ly = 0; ly < CS; ly++) {
      for (let lx = 0; lx < CS; lx++) {
        const x = x0 + lx,
          y = y0 + ly;
        if (!Core.isExplored(w, x, y, z)) continue;
        const type = shownType(w, x, y, z);
        const hex = tileColor(look, type);
        if (!hex) continue;
        const o = (ly * CS + lx) * 4;
        let r = parseInt(hex.slice(1, 3), 16),
          g = parseInt(hex.slice(3, 5), 16),
          b = parseInt(hex.slice(5, 7), 16);
        if (
          Core.TILE_INFO[type].harvest &&
          type === Core.tileAt(w, x, y, z) &&
          Core.richness(w, x, y, z) <= 0
        ) {
          const grey = 0.3 * r + 0.59 * g + 0.11 * b;
          r = (r + (grey - r) * FADE) * DIM;
          g = (g + (grey - g) * FADE) * DIM;
          b = (b + (grey - b) * FADE) * DIM;
        }
        // Underground, rock you've seen is darker than the floors, as in the game.
        if (z < Core.SURFACE && !Core.TILE_INFO[type].walk) {
          r *= 1 - ROCK_SHADE;
          g *= 1 - ROCK_SHADE;
          b *= 1 - ROCK_SHADE;
        }
        px[o] = r;
        px[o + 1] = g;
        px[o + 2] = b;
        px[o + 3] = 255;
      }
    }
    P.ctx.putImageData(img, x0 - P.px * PAGE, y0 - P.py * PAGE);
  }

  // Paints what changed since last time, on every layer, and learns which
  // regions you've seen (a region counts once any of its land is explored).
  // On the surface, finds the clouds' edge again around each chunk that changed.
  function refresh(s, look) {
    const w = s.world;
    if (seed !== w.seed || version !== look.version) {
      layers = new Map();
      known = new Map();
      seed = w.seed;
      version = look.version;
    }
    const worked = gathered(w);
    const edged = new Set();
    for (const [key, mask] of w.explored) {
      const c = Core.unpackKey(key);
      const L = layer(c.z);
      const n = bits(mask) + ':' + (worked.get(key) || 0);
      if (L.painted.get(key) === n) continue;
      L.painted.set(key, n);
      paintChunk(L, w, look, c.x, c.y);
      if (c.z !== Core.SURFACE) continue;
      for (const [dx, dy] of [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1]
      ])
        edged.add(Core.packKey(c.x + dx, c.y + dy, c.z));
      const r = Core.regionAt(w.seed, c.x * CS + CS / 2, c.y * CS + CS / 2);
      if (!known.has(r.key)) known.set(r.key, r);
    }
    if (!edged.size) return;
    const top = layer(Core.SURFACE);
    for (const key of edged) {
      const c = Core.unpackKey(key);
      const list = edgeTiles(w, c.x, c.y, c.z);
      if (list.length) top.edges.set(key, list);
      else top.edges.delete(key);
    }
    top.sampled.clear();
  }

  // Per chunk (keyed like w.explored), a number that changes whenever a
  // tile in it is gathered: how much has been taken from it.
  function gathered(w) {
    const out = new Map();
    for (const [key, left] of w.mods) {
      const p = Core.unpackKey(key);
      const c = Core.packKey(Core.chunkCoord(p.x), Core.chunkCoord(p.y), p.z);
      out.set(c, (out.get(c) || 0) + Core.baseRichness(w, p.x, p.y, p.z) - left);
    }
    return out;
  }

  /* One frame of the map, through `cam` (centred where the map looks, on
   * the layer it shows). `view` is the renderer's: friends, your sign, and
   * keepClear (the zoom pill). Returns what render() does. */
  function draw(ctx, cam, s, look, view) {
    const now = performance.now();
    if (now - refreshed >= REFRESH_MS || seed !== s.world.seed || version !== look.version) {
      refreshed = now;
      refresh(s, look);
    }
    const W = cam.width,
      H = cam.height,
      u = cam.tilePx,
      d = cam.depthPx,
      a = cam.dpr;
    const z = cam.z,
      surface = z === Core.SURFACE,
      L = layer(z);
    const at = (x, y) => cam.project(x, y, z);
    // What you haven't explored: on the surface the cloud bank, its
    // pictures fixed to the land; underground, unseen rock.
    if (surface) {
      for (const { fill, alpha } of bankFills(ctx, look, u, d, at)) {
        ctx.fillStyle = fill;
        ctx.globalAlpha = alpha;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = shade(look.color('color.unknown'), 0.5, UNSEEN_DIM);
      ctx.fillRect(0, 0, W, H);
    }
    // The pages on screen, their edges on whole device pixels so
    // neighbours meet without a seam.
    const snap = (v) => Math.round(v * a) / a;
    const left = cam.x - W / 2 / u,
      top = cam.y - H / 2 / d;
    const px0 = pageOf(left),
      px1 = pageOf(left + W / u),
      py0 = pageOf(top),
      py1 = pageOf(top + H / d);
    ctx.imageSmoothingEnabled = u < 1;
    for (const P of L.pages.values()) {
      if (P.px < px0 || P.px > px1 || P.py < py0 || P.py > py1) continue;
      const p = at(P.px * PAGE, P.py * PAGE),
        q = at((P.px + 1) * PAGE, (P.py + 1) * PAGE);
      const x = snap(p.x),
        y = snap(p.y);
      ctx.drawImage(P.canvas, x, y, snap(q.x) - x, snap(q.y) - y);
    }
    ctx.imageSmoothingEnabled = true;
    // Labels never cover each other: the hiding place's first, then region
    // names, nearest you first.
    const taken = [],
      clear = view.keepClear;
    // ...nor go under the zoom pill or the thumb cluster.
    if (clear) taken.push({ l: clear.left - 6, r: W, t: clear.top - 6, b: clear.bottom + 6 });
    taken.push({ l: 0, r: W, t: H - EDGE_BOTTOM + 30, b: H });
    if (surface) {
      drawPuffs(ctx, look, L, W, H, u, d, at);
      drawHome(ctx, at);
      const room = { l: EDGE, t: EDGE_TOP, r: W - EDGE, b: H - EDGE_BOTTOM };
      if (s.cultivation && s.cultivation.heart?.where !== 'installed')
        drawHidingPlace(ctx, s, at, room, clear, W, H, taken);
      drawRegions(ctx, W, H, at, taken);
    }
    // Friends on this layer: a dot in their colour with their name.
    for (const f of view.friends || []) {
      if (f.z !== z) continue;
      const p = at(f.x, f.y);
      if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
      dot(ctx, p.x, p.y, f.color, 3.5, f.st === 'offline' ? 0.6 : 1);
      drawNameTag(ctx, p.x, p.y - 8, f.name, f.color, taken);
    }
    // You: a bright dot with a ring, beating gently (on your own layer).
    let you = null;
    if (s.player.z === z) {
      const p = at(s.player.x, s.player.y);
      const beat = 1 + 0.25 * Math.sin(now / 260);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 * beat, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 90, 90, 0.3)';
      ctx.fill();
      dot(ctx, p.x, p.y, '#ff5a5a', 4.5, 1, '#fff');
      if (view.me) drawNameTag(ctx, p.x, p.y - 12, view.me.name, view.me.color, taken);
      you = { x: p.x, top: p.y - 6, foot: p.y + 6, handsX: p.x, hands: p.y };
    }
    return { you, taken: taken.slice(clear ? 2 : 1) }; // friends' badges keep clear of the HUD themselves
  }

  // The clouds' edge billowing over the land, puff for puff as in the game:
  // as wide (puffSpan), the same pictures, laid over the same tiles; far
  // out, one per few pixels (PUFF_GAP), north to south.
  function drawPuffs(ctx, look, L, W, H, u, d, at) {
    const step = 2 ** Math.max(0, Math.ceil(Math.log2(PUFF_GAP / u)));
    let list = L.sampled.get(step);
    if (!list) {
      const pairs = sampleEdges(L.edges.values(), step),
        order = [];
      for (let i = 0; i < pairs.length; i += 2) order.push([pairs[i], pairs[i + 1]]);
      order.sort((p, q) => p[1] - q[1]);
      L.sampled.set(step, (list = order));
    }
    const span = puffSpan(u),
      pw = u * span,
      ph = d * span;
    for (const [x, y] of list) {
      const p = at(x + 0.5, y + 0.5);
      if (p.x < -pw || p.y < -ph || p.x > W + pw || p.y > H + ph) continue;
      ctx.drawImage(puffFor(look, x, y), p.x - pw / 2, p.y - ph / 2, pw, ph);
    }
  }

  // Region names, where each region is centred (home's a little higher,
  // clear of its roof).
  function drawRegions(ctx, W, H, at, taken) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const shown = [];
    for (const r of known.values()) {
      const p = at(r.x, r.y),
        x = p.x,
        y = p.y - (r.key === '0,0' ? 22 : 0);
      if (x < -200 || y < -60 || x > W + 200 || y > H + 60) continue;
      shown.push({ r, x, y, d: Math.hypot(x - W / 2, y - H / 2) });
    }
    shown.sort((a, b) => a.d - b.d);
    for (const { r, x, y } of shown) {
      ctx.font = `700 17px ${NAME_FONT}`;
      const half = Math.max(ctx.measureText(r.name).width, 60) / 2 + 4;
      const box = { l: x - half, r: x + half, t: y - 26, b: y + 9 };
      if (overlaps(taken, box)) continue;
      taken.push(box);
      ctx.font = `800 9.5px ${KIND_FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = LABEL_EDGE;
      ctx.strokeText(r.kind.toLocaleUpperCase(), x, y - 14);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(r.kind.toLocaleUpperCase(), x, y - 14);
      ctx.font = `700 17px ${NAME_FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeText(r.name, x, y + 4);
      ctx.fillStyle = LABEL_INK;
      ctx.fillText(r.name, x, y + 4);
    }
  }

  return {
    draw,
    // The names on the map (for the tests).
    names: () => [...known.values()].map((r) => r.name),
    // Forgets every page (a new world, or for the tests).
    drop() {
      layers = new Map();
      known = new Map();
      seed = null;
      refreshed = -Infinity;
    }
  };
}

function dot(ctx, x, y, color, r, alpha = 1, ring = 'rgba(10,8,6,0.85)') {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Home: a little roof.
function drawHome(ctx, at) {
  const p = at(0.5, 0.5),
    hx = p.x,
    hy = p.y,
    u = 7;
  ctx.fillStyle = LABEL_INK;
  ctx.strokeStyle = LABEL_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx - u, hy);
  ctx.lineTo(hx, hy - u);
  ctx.lineTo(hx + u, hy);
  ctx.lineTo(hx + u * 0.7, hy);
  ctx.lineTo(hx + u * 0.7, hy + u * 0.8);
  ctx.lineTo(hx - u * 0.7, hy + u * 0.8);
  ctx.lineTo(hx - u * 0.7, hy);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

// The hiding place, where the last teleport took the machine's heart:
// marked from the start in crystal worlds; off screen, an arrow to it at
// the edge of `room` (clear of the top bar, the zoom pill and the thumbs).
export function edgePoint(tx, ty, cx, cy, room) {
  const dx = tx - cx,
    dy = ty - cy;
  const f = Math.min(
    (dx > 0 ? room.r - cx : cx - room.l) / Math.abs(dx || 1e-9),
    (dy > 0 ? room.b - cy : cy - room.t) / Math.abs(dy || 1e-9)
  );
  return { x: cx + dx * f, y: cy + dy * f };
}

const overlaps = (boxes, b) => boxes.some((o) => o.l < b.r && b.l < o.r && o.t < b.b && b.t < o.b);

function drawHidingPlace(ctx, s, at, room, clear, W, H, taken) {
  const h = Core.hidingPlace(s.world.seed),
    u = 7;
  const p = at(h.x + 0.5, h.y + 0.5);
  const inside = p.x > room.l && p.y > room.t && p.x < room.r && p.y < room.b;
  const cx = (room.l + room.r) / 2,
    cy = (room.t + room.b) / 2;
  let m = inside ? p : edgePoint(p.x, p.y, cx, cy, room);
  // Not under the zoom pill: beside it.
  if (
    !inside &&
    clear &&
    m.x > clear.left - EDGE &&
    m.y > clear.top - EDGE &&
    m.y < clear.bottom + EDGE
  ) {
    m = edgePoint(p.x, p.y, cx, cy, { ...room, r: clear.left - EDGE });
  }
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.strokeStyle = '#eee9dc';
  ctx.fillStyle = '#e995c4';
  ctx.lineWidth = 2;
  if (inside) {
    ctx.beginPath();
    ctx.moveTo(0, -u);
    ctx.lineTo(u * 0.7, 0);
    ctx.lineTo(0, u);
    ctx.lineTo(-u * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, u * 1.7, 0, Math.PI * 2);
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.rotate(Math.atan2(p.y - cy, p.x - cx));
    ctx.beginPath();
    ctx.moveTo(u * 1.6, 0);
    ctx.lineTo(-u * 0.8, -u * 0.75);
    ctx.lineTo(-u * 0.3, 0);
    ctx.lineTo(-u * 0.8, u * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  const label =
    t('cr.station') + ' · ' + distance(Math.hypot(h.x + 0.5 - s.player.x, h.y + 0.5 - s.player.y));
  ctx.font = `700 12px ${KIND_FONT}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = LABEL_EDGE;
  ctx.fillStyle = LABEL_INK;
  const align = m.x < W / 3 ? 'left' : m.x > (W * 2) / 3 ? 'right' : 'center';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const ly = m.y + (m.y < H / 2 ? 24 : -18),
    w = ctx.measureText(label).width;
  const l = align === 'left' ? m.x : align === 'right' ? m.x - w : m.x - w / 2;
  taken.push({
    l: Math.min(l, m.x - 12) - 4,
    r: Math.max(l + w, m.x + 12) + 4,
    t: Math.min(ly - 14, m.y - 12),
    b: Math.max(ly + 4, m.y + 12)
  });
  ctx.strokeText(label, m.x, ly);
  ctx.fillText(label, m.x, ly);
  ctx.textAlign = 'center';
}
