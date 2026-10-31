/* Zoomed out all the way, the game view is the world map (render/atlas.js;
 * there is no separate map screen since v0.158.0). This is what the map adds
 * to the view while it shows:
 *
 *   drag            pans it (you stay where you are); input.js asks pans()
 *   pinch, wheel    zoom about the finger or cursor (zoomed())
 *   the layer pill  steps up and down through the layers you've explored,
 *                   in place of the depth pill (the map opens on yours)
 *   the map button  at the foot of the zoom pill: zooms all the way out in
 *                   one go (Watch, 2026-10-25); out there, brings the map
 *                   back to you, and once it's on you, back to the zoom you
 *                   had
 *
 * Zooming back in past the map lets go: the view glides back to you, on
 * your layer. */

import * as Core from '../core/index.js';
import { mapLayers, stepLayer } from './worldmap-layers.js';
import { t, number } from '../i18n/i18n.js';

const MAP_TILE_PX = 1; // how far out the map button goes the first time, in CSS pixels a tile
const GLIDE = 10; // how fast the zoom and the view glide to where they're going, per second
const ICON_MAP = '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" />';
const ICON_ME = '<circle cx="12" cy="12" r="3.5" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />';

export function createMapView({ cam, getState, el, changed }) {
  let pan = null; // where the map looks ({ x, y }), or null: at you
  let z = null; // the layer it shows, or null: yours
  let goal = null; // the zoom the view is gliding to, or null
  let before = 1; // the zoom you had before the map
  let mapZoom = null; // the zoom the map was last left at
  let lastPill = '',
    lastButton = '';

  const on = () => cam.mapping();
  const here = () => getState().player;

  function glideTo(zoom) {
    goal = zoom;
  }

  const mv = {
    on,
    // Where the view looks, for render(): null for you, or { x, y, z }.
    look() {
      if (!pan && z === null) return null;
      const p = here();
      return { x: pan ? pan.x : p.x, y: pan ? pan.y : p.y, z: z ?? p.z };
    },

    // Whether a drag on the view pans the map.
    pans: on,
    pan(dx, dy) {
      const p = pan || { x: here().x, y: here().y };
      pan = { x: p.x - dx / cam.tilePx, y: p.y - dy / cam.depthPx };
      goal = null;
    },

    // The zoom changed from `was` CSS pixels a tile, about screen point
    // (sx, sy): on the map, that point stays under the finger.
    zoomed(was, sx, sy) {
      goal = null;
      if (!on() && !cam.mapping(was / cam.baseTilePx)) return;
      const p = pan || { x: here().x, y: here().y };
      const dx = sx - cam.width / 2,
        dy = sy - cam.height / 2;
      if (!dx && !dy) return; // about the middle: it stays where it looks
      const wx = p.x + dx / was,
        wy = p.y + dy / ((was * cam.depthPx) / cam.tilePx);
      pan = { x: wx - dx / cam.tilePx, y: wy - dy / cam.depthPx };
    },

    // The map button.
    button() {
      if (!on()) {
        before = cam.zoom;
        glideTo(mapZoom ?? MAP_TILE_PX / cam.baseTilePx);
      } else if (pan || z !== null) {
        pan = null;
        z = null;
      } else {
        mapZoom = cam.zoom;
        glideTo(before);
      }
      mv.sync();
    },

    // Shows the layer above (dir 1) or below (dir -1), of those explored.
    layer(dir) {
      const s = getState();
      const next = stepLayer(mapLayers(s.world, s.player.z), z ?? s.player.z, dir);
      z = next === s.player.z ? null : next;
      mv.sync();
    },
    // The layer the map shows (for the tests).
    shown: () => z ?? here().z,

    // Each frame: the glides, and letting go once zoomed back in.
    tick(dt) {
      if (goal !== null) {
        const k = 1 - Math.exp(-GLIDE * dt);
        const next = Math.exp(Math.log(cam.zoom) + (Math.log(goal) - Math.log(cam.zoom)) * k);
        const done = Math.abs(Math.log(next / goal)) < 0.01;
        cam.setZoom(done ? goal : next);
        if (done) goal = null;
        changed();
      }
      if (!on()) {
        if (goal === null) before = cam.zoom;
        if (z !== null) z = null;
        if (pan) {
          const p = here(),
            k = 1 - Math.exp(-GLIDE * dt);
          pan = { x: pan.x + (p.x - pan.x) * k, y: pan.y + (p.y - pan.y) * k };
          if (Math.hypot(pan.x - p.x, pan.y - p.y) * cam.tilePx < 0.5) pan = null;
        }
      }
      mv.sync();
    },

    // The layer pill (in place of the depth pill, on the map, once you've
    // been underground) and the map button's face.
    sync() {
      const s = getState(),
        map = on();
      const all = mapLayers(s.world, s.player.z),
        shown = z ?? s.player.z;
      const pill = map && all.length > 1 ? all.join() + '|' + shown : '';
      if (pill !== lastPill) {
        lastPill = pill;
        el.mapLayer.hidden = !pill;
        document.body.classList.toggle('mapping', !!pill);
        if (pill) {
          const under = shown < Core.SURFACE;
          el.mapLayer.classList.toggle('forest', !under);
          el.mapLayerName.firstElementChild.textContent = under ? t('hud.layer') : '';
          el.mapLayerName.lastElementChild.textContent = under
            ? number(Core.SURFACE - shown)
            : t('hud.forest');
          el.mapLayerName.setAttribute(
            'aria-label',
            under ? t('hud.layerN', { n: Core.SURFACE - shown }) : t('hud.forest')
          );
          el.mapUp.disabled = stepLayer(all, shown, 1) === shown;
          el.mapDown.disabled = stepLayer(all, shown, -1) === shown;
        }
      }
      const away = map && (pan !== null || z !== null);
      const face = (map ? 'map' : '') + (away ? 'away' : '');
      if (face !== lastButton) {
        lastButton = face;
        el.map.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true">' + (away ? ICON_ME : ICON_MAP) + '</svg>';
        el.map.setAttribute('aria-pressed', String(map));
        el.map.setAttribute('aria-label', t(away ? 'map.centre' : map ? 'map.back' : 'map.title'));
      }
    }
  };
  return mv;
}
