/* localStorage persistence. Every access is guarded: private browsing and full
 * quotas throw, and the game must keep running regardless. */

import { serialize, deserialize, createState } from '../core/index.js';

const SAVE_KEY = 'more-than-enough-save';
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
export function loadGame() {
  const raw = read(SAVE_KEY);
  known = raw;
  if (!raw) return { state: createState(randomSeed()), lost: false };
  const state = deserialize(raw);
  return state ? { state, lost: false } : { state: createState(randomSeed()), lost: true };
}

// The viewer's zoom, drag direction, music choice and the tracks they have
// heard: conveniences for this browser, not game state.
export function loadView() {
  try {
    const v = JSON.parse(read(VIEW_KEY));
    return {
      zoom: Number(v.zoom) || 1,
      invertDrag: v.invertDrag === true,
      music: v.music !== false,
      heard: Array.isArray(v.heard) ? v.heard.filter((x) => typeof x === 'string') : [],
      quality: Number(v.quality) || 0
    };
  } catch {
    return { zoom: 1, invertDrag: false, music: true, heard: [], quality: 0 };
  }
}

export function saveView(view) {
  write(VIEW_KEY, JSON.stringify(view));
}
