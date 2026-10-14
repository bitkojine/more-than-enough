/* Never an old version (src/game/update.js): a new deploy saves and reloads
 * the game at once, without reloading in a loop. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdater, stampOf } from '../../src/game/update.js';

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}

function setup({ running = 'aaa', site = 'aaa', at = 1_000_000 } = {}) {
  const log = [];
  const clock = { at };
  const u = createUpdater({
    running,
    save: () => log.push('save'),
    latest: async () => site,
    reload: async () => log.push('reload'),
    store: memoryStore(),
    now: () => clock.at
  });
  return { u, log, clock };
}

test('the build comes from the ?v= stamped on the module URL', () => {
  assert.equal(stampOf('https://x.test/src/game/update.js?v=71935c7990'), '71935c7990');
  assert.equal(stampOf('file:///repo/src/game/update.js'), null);
});

test('the same build: nothing happens', async () => {
  const { u, log } = setup();
  await u.check();
  assert.deepEqual(log, []);
});

test('a new build: saved first, then reloaded, no asking', async () => {
  const { u, log } = setup({ site: 'bbb' });
  await u.check();
  assert.deepEqual(log, ['save', 'reload']);
});

test('run from source (no stamp): never checks', async () => {
  let asked = false;
  const u = createUpdater({ running: null, save() {}, latest: async () => { asked = true; return 'bbb'; }, reload() {} });
  await u.check();
  assert.equal(asked, false);
});

test('an unreadable build.json is ignored until the next check', async () => {
  const u = createUpdater({ running: 'aaa', save() { throw new Error('no'); }, latest: async () => { throw new Error('offline'); }, reload() {} });
  await u.check();
});

test('a reload that lands on the old page again waits a minute before retrying', async () => {
  const store = memoryStore();
  const log = [];
  const clock = { at: 1_000_000 };
  const make = () => createUpdater({
    running: 'aaa', save() {}, latest: async () => 'bbb', reload: async () => log.push('reload'), store, now: () => clock.at
  });
  await make().check();          // reloads...
  await make().check();          // ...but the CDN still served the old page
  assert.equal(log.length, 1);
  clock.at += 61_000;
  await make().check();
  assert.equal(log.length, 2);
});
