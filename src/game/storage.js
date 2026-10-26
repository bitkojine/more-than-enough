/* localStorage persistence. Every access is guarded: private browsing and full
 * quotas throw, and the game must keep running regardless. */

import { serialize, deserialize, createState, SAVE_VERSION, OLDEST_SAVE } from '../core/index.js';

const SAVE_KEY = 'more-than-enough-save';
// A save this version couldn't read, set aside rather than written over.
const ASIDE_KEY = 'more-than-enough-save-aside';
function freshWorld() { return createState(randomSeed(),{cultivation:true}); }
const VIEW_KEY = 'more-than-enough-view';
const ARCHIVE_PREFIX = 'mte.solo.world.'; // every solo world's own copy, by seed
// Saves set aside by loadGame when a world's own copy took over (one per seed,
// so a set-aside save is never written over by another).
const KEPT_PREFIX = 'mte.solo.kept.';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// Returns the error if the write failed (full quota, storage blocked), else null.
function write(key, value) {
  try { localStorage.setItem(key, value); return null; } catch (err) { return err; }
}

export function randomSeed() {
  for(let i=0;i<100;i++){
    const seed=(Math.random()*4294967295)>>>0;
    if(!read(ARCHIVE_PREFIX+seed)&&!read('mte.depot-v1.world.'+seed))return seed;
  }
  throw new Error('No unused world seed'); // i18n-ok: diagnostic

}

// The save as this tab last read or wrote it. If what's stored differs, another
// tab has saved since: writing now would throw that tab's progress away.
let known = null;

// What another tab saved since this tab last read or wrote, or null if the
// save is still this tab's.
export function savedElsewhere() {
  const cur = read(SAVE_KEY);
  return cur !== null && cur !== known ? cur : null;
}

// Saves, unless another tab has saved since (then nothing is written and
// `conflict` holds that tab's save). `force` writes regardless.
// Returns null when saved, { conflict } or { error }.
export function saveGame(state, force = false) {
  if (state.cultivation&&state.shared) return {error:new Error('Save slot mismatch')}; // i18n-ok: storage diagnostic
  if (!force) {
    const other = savedElsewhere();
    if (other) return { conflict: other };
  }
  const raw = serialize(state);
  // The save itself first: nothing else may stand in its way.
  const err = write(SAVE_KEY, raw);
  if (err) return { error: err };
  known = raw;
  // Then this world's own copy, so it is still there after starting or
  // switching to another world (Nerds, Embark). A full storage can stop the
  // copy but never the save; the error says so, and leaving the world waits
  // until a copy is kept (main.js keep).
  const copy = write(ARCHIVE_PREFIX + state.seed, raw);
  return copy ? { error: copy } : null;
}

// Takes another tab's save as this tab's own. Returns its state, or null if
// this version of the game can't read it.
export function adopt(raw) {
  const state = deserialize(raw);
  if (state) known = raw;
  return state;
}

// Calls `fn` when another tab saves.
export function onSavedElsewhere(fn) {
  window.addEventListener('storage', (e) => {
    if (e.key === SAVE_KEY && e.newValue !== null && e.newValue !== known) fn();
  });
}

// Loads the saved game, or starts a new world. `lost` says why a save that
// existed could not be read, so the player can be told: 'format' (made by
// another version of the game: a newer one, or one from before the
// oldest format kept) or 'broken'; false when nothing was lost.
// A save that can't be read is set aside, never just written over: one this
// version can read is taken back instead (an old cached page right after an
// update set the new game's save aside, or a later fix reads it again), and
// so is one played further than the save in use (v0.109.0, the last format
// change ever, set format 10 worlds aside and started new ones): every
// world is kept (src/core/format.js).
export function loadGame() {
  const raw = read(SAVE_KEY);
  known = raw;
  const aside = read(ASIDE_KEY);
  const back = aside && deserialize(aside);
  let state = raw && deserialize(raw);
  if(state&&!state.cultivation){
    const archived=read(ARCHIVE_PREFIX+state.seed),saved=archived&&deserialize(archived);
    // The world's own copy took over: what was in use is kept under its own
    // name, never over the one save already set aside.
    if (saved?.cultivation && !write(KEPT_PREFIX + state.seed + '.' + Date.now(), raw)) {
      state = saved;
      if (!write(SAVE_KEY, archived)) known = archived;
    }
  }
  if (state && !(back && further(back, state))) return { state, lost: false };
  if (back) {
    // Back in use first, then the other set aside: closing the game in
    // between loses neither.
    if (!write(SAVE_KEY, aside)) { known = aside; write(ASIDE_KEY, raw ?? ''); }
    return { state: back, lost: false };
  }
  if (!raw) return { state: freshWorld(), lost: false };
  // One already set aside (unreadable too, or it would be in use) keeps its
  // own name before this one takes the slot.
  if (aside && aside !== raw) write(KEPT_PREFIX + 'aside.' + Date.now(), aside);
  write(ASIDE_KEY, raw);
  return { state: freshWorld(), lost: formatOf(raw) === null ? 'broken' : 'format' };
}

