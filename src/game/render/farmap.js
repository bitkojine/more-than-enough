/* Zoomed out: the terrain is drawn once into an off-screen map of the area
 * around the view, in the same pictures as up close, and that map is shown
 * scaled every frame. So detail falls off smoothly as you zoom out (tiles stay
 * tiles, just smaller) while a frame costs about the same however far out you
 * are.
 *
 * The map is kept at a resolution near the screen's: each time the zoom
 * crosses a factor of LEVEL it is redrawn sharper or coarser, starting from a
 * flat colour per tile and the old map scaled, so nothing goes blank. Keeping
 * it up to date is spread over frames, a few milliseconds each: the visible
 * part first, then the margins, the ground around you often (that's where
 * you dig and uncover things), and one slice of the rest each frame, so
 * changes far away show too. */

import * as Core from '../../core/index.js';

const LEVEL = Math.SQRT2;    // the map's resolution steps by this factor
const MARGIN = 6;            // tiles kept ready past each edge of the screen
const BUDGET_MS = 4;         // drawing time per frame for bringing the map up to date
const SLICE_ROWS = 12;       // rows painted at a time (each slice redraws a few more above and below)
const SLICE_TILES = 300;     // tiles painted at a time
const NEAR_EVERY = 0.4;      // seconds between repaints of the ground around you
const ROLL_EVERY = 0.1;      // seconds between slices of the slow repaint of everything
const STAND_REACH = 3;       // standing things are at most this many tiles tall
const STAND_SIDE = 3;        // columns either side whose standing things can lean in

