/* The mutation sweep's own scripts (.github/workflows/mutation.yml): parts
 * planned by what they cost, and a joined report that keeps every part and counts what
 * each test file catches. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutPoints, innerCutPoints, linesRun, plan } from '../../scripts/mutation-plan.mjs';
import {
  merge,
  testValue,
  summary,
  survivors,
  assignedTo
} from '../../scripts/mutation-report.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// n lines of one statement (indented, so no cut point inside).
const lines = (n) => Array.from({ length: n }, (_, i) => (i ? '  x' : 'x') + i).join('\n');
const ran = (file, from, to) =>
  new Map([[file, new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i))]]);

test('mutation plan: a line costs the time of the test files that run it', () => {
  const files = [
    { file: 'a.js', text: lines(10) },
    { file: 'b.js', text: lines(10) }
  ];
  // A slow test runs all of a.js, a quick one all of b.js: a.js goes alone.
  const p = plan(
    files,
    [
      { seconds: 100, run: ran('a.js', 1, 10) },
      { seconds: 1, run: ran('b.js', 1, 10) }
    ],
    2
  );
  assert.deepEqual(p.parts, [['a.js'], ['b.js']]);
  assert.ok(p.cost[0] > 50 * p.cost[1], JSON.stringify(p.cost));
  // Lines no test runs, and lines that only run as the module loads (which
  // Stryker leaves out), cost next to nothing.
  const idle = plan(files, [{ seconds: 100, run: ran('a.js', 1, 10) }], 2, ran('a.js', 1, 10));
  assert.ok(
    idle.cost.every((c) => c < 2),
    JSON.stringify(idle.cost)
  );
});

test('mutation plan: a costly file is cut between top-level statements, never inside one', () => {
  const text = [
    'import x from "y";', // 1
    'export function f() {', // 2
    '  return 1;', // 3
    '}', // 4
    '/* a comment', // 5
    ' * more */', // 6
    'const g = () =>', // 7
    '  2;', // 8
    'export { g };' // 9
  ].join('\n');
  assert.deepEqual(cutPoints(text), [2, 5, 7, 9]);
  const p = plan([{ file: 'a.js', text }], [{ seconds: 10, run: ran('a.js', 1, 9) }], 3);
  const pieces = p.parts.flat().sort();
  assert.ok(pieces.length >= 3, JSON.stringify(pieces));
  // The pieces cover every line once, and each starts at a cut point.
  const covered = pieces.flatMap((e) => {
    const [a, b] = e.split(':')[1].split('-').map(Number);
    assert.ok(a === 1 || cutPoints(text).includes(a), e);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
  assert.deepEqual(
    covered.sort((x, y) => x - y),
    [1, 2, 3, 4, 5, 6, 7, 8, 9]
  );
});

test('mutation plan: every source file in exactly one part, the same every time', () => {
  const files = ['p.js', 'q.js', 'r.js', 's.js'].map((file) => ({ file, text: lines(5) }));
  const tests = [{ seconds: 3, run: ran('p.js', 1, 5) }];
  const p = plan(files, tests, 3);
  assert.equal(p.parts.length, 3);
  assert.deepEqual(p.parts.flat().sort(), ['p.js', 'q.js', 'r.js', 's.js']);
  assert.deepEqual(plan(files, tests, 3), p);
  assert.deepEqual(
    plan(files, tests, 6).parts.filter((x) => x.length).length,
    4,
    'more parts than files'
  );
});

test("mutation plan: reads which lines a test file ran from Node's lcov report", () => {
  const lcov =
    'TN:\nSF:src/core/a.js\nDA:1,1\nDA:2,0\nDA:3,4\nend_of_record\nSF:src/core/b.js\nDA:1,0\nend_of_record\n';
  const r = linesRun(lcov);
  assert.deepEqual([...r.get('src/core/a.js')], [1, 3]);
  assert.deepEqual([...r.get('src/core/b.js')], []);
});

test('mutation plan: in real source, a cut point always follows a finished statement', () => {
  for (const file of ['src/core/terrain.js', 'src/core/sim.js', 'src/game/controller.js']) {
    const all = readFileSync(file, 'utf8').split('\n');
    for (const n of cutPoints(all.join('\n'))) {
      let k = n - 2;
      while (k > 0 && !/\S/.test(all[k])) k--;
      assert.match(
        all[k].replace(/\s+\/\/.*$/, ''),
        /[;})\]]$|\*\/$|^\/\/|^\s*$/,
        `${file}:${n} follows "${all[k]}"`
      );
    }
  }
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