// Whether world `a` has been played further than `b`: more Embarks (each
// starts the play clock again), else more time played.
function further(a, b) {
  return a.prestiges !== b.prestiges ? a.prestiges > b.prestiges : a.stats.playedMs > b.stats.playedMs;
}

// The format version a save says it has, or null if it doesn't say one.
function formatOf(raw) {
  try {
    const v = JSON.parse(raw)?.v;
    return Number.isInteger(v) && (v > SAVE_VERSION || v < OLDEST_SAVE) ? v : null;
  } catch { return null; }
}

// The viewer's zoom, drag direction, music choice, the tracks they have
// heard, quality level, whether they know to hold Gather, what Wiki has
// told them (src/game/wiki-memory.js), whether the message log is open, and
// whether time away makes anything
// (freeze season defaults it off): conveniences for this browser, not game state.
export function loadView() {
  try {
    const v = JSON.parse(read(VIEW_KEY));
    return {
      zoom: Number(v.zoom) || 1,
      invertDrag: v.invertDrag === true,
      music: v.music !== false,
      heard: Array.isArray(v.heard) ? v.heard.filter((x) => typeof x === 'string') : [],
      quality: Number(v.quality) || 0,
      holdTip: v.holdTip === true,
      awayProduce: v.awayProduce === true,
      showAuto: v.showAuto === true,
      wiki: v.wiki && typeof v.wiki === 'object' ? v.wiki : null,
      logOpen: v.logOpen !== false
    };
  } catch {
    return { zoom: 1, invertDrag: false, music: true, heard: [], quality: 0, holdTip: false, awayProduce: false, showAuto: false, wiki: null, logOpen: true };
  }
}

export function saveView(view) {
  write(VIEW_KEY, JSON.stringify(view));
}

// Every solo world kept on this device, one per seed, the one in play
// included: none is ever dropped (AGENTS.md, "No world is ever lost"). Its
// own copy wins over older depot keys from before v0.141 (still read, never
// written). `state` is null for a copy this version can't read.
function soloRaws() {
  const bySeed = new Map();
  const take = (raw) => {
    try { const seed = JSON.parse(raw)?.seed; if (Number.isInteger(seed) && !bySeed.has(seed)) bySeed.set(seed, raw); } catch { /* not a save */ }
  };
  let keys = [];
  try { keys = Object.keys(localStorage); } catch { /* storage blocked */ }
  const save = read(SAVE_KEY);
  if (save) take(save);
  for (const prefix of [ARCHIVE_PREFIX, 'mte.depot-v1.world.']) for (const k of keys) if (k.startsWith(prefix)) take(read(k));
  if (keys.includes('mte.depot-v1.save')) take(read('mte.depot-v1.save'));
  return bySeed;
}

// The solo worlds to list, last played first: { seed, state }.
export function soloWorlds() {
  return [...soloRaws()].map(([seed, raw]) => ({ seed, state: deserialize(raw) }))
    .filter((w) => w.state && !w.state.shared)
    .sort((a, b) => (b.state.seen || 0) - (a.state.seen || 0));
}

// The seeds of every solo world's own copy, without reading each one.
export function soloSeeds() {
  const seeds = new Set();
  try {
    for (const k of Object.keys(localStorage)) {
      const m = /^(?:mte\.solo\.world\.|mte\.depot-v1\.world\.)(\d+)$/.exec(k);
      if (m) seeds.add(Number(m[1]));
    }
  } catch { /* storage blocked */ }
  return [...seeds];
}

// How many solo worlds there are, without reading each one.
export function soloCount() {
  return Math.max(soloSeeds().length, read(SAVE_KEY) ? 1 : 0);
}

// One solo world by seed, read fresh, or null.
export function soloWorld(seed) {
  const raw = soloRaws().get(seed);
  return raw ? deserialize(raw) : null;
}

export function newSoloWorld(){return freshWorld();}

// This device's own copy of solo world `seed`, or null (sync.js).
export function archivedSave(seed) {
  return read(ARCHIVE_PREFIX + seed) ?? read('mte.depot-v1.world.' + seed);
}

// Keeps a solo world from your other device (sync.js) as this device's
// copy of it, to play from Worlds: never the one in play, which goes
// through saveGame.
export function keepCopy(seed, raw) {
  write(ARCHIVE_PREFIX + seed, raw);
}

// Keeps a copy of world `seed` that's about to be replaced by another
// device's (sync.js), under its own name: never written over, never deleted.
export function keepAside(seed, raw) {
  write(KEPT_PREFIX + seed + '.' + Date.now(), raw);
}
