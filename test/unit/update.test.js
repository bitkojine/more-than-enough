/* Never an old version (src/game/update.js): a new deploy saves and reloads
 * the game at once, without reloading in a loop, and then says what's new
 * (src/game/news.js). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdater, stampOf, takeUpdatedFrom } from '../../src/game/update.js';
import { NEWS, newsSince, compareVersions } from '../../src/game/news.js';
import { VERSION } from '../../src/version.js';
import { LANGUAGES } from '../../src/i18n/i18n.js';

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
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

test('the version played before an update is kept for the news, once', async () => {
  const store = memoryStore();
  const make = (version, running) => createUpdater({ version, running, save() {}, latest: async () => 'ccc', reload: async () => {}, store, now: () => 0 });
  await make('0.60.0', 'aaa').check();
  await make('0.61.0', 'bbb').check();   // a second update before the news showed
  assert.equal(takeUpdatedFrom(store), '0.60.0');
  assert.equal(takeUpdatedFrom(store), null);
});

test('every release says what is new: the current version first, newest first, notes in every language', () => {
  assert.equal(NEWS[0], VERSION, `add what players will notice in v${VERSION} to NEWS in src/game/news.js and "news.${VERSION}" to the dictionaries`);
  for (let i = 1; i < NEWS.length; i++) assert.equal(compareVersions(NEWS[i - 1], NEWS[i]), 1, `NEWS is out of order at ${NEWS[i]}`);
  for (const [code, lang] of Object.entries(LANGUAGES)) {
    for (const v of NEWS) assert.equal(typeof lang.strings['news.' + v], 'string', `${code} has no "news.${v}"`);
  }
});

test('the news lists only the versions after the one played, up to this one', () => {
  const news = ['0.3.0', '0.2.10', '0.2.9', '0.1.0'];
  assert.deepEqual(newsSince('0.2.9', '0.3.0', news), ['0.3.0', '0.2.10']);
  assert.deepEqual(newsSince('0.3.0', '0.3.0', news), []);
  assert.deepEqual(newsSince('0.0.1', '0.2.9', news), ['0.2.9', '0.1.0']);
});
