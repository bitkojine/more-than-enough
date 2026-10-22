/* Never an old version (src/game/update.js): a new deploy saves and reloads
 * the game at once, without reloading in a loop, and the version badge then
 * says what's new without stopping play (src/game/news.js). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdater, stampOf, takeUpdatedFrom } from '../../src/game/update.js';
import { loadNews, NEWS, newsSince, newsState, createNews, compareVersions } from '../../src/game/news.js';
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

await loadNews();

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

/* What's new never interrupts play (src/game/news.js): the version badge
 * rolls over after an update and keeps a dot until the changelog is opened. */

function fakeBadge() {
  const classes = new Set();
  const span = () => ({ textContent: '' });
  const parts = { '.now': span(), '.was': span() };
  return {
    parts, classes, attrs: {},
    querySelector: (sel) => parts[sel],
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {},
    offsetWidth: 0
  };
}

test('a first ever start has nothing new and nothing to roll over', () => {
  assert.deepEqual(newsState({ version: '0.5.0' }), { from: null, seen: '0.5.0' });
});

test('coming back on a newer version rolls over from the one last played', () => {
  assert.deepEqual(newsState({ version: '0.5.0', ran: '0.3.0', seen: '0.3.0' }), { from: '0.3.0', seen: '0.3.0' });
  // Updated in the tab: the older of the two is where the news starts.
  assert.deepEqual(newsState({ version: '0.5.0', ran: '0.4.0', updatedFrom: '0.3.0' }), { from: '0.3.0', seen: '0.3.0' });
  // Notes already looked at stay looked at, whatever version ran last.
  assert.deepEqual(newsState({ version: '0.5.0', ran: '0.3.0', seen: '0.4.0' }), { from: '0.3.0', seen: '0.4.0' });
});

test('the same version again, or an older one, rolls nothing over', () => {
  assert.equal(newsState({ version: '0.5.0', ran: '0.5.0', seen: '0.4.0' }).from, null);
  assert.equal(newsState({ version: '0.5.0', ran: '0.6.0', seen: '0.6.0' }).from, null);
  assert.equal(newsState({ version: '0.5.0', ran: 'junk', updatedFrom: '', seen: 'junk' }).seen, '0.5.0');
});

test('the badge always shows the version, with a dot while there is news not yet seen', () => {
  const store = memoryStore();
  const [now, older] = [NEWS[0], NEWS[3]];
  store.setItem('mte.ranVersion', older);
  store.setItem('mte.newsSeen', older);
  const badge = fakeBadge();
  const news = createNews({ badge, panel: null, version: now, store });
  assert.equal(badge.parts['.now'].textContent, 'v' + now);
  assert.equal(news.from, older);
  assert.ok(news.fresh && badge.classes.has('fresh'));
  news.play();
  assert.equal(badge.parts['.was'].textContent, 'v' + older);
  assert.ok(badge.classes.has('rolling'));
  assert.equal(store.getItem('mte.ranVersion'), now, 'the next start on this version rolls nothing over');
  const again = createNews({ badge: fakeBadge(), panel: null, version: now, store });
  assert.equal(again.from, null);
  assert.ok(again.fresh, 'the dot stays until the changelog is opened');
});

test('with storage blocked the badge still shows the version, with nothing new', () => {
  const badge = fakeBadge();
  const news = createNews({ badge, panel: null, version: NEWS[0], store: null });
  assert.equal(badge.parts['.now'].textContent, 'v' + NEWS[0]);
  assert.equal(news.fresh, false);
});
