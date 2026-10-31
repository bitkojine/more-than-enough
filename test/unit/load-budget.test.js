/* The first load stays quick on a slow phone connection. Stages the site the
 * way the deploy does (scripts/stage-site.sh) and checks what a fresh
 * browser has to download before the game can start:
 *  - the default pack's pictures arrive inside pack.json (one request, not
 *    one per picture);
 *  - the game's code is one bundled file (no module is left to fetch import
 *    by import), and the pack is named up front so it downloads alongside;
 *  - the whole first load (page, stylesheet, modules, pack), gzipped as
 *    GitHub Pages serves it, stays under a budget. Raise BUDGET_KB only on
 *    purpose: every 10 KB is ~60 ms more on slow 3G before anyone can play;
 *  - every file in the default pack is one pack.json uses, so nothing unused
 *    sits in the repo or (worse) in the first load, and every file it names exists.
 * Needs `npm ci` (staging bundles with esbuild). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUDGET_KB = 300; // v0.145.0: 262 KB once the painted poses (the 3D rig draws Mica) were dropped
const MAX_REQUESTS = 6;

test('the first load is few requests and fits the size budget', (t) => {
  const out = mkdtempSync(join(tmpdir(), 'mte-stage-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  execFileSync('sh', ['scripts/stage-site.sh', out], { cwd: ROOT, stdio: 'pipe' });

  const page = readFileSync(join(out, 'index.html'), 'utf8');
  const file = (url) => readFileSync(join(out, url.split('?')[0]));

  // Every picture of the default pack is inline.
  const pack = JSON.parse(file('packs/default/pack.json'));
  const paths = JSON.stringify(pack.looks).match(/"[^"<]*\.(svg|png|webp|jpe?g|gif)"/g) || [];
  assert.deepEqual(paths, [], 'pictures left as separate files in the staged pack');

  // Anything the game still imports is preloaded (the bundle leaves nothing).
  const preloaded = new Set(
    [...page.matchAll(/<link rel="(?:modulepreload|preload)" href="([^"]+)"/g)].map((m) => m[1])
  );
  const entry = page.match(/<script type="module" src="([^"]+)"/)[1];
  const modules = new Set();
  const walk = (url) => {
    if (modules.has(url)) return;
    modules.add(url);
    const [path] = url.split('?');
    for (const m of file(url)
      .toString()
      .matchAll(/from '(\.{1,2}\/[^']+)'/g)) {
      const u = new URL(m[1], 'http://x/' + path);
      walk(u.pathname.slice(1) + u.search);
    }
  };
  walk(entry);
  for (const m of modules)
    if (m !== entry)
      assert.ok(preloaded.has(m), `${m} is imported but neither bundled nor preloaded`);
  assert.ok(
    [...preloaded].some((u) => u.startsWith('packs/default/pack.json?v=')),
    'the default pack is not preloaded'
  );

  // Size and count of everything a fresh browser fetches before the game starts.
  const css = [...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  const urls = [...new Set([...css, ...modules, ...preloaded])];
  const rigKB = gzipSync(file('src/game/render/rigged-character.js')).length / 1024;
  t.diagnostic(`lazy 3D character: ${rigKB.toFixed(1)} KB gzipped`);
  assert.ok(rigKB <= 180, 'lazy 3D presentation module exceeds its 180 KB budget');
  const kb =
    (gzipSync(page).length + urls.reduce((n, u) => n + gzipSync(file(u)).length, 0)) / 1024;
  t.diagnostic(`first load: ${urls.length + 1} requests, ${kb.toFixed(1)} KB gzipped`);
  assert.ok(
    urls.length + 1 <= MAX_REQUESTS,
    `${urls.length + 1} requests at first load (max ${MAX_REQUESTS})`
  );
  assert.ok(
    kb <= BUDGET_KB,
    `first load is ${kb.toFixed(1)} KB gzipped, over the ${BUDGET_KB} KB budget`
  );
});

test('the default pack holds only files its pack.json uses, and all of them exist', () => {
  const dir = join(ROOT, 'packs', 'default');
  const named = new Set(
    JSON.stringify(JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')).looks).match(
      /[^"]+\.(svg|png|webp|jpe?g|gif)(?=")/g
    )
  );
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .filter((f) => f !== 'pack.json');
  assert.deepEqual(
    files.filter((f) => !named.has(f)),
    [],
    'files in packs/default/ that pack.json never uses: delete them or use them'
  );
  assert.deepEqual(
    [...named].filter((f) => !files.includes(f)),
    [],
    'pack.json names files that do not exist'
  );
});
