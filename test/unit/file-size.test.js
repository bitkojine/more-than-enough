/* Files stay a size a reader can hold in their head. A source file over
 * MAX_LINES (formatted lines, as Prettier lays them out) should be split
 * along its natural seams instead of growing further.
 *
 * Files already over the limit are listed in OVERSIZED with the size they
 * had when the check arrived. That is a ceiling, not an allowance: a listed
 * file may shrink (lower its number, or drop it once it fits) but never grow.
 * Splitting one is the way to make room in it.
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

const OVERSIZED = {
  'src/game/together.js': 1486,
  'src/game/main.js': 1398,
  'src/core/perfect.js': 1152,
  'server/src/room.js': 1006,
  'src/game/render/rig-model.js': 972,
  'server/src/worker.js': 947,
  'src/game/sheet.js': 835,
  'src/core/cultivation.js': 825,
  'src/game/render/sprites.js': 735,
  'src/game/controller.js': 694,
  'server/src/admin.js': 693
};

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

test(`no source file grows past ${MAX_LINES} lines; oversized ones only shrink`, () => {
  const problems = [];
  for (const f of SOURCES) {
    const n = lineCount(f);
    const ceiling = OVERSIZED[f] ?? MAX_LINES;
    if (n > ceiling)
      problems.push(
        OVERSIZED[f]
          ? `${f}: ${n} lines, was ${ceiling}. Split it rather than grow it.`
          : `${f}: ${n} lines, over ${MAX_LINES}. Split it along a natural seam.`
      );
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the oversized list names only files that exist and are still oversized', () => {
  const stale = Object.entries(OVERSIZED)
    .filter(([f]) => !SOURCES.includes(f) || lineCount(f) <= MAX_LINES)
    .map(([f]) => `${f}: fits now (or is gone), drop it from OVERSIZED`);
  assert.deepEqual(stale, [], stale.join('\n'));
});
