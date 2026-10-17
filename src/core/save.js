/* Save format. A save is the seed plus every player edit, so the world can be
 * regenerated exactly. While the game is in active development a save from
 * another format version is rejected (and the player told) and a new world
 * starts. Formats 7 to 9 changed what land a seed grows (scarce, clustered
 * resources; regions; walls and hedges; bigger regions), so older worlds don't carry over. */

import { SURFACE, Z_MIN, unpackKey } from './coords.js';
import { isValidFogMask } from './world.js';
import { EXTRACTORS, TOOLS, REFINERIES, PROPS } from './content.js';
import { MUSHROOMS } from './mushrooms.js';
import { createState } from './state.js';
import { GOALS } from './goals.js';
import { WORLD_FORMAT } from './format.js';

// The room service knows it too (format.js).
export const SAVE_VERSION = WORLD_FORMAT;

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
    holes: [...s.world.holes],
    props: [...s.world.props],
    player: { x: +s.player.x.toFixed(3), y: +s.player.y.toFixed(3), z: s.player.z },
    inv: s.inv, tools: s.tools, unlocks: s.unlocks, resUp: s.resUp,
    abundanceLv: s.abundanceLv, insight: s.insight, prestiges: s.prestiges, totalEver: s.totalEver,
    perks: s.perks,
    extractors: s.extractors.map((e) => ({ k: e.key, x: e.x, y: e.y, z: e.z, b: +e.buffer.toFixed(2), ...(e.owner ? { o: e.owner } : {}) })),
    stats: s.stats, discovered: s.discovered,
    sources: s.sources, mushrooms: s.mushrooms, mushroomsEver: s.mushroomsEver,
    goalIndex: s.goalIndex, goalsDone: s.goalsDone, time: s.time, ...(s.seen ? { seen: s.seen } : {}),
    underground: { deepest: s.underground.deepest }
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

// Returns the restored state, or null if the save is unreadable or too old.
// `make(seed)` makes the state it fills in (the room's copies use a cheap one).
export function deserialize(str, make = createState) {
  let d;
  try { d = JSON.parse(str); } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  if (d.v !== SAVE_VERSION || !isNum(d.seed)) return null;

  const s = make(d.seed);
  const w = s.world;
  w.mods = new Map((d.mods || []).filter(([k, v]) => isInt(k) && isInt(v) && v >= 0));
  w.explored = new Map();
  for (const [k, b64] of d.explored || []) {
    try {
      const mask = b64ToBytes(b64);
      if (isInt(k) && isValidFogMask(mask)) w.explored.set(k, mask);
    } catch { /* skip a corrupt mask */ }
  }
  const holeLayerOk = (k) => { const z = unpackKey(k).z; return z <= SURFACE && z > Z_MIN; };
  w.holes = new Set((d.holes || []).filter((k) => isInt(k) && holeLayerOk(k)));
  const propOk = ([k, kind]) => isInt(k) && PROPS[kind] && unpackKey(k).z < SURFACE && unpackKey(k).z >= Z_MIN;
  w.props = new Map((d.props || []).filter((p) => Array.isArray(p) && propOk(p)));

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
  for (const r in s.sources) copyNumbers(s.sources[r], d.sources && d.sources[r]);
  for (const k in d.mushrooms || {}) if (MUSHROOMS[k] && isNum(d.mushrooms[k])) s.mushrooms[k] = d.mushrooms[k];
  s.mushroomsEver = Array.isArray(d.mushroomsEver) ? d.mushroomsEver.filter((k, i, all) => MUSHROOMS[k] && all.indexOf(k) === i) : [];
  for (const k in s.unlocks) s.unlocks[k] = !!(d.unlocks && d.unlocks[k]);
  for (const k of ['abundanceLv', 'insight', 'prestiges', 'totalEver', 'goalIndex', 'time', 'seen']) {
    if (isNum(d[k])) s[k] = d[k];
  }
  // Milestones reached; a save from before they counted in any order has
  // only how many, which were the first ones listed.
  const goalIds = GOALS.map((g) => g.id);
  s.goalsDone = Array.isArray(d.goalsDone)
    ? d.goalsDone.filter((id, i, all) => goalIds.includes(id) && all.indexOf(id) === i)
    : goalIds.slice(0, clampInt(isNum(s.goalIndex) ? s.goalIndex : 0, 0, goalIds.length));
  s.goalIndex = s.goalsDone.length;
  s.discovered = { ore: !!(d.discovered && d.discovered.ore), crystal: !!(d.discovered && d.discovered.crystal) };
  s.extractors = (d.extractors || [])
    .filter((e) => e && EXTRACTORS[e.k] && isInt(e.x) && isInt(e.y))
    .map((e) => ({
      key: e.k, res: EXTRACTORS[e.k].res, x: e.x, y: e.y, z: isInt(e.z) ? e.z : SURFACE, buffer: isNum(e.b) ? e.b : 0,
      ...(typeof e.o === 'string' && /^[0-9a-f]{16}$/.test(e.o) ? { owner: e.o } : {})
    }));

  const u = d.underground || {};
  s.underground = {
    deepest: Math.min(s.player.z, isInt(u.deepest) && u.deepest <= SURFACE && u.deepest >= Z_MIN ? u.deepest : SURFACE)
  };
  return s;
}
