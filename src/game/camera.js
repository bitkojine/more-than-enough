/* The camera maps world positions (x, y, z) to canvas pixels and back.
 *
 * Every draw call goes through project() and every pointer goes through
 * unproject(), so this is the one place that decides how the world is viewed.
 * Today the view looks straight down at the camera's layer (cam.z). A tilted
 * 2.5D view changes these two functions and gives project() a z argument. */

const ZOOM_MAX = 3;      // 3x in
const MIN_TILE_PX = 3;   // floor on tile size: the practical zoom-out limit

export function createCamera(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = {
    ctx,
    width: 0,            // viewport size in CSS pixels
    height: 0,
    baseTilePx: 48,      // tile size at 1x zoom for this viewport
    zoom: 1,
    tilePx: 48,          // current tile size in CSS pixels
    x: 0, y: 0, z: 0,    // the world point at the centre of the screen

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
    },

    // The world is endless: the camera always centres on its target.
    follow(p) {
      cam.x = p.x; cam.y = p.y; cam.z = p.z;
    },

    project(x, y) {
      return {
        x: (x - cam.x) * cam.tilePx + cam.width / 2,
        y: (y - cam.y) * cam.tilePx + cam.height / 2
      };
    },

    unproject(sx, sy) {
      return {
        x: (sx - cam.width / 2) / cam.tilePx + cam.x,
        y: (sy - cam.height / 2) / cam.tilePx + cam.y,
        z: cam.z
      };
    },

    // The range of tiles the screen shows, with a one-tile margin.
    visibleTiles() {
      const a = cam.unproject(0, 0), b = cam.unproject(cam.width, cam.height);
      return { x0: Math.floor(a.x) - 1, y0: Math.floor(a.y) - 1, x1: Math.ceil(b.x) + 1, y1: Math.ceil(b.y) + 1 };
    }
  };
  return cam;
}
