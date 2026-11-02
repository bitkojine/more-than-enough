import { normalizeCarriedLight } from './light.js';
import { loadSpending, spendingSnapshot } from './spending.js';
/* Save format. A save is the seed plus every player edit, so the world can be
 * regenerated exactly. Every world is kept (format.js): a save from format
 * OLDEST_SAVE on loads and plays on (format 10 worlds were set aside by
 * v0.109.0's bump, the last one ever, and come back). Older ones were from
 * worlds already replaced, and a save from a newer game than this one is set
 * aside until the update arrives (src/game/storage.js). */

import { validCultivation, mendCultivation } from './cultivation-save.js';
import { economyForState } from './economy-context.js';
import { SURFACE, Z_MIN, unpackKey } from './coords.js';
import { isValidFogMask } from './world.js';
import { VersionedMap } from './versioned-map.js';
import { VersionedSet } from './versioned-set.js';
import { ExploredChunks } from './explored-index.js';
import { EXTRACTORS, TOOLS, REFINERIES, PROPS, FLARE_TIME } from './content.js';
import { MUSHROOMS } from './mushrooms.js';
import { createState } from './state.js';
import { GOALS, CULTIVATION_GOALS } from './goals.js';
import { WORLD_FORMAT } from './format.js';

// The room service knows it too (format.js).
export const SAVE_VERSION = WORLD_FORMAT;
export const OLDEST_SAVE = 10;

export function bytesToB64(u8) {
  let out = '';
  for (let i = 0; i < u8.length; i += 0x8000)
    out += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(out);
}

export function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function serialize(s) {
  economyForState(s)?.snapshot();
  return JSON.stringify({
    v: SAVE_VERSION,
    ...(s.cultivation ? { cultivation: s.cultivation } : {}),
    seed: s.seed,
    ...(s.logisticsModel ? { logisticsModel: s.logisticsModel } : {}),
    ...(s.emptyStart ? { emptyStart: true } : {}),
    mods: [...s.world.mods],
    explored: [...s.world.explored].map(([k, mask]) => [k, bytesToB64(mask)]),
    holes: [...s.world.holes],
    props: [...s.world.props],
    player: { x: +s.player.x.toFixed(3), y: +s.player.y.toFixed(3), z: s.player.z },
    inv: s.inv,
    tools: s.tools,
    unlocks: s.unlocks,
    resUp: s.resUp,
    abundanceLv: s.abundanceLv,
    insight: s.insight,
    prestiges: s.prestiges,
    totalEver: s.totalEver,
    perks: s.perks,
    extractors: s.extractors.map((e) => ({
      k: e.key,
      x: e.x,
      y: e.y,
      z: e.z,
      b: s.logisticsModel ? e.buffer : +e.buffer.toFixed(2),
      ...(e.owner ? { o: e.owner } : {})
    })),
    stats: s.stats,
    discovered: s.discovered,
    spending: spendingSnapshot(s.spending),
    sources: s.sources,
    mushrooms: s.mushrooms,
    mushroomsEver: s.mushroomsEver,
    goalIndex: s.goalIndex,
    goalsDone: s.goalsDone,
    time: s.time,
    battery: +s.battery.toFixed(4),
    ...(+s.flare.toFixed(2) > 0 ? { flare: +s.flare.toFixed(2) } : {}),
    ...(s.seen ? { seen: s.seen } : {}),
    underground: { deepest: s.underground.deepest }
  });
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
// A list read from a save, or none if it isn't one.
const list = (v) => (Array.isArray(v) ? v : []);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(v)));

// Copies numeric fields of `from` onto the matching keys of `into`.
function copyNumbers(into, from) {
  if (!from) return;
  for (const k in into) if (isNum(from[k])) into[k] = from[k];
}

// Returns the restored state, or null if the save is unreadable or too old.
// `make(seed)` makes the state it fills in (the room's copies use a cheap one).
// Each part is read on its own (below), mended where it can be: one bad
// field never refuses the whole save.
export function deserialize(str, make = createState) {
  try {
    return read(JSON.parse(str), make);
  } catch {
    // Damaged past what the readers mend: unreadable, so the game sets it
    // aside (storage.js loadGame) instead of failing to start.
    return null;
  }
}

function read(d, make) {
  if (!d || typeof d !== 'object') return null;
  if (!isInt(d.v) || d.v < OLDEST_SAVE || d.v > SAVE_VERSION || !isNum(d.seed)) return null;
  if (d.logisticsModel && d.logisticsModel !== 'depot-v1') return null;

  const s = make(d.seed);
  s.emptyStart = d.emptyStart === true;
  if (d.logisticsModel) s.logisticsModel = d.logisticsModel;
  if (d.cultivation && !readCultivation(s, d.cultivation)) return null;
  readLand(s.world, d);
  readPlayer(s, d.player);
  readKit(s, d);
  readProgress(s, d);
  readLight(s, d);
  readGoals(s, d);
  s.extractors = readExtractors(d.extractors);
  s.underground = { deepest: Math.min(s.player.z, deepestOf(d.underground)) };
  return s;
}

// The deepest layer you've been to.
function deepestOf(u) {
  const z = u?.deepest;
  return isInt(z) && z <= SURFACE && z >= Z_MIN ? z : SURFACE;
}

// Mended, never refused for one bad field (cultivation-save.js); false if
// even that can't make it whole.
function readCultivation(s, raw) {
  const c = mendCultivation(raw);
  if (!c || !validCultivation(c)) return false;
  s.cultivation = c;
  s.world.cultivation = true;
  s.world.chunks.clear();
  s.world.hotKey = -1;
  s.world.hotChunk = null;
  return true;
}

