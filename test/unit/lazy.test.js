/* Lazy modules survive a deploy and a waking phone (src/game/lazy.js): an
 * iPhone on 0.182.0 reported "TypeError: Importing a module script failed"
 * from an import nobody caught (2026-11-01). Each lazy import keeps the
 * running build's ?v=, tries again once on a new URL, then asks whether a
 * new build is live; callers forget a failed load so the next use retries. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lazy, lazyUrl, onLazyFailure } from '../../src/game/lazy.js';
import { createSyncHost } from '../../src/game/sync-host.js';
import syncEn from '../../src/i18n/sync/en.js';
import syncLt from '../../src/i18n/sync/lt.js';

const BASE = 'https://play.test/src/game/main.js?v=abc123';
const noWait = async () => {};
const failure = () => new TypeError('Importing a module script failed.');

test('lazy: the URL keeps the build stamp and is new on each retry', () => {
  assert.equal(lazyUrl('./qr.js', BASE, 0), 'https://play.test/src/game/qr.js?v=abc123');
  assert.equal(
    lazyUrl('./render/rigged-character.js', BASE, 2),
    'https://play.test/src/game/render/rigged-character.js?v=abc123&retry=2'
  );
  assert.equal(
    lazyUrl('./x.js', 'http://localhost:8000/src/game/lazy.js', 0),
    'http://localhost:8000/src/game/x.js',
    'run from source: no stamp'
  );
});

test('lazy: one failure is tried again on a new URL and nobody is bothered', async () => {
  const tried = [];
  let stale = 0;
  onLazyFailure(() => stale++);
  const m = await lazy('./once.js', {
    base: BASE,
    wait: noWait,
    load: async (href) => {
      tried.push(href);
      if (tried.length === 1) throw failure();
      return { ok: true };
    }
  });
  assert.deepEqual(m, { ok: true });
  assert.equal(tried.length, 2);
  assert.notEqual(tried[0], tried[1], 'a failed module URL is never asked for again');
  assert.equal(stale, 0, 'no update check for a blip');
  onLazyFailure(null);
});

test('lazy: two failures ask for the newest build, and the caller still hears of it', async () => {
  const tried = [];
  let stale = 0;
  onLazyFailure(() => stale++);
  const load = async (href) => {
    tried.push(href);
    throw failure();
  };
  await assert.rejects(lazy('./gone.js', { base: BASE, wait: noWait, load }), /Importing a module/);
  assert.equal(stale, 1, 'the updater checks build.json (and reloads if a deploy left us behind)');
  await assert.rejects(lazy('./gone.js', { base: BASE, wait: noWait, load }));
  assert.equal(new Set(tried).size, 4, 'later tries use new URLs as well');
  onLazyFailure(() => {
    throw new Error('check broke');
  });
  await assert.rejects(lazy('./gone.js', { base: BASE, wait: noWait, load }), /Importing a module/);
  onLazyFailure(null);
});

test('sync host: a linked device whose sync fails to load keeps playing and tries again', async () => {
  const faults = [];
  const was = globalThis.MTE_FAULT;
  globalThis.MTE_FAULT = (error, where) => faults.push(where);
  let loads = 0;
  const host = createSyncHost({
    game: { state: {} },
    el: {},
    ask: async () => true,
    toast() {},
    fork: { open: false },
    input: {},
    copy: null,
    store: { getItem: () => 'linked' },
    service: 'https://rooms.test',
    page: { hash: '#link=' + 'a'.repeat(64), pathname: '/', search: '' },
    history: { replaceState() {} },
    load: async () => {
      loads++;
      if (loads === 1) throw failure();
      return { strings: { en: syncEn, lt: syncLt }, createSync: () => ({}), linkFrom: () => null };
    }
  });
  host.start(); // unhandled before: "where: promise"
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(faults, ['sync/load'], 'the failure is noted, not thrown at the page');
  await host.linkFromHash();
  assert.equal(loads, 2, 'the failed load was forgotten, so the next use loads again');
  globalThis.MTE_FAULT = was;
});
