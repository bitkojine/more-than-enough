import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const boot = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').match(
  /<script>([\s\S]*?)<\/script>/
)[1];
function setup() {
  const listeners = {},
    faults = [],
    pre = { textContent: '' },
    box = {
      hidden: true,
      querySelector: (q) => (q === 'pre' ? pre : {}),
      querySelectorAll: () => [{ addEventListener() {} }, { addEventListener() {} }]
    };
  const window = {
    MTE_VERSION: 'test',
    console: {},
    addEventListener: (name, fn) => {
      listeners[name] = fn;
    }
  };
  const document = {
    getElementById: () => box,
    querySelector: () => ({ src: 'https://game.test/src/game/main.js?v=build42' })
  };
  vm.runInNewContext(boot, {
    window,
    document,
    location: {
      origin: 'https://game.test',
      pathname: '/',
      search: '',
      href: 'https://game.test/#join=secret'
    },
    navigator: { languages: ['en'], language: 'en', userAgent: 'test' },
    URL,
    URLSearchParams,
    console: { error() {}, warn() {} }
  });
  const resource = (tag = 'IMG', src = '', rel = '') => ({
    tagName: tag,
    src: tag === 'LINK' ? '' : src || 'https://game.test/#join=secret',
    href: tag === 'LINK' ? src : '',
    rel,
    style: {},
    getAttribute: (n) =>
      ({ src, href: src, 'data-help': 'tile.geode', 'data-picture-slot': 'image' })[n] ?? null,
    closest: () => ({ id: 'buildingCard' })
  });
  return {
    window,
    listeners,
    faults,
    pre,
    box,
    resource,
    ready() {
      window.MTE_FAULT = (error, where) => faults.push({ error, where });
    }
  };
}

test('running image failures remain nonfatal and identify the exact element and request', () => {
  const f = setup();
  f.ready();
  f.window.performance = { getEntriesByName: () => [{ responseStatus: 404 }] };
  f.listeners.error({ target: f.resource() });
  assert.equal(f.box.hidden, true);
  assert.equal(f.faults.length, 1);
  const { error, where } = f.faults[0];
  assert.equal(error.name, 'ResourceLoadError');
  assert.equal(where, 'resource IMG');
  for (const detail of [
    'resource tag: IMG',
    'HTTP status: 404',
    'requested src: ""',
    'picture: tile.geode',
    'slot: image',
    'inside #buildingCard',
    'build42'
  ])
    assert.ok(error.message.includes(detail), detail);
  assert.ok(
    error.message.includes(String.fromCharCode(10) + 'resource tag: IMG' + String.fromCharCode(10)),
    'report uses real line breaks'
  );
  assert.ok(!error.message.includes('secret'), 'invite fragments never enter reports');
});

test('optional resource failures before startup queue bounded diagnostics without a fatal screen', () => {
  const f = setup();
  for (let i = 0; i < 20; i++) f.listeners.error({ target: f.resource() });
  assert.equal(f.box.hidden, true);
  assert.equal(f.window.MTE_RESOURCE_ERRORS.length, 8);
});

test('required startup script failure stays fatal with asset, page and build details', () => {
  const f = setup();
  f.listeners.error({ target: f.resource('SCRIPT', 'https://game.test/src/missing.js?v=build42') });
  assert.equal(f.box.hidden, false);
  for (const detail of [
    'ResourceLoadError',
    'resource tag: SCRIPT',
    'missing.js?v=build42',
    'page: https://game.test/',
    'entry module:'
  ])
    assert.ok(f.pre.textContent.includes(detail), detail);
  assert.ok(!f.pre.textContent.includes('secret'));
});
