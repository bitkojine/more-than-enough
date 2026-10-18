/* localStorage persistence. Every access is guarded: private browsing and full
 * quotas throw, and the game must keep running regardless. */

import { serialize, deserialize, createState } from '../core/index.js';

const SAVE_KEY = 'more-than-enough-save';
// A save this version couldn't read, set aside rather than written over.
const ASIDE_KEY = 'more-than-enough-save-aside';
const VIEW_KEY = 'more-than-enough-view';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// Returns the error if the write failed (full quota, storage blocked), else null.
function write(key, value) {
  try { localStorage.setItem(key, value); return null; } catch (err) { return err; }
}

export function randomSeed() {
  return (Math.random() * 4294967295) >>> 0;
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
  if (!force) {
    const other = savedElsewhere();
    if (other) return { conflict: other };
  }
  const raw = serialize(state);
  const err = write(SAVE_KEY, raw);
  if (err) return { error: err };
  known = raw;
  return null;
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

// Loads the saved game, or starts a new world. `lost` is true when a save
// existed but could not be read, so the player can be told.
// A save that can't be read is set aside, never just written over: one this
// version can read is taken back instead (an old cached page right after an
// update set the new game's save aside, or a later fix reads it again).
export function loadGame() {
  const raw = read(SAVE_KEY);
  known = raw;
  if (!raw) return { state: createState(randomSeed()), lost: false };
  const state = deserialize(raw);
  if (state) return { state, lost: false };
  const aside = read(ASIDE_KEY);
  const back = aside && deserialize(aside);
  write(ASIDE_KEY, raw);
  if (back) return { state: back, lost: false };
  return { state: createState(randomSeed()), lost: true };
}

// The viewer's zoom, drag direction, music choice, the tracks they have
// heard, quality level and whether they know to hold Gather: conveniences for this browser, not game state.
export function loadView() {
  try {
    const v = JSON.parse(read(VIEW_KEY));
    return {
      zoom: Number(v.zoom) || 1,
      invertDrag: v.invertDrag === true,
      music: v.music !== false,
      heard: Array.isArray(v.heard) ? v.heard.filter((x) => typeof x === 'string') : [],
      quality: Number(v.quality) || 0,
      holdTip: v.holdTip === true
    };
  } catch {
    return { zoom: 1, invertDrag: false, music: true, heard: [], quality: 0, holdTip: false };
  }
}

export function saveView(view) {
  write(VIEW_KEY, JSON.stringify(view));
}
