/* No world is ever lost (AGENTS.md): saves that past releases really wrote
 * still load, keep everything they held, and play on. The saves in
 * test/fixtures/saves/ were made by each release's own code
 * (scripts/save-fixtures.mjs), not by today's serialize() with an old version
 * number. Add one whenever a release changes what a save holds.
 *
 * Also the device side: Settings -> Worlds (src/game/storage.js soloWorlds)
 * lists every solo world kept on this device, the save in play, each world's
 * own copy and the keys used before v0.141. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as Core from '../../src/core/index.js';

const DIR = new URL('../fixtures/saves/', import.meta.url);
const FIXTURES = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) }));

// What a later release dropped on purpose, by path (`[]` for every array
// item). Anything else an old save held must come back unchanged.
const RETIRED = new Map([
  ['cultivation.facilities[].closed', 'manual shutters removed in 0.180.9'],
  ['v', 'the format number moves up on load (10 -> 11)']
]);

// Every value `old` holds, found unchanged in `now`; extra fields in `now`
// (defaults a later release added) are fine.
function missing(old, now, path = '', out = []) {
  if (RETIRED.has(path)) return out;
  if (Array.isArray(old)) {
    if (!Array.isArray(now) || now.length !== old.length) out.push(path);
    else old.forEach((v, i) => missing(v, now[i], path + '[]', out));
  } else if (old && typeof old === 'object') {
    if (!now || typeof now !== 'object') out.push(path);
    else for (const k of Object.keys(old)) missing(old[k], now[k], path ? path + '.' + k : k, out);
  } else if (!Object.is(old, now))
    out.push(`${path}: ${JSON.stringify(old)} -> ${JSON.stringify(now)}`);
  return out;
}

test('old saves: the corpus spans the old economy and the crystal chapter, from format 10 on', () => {
  const kinds = new Set(FIXTURES.map((f) => f.file.replace(/^[\d.]+-/, '').replace('.json', '')));
  for (const k of ['old-early', 'old-mid', 'crystal-start', 'crystal-mid', 'crystal-late'])
    assert.ok(kinds.has(k), 'a ' + k + ' save is kept');
  const formats = new Set(FIXTURES.map((f) => f.save.v));
  assert.ok(formats.has(Core.OLDEST_SAVE), 'a save from the oldest format that loads');
  assert.ok(formats.has(Core.SAVE_VERSION));
});

for (const { file, note, save } of FIXTURES) {
  test(`old saves: ${file} (${note}) loads with everything it held`, () => {
    const s = Core.deserialize(JSON.stringify(save));
    assert.ok(s, 'it loads');
    assert.equal(!!s.cultivation, !!save.cultivation, 'and keeps its economy');
    const back = JSON.parse(Core.serialize(s));
    assert.deepEqual(missing(save, back), [], 'nothing it held is lost or changed');
    const again = Core.serialize(Core.deserialize(JSON.stringify(back)));
    assert.equal(again, JSON.stringify(back), 'and saving it again is stable');
  });

  test(`old saves: ${file} plays on`, () => {
    const s = Core.deserialize(JSON.stringify(save));
    Core.revealAround(s);
    for (let i = 0; i < 40; i++) Core.step(s, 0.25);
    Core.move(s, 1, 0, 0.5);
    if (Core.harvestTarget(s)) Core.harvest(s);
    assert.ok(Core.deserialize(Core.serialize(s)), 'what it saves after play loads too');
    for (const [k, n] of Object.entries(s.inv))
      assert.ok(Number.isFinite(n) && n >= 0, k + ' ' + n);
  });
}

// localStorage the way a browser has it: Object.keys lists what it stores.
const store = new Map();
globalThis.localStorage = new Proxy(
  {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    key: (i) => [...store.keys()][i] ?? null
  },
  {
    get: (t, k) => (k === 'length' ? store.size : t[k]),
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: (t, k) =>
      store.has(k) ? { value: store.get(k), enumerable: true, configurable: true } : undefined
  }
);
const storage = await import('../../src/game/storage.js');
const SAVE = 'more-than-enough-save';
const raw = (name) => JSON.stringify(FIXTURES.find((f) => f.file === name).save);

beforeEach(() => store.clear());

test('worlds list: an old save in play loads as it was, and is the one world listed', () => {
  store.set(SAVE, raw('0.70.0-old-early.json'));
  const { state, lost } = storage.loadGame();
  assert.equal(lost, false);
  assert.equal(state.seed, 4242);
  assert.equal(state.inv.stone, JSON.parse(raw('0.70.0-old-early.json')).inv.stone);
  assert.deepEqual(
    storage.soloWorlds().map((w) => w.seed),
    [4242]
  );
  assert.equal(storage.soloCount(), 1);
});

test('worlds list: every kept world shows, the save in play, own copies and pre-0.141 keys alike', () => {
  const put = (key, name, seed, seen) => {
    const d = JSON.parse(raw(name));
    store.set(key, JSON.stringify({ ...d, seed, seen }));
  };
  put(SAVE, '0.185.1-crystal-mid.json', 1, 50);
  put('mte.solo.world.2', '0.175.0-old-mid.json', 2, 40);
  put('mte.depot-v1.world.3', '0.131.0-old-mid.json', 3, 30);
  put('mte.depot-v1.save', '0.117.0-old-early.json', 4, 20);
  put('mte.solo.world.5', '0.160.0-crystal-late.json', 5, 10);
  store.set('mte.solo.world.6', '{"v":11,"seed":6,"mods":[['); // damaged: kept, not listed
  store.set('more-than-enough-view', '{"zoom":2}'); // not a world
  const worlds = storage.soloWorlds();
  assert.deepEqual(
    worlds.map((w) => w.seed),
    [1, 2, 3, 4, 5],
    'last played first'
  );
  assert.ok(worlds.every((w) => w.state.seed === w.seed));
  assert.deepEqual(storage.soloSeeds().sort(), [2, 3, 5, 6]);
  assert.equal(storage.soloWorld(3).inv.stone, JSON.parse(raw('0.131.0-old-mid.json')).inv.stone);
  assert.equal(storage.archivedSave(3), store.get('mte.depot-v1.world.3'), 'an old key is read');
  assert.equal(store.get('mte.solo.world.6'), '{"v":11,"seed":6,"mods":[[', 'nothing is deleted');
});

test("worlds list: a world's own copy wins over its pre-0.141 key, and both stay", () => {
  const d = JSON.parse(raw('0.175.0-old-mid.json'));
  const newer = JSON.stringify({ ...d, inv: { ...d.inv, stone: 999 } });
  store.set('mte.solo.world.4242', newer);
  store.set('mte.depot-v1.world.4242', raw('0.175.0-old-mid.json'));
  assert.equal(storage.soloWorld(4242).inv.stone, 999);
  assert.equal(storage.soloWorlds().length, 1, 'one world, listed once');
  assert.ok(store.has('mte.depot-v1.world.4242'));
});

test('worlds list: leaving a world for a new one keeps it listed, and going back finds it as it was', () => {
  store.set(SAVE, raw('0.185.1-crystal-late.json'));
  const { state: old } = storage.loadGame();
  assert.equal(storage.saveGame(old), null);
  const next = Core.createState(77, { cultivation: true });
  assert.equal(storage.saveGame(next), null);
  const listed = storage.soloWorlds().map((w) => w.seed);
  assert.ok(listed.includes(4242) && listed.includes(77), 'both worlds listed: ' + listed);
  const back = storage.soloWorld(4242);
  assert.deepEqual(
    missing(JSON.parse(raw('0.185.1-crystal-late.json')), JSON.parse(Core.serialize(back))),
    []
  );
});

test('worlds list: blocked storage lists nothing and throws nothing', () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = new Proxy(
    {},
    {
      get: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      ownKeys: () => {
        throw new DOMException('blocked', 'SecurityError');
      }
    }
  );
  try {
    assert.deepEqual(storage.soloWorlds(), []);
    assert.deepEqual(storage.soloSeeds(), []);
    assert.equal(storage.soloCount(), 0);
  } finally {
    globalThis.localStorage = saved;
  }
});
