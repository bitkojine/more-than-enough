/* Files stay a size a reader can hold in their head. A source file over
 * MAX_LINES (formatted lines, as Prettier lays them out) should be split
 * along its natural seams instead of growing further.
 *
 * Every file fits since v0.182.3 (Watch, 2026-11-01: "the goal is highly
 * testable code"); the list of files allowed over the limit is gone, and
 * none comes back.
 *
 * The translation dictionaries are data, one key per string, and grow with
 * the game; they are not counted. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_LINES = 600;

const DATA = [/^src\/i18n\/(en|lt)\.js$/, /^src\/i18n\/news\//, /^wiki\/i18n\//];

function files(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory())
      return p.startsWith(join('src', 'vendor')) ? [] : files(p);
    return /\.m?js$/.test(name) ? [p.split(sep).join('/')] : [];
  });
}

const lineCount = (f) => readFileSync(join(ROOT, f), 'utf8').trimEnd().split('\n').length;
const SOURCES = ['src', 'server/src', 'wiki', 'scripts']
  .flatMap(files)
  .filter((f) => !DATA.some((re) => re.test(f)));

test(`no source file grows past ${MAX_LINES} lines`, () => {
  const problems = SOURCES.filter((f) => lineCount(f) > MAX_LINES).map(
    (f) => `${f}: ${lineCount(f)} lines, over ${MAX_LINES}. Split it along a natural seam.`
  );
  assert.deepEqual(problems, [], problems.join('\n'));
});
