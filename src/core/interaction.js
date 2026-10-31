/* Physical player contact, shared by every personal world action. Cardinal
 * neighboring floor is beside an object; diagonals and intervening tiles are
 * not. Standing inside a walkable object's tile also remains valid (gathering
 * among mushrooms, or a kept save made inside a building). No path search here. */
import { tileAt, isExplored } from './world.js';
import { TILE_INFO } from './tiles.js';
import { REACH } from './content.js';
export const CONTACT_DISTANCE = REACH;
export function atInteraction(s, x, y, z = s.player.z) {
  const p = s.player;
  if (!Number.isInteger(x) || !Number.isInteger(y) || p.z !== z) return false;
  const px = Math.floor(p.x),
    py = Math.floor(p.y),
    dx = Math.abs(px - x),
    dy = Math.abs(py - y);
  if (dx + dy > 1 || !TILE_INFO[tileAt(s.world, px, py, z)].walk) return false;
  return Math.hypot(p.x - x - 0.5, p.y - y - 0.5) <= CONTACT_DISTANCE;
}
// Constant-size, observed floor candidates. Routing decides which is reachable;
// never infer an access point from terrain behind fog.
export function interactionSites(s, x, y) {
  const z = s.player.z;
  if (!isExplored(s.world, x, y, z)) return [];
  const sites = [
    [x, y + 1],
    [x + 1, y],
    [x, y - 1],
    [x - 1, y]
  ];
  if (Math.floor(s.player.x) === x && Math.floor(s.player.y) === y) sites.push([x, y]);
  return sites
    .filter(([a, b]) => isExplored(s.world, a, b, z) && TILE_INFO[tileAt(s.world, a, b, z)].walk)
    .map(([x, y]) => ({ x, y }));
}
