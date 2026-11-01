/* The Perfect brain finding things (perfect.js): the nearest deposit of a
 * resource it has seen, the way into a cave, and a spot to put a building
 * that pays. Only what has been seen counts: fog stays fog. */

import { SURFACE } from './coords.js';
import { T, TILE_INFO } from './tiles.js';
import { tileAt, richness, isExplored, nearestExploredTile, holeBelow, wayUp } from './world.js';
import { EXTRACTORS } from './content.js';
import { depotFor, depotGain } from './logistics.js';
import { supportGain, ownBuilding } from './economy.js';
import { gearFor, extractorAt } from './actions.js';
import { SEARCH, key, dist, SURFACE_TYPES } from './perfect-util.js';

/* ------------------------------------------------------------- finding */

export const gearKey = (s) => s.tools.pickaxe + ',' + s.tools.basket + ',' + s.tools.boots;

// The nearest deposit of `res` you've seen on the surface and can work
// ({ tile }), or { gated: true } if all you've seen take a better tool.
// Remembered a while, and dropped once worked out or the tools change.
export function nearestDeposit(s, mind, res) {
  const seen = (x, y) =>
    isExplored(s.world, x, y, SURFACE) &&
    TILE_INFO[tileAt(s.world, x, y, SURFACE)].res === res &&
    harvestableOn(s, x, y) &&
    !mind.bad.has(key(x, y, SURFACE));
  const works = (x, y) => seen(x, y) && !gearOn(s, x, y);
  const c = mind.near[res];
  if (
    c &&
    c.gear === gearKey(s) &&
    s.time - c.t < 30 &&
    (!c.tile || works(c.tile.x, c.tile.y)) &&
    (!c.tile || dist(s, c.tile.x, c.tile.y) < 3 || s.time - c.t < 5)
  )
    return c;
  const minimum = reserveDeposit(s, SURFACE_TYPES[res]) ? 2 : 1;
  const tile = nearestExploredTile(
    s.world,
    s.player.x,
    s.player.y,
    SURFACE,
    SEARCH,
    works,
    null,
    SURFACE_TYPES[res],
    minimum
  );
  const out = {
    t: s.time,
    gear: gearKey(s),
    tile,
    gated:
      !tile &&
      !!nearestExploredTile(
        s.world,
        s.player.x,
        s.player.y,
        SURFACE,
        SEARCH,
        seen,
        null,
        SURFACE_TYPES[res],
        minimum
      )
  };
  mind.near[res] = out;
  return out;
}

// Static terrain-to-building rules; unlock eligibility remains live.
const depositBuildings = new Map();
for (const d of Object.values(EXTRACTORS)) {
  const list = depositBuildings.get(d.tile) || [];
  list.push(d);
  depositBuildings.set(d.tile, list);
}
const reserveDeposit = (s, type) =>
  depositBuildings.get(type)?.some((d) => !d.unlock || s.unlocks[d.unlock]);

// Surface checks that hold wherever the player is (harvestable and
// gearNeeded look at the player's own layer).
// A deposit a building you can put up stands on is never worked down to
// nothing: the last of it is left for the building.
function harvestableOn(s, x, y) {
  const type = tileAt(s.world, x, y, SURFACE);
  const keep = reserveDeposit(s, type);
  return (
    !!TILE_INFO[type].harvest &&
    !holeBelow(s.world, x, y, SURFACE) &&
    !extractorAt(s, x, y, SURFACE) &&
    richness(s.world, x, y, SURFACE) > (keep ? 1 : 0)
  );
}
function gearOn(s, x, y) {
  const g = gearFor(s, x, y, SURFACE);
  return !!g && s.tools[g.tool] < g.level;
}

// The nearest cave mouth you've seen: the way down into the mine.
export function caveMouth(s, mind) {
  // Remembered once seen; none seen yet is looked for again now and then.
  const c = mind.spots.cave;
  if (c && (c.tile ? !mind.bad.has(key(c.tile.x, c.tile.y, SURFACE)) : s.time - c.t < 120))
    return c.tile;
  const cave = nearestExploredTile(
    s.world,
    mind.home.x + 0.5,
    mind.home.y + 0.5,
    SURFACE,
    SEARCH,
    (x, y) =>
      isExplored(s.world, x, y, SURFACE) &&
      tileAt(s.world, x, y, SURFACE) === T.CAVE &&
      !mind.bad.has(key(x, y, SURFACE)),
    null,
    T.CAVE
  );
  mind.spots.cave = { t: s.time, tile: cave };
  return cave;
}

