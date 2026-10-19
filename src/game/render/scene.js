/* What stands on the layer being drawn, sorted into rows from north to south.
 * Anything on a tile you haven't explored stays under the fog with the land:
 * in a shared world other players' buildings, props and tombstones show only
 * once you've been there. Friends always show, so you can find each other:
 * those out in the clouds (`aloft`) are drawn over them. */

import * as Core from '../../core/index.js';

function addTo(rows, y, item) {
  const row = rows.get(y);
  if (row) row.push(item); else rows.set(y, [item]);
}

export function scene(s, view, z) {
  const w = s.world;
  const seen = (x, y) => Core.isExplored(w, Math.floor(x), Math.floor(y), z);
  const buildings = new Map(), friends = new Map(), graves = new Map(), props = new Map(), aloft = [];
  const built = new Set(); // tiles with a building on them show no trees or boulders
  for (const e of s.extractors) {
    if (e.z !== z || !seen(e.x, e.y)) continue;
    built.add(Core.packKey(e.x, e.y, e.z));
    addTo(buildings, e.y, e);
  }
  for (const f of view.friends || []) {
    if (f.z !== z) continue;
    if (z === Core.SURFACE && !seen(f.x, f.y)) aloft.push(f);
    else addTo(friends, Math.floor(f.y), f);
  }
  for (const g of view.graves || []) if (g.z === z && seen(g.x, g.y)) addTo(graves, Math.floor(g.y), g);
  const placed = [];
  for (const [k, kind] of w.props) {
    const t = Core.unpackKey(k);
    if (t.z !== z || !seen(t.x, t.y)) continue;
    addTo(props, t.y, [t.x, kind]);
    placed.push({ x: t.x, y: t.y, kind });
  }
  return { buildings, built, friends, aloft, graves, props, placed };
}
