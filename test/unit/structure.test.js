/* The code's shape, checked so it can't quietly rot. The project has no
 * linter (its one dev dependency, esbuild, only stages the site), so these few rules are enforced here:
 *  - no function name is declared twice in a file: a later declaration
 *    silently replaces the earlier one (this once made the game silent);
 *  - no import cycles among the source modules;
 *  - the core stays pure: it never imports game (browser) code, only its
 *    own modules and the translations (src/i18n/), which import nothing else;
 *  - no merge-conflict markers are left in the code (several people push to
 *    main at once, and the browser-only files have no other check);
 *  - the docs and the architecture model name only files that exist, so
 *    moving or deleting code can't leave them pointing at nothing. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return jsFiles(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

// src/vendor/ holds other people's code, copied unchanged: not ours to check.
const SOURCES = [...jsFiles(join(ROOT, 'src')), ...jsFiles(join(ROOT, 'wiki'))].filter((f) => !f.includes(join('src', 'vendor')));
const rel = (p) => relative(ROOT, p);

// Relative imports of a file, as absolute paths.
function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/^\s*(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]/gm)]
    .map((m) => normalize(join(dirname(file), m[1])));
}

test('no merge-conflict markers are left in the code', () => {
  for (const file of [...SOURCES, ...jsFiles(join(ROOT, 'test'))]) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const bad = lines.findIndex((l) => /^(<{7}|>{7}|={7})( |$)/.test(l));
    assert.equal(bad, -1, `${rel(file)}:${bad + 1} has a merge-conflict marker`);
  }
});

test('no function name is declared twice in the same file', () => {
  for (const file of SOURCES) {
    const names = [...readFileSync(file, 'utf8').matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
    const twice = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(twice, [], `${rel(file)} declares ${twice.join(', ')} more than once`);
  }
});

test('source modules have no import cycles', () => {
  const graph = new Map(SOURCES.map((f) => [f, importsOf(f)]));
  const done = new Set();
  const visit = (file, path) => {
    const at = path.indexOf(file);
    assert.equal(at, -1, 'import cycle: ' + path.slice(at).concat(file).map(rel).join(' -> '));
    if (done.has(file)) return;
    for (const next of graph.get(file) || []) visit(next, path.concat(file));
    done.add(file);
  };
  for (const file of SOURCES) visit(file, []);
});

test('the core never imports game code', () => {
  for (const file of jsFiles(join(ROOT, 'src', 'core'))) {
    for (const dep of importsOf(file)) {
      assert.ok(dep.startsWith(join(ROOT, 'src', 'core')) || dep.startsWith(join(ROOT, 'src', 'i18n')), `${rel(file)} imports ${rel(dep)}`);
    }
  }
  for (const file of jsFiles(join(ROOT, 'src', 'i18n'))) {
    for (const dep of importsOf(file)) {
      assert.ok(dep.startsWith(join(ROOT, 'src', 'i18n')), `${rel(file)} imports ${rel(dep)}`);
    }
  }
});

test('the docs and the architecture model name only files that exist', () => {
  const docs = ['README.md', 'AGENTS.md', 'server/README.md', 'structurizr/README.md',
    ...readdirSync(join(ROOT, 'docs')).map((n) => 'docs/' + n)];
  const ROOTS = /^(\.\.?\/|src\/|server\/|test\/|wiki\/|docs\/|scripts\/|packs\/|structurizr\/|icons\/|privacy\/|\.github\/)/;
  const missing = [];
  const check = (doc, path) => {
    if (!ROOTS.test(path) || /[<>*]/.test(path)) return;
    // A path in server/README.md may be from server/ or from the repo root.
    if (![join(ROOT, dirname(doc), path), join(ROOT, path)].some((p) => existsSync(p))) missing.push(`${doc}: ${path}`);
  };
  for (const doc of docs) {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    for (const m of text.matchAll(/`([\w./-]+)`/g)) check(doc, m[1]);
    for (const m of text.matchAll(/\]\(([\w./-]+)\)/g)) check(doc, m[1]);
  }
  // The model's "ref" and "files" lists: a bare name sits in the folder of the path before it.
  const dsl = readFileSync(join(ROOT, 'structurizr', 'workspace.dsl'), 'utf8');
  for (const m of dsl.matchAll(/"(?:ref|files)" "([^"]+)"/g)) {
    let dir = '';
    for (const part of m[1].split(/,\s*/)) {
      const path = part.includes('/') ? part : dir + part;
      dir = path.endsWith('/') ? path : dirname(path) + '/';
      check('structurizr/workspace.dsl', path);
    }
  }
  assert.deepEqual(missing, [], 'these name files that do not exist:\n' + missing.join('\n'));
});
