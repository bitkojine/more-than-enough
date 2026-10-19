/* The world map: the surface as far as you've explored it, one pixel per
 * tile, with the names of the regions you've set foot in or seen, home, and
 * you. Drag to pan, pinch or scroll to zoom; it opens centred on you.
 *
 * Deposits you've emptied show faded: nothing grows back, so the map is a
 * record of where you've gathered (Watch, 2026-10-19).
 *
 * What you've explored is painted into one off-screen canvas, a chunk at a
 * time, and kept: each time the map opens only the chunks whose fog or
 * gathered tiles changed since are repainted. */

import * as Core from '../core/index.js';
import { tileColor } from './render/terrain.js';
import { cloudBank } from './render/fog.js';

const CS = Core.CHUNK_SIZE;
const GROW = 32;             // chunks the canvas grows by past what's explored
const MIN_SCALE = 0.25;      // screen pixels per tile, zoomed right out
const MAX_SCALE = 8;
const START_SCALE = 2;
const CLOUD_SPAN = 120;      // tiles one picture of cloud spans, seen from this high
const LABEL_INK = '#fff6dc';
const LABEL_EDGE = 'rgba(20, 16, 10, 0.85)';
const KIND_FONT = '-apple-system, BlinkMacSystemFont, sans-serif'; // i18n-ok: a font list
const NAME_FONT = "Georgia, 'Times New Roman', serif"; // i18n-ok: a font list

const FADE = 0.65;           // how far an emptied deposit's colour fades to grey
const DIM = 0.85;

const bits = (mask) => mask.reduce((n, b) => { for (; b; b &= b - 1) n++; return n; }, 0);

export function createWorldMap(canvas, { getState, look }) {
  const ctx = canvas.getContext('2d');
  let land = null;            // { canvas, ctx, cx0, cy0, cols, rows } in chunks
  let painted = new Map();    // chunk key -> explored tiles and gathering when last painted
  let known = new Map();      // region key -> region (named on the map)
  let seed = null;
  let view = { x: 0, y: 0, scale: START_SCALE };
  let open = false;
  const pointers = new Map();
  let pinch = null;

  // Makes sure the land canvas covers chunk (cx, cy), growing it if not.
  function cover(cx, cy) {
    if (land && cx >= land.cx0 && cy >= land.cy0 && cx < land.cx0 + land.cols && cy < land.cy0 + land.rows) return;
    const cx0 = Math.min(land ? land.cx0 : cx, cx - GROW), cy0 = Math.min(land ? land.cy0 : cy, cy - GROW);
    const cx1 = Math.max(land ? land.cx0 + land.cols : cx, cx + GROW), cy1 = Math.max(land ? land.cy0 + land.rows : cy, cy + GROW);
    const next = document.createElement('canvas');
    next.width = (cx1 - cx0) * CS;
    next.height = (cy1 - cy0) * CS;
    const nctx = next.getContext('2d');
    if (land) nctx.drawImage(land.canvas, (land.cx0 - cx0) * CS, (land.cy0 - cy0) * CS);
    land = { canvas: next, ctx: nctx, cx0, cy0, cols: cx1 - cx0, rows: cy1 - cy0 };
  }

  function paintChunk(w, cx, cy) {
    cover(cx, cy);
    const img = land.ctx.createImageData(CS, CS);
    const px = img.data;
    for (let ly = 0; ly < CS; ly++) {
      for (let lx = 0; lx < CS; lx++) {
        const x = cx * CS + lx, y = cy * CS + ly;
        if (!Core.isExplored(w, x, y, Core.SURFACE)) continue;
        const type = Core.tileAt(w, x, y, Core.SURFACE);
        const hex = tileColor(look, type);
        if (!hex) continue;
        const o = (ly * CS + lx) * 4;
        let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        if (Core.TILE_INFO[type].harvest && Core.richness(w, x, y, Core.SURFACE) <= 0) {
          const grey = 0.3 * r + 0.59 * g + 0.11 * b;
          r = (r + (grey - r) * FADE) * DIM; g = (g + (grey - g) * FADE) * DIM; b = (b + (grey - b) * FADE) * DIM;
        }
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
        px[o + 3] = 255;
      }
    }
    land.ctx.putImageData(img, (cx - land.cx0) * CS, (cy - land.cy0) * CS);
  }

  // Paints what changed since the map last opened, and learns which regions
  // you've seen (a region counts once any of its land is explored).
  function refresh(s) {
    const w = s.world;
    if (seed !== w.seed) { land = null; painted = new Map(); known = new Map(); seed = w.seed; }
    const worked = gathered(w);
    for (const [key, mask] of w.explored) {
      const c = Core.unpackKey(key);
      if (c.z !== Core.SURFACE) continue;
      const n = bits(mask) + ':' + (worked.get(key) || 0);
      if (painted.get(key) === n) continue;
      painted.set(key, n);
      paintChunk(w, c.x, c.y);
      const r = Core.regionAt(w.seed, c.x * CS + CS / 2, c.y * CS + CS / 2);
      if (!known.has(r.key)) known.set(r.key, r);
    }
  }

  // Per surface chunk (keyed like w.explored), a number that changes
  // whenever a tile in it is gathered: how much has been taken from it.
  function gathered(w) {
    const out = new Map();
    for (const [key, left] of w.mods) {
      const t = Core.unpackKey(key);
      if (t.z !== Core.SURFACE) continue;
      const c = Core.packKey(Core.chunkCoord(t.x), Core.chunkCoord(t.y), Core.SURFACE);
      out.set(c, (out.get(c) || 0) + Core.baseRichness(w, t.x, t.y, t.z) - left);
    }
    return out;
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Unexplored land: clouds, as in the game, fixed to the land.
    const bank = cloudBank(look), clouds = ctx.createPattern(bank, 'repeat');
    clouds.setTransform(new DOMMatrix().translate(sx(0), sy(0)).scale(CLOUD_SPAN * k / bank.width));
    ctx.fillStyle = clouds;
    ctx.fillRect(0, 0, W, H);
    if (land) {
      ctx.imageSmoothingEnabled = view.scale < 1;
      ctx.drawImage(land.canvas, sx(land.cx0 * CS), sy(land.cy0 * CS), land.cols * CS * k, land.rows * CS * k);
    }
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
    // You: a bright dot with a ring, beating gently.
    const px = sx(s.player.x), py = sy(s.player.y);
    const beat = 1 + 0.25 * Math.sin(performance.now() / 260);
    ctx.beginPath(); ctx.arc(px, py, 9 * dpr * beat, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 90, 90, 0.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, 4.5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5a5a'; ctx.fill();
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
    requestAnimationFrame(draw);
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
      view = { x: s.player.x, y: s.player.y, scale: view.scale };
      if (!open) { open = true; requestAnimationFrame(draw); }
    },
    hide() { open = false; },
    zoom(f) { const r = canvas.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); },
    centre() { const s = getState(); view.x = s.player.x; view.y = s.player.y; },
    // The names on the map (for the tests).
    names: () => [...known.values()].map((r) => r.name)
  };
}
