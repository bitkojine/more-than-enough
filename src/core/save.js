/* Save format. A save is the seed plus every player edit, so the world can be
 * regenerated exactly. While the game is in active development a save from
 * another format version is rejected (and the player told) and a new world
 * starts, with one exception: format 5 saves from before trees stopped being
 * cut are renamed into format 6 (see fromV5), so nobody loses a world to it. */

import { SURFACE, Z_MIN, unpackKey } from './coords.js';
import { isValidFogMask } from './world.js';
import { EXTRACTORS, TOOLS, REFINERIES, PROPS } from './content.js';
import { createState } from './state.js';

export const SAVE_VERSION = 6;

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
    extractors: s.extractors.map((e) => ({ k: e.key, x: e.x, y: e.y, z: e.z, b: +e.buffer.toFixed(2) })),
    stats: s.stats, discovered: s.discovered,
    goalIndex: s.goalIndex, time: s.time,
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

// Format 5 had wood instead of mycelium: the Axe, the Lumber Camp, the
// Sapling Grove, Silviculture and torches. Format 6 is the same save with
// those renamed to the Basket, the Mushroom Garden, the Compost Heap,
// Mycology and glowcaps; amounts and levels carry over one for one.
const V5_NAMES = { wood: 'mycelium', axe: 'basket', lumber: 'garden', sapling: 'compost', forestWood: 'foraged' };
const renamed = (o) => (o && typeof o === 'object' && !Array.isArray(o)
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [V5_NAMES[k] || k, v]))
  : o);
function fromV5(d) {
  const props = d.props || (d.torches || []).map((k) => [k, 'torch']);
  return {
    ...d,
    v: 6,
    inv: renamed(d.inv), tools: renamed(d.tools), unlocks: renamed(d.unlocks), resUp: renamed(d.resUp), stats: renamed(d.stats),
    props: props.map((p) => (Array.isArray(p) && p[1] === 'torch' ? [p[0], 'glowcap'] : p)),
    extractors: (d.extractors || []).map((e) => (e && V5_NAMES[e.k] ? { ...e, k: V5_NAMES[e.k] } : e))
  };
}

// Returns the restored state, or null if the save is unreadable or too old.
export function deserialize(str) {
  let d;
  try { d = JSON.parse(str); } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  if (d.v === 5) d = fromV5(d);
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
    deepest: Math.min(s.player.z, isInt(u.deepest) && u.deepest <= SURFACE && u.deepest >= Z_MIN ? u.deepest : SURFACE)
  };
  return s;
}
