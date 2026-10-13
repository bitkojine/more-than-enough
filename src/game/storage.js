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

function remove(key) {
  try { localStorage.removeItem(key); } catch { /* private mode */ }
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

// The viewer's zoom, tilt and whether the performance panel is open: a
// convenience for this browser, not game state.
export function loadView() {
  try {
    const v = JSON.parse(read(VIEW_KEY));
    return { zoom: Number(v.zoom) || 1, tilt: Number(v.tilt) || 0, perf: v.perf === true };
  } catch {
    return { zoom: 1, tilt: 0, perf: false };
  }
}

export function saveView(cam, perf) {
  write(VIEW_KEY, JSON.stringify({ zoom: cam.zoom, tilt: cam.tiltTarget, perf: perf.visible }));
}

export function clearSave() {
  remove(SAVE_KEY);
  known = null;
}
