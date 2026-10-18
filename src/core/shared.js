/* A shared world: one world, several players, each with their own progress.
 * The room (server/) keeps the world and everyone's progress; this is how a
 * game state is split into those parts and put back together, and how the
 * world's changes from friends are applied. Pure, like the rest of the core:
 * the network lives in src/game/together.js. */

import { SURFACE, Z_MIN, unpackKey } from './coords.js';
import { putRichness, walkable } from './world.js';
import { EXTRACTORS, PROPS } from './content.js';
import { serialize, deserialize, SAVE_VERSION } from './save.js';
import { blankState } from './state.js';
import { RESOURCES } from './tiles.js';

// The world part of a state, as a room is made from it: the seed and every
// edit. Your buildings come along; the room marks them as yours.
export function worldOf(s) {
  return {
    seed: s.seed,
    mods: [...s.world.mods],
    props: [...s.world.props],
    ext: s.extractors.filter((e) => !e.owner || e.owner === s.me).map((e) => [e.key, e.x, e.y, e.z])
  };
}

// Your own part, as the room keeps it: everything in a save except the
// shared world and the map you've explored (that stays on this phone).
// Your buildings come along by kind and place, with their waiting output.
export function progressOf(s) {
  const d = JSON.parse(serialize(s));
  delete d.mods; delete d.props; delete d.explored; delete d.holes;
  d.extractors = d.extractors.filter((e) => e.o === s.me).map((e) => ({ k: e.k, x: e.x, y: e.y, z: e.z, b: e.b }));
  return JSON.stringify(d);
}

