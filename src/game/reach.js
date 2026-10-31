/* What a building reaches and helps (Watch, 2026-10-26): a Stoneworks
 * doubles the quarries near it, a depot collects from the producers near it,
 * a cooling tower cools what is near it, a conduit joins a chamber and a
 * vault. Shown only for the one building being placed, moved or whose card
 * is open: a soft area for how far it reaches, and a badge on each building
 * it helps (render/reach.js). The rules are the core's; this only asks them.
 *
 * A focus: { key } (a building from Core.EXTRACTORS) or { kind } (a
 * crystal-world facility), at { x, y, z }, with `building` the one standing
 * (or being moved), else null for a preview. Returns null for a building that
 * reaches nothing, else { r, shape: 'circle' | 'diamond', badge, targets }. */
import * as Core from '../core/index.js';

const COOLER_REACH = 3; // steps a cooling tower cools (core/cultivation.js)
const COOLED = ['chamber', 'vault', 'machine', 'shelter'];
const steps = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function reachOf(s, f) {
  if (Core.contentLocked(s, f.key || f.kind)) return null;
  const b = f.building || null,
    at = { x: f.x, y: f.y, z: f.z, owner: b ? b.owner : s.me || undefined };
  // Taken by another building already, for a preview: this one wouldn't help it.
  const free = (by) => !by || by === b;
  if (f.key === 'stoneworks') {
    const targets = Core.supportTargets(s, { ...at, key: 'stoneworks' }).filter((q) =>
      free(Core.supportingBuilding(s, q))
    );
    return {
      r: Core.EXTRACTORS.stoneworks.support.radius,
      shape: 'circle',
      badge: 'double',
      targets
    };
  }
  if (f.key === 'depot') {
    const targets = Core.depotTargets(s, at).filter((e) => e !== b && free(Core.depotFor(s, e)));
    return { r: Core.EXTRACTORS.depot.depot.radius, shape: 'circle', badge: 'collect', targets };
  }
  const c = s.cultivation;
  if (!c) return null;
  const others = c.facilities.filter((d) => d !== b && d.z === f.z);
  if (f.kind === 'cooler') {
    return {
      r: COOLER_REACH,
      shape: 'diamond',
      badge: 'cool',
      targets: others.filter((d) => COOLED.includes(d.kind) && steps(d, f) <= COOLER_REACH)
    };
  }
  if (f.kind === 'conduit') {
    // A conduit standing joins the two it was built for; a preview, the first
    // chamber and vault in reach, as building it would (core cultivation.js).
    const joined =
      b && !f.moved
        ? others.filter((d) => d.id === b.from || d.id === b.to)
        : [
            others.find((d) => d.kind === 'chamber' && steps(d, f) <= Core.CONDUIT_REACH),
            others.find((d) => d.kind === 'vault' && steps(d, f) <= Core.CONDUIT_REACH)
          ].filter(Boolean);
    return { r: Core.CONDUIT_REACH, shape: 'diamond', badge: 'link', targets: joined };
  }
  return null;
}
