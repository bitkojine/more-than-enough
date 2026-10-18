/* The browser's save (src/game/storage.js) with localStorage faked: a save
 * this version can't read is set aside, never written over. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../../src/core/index.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); }
};
const { loadGame, saveGame } = await import('../../src/game/storage.js');

const SAVE = 'more-than-enough-save', ASIDE = 'more-than-enough-save-aside';
const otherFormat = JSON.stringify({ v: Core.SAVE_VERSION + 1, seed: 5, inv: { mycelium: 999 } });

beforeEach(() => store.clear());

test('storage: a save it reads is loaded, and nothing is set aside', () => {
  const s = Core.createState(42);
  s.inv.mycelium = 17;
  store.set(SAVE, Core.serialize(s));
  const { state, lost } = loadGame();
  assert.equal(lost, false);
  assert.equal(state.inv.mycelium, 17);
  assert.equal(store.has(ASIDE), false);
});

test('storage: a save it can\'t read is set aside before the new world is saved over it', () => {
  store.set(SAVE, otherFormat);
  const { state, lost } = loadGame();
  assert.equal(lost, true);
  assert.equal(store.get(ASIDE), otherFormat, 'kept, as it was');
  assert.equal(saveGame(state), null, 'the new world saves without a conflict');
  assert.equal(store.get(ASIDE), otherFormat, 'and the old one is still kept');
});

test('storage: a broken save is set aside too', () => {
  store.set(SAVE, '{"v":' + Core.SAVE_VERSION + ',"seed":1,"mods":[[');
  assert.equal(loadGame().lost, true);
  assert.equal(store.get(ASIDE), '{"v":' + Core.SAVE_VERSION + ',"seed":1,"mods":[[');
});

test('storage: a save set aside that this version can read is taken back (an old cached page set it aside)', () => {
  const s = Core.createState(7);
  s.inv.stone = 123;
  const mine = Core.serialize(s);
  store.set(ASIDE, mine);     // the newest game's save, set aside by an old page
  store.set(SAVE, otherFormat); // the fresh world that old page made
  const { state, lost } = loadGame();
  assert.equal(lost, false, 'no nuke: your world is back');
  assert.equal(state.inv.stone, 123);
  assert.equal(store.get(ASIDE), otherFormat, 'the old page\'s world is set aside in its place');
  assert.equal(saveGame(state), null);
  assert.equal(Core.deserialize(store.get(SAVE)).inv.stone, 123, 'and saved as your game again');
});
