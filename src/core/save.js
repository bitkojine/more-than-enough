/* Save format. A save is the seed plus every player edit, so the world can be
 * regenerated exactly. Version 3 saves (the 2D era) are migrated on load. */

import { SURFACE, Z_MIN, liftSurfaceKey } from './coords.js';
import { isValidFogMask } from './world.js';
import { EXTRACTORS, TOOLS, REFINERIES } from './content.js';
import { createState } from './state.js';

export const SAVE_VERSION = 4;

export function bytesToB64(u8) {
  let out = '';
  for (let i = 0; i < u8.length; i += 0x8000) out += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(out);
}

export function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function serialize(s) {
  return JSON.stringify({
    v: SAVE_VERSION,
    seed: s.seed,
    mods: [...s.world.mods],
    explored: [...s.world.explored].map(([k, mask]) => [k, bytesToB64(mask)]),
    player: { x: +s.player.x.toFixed(3), y: +s.player.y.toFixed(3), z: s.player.z },
    inv: s.inv, tools: s.tools, unlocks: s.unlocks, resUp: s.resUp,
    abundanceLv: s.abundanceLv, insight: s.insight, prestiges: s.prestiges, totalEver: s.totalEver,
    perks: s.perks,
    extractors: s.extractors.map((e) => ({ k: e.key, x: e.x, y: e.y, z: e.z, b: +e.buffer.toFixed(2) })),
    stats: s.stats, discovered: s.discovered,
    goalIndex: s.goalIndex, time: s.time,
    underground: s.underground
  });
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(v)));

// Copies numeric fields of `from` onto the matching keys of `into`.
function copyNumbers(into, from) {
  if (!from) return;
  for (const k in into) if (isNum(from[k])) into[k] = from[k];
}

// v3 -> v4: keys gain a z component, the mine becomes real layers under the
// forest, perks become levels and the Abundance flag is derived from its level.
// The old mine was a pocket with its own coordinates, so its tunnels can't be
// placed in the new world; the player returns to the forest spot they entered from.
function migrateV3(d) {
  const lift = (pairs) => (Array.isArray(pairs) ? pairs.map(([k, v]) => [liftSurfaceKey(k), v]) : []);
  const mine = d.mine || {};
  const surface = mine.active && mine.surface ? mine.surface : d.player;
  const perks = {};
  for (const k in d.perks || {}) perks[k] = Number(d.perks[k]) || 0;
  return {
    ...d,
    v: 4,
    mods: lift(d.mods),
    explored: lift(d.explored),
    player: surface && { x: surface.x, y: surface.y, z: SURFACE },
    perks,
    extractors: (d.extractors || []).map((e) => ({ ...e, z: SURFACE })),
    underground: { deepest: SURFACE - 1 - Math.max(0, Math.floor(mine.depth || 0)), entry: null }
  };
}

const MIGRATIONS = { 3: migrateV3 };

// Returns the restored state, or null if the save is unreadable or too old.
export function deserialize(str) {
  let d;
  try { d = JSON.parse(str); } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  while (MIGRATIONS[d.v]) d = MIGRATIONS[d.v](d);
  if (d.v !== SAVE_VERSION || !isNum(d.seed)) return null;

  const s = createState(d.seed);
  const w = s.world;
  w.mods = new Map((d.mods || []).filter(([k, v]) => isInt(k) && isInt(v) && v >= 0));
  w.explored = new Map();
  for (const [k, b64] of d.explored || []) {
    try {
      const mask = b64ToBytes(b64);
      if (isInt(k) && isValidFogMask(mask)) w.explored.set(k, mask);
    } catch { /* skip a corrupt mask */ }
  }

  if (d.player && isNum(d.player.x) && isNum(d.player.y)) {
    s.player = { x: d.player.x, y: d.player.y, z: isInt(d.player.z) && d.player.z <= SURFACE && d.player.z >= Z_MIN ? d.player.z : SURFACE };
  }
  copyNumbers(s.inv, d.inv);
  copyNumbers(s.tools, d.tools);
  copyNumbers(s.resUp, d.resUp);
  // Levels index content tables, so keep them inside those tables.
  for (const k in s.tools) s.tools[k] = clampInt(s.tools[k], 1, TOOLS[k].levels.length);
  for (const k in s.resUp) s.resUp[k] = clampInt(s.resUp[k], 0, REFINERIES[k].levels.length);
  copyNumbers(s.perks, d.perks);
  copyNumbers(s.stats, d.stats);
  for (const k in s.unlocks) s.unlocks[k] = !!(d.unlocks && d.unlocks[k]);
  for (const k of ['abundanceLv', 'insight', 'prestiges', 'totalEver', 'goalIndex', 'time']) {
    if (isNum(d[k])) s[k] = d[k];
  }
  s.discovered = { ore: !!(d.discovered && d.discovered.ore), crystal: !!(d.discovered && d.discovered.crystal) };
  s.extractors = (d.extractors || [])
    .filter((e) => e && EXTRACTORS[e.k] && isInt(e.x) && isInt(e.y))
    .map((e) => ({ key: e.k, res: EXTRACTORS[e.k].res, x: e.x, y: e.y, z: isInt(e.z) ? e.z : SURFACE, buffer: isNum(e.b) ? e.b : 0 }));

  const u = d.underground || {};
  s.underground = {
    deepest: isInt(u.deepest) && u.deepest < SURFACE && u.deepest >= Z_MIN ? u.deepest : SURFACE - 1,
    entry: u.entry && isNum(u.entry.x) && isNum(u.entry.y) ? { x: u.entry.x, y: u.entry.y } : null
  };
  if (s.player.z < SURFACE && !s.underground.entry) s.underground.entry = { x: s.player.x, y: s.player.y };
  return s;
}