// What was done to the land: mined tiles, fog lifted, holes and props.
function readLand(w, d) {
  w.mods = new VersionedMap(
    list(d.mods).filter((e) => Array.isArray(e) && isInt(e[0]) && isInt(e[1]) && e[1] >= 0)
  );
  w.explored = new ExploredChunks();
  for (const e of list(d.explored)) {
    try {
      const [k, b64] = e;
      const mask = b64ToBytes(b64);
      if (isInt(k) && isValidFogMask(mask)) w.explored.set(k, mask);
    } catch {
      /* skip a corrupt mask */
    }
  }
  const holeLayerOk = (k) => {
    const z = unpackKey(k).z;
    return z <= SURFACE && z > Z_MIN;
  };
  w.holes = new VersionedSet(list(d.holes).filter((k) => isInt(k) && holeLayerOk(k)));
  // Tunnel props in the mine, water power on the surface.
  const propOk = ([k, kind]) =>
    isInt(k) &&
    Object.hasOwn(PROPS, kind) &&
    (PROPS[kind].on === 'tunnel'
      ? unpackKey(k).z < SURFACE && unpackKey(k).z >= Z_MIN
      : unpackKey(k).z === SURFACE);
  w.props = new VersionedMap(list(d.props).filter((p) => Array.isArray(p) && propOk(p)));
}

function readPlayer(s, p) {
  if (!p || !isNum(p.x) || !isNum(p.y)) return;
  s.player = {
    x: p.x,
    y: p.y,
    z: isInt(p.z) && p.z <= SURFACE && p.z >= Z_MIN ? p.z : SURFACE
  };
}

// What you carry and own: packs, tools, refinery levels, perks.
function readKit(s, d) {
  copyNumbers(s.inv, d.inv);
  // Missing old fields mean legacy basic equipment, not a new empty start.
  const least = s.emptyStart ? 0 : 1;
  for (const k in s.tools) s.tools[k] = least;
  copyNumbers(s.tools, d.tools);
  copyNumbers(s.resUp, d.resUp);
  // Levels index content tables, so keep them inside those tables.
  for (const k in s.tools) s.tools[k] = clampInt(s.tools[k], least, TOOLS[k].levels.length);
  for (const k in s.resUp) s.resUp[k] = clampInt(s.resUp[k], 0, REFINERIES[k].levels.length);
  copyNumbers(s.perks, d.perks);
}

// Records and running totals: stats, mushrooms, unlocks, spending.
function readProgress(s, d) {
  copyNumbers(s.stats, d.stats);
  for (const r in s.sources) copyNumbers(s.sources[r], d.sources && d.sources[r]);
  for (const k in d.mushrooms || {})
    if (MUSHROOMS[k] && isNum(d.mushrooms[k])) s.mushrooms[k] = d.mushrooms[k];
  s.mushroomsEver = Array.isArray(d.mushroomsEver)
    ? d.mushroomsEver.filter((k, i, all) => MUSHROOMS[k] && all.indexOf(k) === i)
    : [];
  for (const k in s.unlocks) s.unlocks[k] = !!(d.unlocks && d.unlocks[k]);
  for (const k of ['abundanceLv', 'insight', 'prestiges', 'totalEver', 'goalIndex', 'time', 'seen'])
    if (isNum(d[k])) s[k] = d[k];
  loadSpending(s, d.spending);
  s.discovered = {
    ore: !!(d.discovered && d.discovered.ore),
    crystal: !!(d.discovered && d.discovered.crystal)
  };
}

// The light in your hand: the lantern's charge and a burning flare.
function readLight(s, d) {
  if (isNum(d.battery)) s.battery = Math.max(0, Math.min(1, d.battery)); // a save from before it: full
  if (isNum(d.flare)) s.flare = Math.max(0, Math.min(FLARE_TIME, d.flare)); // the flare in your hand, still burning
  normalizeCarriedLight(s);
}

// Milestones reached; a save from before they counted in any order has
// only how many, which were the first ones listed.
function readGoals(s, d) {
  const goalIds = (s.cultivation ? CULTIVATION_GOALS : GOALS).map((g) => g.id);
  s.goalsDone = Array.isArray(d.goalsDone)
    ? d.goalsDone.filter((id, i, all) => goalIds.includes(id) && all.indexOf(id) === i)
    : goalIds.slice(0, clampInt(isNum(s.goalIndex) ? s.goalIndex : 0, 0, goalIds.length));
  if (s.cultivation && !s.cultivation.completed && s.goalsDone.includes('master')) {
    s.goalsDone = s.goalsDone.filter((id) => id !== 'master');
    if (s.cultivation.restored && !s.goalsDone.includes('cultivationRepair'))
      s.goalsDone.push('cultivationRepair');
  }
  s.goalIndex = s.goalsDone.length;
}

function readExtractors(raw) {
  return list(raw)
    .filter((e) => e && EXTRACTORS[e.k] && isInt(e.x) && isInt(e.y))
    .map((e) => ({
      key: e.k,
      res: EXTRACTORS[e.k].res,
      x: e.x,
      y: e.y,
      z: isInt(e.z) ? e.z : SURFACE,
      buffer: isNum(e.b) ? e.b : 0,
      ...(typeof e.o === 'string' && /^[0-9a-f]{16}$/.test(e.o) ? { owner: e.o } : {})
    }));
}
