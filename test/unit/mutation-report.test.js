/* The mutation sweep's own scripts (.github/workflows/mutation.yml): parts
 * dealt out evenly, and a joined report that keeps every part and counts what
 * each test file catches. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shards } from '../../scripts/mutation-shard.mjs';
import { merge, testValue, summary } from '../../scripts/mutation-report.mjs';

test('mutation parts: every file in exactly one part, biggest first to the lightest part', () => {
  const files = [
    'src/core/paths.js',
    'src/core/save.js',
    'src/net/protocol.js',
    'server/src/room.js'
  ];
  const parts = shards(files, 3);
  assert.equal(parts.length, 3);
  assert.deepEqual(parts.flat().sort(), [...files].sort());
  assert.deepEqual(shards(files, 3), parts, 'the same every time');
  assert.deepEqual(shards(files, 1), [[...files].sort()]);
});

const mutant = (id, status, coveredBy, killedBy) => ({
  id,
  mutatorName: 'x',
  location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
  status,
  coveredBy,
  killedBy
});
// Two parts that number the same test files their own ways.
const parts = [
  {
    files: {
      'src/core/a.js': {
        language: 'javascript',
        source: 'a',
        mutants: [
          mutant('1', 'Killed', ['0', '1'], ['0', '1']),
          mutant('2', 'Killed', ['0', '1'], ['1']),
          mutant('3', 'Survived', ['0'], [])
        ]
      }
    },
    testFiles: {
      'test/unit/a.test.js': { tests: [{ id: '0', name: 'test/unit/a.test.js' }] },
      'test/unit/b.test.js': { tests: [{ id: '1', name: 'test/unit/b.test.js' }] }
    }
  },
  {
    files: {
      'server/src/b.js': {
        language: 'javascript',
        source: 'b',
        mutants: [
          mutant('1', 'Timeout', ['0'], ['0']),
          mutant('2', 'NoCoverage', [], []),
          mutant('3', 'RuntimeError', ['0'], [])
        ]
      }
    },
    testFiles: {
      'test/unit/b.test.js': { tests: [{ id: '0', name: 'test/unit/b.test.js' }] },
      'test/unit/c.test.js': { tests: [{ id: '1', name: 'test/unit/c.test.js' }] }
    }
  }
];

test('mutation report: parts join with test files named, not numbered', () => {
  const r = merge(parts);
  assert.deepEqual(Object.keys(r.files).sort(), ['server/src/b.js', 'src/core/a.js']);
  assert.deepEqual(r.files['server/src/b.js'].mutants[0].killedBy, ['test/unit/b.test.js']);
  assert.deepEqual(r.files['src/core/a.js'].mutants[1].killedBy, ['test/unit/b.test.js']);
  assert.equal(r.testFiles['test/unit/b.test.js'].tests.length, 1, 'one entry per test file');
});

test('mutation report: what each test file reaches, catches and alone catches', () => {
  const v = Object.fromEntries(testValue(merge(parts)).map((t) => [t.test, t]));
  assert.deepEqual(v['test/unit/a.test.js'], {
    test: 'test/unit/a.test.js',
    covered: 3,
    caught: 1,
    only: 0
  });
  assert.deepEqual(v['test/unit/b.test.js'], {
    test: 'test/unit/b.test.js',
    covered: 4,
    caught: 3,
    only: 2
  });
  assert.equal(v['test/unit/c.test.js'].covered, 0, 'listed though it reaches nothing');
});

test('mutation report: the score counts caught, timed out, survived and never run, not errors', () => {
  const md = summary(merge(parts));
  assert.match(md, /caught: \*\*60\.0 %\*\* \(3 of 5\)/);
  assert.match(md, /\| src\/core \| 66\.7 % \|/);
  assert.match(md, /\| server\/src \| 50\.0 % \|/);
  const nothing = md.split('## Test files that catch nothing')[1].split('##')[0];
  assert.doesNotMatch(nothing, /a\.test\.js|b\.test\.js/, 'both catch something');
  assert.doesNotMatch(nothing, /c\.test\.js/, 'and c reaches nothing, so it is not blamed');
});
