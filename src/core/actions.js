/* What the player does to the world: harvest tiles, collect from extractors,
 * and build. Every action works on the player's own layer. */

import { SURFACE, tileDist2 } from './coords.js';
import { T, TILE_INFO } from './tiles.js';
import { tileAt, richness, setRichness, holeBelow, holeAbove } from './world.js';
import { EXTRACTORS, UNLOCKS, REACH, COLLECT_RANGE, FINDS } from './content.js';
import { canAfford, pay, costText, gatherYield, extractorCost } from './economy.js';

// Trail sweeps take tiles whose centre lies within this distance of the stroke.
export const SWEEP_RADIUS = 0.6;

const REACH2 = REACH * REACH;

/* ------------------------------------------------------------- harvest */

// A tile on the player's layer that has something to gather, near or far.
export function harvestable(s, x, y) {
  const z = s.player.z;
  return !!TILE_INFO[tileAt(s.world, x, y, z)].harvest &&
    richness(s.world, x, y, z) > 0 &&
    !holeBelow(s.world, x, y, z);
}

// A tile on the player's layer that Gather could work right now.
export function canHarvest(s, x, y) {
  return harvestable(s, x, y) && tileDist2(s.player, x, y, s.player.z) <= REACH2;
}

// Tiles within reach of the player, nearest first.
function tilesInReach(s) {
  const p = s.player, out = [];
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let y = cy - 2; y <= cy + 2; y++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      const d2 = tileDist2(p, x, y, p.z);
      if (d2 <= REACH2) out.push({ x, y, d2 });
    }
  }
  return out.sort((a, b) => a.d2 - b.d2);
}

// What holding Gather works on: the nearest deposit you can walk among. Solid
// rock is never auto-targeted; digging is always a deliberate choice.
export function harvestTarget(s) {
  for (const t of tilesInReach(s)) {
    const type = tileAt(s.world, t.x, t.y, s.player.z);
    if (!TILE_INFO[type].solid && canHarvest(s, t.x, t.y)) return { x: t.x, y: t.y, res: TILE_INFO[type].res };
  }
  return null;
}

// What digging out a find of `type` on layer z pays right now (see FINDS).
export function findLoot(s, type, z) {
  const layer = SURFACE - z, out = {};
  const loot = FINDS[type].loot;
  for (const r of Object.keys(loot)) out[r] = loot[r] * layer * gatherYield(s, r);
  return out;
}

// Works tile (x, y) once: richness drops by one and its resource (if any) goes
// into the packs. Solid tiles clear into their `cleared` type at zero, which is
// how tunnels are dug and shafts are opened; a find pays out its loot as
// `found` ({res: amount}). Returns null if out of reach.
export function harvestAt(s, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (!canHarvest(s, x, y)) return null;
  const z = s.player.z;
  const type = tileAt(s.world, x, y, z);
  setRichness(s.world, x, y, z, richness(s.world, x, y, z) - 1);
  const res = TILE_INFO[type].res || null;
  const amount = res ? gatherYield(s, res) : 0;
  if (res) {
    s.inv[res] += amount;
    s.stats[res] += amount;
  }
  // Mycelium also grows in spore beds deep underground; the first milestone wants a forest.
  if (type === T.FOREST) s.stats.foraged += amount;
  s.stats.gathers += 1;
  let found = null;
  if (TILE_INFO[type].find) {
    found = findLoot(s, type, z);
    for (const r of Object.keys(found)) {
      s.inv[r] += found[r];
      s.stats[r] += found[r];
    }
    s.stats.finds += 1;
  }
  return { x, y, z, type, res, amount, found, now: tileAt(s.world, x, y, z) };
}

export function harvest(s) {
  const t = harvestTarget(s);
  return t ? harvestAt(s, t.x, t.y) : null;
}

