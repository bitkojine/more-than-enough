/* The code's shape, checked so it can't quietly rot. The project has no
 * linter (no dependencies at all), so these few rules are enforced here:
 *  - no function name is declared twice in a file: a later declaration
 *    silently replaces the earlier one (this once made the game silent);
 *  - no import cycles among the source modules;
 *  - the core stays pure: it never imports game (browser) code;
 *  - no merge-conflict markers are left in the code (several people push to
 *    main at once, and the browser-only files have no other check). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

const SOURCES = [...jsFiles(join(ROOT, 'src')), ...jsFiles(join(ROOT, 'wiki'))];
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
      assert.ok(dep.startsWith(join(ROOT, 'src', 'core')), `${rel(file)} imports ${rel(dep)}`);
    }
  }
});
