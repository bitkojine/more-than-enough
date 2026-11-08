/* Choosing where to teleport (Watch, 2026-11-01: "Tap a shelter on the
 * map"). Standing at the woken machine, its card opens the world map on
 * the surface; every heart shelter shows there as a stop (render/atlas.js),
 * and tapping one teleports you beside it. The map then glides back in to
 * where you landed. Anywhere else, a tap on the map still only looks.
 * The rules are the core's (cultivation-travel.js); this only picks. */
import * as Core from '../core/index.js';
import { t } from '../i18n/i18n.js';

const TAP_PX = 28; // how near a stop a tap must land, in CSS pixels

export function createTeleportMap({ cam, state, mapView, cultivate, hud }) {
  const machine = () => {
    const s = state(),
      c = s.cultivation;
    if (!c?.completed) return null;
    const m = c.facilities.find((b) => b.kind === 'machine');
    return m && Core.atInteraction(s, m.x, m.y, m.z) ? m : null;
  };
  return {
    // Whether a tap on a stop would teleport you now (the map marks them so).
    ready: () => !!machine() && Core.teleportStops(state()).length > 0,
    // From the machine's card: the map, on the layer with the most stops.
    open() {
      const stops = Core.teleportStops(state());
      if (!machine() || !stops.length) return false;
      const count = new Map();
      for (const b of stops) count.set(b.z, (count.get(b.z) || 0) + 1);
      const layer = [...count].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0],
        on = stops.filter((b) => b.z === layer),
        xs = on.map((b) => b.x),
        ys = on.map((b) => b.y);
      // Every stop on that layer in view, and where you stand.
      const { x, y } = state().player;
      xs.push(Math.floor(x));
      ys.push(Math.floor(y));
      mapView.openOn(layer, {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys)
      });
      hud.toast(t('cr.teleport.hint'));
      return true;
    },
    // A tap on the map at screen (x, y): true if it teleported you.
    tap(x, y) {
      const m = machine();
      if (!m) return false;
      const w = cam.unproject(x, y),
        z = mapView.shown(),
        reach = TAP_PX / cam.tilePx;
      let best = null,
        near = reach;
      for (const b of Core.teleportStops(state())) {
        if (b.z !== z) continue;
        const d = Math.hypot(b.x + 0.5 - w.x, b.y + 0.5 - w.y);
        if (d <= near) {
          best = b;
          near = d;
        }
      }
      if (!best) return false;
      // Yours by id; someone else's by where it stands (0.203.0).
      const to = best.by ? { at: { x: best.x, y: best.y, z: best.z } } : { to: best.id };
      const result = cultivate({ type: 'teleport', x: m.x, y: m.y, ...to });
      if (result !== 'teleported') return false;
      mapView.leave();
      return true;
    }
  };
}
