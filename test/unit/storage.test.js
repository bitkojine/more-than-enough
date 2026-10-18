/* What the game keeps in the browser, with localStorage faked: the save
 * (src/game/storage.js), where a save this version can't read is set aside,
 * never written over, and the copies kept per shared world
 * (src/game/worlds.js), which go when the world leaves the list. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../../src/core/index.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; }
};
const { loadGame, saveGame } = await import('../../src/game/storage.js');
const { remember, forget, knownRooms, SAVE_PREFIX, FOG_PREFIX, GEN_PREFIX } = await import('../../src/game/worlds.js');

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
  assert.equal(lost, 'format', 'made by another version');
  assert.equal(store.get(ASIDE), otherFormat, 'kept, as it was');
  assert.equal(saveGame(state), null, 'the new world saves without a conflict');
  assert.equal(store.get(ASIDE), otherFormat, 'and the old one is still kept');
});

test('storage: a broken save is set aside too, and told apart from one made by another version', () => {
  const cut = '{"v":' + Core.SAVE_VERSION + ',"seed":1,"mods":[[';
  store.set(SAVE, cut);
  assert.equal(loadGame().lost, 'broken');
  assert.equal(store.get(ASIDE), cut);
  for (const raw of ['null', '[]', '{"seed":3}', JSON.stringify({ v: Core.SAVE_VERSION, seed: 'x' })]) {
    store.set(SAVE, raw);
    assert.equal(loadGame().lost, 'broken', raw);
  }
});

test('storage: a save set aside that this version can read is taken back (an old cached page set it aside)', () => {
  const s = Core.createState(7);
  s.inv.stone = 123;
  const mine = Core.serialize(s);
  store.set(ASIDE, mine);     // the newest game's save, set aside by an old page
  store.set(SAVE, otherFormat); // the fresh world that old page made
  const { state, lost } = loadGame();
  assert.equal(lost, false, 'your world is back');
  assert.equal(state.inv.stone, 123);
  assert.equal(store.get(ASIDE), otherFormat, 'the old page\'s world is set aside in its place');
  assert.equal(saveGame(state), null);
  assert.equal(Core.deserialize(store.get(SAVE)).inv.stone, 123, 'and saved as your game again');
});

const roomId = (n) => ('room' + n).padEnd(22, 'x');
const copies = (id) => [SAVE_PREFIX, FOG_PREFIX, GEN_PREFIX].map((p) => p + id);

test('worlds: what is kept for a shared world goes with it when it leaves the list', () => {
  store.set(SAVE, 'the solo save');
  for (let n = 0; n < 12; n++) {
    remember(roomId(n), false);
    for (const k of copies(roomId(n))) store.set(k, 'kept');
  }
  remember(roomId(12), false); // a 13th: the oldest falls off
  assert.equal(knownRooms().includes(roomId(0)), false);
  for (const k of copies(roomId(0))) assert.equal(store.has(k), false, k + ' dropped with its world');
  for (const k of copies(roomId(1))) assert.equal(store.has(k), true, k + ' kept: still on the list');
  forget(roomId(5));
  for (const k of copies(roomId(5))) assert.equal(store.has(k), false, k + ' dropped when the world is forgotten');
  assert.equal(store.get(SAVE), 'the solo save', 'nothing else is touched');
});

test('worlds: copies left behind by an older version are cleared the next time a world is remembered', () => {
  for (const k of copies(roomId(99))) store.set(k, 'orphan');
  remember(roomId(1), false);
  for (const k of copies(roomId(99))) assert.equal(store.has(k), false, k);
});

test('storage: a backup file of your own world loads back as it was, and nothing else does', async () => {
  const { backupText, fromBackup, backupName } = await import('../../src/game/backup.js');
  const s = Core.createState(42);
  s.inv.mycelium = 17;
  s.prestiges = 2;
  const text = backupText(s, Date.UTC(2026, 9, 18), '1.2.3');
  const back = fromBackup(text);
  assert.equal(back.seed, 42);
  assert.equal(back.inv.mycelium, 17);
  assert.equal(back.prestiges, 2);
  assert.equal(Core.serialize(back), Core.serialize(s), 'the whole world');
  assert.equal(fromBackup(Core.serialize(s)).inv.mycelium, 17, 'a save as the browser keeps it reads too');
  for (const bad of ['', 'nope', 'null', '[]', '{}', otherFormat, JSON.stringify({ kind: 'mte-solo-world', save: otherFormat }), JSON.stringify({ kind: 'mte-shared-world', entries: [] })]) {
    assert.equal(fromBackup(bad), null, bad);
  }
  assert.match(backupName(Date.now()), /^more-than-enough-\d{4}-\d\d-\d\d-\d{4}\.json$/);
});