// Where building `id` would go: a deposit building on the free matching
// tile nearest home that you've seen with some of it left (an emptied one
// takes no building, and nothing grows back), else nearest you; a converter
// on free open land near home. Remembered while it stays free.
export function buildSpot(s, mind, id) {
  const def = EXTRACTORS[id];
  const which = def.support || def.depot ? id : def.tile === null ? 'land' : 'tile' + def.tile;
  const free = (x, y) =>
    isExplored(s.world, x, y, SURFACE) &&
    !mind.bad.has(key(x, y, SURFACE)) &&
    !extractorAt(s, x, y, SURFACE) &&
    !holeBelow(s.world, x, y, SURFACE) &&
    !wayUp(s.world, x, y, SURFACE) &&
    (def.tile === null
      ? !!TILE_INFO[tileAt(s.world, x, y, SURFACE)].land &&
        !TILE_INFO[tileAt(s.world, x, y, SURFACE)].harvest &&
        !(x === mind.home.x && y === mind.home.y)
      : tileAt(s.world, x, y, SURFACE) === def.tile && richness(s.world, x, y, SURFACE) > 0);
  if (def.support || def.depot) {
    const cached = mind.spots[which];
    if (
      cached &&
      cached.n === s.extractors.length &&
      s.time - cached.t < 120 &&
      (!cached.tile || free(cached.tile.x, cached.tile.y))
    )
      return cached.tile;
    let tile = null,
      gain = 0,
      distance = Infinity;
    const radius = (def.support || def.depot).radius;
    const seen = new Set();
    const coverageScores = def.depot ? new Map() : null;
    for (const q of s.extractors) {
      if (
        (def.depot
          ? EXTRACTORS[q.key].rate <= 0 || !!depotFor(s, q)
          : q.key !== def.support.target) ||
        q.z !== SURFACE ||
        !ownBuilding(s, q) ||
        !isExplored(s.world, q.x, q.y, SURFACE)
      )
        continue;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius ** 2) continue;
          const x = q.x + dx,
            y = q.y + dy,
            k = key(x, y, SURFACE);
          if (coverageScores) {
            const before = coverageScores.get(k);
            if (before) before.gain++;
            else coverageScores.set(k, { x, y, gain: 1 });
            continue;
          }
          if (seen.has(k)) continue;
          seen.add(k);
          if (!free(x, y)) continue;
          const g = def.depot
            ? depotGain(s, { x, y, z: SURFACE })
            : supportGain(s, { x, y, z: SURFACE });
          const d = (x - mind.home.x) ** 2 + (y - mind.home.y) ** 2;
          if (g > gain || (g === gain && g > 0 && d < distance)) {
            tile = { x, y };
            gain = g;
            distance = d;
          }
        }
    }
    if (coverageScores)
      for (const c of coverageScores.values()) {
        if (!free(c.x, c.y)) continue;
        const d = (c.x - mind.home.x) ** 2 + (c.y - mind.home.y) ** 2;
        if (c.gain > gain || (c.gain === gain && d < distance)) {
          tile = { x: c.x, y: c.y };
          gain = c.gain;
          distance = d;
        }
      }
    mind.spots[which] = { n: s.extractors.length, t: s.time, tile };
    return tile;
  }
  const c = mind.spots[which];
  if (c && (c.tile ? free(c.tile.x, c.tile.y) : s.time - c.t < 120)) return c.tile;
  const tile =
    nearestExploredTile(
      s.world,
      mind.home.x + 0.5,
      mind.home.y + 0.5,
      SURFACE,
      def.tile === null ? 30 : SEARCH,
      free,
      null,
      def.tile
    ) ||
    (def.tile === null
      ? null
      : nearestExploredTile(
          s.world,
          s.player.x,
          s.player.y,
          SURFACE,
          SEARCH,
          free,
          null,
          def.tile
        ));
  mind.spots[which] = { t: s.time, tile };
  return tile;
}