// The map you've explored in a shared world, kept on this phone.
export function fogOf(s) {
  return JSON.parse(serialize(s)).explored;
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// A playable state from what the room sent (its welcome) and the explored
// map this phone kept, or null if it doesn't make a world. A new player
// starts fresh, next to `near` if given (a friend, wherever they are).
export function joinState(welcome, room, fog, near, make = undefined) {
  let mine = {};
  if (typeof welcome.save === 'string') {
    try { mine = JSON.parse(welcome.save); } catch { mine = {}; }
    if (!isObj(mine)) mine = {};
  }
  const waiting = new Map((Array.isArray(mine.extractors) ? mine.extractors : [])
    .filter(isObj).map((e) => [e.x + ',' + e.y + ',' + e.z, e.b]));
  const d = {
    ...mine,
    v: SAVE_VERSION,
    seed: welcome.seed,
    mods: welcome.mods,
    props: welcome.props,
    holes: [],
    explored: Array.isArray(fog) ? fog : [],
    extractors: (Array.isArray(welcome.ext) ? welcome.ext : []).map((e) => ({
      k: e[0], x: e[1], y: e[2], z: e[3], o: e[4],
      b: e[4] === welcome.you ? waiting.get(e[1] + ',' + e[2] + ',' + e[3]) || 0 : 0
    }))
  };
  const s = deserialize(JSON.stringify(d), make);
  if (!s) return null;
  s.shared = room;
  s.me = welcome.you;
  if (!mine.player && near && near.z <= SURFACE && near.z >= Z_MIN) {
    s.player = beside(s.world, near, playersIn(welcome));
    s.underground.deepest = Math.min(s.underground.deepest, near.z);
  }
  s.world.edits = [];
  return s;
}

// Where a newcomer arrives: a step beside the friend they join, so the two
// are both seen, not one drawn over the other (on them if there's no room).
// `taken`: where everyone already in the world stands, so friends joining
// one after another each get a spot of their own, not one on top of another.
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
export function beside(w, p, taken = []) {
  const free = (x, y) => walkable(w, Math.floor(x), Math.floor(y), p.z);
  const clear = (x, y) => !taken.some((o) => o.z === p.z && Math.abs(o.x - x) < 0.75 && Math.abs(o.y - y) < 0.75);
  const spot = SIDES.find(([dx, dy]) => free(p.x + dx, p.y + dy) && clear(p.x + dx, p.y + dy)) ||
    SIDES.slice(0, 4).find(([dx, dy]) => free(p.x + dx, p.y + dy));
  return spot ? { x: p.x + spot[0], y: p.y + spot[1], z: p.z } : { x: p.x, y: p.y, z: p.z };
}

// Where the players in a welcome stand (its `players`, a Map or an object of
// {p: {x, y, z}}), for beside().
function playersIn(welcome) {
  const list = welcome.players instanceof Map ? [...welcome.players.values()] : isObj(welcome.players) ? Object.values(welcome.players) : [];
  return list.filter((f) => isObj(f) && isObj(f.p) && Number.isFinite(f.p.x) && Number.isFinite(f.p.y)).map((f) => f.p);
}

// Sets your progress straight from the room's numbers (`save`, the room's
// copy of your progress as of when your game sent it, with `sent` what the
// game had then: sentOf). What you have is the room's, plus what you got
// since; your levels, milestones and buildings are the room's, except what
// changed since it was sent (the room hasn't heard of that yet: it's on its
// way, and the room answers it on its own). False if it can't be read.
export function correctProgress(s, save, sent = null) {
  const r = deserialize(save, (seed) => blankState({ seed, mods: new Map(), explored: new Map(), holes: new Set(), props: new Map() }));
  if (!r) return false;
  for (const k of RESOURCES) {
    const since = sent && Number.isFinite(sent.inv?.[k]) ? s.inv[k] - sent.inv[k] : 0;
    s.inv[k] = Math.max(0, r.inv[k] + since);
  }
  const changed = (k) => !!sent && k in sent && JSON.stringify(s[k]) !== JSON.stringify(sent[k]);
  for (const k of LEVELS) if (!changed(k)) s[k] = r[k];
  if (!changed('goalIndex')) { s.goalsDone = r.goalsDone; s.goalIndex = r.goalIndex; }
  for (const k of ['sources', 'mushrooms', 'mushroomsEver', 'insight', 'totalEver']) s[k] = r[k];
  // Your buildings, where the room has them. A room before v0.106.0 left
  // out their kind: the one standing there in this game, then.
  const here = new Map(s.extractors.map((e) => [spotOf(e), e]));
  const theirs = new Map();
  for (const e of buildingsIn(save)) {
    const key = EXTRACTORS[e.k] ? e.k : here.get(spotOf(e))?.key;
    if (key && !theirs.has(spotOf(e))) theirs.set(spotOf(e), { key, res: EXTRACTORS[key].res, x: e.x, y: e.y, z: e.z, buffer: e.b, owner: s.me });
  }
  const had = sent && Array.isArray(sent.built) ? new Set(sent.built) : null;
  const since = had ? s.extractors.filter((e) => e.owner === s.me && !had.has(spotOf(e)) && !theirs.has(spotOf(e))) : [];
  s.extractors = [...s.extractors.filter((e) => e.owner !== s.me && !theirs.has(spotOf(e))), ...theirs.values(), ...since];
  return true;
}

// Levels the room sets straight (correctProgress), each counted by takenBack.
const LEVELS = ['tools', 'unlocks', 'resUp', 'perks', 'abundanceLv'];
const spotOf = (e) => e.x + ',' + e.y + ',' + e.z;

// The buildings in a save (JSON), as written: {k, x, y, z, b}.
function buildingsIn(save) {
  let d;
  try { d = JSON.parse(save); } catch { return []; }
  const isInt = Number.isSafeInteger;
  return (isObj(d) && Array.isArray(d.extractors) ? d.extractors : [])
    .filter((e) => isObj(e) && isInt(e.x) && isInt(e.y))
    .map((e) => ({ k: e.k, x: e.x, y: e.y, z: isInt(e.z) ? e.z : SURFACE, b: Number.isFinite(e.b) ? e.b : 0 }));
}

// What your game has that a correction from the room could change (and
// correctProgress keeps if it changed since): kept with each progress sent.
export function sentOf(s) {
  const out = { inv: { ...s.inv }, goalIndex: s.goalIndex, built: s.extractors.filter((e) => e.owner === s.me).map(spotOf) };
  for (const k of LEVELS) out[k] = JSON.parse(JSON.stringify(s[k] ?? null));
  return out;
}

// What a correction took back from what your game had (`was`, sentOf just
// before it): {buildings, levels, res: [resource]}, or null if nothing
// that counts. A little less of a resource is only timing, not worth a word.
export function takenBack(was, s) {
  const now = new Set(s.extractors.filter((e) => e.owner === s.me).map(spotOf));
  const buildings = was.built.filter((k) => !now.has(k)).length;
  let levels = (s.abundanceLv || 0) < (was.abundanceLv || 0) ? 1 : 0;
  for (const k of ['tools', 'unlocks', 'resUp', 'perks']) {
    for (const [id, lv] of Object.entries(was[k] || {})) if (Number(s[k]?.[id] || 0) < Number(lv || 0)) levels++;
  }
  const res = RESOURCES.filter((r) => (was.inv[r] || 0) - (s.inv[r] || 0) > Math.max(10, 0.05 * (was.inv[r] || 0)));
  return buildings || levels || res.length ? { buildings, levels, res } : null;
}

// Whether this phone's copy of your progress (`local`, a save) showed far
// more than the room's (`room`): resources more than twice over, or more
// buildings. Games before v0.91.1 could run away from the room's count, so
// arriving back says the room's numbers are the real ones.
export function overCounted(local, room) {
  const parse = (v) => { try { const d = JSON.parse(v); return isObj(d) ? d : null; } catch { return null; } };
  const a = parse(local), b = parse(room);
  if (!a || !b) return false;
  const total = (d) => RESOURCES.reduce((n, r) => n + (Number(d.inv?.[r]) > 0 ? Number(d.inv[r]) : 0), 0);
  const built = (d) => (Array.isArray(d.extractors) ? d.extractors.length : 0);
  return total(a) > 2 * total(b) + 1000 || built(a) > built(b) + 5;
}

// Applies world changes from the room (checked by src/net/protocol.js; kinds
// are checked against the game's own tables here). Your own changes come back
// too: in the room's order, so every phone ends with the same world.
export function applyEdits(s, edits) {
  const w = s.world;
  let changed = false;
  for (const e of edits) {
    if (e[0] === 'm') {
      const { x, y, z } = unpackKey(e[1]);
      putRichness(w, e[1], x, y, z, e[2]);
      changed = true;
    } else if (e[0] === 'p') {
      if (PROPS[e[2]] && !w.props.has(e[1])) { w.props.set(e[1], e[2]); changed = true; }
    } else if (e[0] === 'x') {
      const [, key, x, y, z, owner] = e;
      if (!EXTRACTORS[key] || s.extractors.some((b) => b.x === x && b.y === y && b.z === z)) continue;
      s.extractors.push({ key, res: EXTRACTORS[key].res, x, y, z, buffer: 0, owner });
      changed = true;
    }
  }
  return changed;
}

// The edits made since the last call, emptied.
export function takeEdits(s) {
  const w = s.world;
  if (!w.edits || !w.edits.length) return [];
  const out = w.edits;
  w.edits = [];
  return out;
}