test('mutation report: a file split over two parts keeps the bugs of both', () => {
  const half = (ids) => ({
    files: {
      'src/core/a.js': {
        language: 'javascript',
        source: 'a',
        mutants: ids.map((id) => mutant(id, 'Killed', ['0'], ['0']))
      }
    },
    testFiles: { 'test/unit/a.test.js': { tests: [{ id: '0', name: 'test/unit/a.test.js' }] } }
  });
  const r = merge([half(['0', '1']), half(['0'])]);
  const ms = r.files['src/core/a.js'].mutants;
  assert.equal(ms.length, 3);
  assert.equal(new Set(ms.map((m) => m.id)).size, 3, 'ids stay apart');
  assert.deepEqual(
    ms.map((m) => m.killedBy),
    [['test/unit/a.test.js'], ['test/unit/a.test.js'], ['test/unit/a.test.js']]
  );
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

test('mutation report: survivors are listed by file and line, worst files first', () => {
  const r = merge(parts);
  r.files['src/core/a.js'].mutants[2].replacement = '!x';
  assert.deepEqual(survivors(r).split('\n'), [
    'server/src/b.js:1 x (no test runs it)',
    'src/core/a.js:1 x -> !x'
  ]);
});

const at = (line, status = 'Killed') => ({
  ...mutant(String(line), status, ['0'], status === 'Killed' ? ['0'] : []),
  location: { start: { line, column: 1 }, end: { line, column: 5 } }
});
// A part's report also carries the files of the report it started from.
const carrying = (mutants) => ({
  files: { 'src/core/a.js': { language: 'javascript', source: 'a', mutants } },
  testFiles: { 'test/unit/a.test.js': { tests: [{ id: '0', name: 'test/unit/a.test.js' }] } }
});

test('mutation report: each part counts only the code the plan gave it', () => {
  assert.ok(assignedTo(['src/core/a.js'], 'src/core/a.js', at(7)));
  assert.ok(assignedTo(['src/core/a.js:5-9'], 'src/core/a.js', at(9)));
  assert.ok(!assignedTo(['src/core/a.js:5-9'], 'src/core/a.js', at(10)));
  assert.ok(!assignedTo(['src/core/b.js'], 'src/core/a.js', at(7)));
  const both = [at(2), at(8, 'Survived')];
  const r = merge([carrying(both), carrying(both)], [['src/core/a.js:1-4'], ['src/core/a.js:5-9']]);
  assert.deepEqual(
    r.files['src/core/a.js'].mutants.map((m) => [m.location.start.line, m.status]),
    [
      [2, 'Killed'],
      [8, 'Survived']
    ],
    'one copy of each, not one per part'
  );
});

test("mutation report: the command joins named parts by the plan, leaving out a lost part's code", () => {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-join-'));
  const all = [at(2), at(8, 'Survived'), at(20)];
  writeFileSync(
    join(dir, 'plan.json'),
    JSON.stringify({
      parts: [['src/core/a.js:1-4'], ['src/core/a.js:5-9'], ['src/core/a.js:10-30']]
    })
  );
  writeFileSync(join(dir, 'part-1.json'), JSON.stringify(carrying(all)));
  writeFileSync(join(dir, 'part-3.json'), JSON.stringify(carrying(all))); // part 2 was lost
  const out = join(dir, 'out');
  execFileSync(process.execPath, [
    'scripts/mutation-report.mjs',
    out,
    '--plan',
    join(dir, 'plan.json'),
    join(dir, 'part-1.json'),
    join(dir, 'part-3.json')
  ]);
  const r = JSON.parse(readFileSync(join(out, 'mutation.json'), 'utf8'));
  assert.deepEqual(
    r.files['src/core/a.js'].mutants.map((m) => m.location.start.line).sort((a, b) => a - b),
    [2, 20],
    'line 8 was part 2, which was lost'
  );
  assert.doesNotMatch(readFileSync(join(out, 'survivors.txt'), 'utf8'), /src\/core\/a\.js:8/);
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          'scripts/mutation-report.mjs',
          out,
          '--plan',
          join(dir, 'plan.json'),
          join(dir, 'plan.json')
        ],
        { stdio: 'pipe' }
      ),
    /part-N/
  );
});

test('mutation plan: one long function too costly whole is cut between its own statements', () => {
  const text = [
    'import x from "y";', // 1
    'export function big() {', // 2
    '  const a = 1;', // 3
    '  if (a) {', // 4
    '    x(a);', // 5
    '  }', // 6
    '  // why', // 7
    '  return f(a,', // 8
    '    2);', // 9
    '}' // 10
  ].join('\n');
  // Not inside the if (5), nor after a line that runs on (9).
  assert.deepEqual(innerCutPoints(text), [3, 4, 7, 8]);
  const tests = [{ seconds: 10, run: ran('a.js', 1, 10) }];
  const whole = plan(
    [
      { file: 'a.js', text },
      { file: 'b.js', text: lines(3) }
    ],
    tests,
    4
  );
  assert.ok(
    whole.parts.flat().filter((e) => e.startsWith('a.js:')).length >= 3,
    JSON.stringify(whole.parts)
  );
  for (const e of whole.parts.flat().filter((x) => x.startsWith('a.js:'))) {
    const a = Number(e.split(':')[1].split('-')[0]);
    assert.ok(a === 1 || [2, ...innerCutPoints(text)].includes(a), e);
  }
});

test('mutation report: a sweep where test runs break is reported broken, not scored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-broken-'));
  const broken = carrying([at(1, 'RuntimeError'), at(2, 'RuntimeError'), at(3, 'Survived')]);
  writeFileSync(join(dir, 'part-1.json'), JSON.stringify(broken));
  assert.match(
    summary(merge([broken])),
    /broke instead of passing or failing \(not counted\): 2\./
  );
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ['scripts/mutation-report.mjs', join(dir, 'out'), join(dir, 'part-1.json')],
        { stdio: 'pipe' }
      ),
    /sweep is broken/
  );
});
