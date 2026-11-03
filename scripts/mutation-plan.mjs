#!/usr/bin/env node
/* Plans the mutation sweep's parts (.github/workflows/mutation.yml) by what
 * they cost, not by their size. A planted bug costs the time of every test
 * file that runs its line, so a bug in code that every world-making test
 * runs (noise, regions) reruns most of the suite, while one in a file few
 * tests reach takes a second. Counting lines put a few such files in one
 * part, which then ran for hours (run 41571010168, 2026-11-03).
 *
 * So: run each test file once with Node's coverage, timing it; a line costs
 * the time of the test files that ran it; each source file is cut, between
 * top-level statements, into pieces that fit one part's share; and the
 * pieces are dealt out, costliest first, to the cheapest part so far.
 * Stryker plants a bug only when all of it lies inside a range, so a cut
 * between top-level statements loses none (test/unit/mutation-report.test.js).
 *
 *   node scripts/mutation-plan.mjs <parts> <plan.json>
 * writes { parts: [[mutate entries]], cost: [seconds] }; each part then runs
 *   stryker run --mutate "$(node -e '…plan.parts[i - 1].join(",")')"       */
import { execFile } from 'node:child_process';
import { availableParallelism, tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ROOTS = ['src/core', 'src/net', 'server/src', 'src/game'];
// Every planted bug costs at least starting its test run.
const BASE = 0.5;

export function sourceFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.posix.join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

// Lines that start a top-level statement: Prettier puts those at column 0
// and indents everything inside one, and a closing bracket at column 0 still
// belongs to the statement above.
export function cutPoints(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++)
    if (/^[A-Za-z_$@/]/.test(lines[i]) && !/^\s*\*/.test(lines[i])) out.push(i + 1);
  return out;
}

// One test file's coverage, from Node's lcov report: source file -> lines run.
export function linesRun(lcov) {
  const run = new Map();
  let file = null;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('SF:')) {
      file = path.posix.normalize(line.slice(3).split(path.sep).join('/'));
      run.set(file, new Set());
    } else if (line.startsWith('DA:') && file) {
      const [n, hits] = line.slice(3).split(',').map(Number);
      if (hits > 0) run.get(file).add(n);
    }
  }
  return run;
}

/* Pieces of each file, then parts.
 *   files: [{ file, text }]; tests: [{ seconds, run: Map(file -> Set(line)) }];
 *   atLoad: lines that run when the module loads, whose bugs Stryker leaves
 *   out (ignoreStatic in stryker.config.mjs), so they cost nothing. */
export function plan(files, tests, n, atLoad = new Map()) {
  const pieces = [];
  // A line no test runs still holds bugs, but Stryker settles those at once.
  const costOf = (file, text) => {
    const lines = text.split('\n');
    const ran = lines.map(() => 0);
    for (const t of tests)
      for (const ln of t.run.get(file) || []) if (ln <= lines.length) ran[ln - 1] += t.seconds;
    const load = atLoad.get(file) || new Set();
    return lines.map((l, i) =>
      !/\S/.test(l) ? 0 : ran[i] && !load.has(i + 1) ? BASE + ran[i] : BASE / 10
    );
  };
  const all = files.map(({ file, text }) => ({ file, text, cost: costOf(file, text) }));
  const total = all.reduce((s, f) => s + f.cost.reduce((a, b) => a + b, 0), 0);
  const share = total / n;
  for (const { file, text, cost } of all) {
    const sum = cost.reduce((a, b) => a + b, 0);
    if (sum <= share) {
      pieces.push({ entry: file, cost: sum });
      continue;
    }
    const cuts = new Set(cutPoints(text));
    let start = 1,
      acc = 0;
    for (let ln = 1; ln <= cost.length; ln++) {
      if (cuts.has(ln) && acc > 0 && acc + cost[ln - 1] > share) {
        pieces.push({ entry: `${file}:${start}-${ln - 1}`, cost: acc });
        start = ln;
        acc = 0;
      }
      acc += cost[ln - 1];
    }
    // A file with no cut point left is one piece, named as the whole file.
    pieces.push({ entry: start === 1 ? file : `${file}:${start}-${cost.length}`, cost: acc });
  }
  pieces.sort((a, b) => b.cost - a.cost || a.entry.localeCompare(b.entry));
  const parts = Array.from({ length: n }, () => ({ cost: 0, entries: [] }));
  for (const p of pieces) {
    const least = parts.reduce((a, b) => (b.cost < a.cost ? b : a));
    least.entries.push(p.entry);
    least.cost += p.cost;
  }
  return {
    parts: parts.map((p) => p.entries.sort()),
    cost: parts.map((p) => Math.round(p.cost))
  };
}

// What runs when every module is only loaded: a test file that imports them
// all and does nothing else (a browser module that can't load in Node is
// skipped; its bugs are then costed as if tests ran them).
function atLoadRun(files, dir) {
  const probe = path.join(dir, 'load.test.mjs');
  const urls = files.map((f) => new URL(f, `file://${process.cwd()}/`).href);
  writeFileSync(
    probe,
    `import { test } from 'node:test';\n` +
      `test('load', async () => { for (const u of ${JSON.stringify(urls)}) await import(u).catch(() => {}); });\n`
  );
  return runWithCoverage(probe, dir).then((r) => r.run);
}

function runWithCoverage(file, dir) {
  const out = path.join(dir, path.basename(file) + '.lcov');
  const started = process.hrtime.bigint();
  return new Promise((resolve) =>
    execFile(
      process.execPath,
      [
        '--test',
        '--experimental-test-coverage',
        '--test-reporter=lcov',
        '--test-reporter-destination=' + out,
        file
      ],
      { maxBuffer: 1 << 26 },
      () => {
        const seconds = Number(process.hrtime.bigint() - started) / 1e9;
        let lcov = '';
        try {
          lcov = readFileSync(out, 'utf8');
        } catch {
          // a test file that fails to run still costs its time
        }
        resolve({ file, seconds, run: linesRun(lcov) });
      }
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [n, out] = [Number(process.argv[2]), process.argv[3]];
  if (!(n >= 1) || !out) {
    console.error('usage: node scripts/mutation-plan.mjs <parts> <plan.json>');
    process.exit(2);
  }
  const { default: config } = await import('../stryker.config.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'mutation-plan-'));
  const queue = [...config.tap.testFiles];
  const tests = [];
  await Promise.all(
    Array.from({ length: availableParallelism() }, async () => {
      while (queue.length) tests.push(await runWithCoverage(queue.shift(), dir));
    })
  );
  const names = ROOTS.flatMap(sourceFiles);
  const atLoad = await atLoadRun(names, dir);
  rmSync(dir, { recursive: true, force: true });
  const files = names.map((file) => ({ file, text: readFileSync(file, 'utf8') }));
  const result = plan(files, tests, n, atLoad);
  writeFileSync(out, JSON.stringify(result));
  const slow = [...tests].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
  console.log(
    'slowest test files:',
    slow.map((t) => `${t.file} ${t.seconds.toFixed(0)} s`).join(', ')
  );
  console.log(
    'estimated part cost (s): max',
    Math.max(...result.cost),
    'min',
    Math.min(...result.cost)
  );
  console.log(
    'split files:',
    [
      ...new Set(
        result.parts
          .flat()
          .filter((e) => e.includes(':'))
          .map((e) => e.split(':')[0])
      )
    ].join(', ')
  );
}
