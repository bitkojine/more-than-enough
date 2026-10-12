/* localStorage persistence. Every access is guarded: private browsing and full
 * quotas throw, and the game must keep running regardless. */

import { serialize, deserialize, createState } from '../core/index.js';

const SAVE_KEY = 'more-than-enough-save';
const LEGACY_SAVE_KEYS = ['more-than-enough-v3'];
const TUTORIAL_KEY = 'more-than-enough-controls-tutorial-seen-v1';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* quota or private mode */ }
}

function remove(key) {
  try { localStorage.removeItem(key); } catch { /* private mode */ }
}

export function randomSeed() {
  return (Math.random() * 4294967295) >>> 0;
}

export function saveGame(state) {
  write(SAVE_KEY, serialize(state));
}

// Loads the saved game, or starts a new world. `lost` is true when a save
// existed but could not be read, so the player can be told.
export function loadGame() {
  for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
    const raw = read(key);
    if (!raw) continue;
    const state = deserialize(raw);
    if (state) {
      if (key !== SAVE_KEY) { saveGame(state); remove(key); }
      return { state, lost: false };
    }
    return { state: createState(randomSeed()), lost: true };
  }
  return { state: createState(randomSeed()), lost: false };
}

export function clearSave() {
  remove(SAVE_KEY);
  LEGACY_SAVE_KEYS.forEach(remove);
}

export function tutorialSeen() {
  return read(TUTORIAL_KEY) === '1';
}

export function markTutorialSeen() {
  write(TUTORIAL_KEY, '1');
}