export function createFarMap() {
  let map = null;     // the off-screen map; see build()
  let queue = [];     // areas to repaint, { x0, y0, x1, y1 } in tiles, most urgent first
  let rolling = 0;    // the next row of the slow repaint of everything
  let roll = null;    // what's left of the band it's painting
  let nearAt = -1;    // when the ground around you was last queued
  let rolledAt = -1;  // when the last slice of the slow repaint was painted

  // The map for this view: a new one when the zoom crosses a level, the
  // layer or the look changes, or the screen resizes; recentred when the
  // view nears its edge.
  function fit(cam, look, art) {
    const dpr = cam.dpr;
    const k = Math.round(Math.log(cam.tilePx * dpr) / Math.log(LEVEL));
    const p = Math.max(1, Math.round(LEVEL ** k));   // device pixels per tile
    const fresh = !map || map.p !== p || map.z !== cam.z || map.version !== look.version ||
      map.width !== cam.width || map.height !== cam.height;
    if (fresh) build(cam, look, art, p);
    else recentre(cam);
  }

  function build(cam, look, art, p) {
    const dpr = cam.dpr;
    const depth = cam.depthPx / cam.tilePx, rise = cam.risePx / cam.tilePx;
    const pd = Math.max(1, Math.round(p * depth));   // device pixels per row
    // Big enough for the smallest tiles this level is shown at.
    const least = p / dpr / Math.sqrt(LEVEL);
    const relief = Math.ceil((Core.RELIEF_MAX - Core.RELIEF_MIN) * rise / depth) + 2;
    const cols = Math.ceil(cam.width / least) + 2 * MARGIN;
    const rows = Math.ceil(cam.height / (least * depth)) + 2 * MARGIN + relief;
    const canvas = document.createElement('canvas');
    canvas.width = cols * p;
    canvas.height = rows * pd;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const u = p / dpr, d = pd / dpr;
    const old = map;
    map = {
      canvas, ctx, p, pd, z: cam.z, version: look.version, width: cam.width, height: cam.height,
      cols, rows, x0: Math.round(cam.x - cols / 2), y0: Math.round(cam.y - rows / 2)
    };
    map.cam = mapCam(map, u, d, u * rise, cam.z, cols * u, rows * d);
    placeholder(art);
    // The old map, scaled, over the flat colours where it has something.
    if (old && old.z === map.z && old.version === map.version) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const f = p / old.p;
      ctx.drawImage(old.canvas, (old.x0 - map.x0) * p, (old.y0 - map.y0) * pd,
        old.canvas.width * f, old.canvas.height * pd / old.pd);
      ctx.restore();
    }
    queue = [];
    rolling = map.y0;
    roll = null;
    nearAt = -1;
    rolledAt = -1;
    dirtyVisible(cam);
    queue.push({ x0: map.x0, y0: map.y0, x1: map.x0 + cols - 1, y1: map.y0 + rows - 1 });
  }

  // A flat colour per tile, scaled up: instant, and only shows until painted over.
  function placeholder(art) {
    const { cols, rows } = map;
    const small = document.createElement('canvas');
    small.width = cols;
    small.height = rows;
    const g = small.getContext('2d');
    const img = g.createImageData(cols, rows);
    const px = img.data;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const hex = art.flatColor(map.x0 + i, map.y0 + j);
        if (!hex) continue;
        const o = (j * cols + i) * 4;
        px[o] = parseInt(hex.slice(1, 3), 16);
        px[o + 1] = parseInt(hex.slice(3, 5), 16);
        px[o + 2] = parseInt(hex.slice(5, 7), 16);
        px[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const ctx = map.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, map.canvas.width, map.canvas.height);
    ctx.restore();
  }

  // Keeps the visible tiles inside the map: when they near an edge, the map
  // moves to centre on the view, keeping what it already had.
  function recentre(cam) {
    const v = cam.visibleTiles();
    if (v.x0 >= map.x0 && v.y0 >= map.y0 && v.x1 < map.x0 + map.cols && v.y1 < map.y0 + map.rows) return;
    const x0 = Math.round(cam.x - map.cols / 2), y0 = Math.round(cam.y - map.rows / 2);
    const dx = map.x0 - x0, dy = map.y0 - y0;
    const ctx = map.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(map.canvas, dx * map.p, dy * map.pd);
    ctx.restore();
    map.x0 = x0; map.y0 = y0;
    const x1 = x0 + map.cols - 1, y1 = y0 + map.rows - 1;
    // What came into the map: a band across the top or bottom, one down a side.
    if (dy > 0) queue.unshift({ x0, y0, x1, y1: y0 + dy - 1 });
    if (dy < 0) queue.unshift({ x0, y0: y1 + dy + 1, x1, y1 });
    if (dx > 0) queue.unshift({ x0, y0, x1: x0 + dx - 1, y1 });
    if (dx < 0) queue.unshift({ x0: x1 + dx + 1, y0, x1, y1 });
  }

  function dirtyVisible(cam) {
    const v = cam.visibleTiles();
    queue.unshift({ x0: v.x0, y0: v.y0, x1: v.x1, y1: v.y1 });
  }

  // Paints one slice of an area, from its top left (up to SLICE_ROWS rows
  // of SLICE_TILES tiles); returns what's left of it, or null.
  function paintSome(art, a) {
    const x0 = Math.max(a.x0, map.x0), x1 = Math.min(a.x1, map.x0 + map.cols - 1);
    const y0 = Math.max(a.y0, map.y0), y1 = Math.min(a.y1, map.y0 + map.rows - 1);
    if (x0 > x1 || y0 > y1) return null;
    const last = Math.min(y1, y0 + SLICE_ROWS - 1);
    const right = Math.min(x1, x0 + Math.max(4, Math.floor(SLICE_TILES / (last - y0 + 1))) - 1);
    paint(art, x0, y0, right, last);
    // What's left: the rest of this band, then the rows below it.
    if (right < x1) return { x0: right + 1, y0, x1, y1, x: a.x ?? x0 };
    return last < y1 ? { x0: a.x ?? x0, y0: last + 1, x1, y1 } : null;
  }

  // Repaints tiles (x0..x1, y0..y1) of the map: cleared, then everything
  // that can reach into them drawn again in order, clipped to them.
  function paint(art, x0, y0, x1, y1) {
    const c = map.cam, ctx = map.ctx;
    const up = Math.ceil((Core.RELIEF_MAX - Core.RELIEF_MIN) * c.risePx / c.depthPx) + 1;
    const down = Math.ceil((Core.RELIEF_MAX * c.risePx + STAND_REACH * c.tilePx) / c.depthPx) + 1;
    const sx = (x0 - map.x0) * c.tilePx, sy = (y0 - map.y0) * c.depthPx;
    const w = (x1 - x0 + 1) * c.tilePx, h = (y1 - y0 + 1) * c.depthPx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, w, h);
    ctx.clip();
    ctx.clearRect(sx, sy, w, h);
    art.paintArea(ctx, c, x0 - 1, y0 - up, x1 + 1, y1 + down, STAND_SIDE);
    ctx.restore();
  }

  return {
    /* Brings the map up to date (within the frame's budget) and draws it.
     * `art` comes from the terrain, bound to this frame:
     *   paintArea(ctx, cam, x0, y0, x1, y1, side)  draws the ground of those
     *     tiles, north to south, with what stands on them (and on `side`
     *     columns either side, which can lean in)
     *   flatColor(x, y)  a tile's colour ('#rrggbb'), or null for nothing
     *   player, near     where you are, and how many tiles around you change */
    draw(ctx, cam, time, look, art) {
      fit(cam, look, art);
      if (nearAt < 0 || time - nearAt >= NEAR_EVERY || time < nearAt) {
        nearAt = time;
        const r = art.near, x = Math.floor(art.player.x), y = Math.floor(art.player.y);
        queue.unshift({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
      }
      const start = performance.now();
      let painted = false;
      while (queue.length && performance.now() - start < BUDGET_MS) {
        const rest = paintSome(art, queue[0]);
        if (rest) queue[0] = rest; else queue.shift();
        painted = true;
      }
      if (!painted && (time - rolledAt >= ROLL_EVERY || time < rolledAt)) {
        // Nothing waiting: a slice of the slow repaint of the whole map.
        rolledAt = time;
        if (!roll) {
          if (rolling < map.y0 || rolling >= map.y0 + map.rows) rolling = map.y0;
          roll = { x0: map.x0, y0: rolling, x1: map.x0 + map.cols - 1, y1: rolling + SLICE_ROWS - 1 };
          rolling += SLICE_ROWS;
        }
        roll = paintSome(art, roll);
      }
      const at = cam.project(map.x0, map.y0);
      const sx = cam.tilePx / map.cam.tilePx, sy = cam.depthPx / map.cam.depthPx;
      ctx.drawImage(map.canvas, at.x, at.y, map.cam.width * sx, map.cam.height * sy);
    },

    // Forgets the map (zoomed back in), so its memory is freed.
    drop() {
      map = null;
      queue = [];
    }
  };
}

// A camera onto the map: world tile (x0, y0) at its top left, same lean.
function mapCam(map, u, d, rise, z, width, height) {
  return {
    tilePx: u, depthPx: d, risePx: rise, z, width, height,
    project(x, y, h = z) {
      return { x: (x - map.x0) * u, y: (y - map.y0) * d - (h - z) * rise };
    }
  };
}
