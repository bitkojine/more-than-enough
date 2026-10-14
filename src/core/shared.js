/* A shared world: one world, several players, each with their own progress.
 * The room (server/) keeps the world and everyone's progress; this is how a
 * game state is split into those parts and put back together, and how the
 * world's changes from friends are applied. Pure, like the rest of the core:
 * the network lives in src/game/together.js. */

import { SURFACE, Z_MIN, unpackKey } from './coords.js';
import { putRichness } from './world.js';
import { EXTRACTORS, PROPS } from './content.js';
import { serialize, deserialize, SAVE_VERSION } from './save.js';

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
// Your buildings' waiting output comes along by place.
export function progressOf(s) {
  const d = JSON.parse(serialize(s));
  delete d.mods; delete d.props; delete d.explored; delete d.holes;
  d.extractors = d.extractors.filter((e) => e.o === s.me).map((e) => ({ x: e.x, y: e.y, z: e.z, b: e.b }));
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
export function joinState(welcome, room, fog, near) {
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
  const s = deserialize(JSON.stringify(d));
  if (!s) return null;
  s.shared = room;
  s.me = welcome.you;
  if (!mine.player && near && near.z <= SURFACE && near.z >= Z_MIN) {
    s.player = { x: near.x, y: near.y, z: near.z };
    s.underground.deepest = Math.min(s.underground.deepest, near.z);
  }
  s.world.edits = [];
  return s;
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
