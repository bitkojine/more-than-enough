/* localStorage persistence. Every access is guarded: private browsing and full
 * quotas throw, and the game must keep running regardless. */

import { serialize, deserialize, createState } from '../core/index.js';

const SAVE_KEY = 'more-than-enough-save';
const LEGACY_SAVE_KEYS = ['more-than-enough-v3'];
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

// Returns null when saved, or the error that stopped it.
export function saveGame(state) {
  return write(SAVE_KEY, serialize(state));
}

// Loads the saved game, or starts a new world. `lost` is true when a save
// existed but could not be read, so the player can be told.
export function loadGame() {
  for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
    const raw = read(key);
    if (!raw) continue;
    const state = deserialize(raw);
    if (state) {
      // Move an old save to the current key, keeping the old one if that fails.
      if (key !== SAVE_KEY && !saveGame(state)) remove(key);
      return { state, lost: false };
    }
    return { state: createState(randomSeed()), lost: true };
  }
  return { state: createState(randomSeed()), lost: false };
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
  LEGACY_SAVE_KEYS.forEach(remove);
}
