/* The camera maps world positions to canvas pixels and back.
 *
 * Every draw call goes through project() and every pointer goes through
 * unproject(), so this is the one place that decides how the world is viewed.
 *
 * The view looks north and tilts from a slight angle (MIN_TILT, never quite
 * straight down, so the edges of the known world always read as cliffs) to an
 * angled 2.5D view (tilt 1). There is no turning, so a tile's top always projects to
 * an axis-aligned rectangle: x maps straight across, a row of tiles is
 * foreshortened to `depthPx` tall, and height lifts things by `risePx` per
 * layer. Heights are absolute: the surface floor is 0, layer -1's floor is -1,
 * and a wall in layer -1 stands up to 0. Only south faces can be seen. */

import { RELIEF_MIN, RELIEF_MAX } from '../core/index.js';

const ZOOM_MAX = 3;          // 3x in
const MIN_TILE_PX = 3;       // floor on tile size: the practical zoom-out limit
const MAX_PITCH = 0.9;       // radians from straight down at full tilt (~52°)
export const MIN_TILT = 0.25;  // the flattest the view gets (~13°)
const LAYER_HEIGHT = 0.6;    // one layer's height, in tile lengths
// Below this much lift per layer the view counts as flat and heights are ignored.
export const FLAT_RISE_PX = 0.5;
const TILT_EASE = 9;         // how quickly the view swings to a new tilt, per second

export function createCamera(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = {
    ctx,
    width: 0,            // viewport size in CSS pixels
    height: 0,
    baseTilePx: 48,      // tile size at 1x zoom for this viewport
    zoom: 1,
    tilePx: 48,          // tile width in CSS pixels
    depthPx: 48,         // a tile's on-screen depth (north to south)
    risePx: 0,           // on-screen lift per layer of height
    tilt: MIN_TILT,      // MIN_TILT = slight angle ... 1 = fully tilted
    tiltTarget: MIN_TILT,
    x: 0, y: 0, z: 0,    // the world point at the centre of the screen
    // (x, y) -> height of that tile's top above the floor of layer cam.z.
    // Set by the game; picking uses it to hit the face you actually see.
    relief: () => 0,

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cam.width = window.innerWidth;
      cam.height = window.innerHeight;
      canvas.width = Math.round(cam.width * dpr);
      canvas.height = Math.round(cam.height * dpr);
      canvas.style.width = cam.width + 'px';
      canvas.style.height = cam.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cam.baseTilePx = Math.max(34, Math.min(64, Math.min(cam.width / 7.2, cam.height / 11)));
      cam.setZoom(cam.zoom); // keep the player's zoom across resizes, re-clamped
    },

    setZoom(z) {
      if (!(z > 0)) return;
      cam.zoom = Math.min(ZOOM_MAX, Math.max(MIN_TILE_PX / cam.baseTilePx, z));
      cam.tilePx = cam.baseTilePx * cam.zoom;
      shape();
    },

    // Aim for a tilt; the view swings there over the next frames. `now` jumps
    // straight there (a gesture that tracks the fingers).
    setTilt(t, now = false) {
      cam.tiltTarget = t >= MIN_TILT ? Math.min(1, t) : MIN_TILT;
      if (now) { cam.tilt = cam.tiltTarget; shape(); }
    },

    // The pitch angle, for drawing things that stand upright.
    pitch() {
      return cam.tilt * MAX_PITCH;
    },

    tick(dt) {
      if (cam.tilt === cam.tiltTarget) return;
      const d = cam.tiltTarget - cam.tilt;
      cam.tilt = Math.abs(d) < 0.002 ? cam.tiltTarget : cam.tilt + d * Math.min(1, dt * TILT_EASE);
      shape();
    },

    // The world is endless: the camera always centres on its target.
    follow(p) {
      cam.x = p.x; cam.y = p.y; cam.z = p.z;
    },

    // World (x, y) at height h (default: the floor of the camera's layer).
    project(x, y, h = cam.z) {
      return {
        x: (x - cam.x) * cam.tilePx + cam.width / 2,
        y: (y - cam.y) * cam.depthPx - (h - cam.z) * cam.risePx + cam.height / 2
      };
    },

    /* The world point under a screen point: the front-most tile whose top or
     * south face covers it. Returns { x, y, z, h } with h the height of the top
     * that was hit (relative to the layer's floor). A hit on a south face lands
     * on the southern edge of that tile's top. */
    unproject(sx, sy) {
      const x = (sx - cam.width / 2) / cam.tilePx + cam.x;
      const rowY = (sy - cam.height / 2) / cam.depthPx + cam.y; // on the floor plane
      if (cam.risePx <= FLAT_RISE_PX) return { x, y: rowY, z: cam.z, h: 0 };
      const k = cam.risePx / cam.depthPx; // rows of lift per layer of height
      const tx = Math.floor(x);
      for (let ty = Math.floor(rowY + RELIEF_MAX * k); ty >= Math.floor(rowY + RELIEF_MIN * k); ty--) {
        const h = cam.relief(tx, ty);
        const top = rowY + h * k; // where the screen point lands on this tile's top
        if (top < ty) continue;
        const bottom = ty + 1 + (h - Math.min(h, cam.relief(tx, ty + 1))) * k;
        if (top >= bottom) continue;
        return { x, y: Math.min(top, ty + 0.999), z: cam.z, h };
      }
      return { x, y: rowY, z: cam.z, h: 0 };
    },

    // The tiles the screen can show, with a margin, for any relief.
    visibleTiles() {
      const k = cam.risePx / cam.depthPx;
      const left = (0 - cam.width / 2) / cam.tilePx + cam.x;
      const right = (cam.width / 2) / cam.tilePx + cam.x;
      const top = (0 - cam.height / 2) / cam.depthPx + cam.y;
      const bottom = (cam.height / 2) / cam.depthPx + cam.y;
      return {
        x0: Math.floor(left) - 1, x1: Math.ceil(right) + 1,
        y0: Math.floor(top + RELIEF_MIN * k) - 1, y1: Math.ceil(bottom + RELIEF_MAX * k) + 2
      };
    }
  };

  function shape() {
    const p = cam.pitch();
    cam.depthPx = cam.tilePx * Math.cos(p);
    cam.risePx = cam.tilePx * LAYER_HEIGHT * Math.sin(p);
  }

  return cam;
}
