/* The world map: each layer as far as you've explored it, one pixel per
 * tile; on the surface, the names of the regions you've set foot in or seen,
 * home and the hiding place. Drag to pan, pinch or scroll to zoom; it opens
 * centred on you, on your layer, and the pill in its corner steps up and
 * down through the layers you've explored.
 *
 * What you haven't explored looks as it does in the game: clouds on the
 * surface (the same bank and edge puffs, fixed to the land), unseen rock
 * underground. The ways between layers aren't marked: they show as the
 * ground beside them (worldmap-layers.js).
 *
 * Deposits you've emptied show faded: nothing grows back, so the map is a
 * record of where you've gathered (Watch, 2026-10-19).
 *
 * What you've explored is painted into one off-screen canvas, a chunk at a
 * time, and kept: each time the map opens only the chunks whose fog or
 * gathered tiles changed since are repainted. */

import * as Core from '../core/index.js';
import { tileColor, ROCK_SHADE, UNSEEN_DIM } from './render/terrain.js';
import { bankFills, puffFor, puffSpan } from './render/fog.js';
import { shade } from './render/palette.js';
import { mapLayers, stepLayer, shownType, edgeTiles, sampleEdges } from './worldmap-layers.js';
import { t, distance, number } from '../i18n/i18n.js';

const CS = Core.CHUNK_SIZE;
const GROW = 32;             // chunks the canvas grows by past what's explored
const MIN_SCALE = 0.25;      // screen pixels per tile, zoomed right out
const MAX_SCALE = 8;
const START_SCALE = 2;
const PUFF_GAP = 3;          // CSS pixels between the edge's puffs, at least, zoomed out
const LABEL_INK = '#fff6dc';
const LABEL_EDGE = 'rgba(20, 16, 10, 0.85)';
const KIND_FONT = '-apple-system, BlinkMacSystemFont, sans-serif'; // i18n-ok: a font list
const NAME_FONT = "Georgia, 'Times New Roman', serif"; // i18n-ok: a font list

const FADE = 0.65;           // how far an emptied deposit's colour fades to grey
const DIM = 0.85;

const bits = (mask) => mask.reduce((n, b) => { for (; b; b &= b - 1) n++; return n; }, 0);