// Tiles a freehand Trail stroke (world-space points) would harvest: those in
// reach whose centre lies within SWEEP_RADIUS of the polyline.
export function sweepTargets(s, points) {
  if (!points.length) return [];
  const r2 = SWEEP_RADIUS * SWEEP_RADIUS;
  const crossed = (cx, cy) => {
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
      const sx = b.x - a.x, sy = b.y - a.y, len2 = sx * sx + sy * sy;
      const t = len2 ? Math.max(0, Math.min(1, ((cx - a.x) * sx + (cy - a.y) * sy) / len2)) : 0;
      const ox = cx - (a.x + t * sx), oy = cy - (a.y + t * sy);
      if (ox * ox + oy * oy <= r2) return true;
    }
    return false;
  };
  return tilesInReach(s)
    .filter((t) => canHarvest(s, t.x, t.y) && TILE_INFO[tileAt(s.world, t.x, t.y, s.player.z)].sweep !== false)
    .filter((t) => crossed(t.x + 0.5, t.y + 0.5))
    .map((t) => ({ x: t.x, y: t.y, res: TILE_INFO[tileAt(s.world, t.x, t.y, s.player.z)].res || null }));
}

/* ------------------------------------------------------------- collect */

export function collectTarget(s) {
  const range2 = COLLECT_RANGE * COLLECT_RANGE;
  const list = s.extractors.filter((e) => e.buffer >= 1 && tileDist2(s.player, e.x, e.y, e.z) <= range2);
  if (!list.length) return null;
  return { total: Math.floor(list.reduce((n, e) => n + e.buffer, 0)), list };
}

// Empties whole units from every extractor in range. Returns
// { gained: {res: amount}, sources: [{x, y, res, amt}] } or null.
export function collect(s) {
  const t = collectTarget(s);
  if (!t) return null;
  const gained = {}, sources = [];
  for (const e of t.list) {
    const amt = Math.floor(e.buffer);
    e.buffer -= amt;
    s.inv[e.res] += amt;
    s.stats[e.res] += amt;
    s.stats.collected += amt;
    gained[e.res] = (gained[e.res] || 0) + amt;
    sources.push({ x: e.x, y: e.y, res: e.res, amt });
  }
  return { gained, sources };
}

/* --------------------------------------------------------------- build */

export function extractorAt(s, x, y, z) {
  return s.extractors.find((e) => e.x === x && e.y === y && e.z === z) || null;
}

// A building never shares a tile with a way between layers: not on a hole in
// the floor, nor under one in the ceiling.
function buildableTile(s, def, x, y) {
  const z = s.player.z;
  const type = tileAt(s.world, x, y, z);
  const fits = def.tile === null ? !!TILE_INFO[type].land : type === def.tile;
  return fits && !extractorAt(s, x, y, z) && !holeBelow(s.world, x, y, z) && !holeAbove(s.world, x, y, z);
}

// The nearest free tile in reach where extractor `key` could stand.
export function buildTarget(s, key) {
  const def = EXTRACTORS[key];
  if (!def) return null;
  const t = tilesInReach(s).find((c) => buildableTile(s, def, c.x, c.y));
  return t ? { x: t.x, y: t.y } : null;
}

export function place(s, key) {
  const def = EXTRACTORS[key];
  if (!def) return { ok: false, reason: 'Unknown' };
  if (def.unlock && !s.unlocks[def.unlock]) return { ok: false, reason: 'Find the ' + UNLOCKS[def.unlock].name };
  const at = buildTarget(s, key);
  if (!at) return { ok: false, reason: 'Stand next to a suitable deposit' };
  const cost = extractorCost(s, key);
  if (!canAfford(s.inv, cost)) return { ok: false, reason: 'Need ' + costText(cost) };
  pay(s.inv, cost);
  s.extractors.push({ key, res: def.res, x: at.x, y: at.y, z: s.player.z, buffer: 0 });
  s.stats.built += 1;
  return { ok: true, x: at.x, y: at.y, cost };
}