export function createWorldMap(canvas, { getState, look, pill }) {
  const ctx = canvas.getContext('2d');
  let layers = new Map();     // z -> what's painted of that layer; see layer()
  let known = new Map();      // region key -> region (named on the map)
  let seed = null;
  let view = { x: 0, y: 0, z: Core.SURFACE, scale: START_SCALE };
  let open = false;
  const pointers = new Map();
  let pinch = null;

  // Layer z's painting: the land canvas ({ canvas, ctx, cx0, cy0, cols,
  // rows } in chunks), what each chunk was when last painted (explored tiles
  // and gathering), the clouds' edge tiles per chunk, and those thinned out
  // per step (see sampleEdges).
  function layer(z) {
    let L = layers.get(z);
    if (!L) layers.set(z, L = { z, land: null, painted: new Map(), edges: new Map(), sampled: new Map() });
    return L;
  }

  // Makes sure the layer's land canvas covers chunk (cx, cy), growing it if not.
  function cover(L, cx, cy) {
    const land = L.land;
    if (land && cx >= land.cx0 && cy >= land.cy0 && cx < land.cx0 + land.cols && cy < land.cy0 + land.rows) return;
    const cx0 = Math.min(land ? land.cx0 : cx, cx - GROW), cy0 = Math.min(land ? land.cy0 : cy, cy - GROW);
    const cx1 = Math.max(land ? land.cx0 + land.cols : cx, cx + GROW), cy1 = Math.max(land ? land.cy0 + land.rows : cy, cy + GROW);
    const next = document.createElement('canvas');
    next.width = (cx1 - cx0) * CS;
    next.height = (cy1 - cy0) * CS;
    const nctx = next.getContext('2d');
    if (land) nctx.drawImage(land.canvas, (land.cx0 - cx0) * CS, (land.cy0 - cy0) * CS);
    L.land = { canvas: next, ctx: nctx, cx0, cy0, cols: cx1 - cx0, rows: cy1 - cy0 };
  }

  function paintChunk(L, w, cx, cy) {
    cover(L, cx, cy);
    const land = L.land, z = L.z;
    const img = land.ctx.createImageData(CS, CS);
    const px = img.data;
    for (let ly = 0; ly < CS; ly++) {
      for (let lx = 0; lx < CS; lx++) {
        const x = cx * CS + lx, y = cy * CS + ly;
        if (!Core.isExplored(w, x, y, z)) continue;
        const type = shownType(w, x, y, z);
        const hex = tileColor(look, type);
        if (!hex) continue;
        const o = (ly * CS + lx) * 4;
        let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        if (Core.TILE_INFO[type].harvest && type === Core.tileAt(w, x, y, z) && Core.richness(w, x, y, z) <= 0) {
          const grey = 0.3 * r + 0.59 * g + 0.11 * b;
          r = (r + (grey - r) * FADE) * DIM; g = (g + (grey - g) * FADE) * DIM; b = (b + (grey - b) * FADE) * DIM;
        }
        // Underground, rock you've seen is darker than the floors, as in the game.
        if (z < Core.SURFACE && !Core.TILE_INFO[type].walk) { r *= 1 - ROCK_SHADE; g *= 1 - ROCK_SHADE; b *= 1 - ROCK_SHADE; }
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
        px[o + 3] = 255;
      }
    }
    land.ctx.putImageData(img, (cx - land.cx0) * CS, (cy - land.cy0) * CS);
  }

  // Paints what changed since the map last opened, on every layer, and
  // learns which regions you've seen (a region counts once any of its land
  // is explored). On the surface, finds the clouds' edge again around each
  // chunk that changed.
  function refresh(s) {
    const w = s.world;
    if (seed !== w.seed) { layers = new Map(); known = new Map(); seed = w.seed; }
    const worked = gathered(w);
    const edged = new Set();
    for (const [key, mask] of w.explored) {
      const c = Core.unpackKey(key);
      const L = layer(c.z);
      const n = bits(mask) + ':' + (worked.get(key) || 0);
      if (L.painted.get(key) === n) continue;
      L.painted.set(key, n);
      paintChunk(L, w, c.x, c.y);
      if (c.z !== Core.SURFACE) continue;
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) edged.add(Core.packKey(c.x + dx, c.y + dy, c.z));
      const r = Core.regionAt(w.seed, c.x * CS + CS / 2, c.y * CS + CS / 2);
      if (!known.has(r.key)) known.set(r.key, r);
    }
    if (!edged.size) return;
    const top = layer(Core.SURFACE);
    for (const key of edged) {
      const c = Core.unpackKey(key);
      const list = edgeTiles(w, c.x, c.y, c.z);
      if (list.length) top.edges.set(key, list); else top.edges.delete(key);
    }
    top.sampled.clear();
  }

  // Per chunk (keyed like w.explored), a number that changes whenever a
  // tile in it is gathered: how much has been taken from it.
  function gathered(w) {
    const out = new Map();
    for (const [key, left] of w.mods) {
      const t = Core.unpackKey(key);
      const c = Core.packKey(Core.chunkCoord(t.x), Core.chunkCoord(t.y), t.z);
      out.set(c, (out.get(c) || 0) + Core.baseRichness(w, t.x, t.y, t.z) - left);
    }
    return out;
  }

  // The layer pill: which layer the map shows, and whether there's one
  // above or below to step to (only once you've been underground).
  let lastPill = '';
  function updatePill(s) {
    if (!pill) return;
    const all = mapLayers(s.world, s.player.z), z = view.z;
    const key = all.join() + '|' + z;
    if (key === lastPill) return;
    lastPill = key;
    pill.root.hidden = all.length < 2;
    const under = z < Core.SURFACE;
    pill.root.classList.toggle('forest', !under);
    pill.label.textContent = under ? t('hud.layer') : '';
    pill.value.textContent = under ? number(Core.SURFACE - z) : t('hud.forest');
    pill.root.setAttribute('aria-label', under ? t('hud.layerN', { n: Core.SURFACE - z }) : t('hud.forest'));
    pill.up.disabled = stepLayer(all, z, 1) === z;
    pill.down.disabled = stepLayer(all, z, -1) === z;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    return dpr;
  }

  function draw() {
    // Stops once the sheet closes or shows something else.
    if (!open || !canvas.offsetParent) { open = false; return; }
    const s = getState();
    const dpr = resize();
    const W = canvas.width, H = canvas.height, k = view.scale * dpr;
    const sx = (x) => W / 2 + (x - view.x) * k, sy = (y) => H / 2 + (y - view.y) * k;
    const z = view.z, surface = z === Core.SURFACE, L = layer(z), land = L.land;
    updatePill(s);
    // What you haven't explored, as in the game: on the surface the cloud
    // bank, its pictures fixed to the land as the view lays them (drawn in
    // CSS pixels, like the view); underground, unseen rock.
    if (surface) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const { fill, alpha } of bankFills(ctx, look, view.scale, view.scale, (x, y) => ({ x: sx(x) / dpr, y: sy(y) / dpr }))) {
        ctx.fillStyle = fill;
        ctx.globalAlpha = alpha;
        ctx.fillRect(0, 0, W / dpr, H / dpr);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = shade(look.color('color.unknown'), 0.5, UNSEEN_DIM);
      ctx.fillRect(0, 0, W, H);
    }
    if (land) {
      ctx.imageSmoothingEnabled = view.scale < 1;
      ctx.drawImage(land.canvas, sx(land.cx0 * CS), sy(land.cy0 * CS), land.cols * CS * k, land.rows * CS * k);
      ctx.imageSmoothingEnabled = true;
    }
    if (surface) drawPuffs(L, W, H, sx, sy, dpr);
    if (surface) drawSurfaceMarks(s, W, H, sx, sy, dpr);
    // You: a bright dot with a ring, beating gently (on your own layer).
    if (s.player.z === z) {
      const px = sx(s.player.x), py = sy(s.player.y);
      const beat = 1 + 0.25 * Math.sin(performance.now() / 260);
      ctx.beginPath(); ctx.arc(px, py, 9 * dpr * beat, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 90, 90, 0.3)'; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5a5a'; ctx.fill();
      ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    requestAnimationFrame(draw);
  }

  // The clouds' edge billowing over the land, puff for puff as in the game:
  // as wide (puffSpan), the same pictures, laid over the same tiles; zoomed
  // out, one per few pixels (PUFF_GAP), north to south.
  function drawPuffs(L, W, H, sx, sy, dpr) {
    const u = view.scale;
    const step = 2 ** Math.max(0, Math.ceil(Math.log2(PUFF_GAP / u)));
    let list = L.sampled.get(step);
    if (!list) {
      const pairs = sampleEdges(L.edges.values(), step), order = [];
      for (let i = 0; i < pairs.length; i += 2) order.push([pairs[i], pairs[i + 1]]);
      order.sort((a, b) => a[1] - b[1]);
      L.sampled.set(step, list = order);
    }
    const pw = u * puffSpan(u) * dpr, half = pw / 2;
    for (const [x, y] of list) {
      const px = sx(x + 0.5), py = sy(y + 0.5);
      if (px < -half || py < -half || px > W + half || py > H + half) continue;
      ctx.drawImage(puffFor(look, x, y), px - half, py - half, pw, pw);
    }
  }

  // Region names, home and the hiding place: the surface's.
  function drawSurfaceMarks(s, W, H, sx, sy, dpr) {
    // Region names, where each region is centred.
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const r of known.values()) {
      const x = sx(r.x), y = sy(r.y) - (r.key === '0,0' ? 22 * dpr : 0);
      if (x < -200 * dpr || y < -60 * dpr || x > W + 200 * dpr || y > H + 60 * dpr) continue;
      ctx.font = `800 ${9.5 * dpr}px ${KIND_FONT}`;
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = LABEL_EDGE;
      ctx.strokeText(r.kind.toLocaleUpperCase(), x, y - 14 * dpr);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(r.kind.toLocaleUpperCase(), x, y - 14 * dpr);
      ctx.font = `700 ${17 * dpr}px ${NAME_FONT}`;
      ctx.lineWidth = 4 * dpr;
      ctx.strokeText(r.name, x, y + 4 * dpr);
      ctx.fillStyle = LABEL_INK;
      ctx.fillText(r.name, x, y + 4 * dpr);
    }
    // Home: a little roof.
    const hx = sx(0.5), hy = sy(0.5), u = 7 * dpr;
    ctx.fillStyle = LABEL_INK; ctx.strokeStyle = LABEL_EDGE; ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(hx - u, hy); ctx.lineTo(hx, hy - u); ctx.lineTo(hx + u, hy); ctx.lineTo(hx + u * 0.7, hy);
    ctx.lineTo(hx + u * 0.7, hy + u * 0.8); ctx.lineTo(hx - u * 0.7, hy + u * 0.8); ctx.lineTo(hx - u * 0.7, hy); ctx.closePath();
    ctx.stroke(); ctx.fill();
    // The hiding place, where the last teleport took the machine's heart:
    // marked from the start in crystal worlds; at the edge, an arrow to it.
    if (s.cultivation && s.cultivation.heart?.where !== 'installed') {
      const h = Core.hidingPlace(s.world.seed), m = 18 * dpr;
      let tx = sx(h.x + 0.5), ty = sy(h.y + 0.5);
      const inside = tx > m && ty > m && tx < W - m && ty < H - m;
      if (!inside) {
        const dx = tx - W / 2, dy = ty - H / 2, f = Math.min((W / 2 - m) / Math.abs(dx || 1), (H / 2 - m) / Math.abs(dy || 1));
        tx = W / 2 + dx * f; ty = H / 2 + dy * f;
      }
      ctx.save();
      ctx.translate(tx, ty);
      ctx.strokeStyle = '#eee9dc'; ctx.fillStyle = '#e995c4'; ctx.lineWidth = 2 * dpr;
      if (inside) {
        ctx.beginPath(); ctx.moveTo(0, -u); ctx.lineTo(u * 0.7, 0); ctx.lineTo(0, u); ctx.lineTo(-u * 0.7, 0); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, u * 1.7, 0, Math.PI * 2); ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.rotate(Math.atan2(sy(h.y) - H / 2, sx(h.x) - W / 2));
        ctx.beginPath(); ctx.moveTo(u * 1.6, 0); ctx.lineTo(-u * 0.8, -u * 0.75); ctx.lineTo(-u * 0.3, 0); ctx.lineTo(-u * 0.8, u * 0.75); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      const label = t('cr.station') + ' · ' + distance(Math.hypot(h.x + 0.5 - s.player.x, h.y + 0.5 - s.player.y));
      ctx.font = `700 ${12 * dpr}px ${KIND_FONT}`; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = LABEL_EDGE; ctx.fillStyle = LABEL_INK;
      ctx.textAlign = tx < W / 3 ? 'left' : tx > W * 2 / 3 ? 'right' : 'center';
      const ly = ty + (ty < H / 2 ? 24 : -18) * dpr;
      ctx.strokeText(label, tx, ly); ctx.fillText(label, tx, ly);
      ctx.textAlign = 'center';
    }
  }

  function zoomAt(f, cxPx, cyPx) {
    const r = canvas.getBoundingClientRect();
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * f));
    // Keep the point under the finger (or cursor) still.
    const dx = cxPx - r.width / 2, dy = cyPx - r.height / 2;
    view.x += dx / view.scale - dx / next;
    view.y += dy / view.scale - dy / next;
    view.scale = next;
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    pinch = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const other = a === p ? b : a;
      const d = Math.hypot(e.offsetX - other.x, e.offsetY - other.y);
      if (pinch) zoomAt(d / pinch, (e.offsetX + other.x) / 2, (e.offsetY + other.y) / 2);
      pinch = d;
    } else {
      view.x -= (e.offsetX - p.x) / view.scale;
      view.y -= (e.offsetY - p.y) / view.scale;
    }
    p.x = e.offsetX; p.y = e.offsetY;
  });
  const lift = (e) => { pointers.delete(e.pointerId); pinch = null; };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
  }, { passive: false });

  return {
    // Opens on where you are now.
    show() {
      const s = getState();
      refresh(s);
      view = { x: s.player.x, y: s.player.y, z: s.player.z, scale: view.scale };
      if (!open) { open = true; requestAnimationFrame(draw); }
    },
    hide() { open = false; },
    zoom(f) { const r = canvas.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); },
    centre() { const s = getState(); view.x = s.player.x; view.y = s.player.y; view.z = s.player.z; },
    // Shows the layer above (dir 1) or below (dir -1), of those explored.
    layer(dir) { const s = getState(); view.z = stepLayer(mapLayers(s.world, s.player.z), view.z, dir); },
    // The layer the map shows (for the tests).
    shown: () => view.z,
    // The names on the map (for the tests).
    names: () => [...known.values()].map((r) => r.name)
  };
}
