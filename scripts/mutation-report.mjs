#!/usr/bin/env node
/* Joins the mutation sweep's parts (.github/workflows/mutation.yml) into one
 * report: mutation.json (Stryker's format, also the next run's incremental
 * baseline), mutation.html (Stryker's own viewer), survivors.txt (every bug
 * no test caught, by file and line) and summary.md, which says
 * for each source file how many planted bugs the tests caught and, for each
 * test file, how many it catches, how many only it catches, and which catch
 * nothing at all.
 *   node scripts/mutation-report.mjs <out dir> <part.json>...            */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const CAUGHT = new Set(['Killed', 'Timeout']);
const COUNTED = new Set(['Killed', 'Timeout', 'Survived', 'NoCoverage']);

// Whether a mutant lies in what its part was given to test: a whole file,
// or a line range of one ("src/core/sim.js:200-339"). A part's report also
// carries every file of the report it started from (incremental), so a
// file can turn up in many parts; only the part that was given it counts.
export function assignedTo(entries, file, m) {
  return entries.some((e) => {
    const [f, range] = e.split(':');
    if (f !== file) return false;
    if (!range) return true;
    const [a, b] = range.split('-').map(Number);
    return m.location.start.line >= a && m.location.end.line <= b;
  });
}

/* One report from many: files side by side, and each part's test ids (which
 * each part numbers its own way) replaced by the test file's name. `parts`
 * may be any iterable (read one at a time, so 90 parts fit in memory);
 * `plan`, when given, is the plan's list of entries per part, in order. */
export function merge(parts, plan = null) {
  const out = { schemaVersion: '2', thresholds: { high: 80, low: 60 }, files: {}, testFiles: {} };
  let n = 0;
  out.log = [];
  for (const part of parts) {
    n++;
    const tally = (ms) => {
      const t = {};
      for (const m of ms) t[m.status] = (t[m.status] || 0) + 1;
      return JSON.stringify(t);
    };
    const all = Object.values(part.files).flatMap((f) => f.mutants);
    let kept = [];
    const name = new Map();
    for (const [file, t] of Object.entries(part.testFiles || {})) {
      out.testFiles[file] ??= { source: t.source, tests: [] };
      for (const x of t.tests) {
        const id = x.name || file;
        name.set(x.id, id);
        if (!out.testFiles[file].tests.some((y) => y.id === id))
          out.testFiles[file].tests.push({ ...x, id, name: id });
      }
    }
    const rename = (ids) => ids && ids.map((id) => name.get(id) ?? id);
    // A costly file is split over several parts by line range: its pieces
    // join, and each part's mutant ids (which restart at 0) get its number.
    for (const [file, f] of Object.entries(part.files)) {
      const mine = plan
        ? f.mutants.filter((m) => assignedTo(plan[n - 1] || [], file, m))
        : f.mutants;
      kept = kept.concat(mine);
      if (!mine.length) continue;
      const mutants = mine.map((m) => ({
        ...m,
        id: `${n}-${m.id}`,
        coveredBy: rename(m.coveredBy),
        killedBy: rename(m.killedBy)
      }));
      if (out.files[file]) out.files[file].mutants.push(...mutants);
      else out.files[file] = { ...f, mutants };
    }
    out.log.push(
      `part ${n}: ${plan ? (plan[n - 1] || []).join(',') : '-'} | in report ${tally(all)} | kept ${tally(kept)}`
    );
    out.projectRoot ??= part.projectRoot;
    out.framework ??= part.framework;
  }
  return out;
}

const score = (ms) => {
  const counted = ms.filter((m) => COUNTED.has(m.status));
  const caught = counted.filter((m) => CAUGHT.has(m.status)).length;
  return {
    caught,
    counted: counted.length,
    pct: counted.length ? (100 * caught) / counted.length : null
  };
};
const pct = (s) => (s.pct === null ? 'n/a' : s.pct.toFixed(1) + ' %');

// What each test file is worth: planted bugs it reaches, catches, and is the
// only one to catch.
export function testValue(report) {
  const value = new Map();
  const row = (t) => {
    if (!value.has(t)) value.set(t, { covered: 0, caught: 0, only: 0 });
    return value.get(t);
  };
  for (const t of Object.keys(report.testFiles)) row(t);
  for (const f of Object.values(report.files))
    for (const m of f.mutants) {
      for (const t of m.coveredBy || []) row(t).covered++;
      const by = CAUGHT.has(m.status) ? m.killedBy || [] : [];
      for (const t of by) row(t).caught++;
      if (by.length === 1) row(by[0]).only++;
    }
  return [...value].map(([test, v]) => ({ test, ...v })).sort((a, b) => a.caught - b.caught);
}

export function summary(report) {
  const files = Object.entries(report.files).map(([file, f]) => ({ file, ...score(f.mutants) }));
  const all = score(Object.values(report.files).flatMap((f) => f.mutants));
  const area = (root) =>
    score(
      Object.entries(report.files)
        .filter(([f]) => f.startsWith(root))
        .flatMap(([, f]) => f.mutants)
    );
  const tests = testValue(report);
  const lines = [
    '# Mutation sweep',
    '',
    `Planted bugs the tests caught: **${pct(all)}** (${all.caught} of ${all.counted}).`,
    '',
    '| Code | Caught |',
    '| --- | --- |',
    ...['src/core', 'src/net', 'server/src', 'src/game'].map((r) => `| ${r} | ${pct(area(r))} |`),
    '',
    '## Test files that catch nothing',
    '',
    'Each reaches planted bugs but catches none of them: either it checks',
    'nothing that matters, or what it checks is text, pictures or timing.',
    '',
    ...tests
      .filter((t) => t.covered > 0 && t.caught === 0)
      .map((t) => `- \`${t.test}\` (reaches ${t.covered})`),
    '',
    '## What each test file catches',
    '',
    '| Test file | Reaches | Catches | Only it catches |',
    '| --- | --- | --- | --- |',
    ...[...tests]
      .sort((a, b) => b.caught - a.caught)
      .map((t) => `| \`${t.test}\` | ${t.covered} | ${t.caught} | ${t.only} |`),
    '',
    '## Source files, worst first',
    '',
    '| File | Caught | Of |',
    '| --- | --- | --- |',
    ...files
      .filter((f) => f.counted)
      .sort((a, b) => a.pct - b.pct || b.counted - a.counted)
      .map((f) => `| \`${f.file}\` | ${pct(f)} | ${f.counted} |`),
    ''
  ];
  return lines.join('\n');
}

// Every planted bug no test caught, one per line, the files with most first:
// what to write tests for (or mark as harmless).
export function survivors(report) {
  const rows = Object.entries(report.files).map(([file, f]) => [
    file,
    f.mutants.filter((m) => m.status === 'Survived' || m.status === 'NoCoverage')
  ]);
  return rows
    .filter(([, ms]) => ms.length)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .flatMap(([file, ms]) =>
      ms
        .sort((a, b) => a.location.start.line - b.location.start.line)
        .map(
          (m) =>
            `${file}:${m.location.start.line} ${m.mutatorName}` +
            (m.status === 'NoCoverage'
              ? ' (no test runs it)'
              : m.replacement
                ? ' -> ' + m.replacement.replace(/\s+/g, ' ').slice(0, 80)
                : '')
        )
    )
    .join('\n');
}

// Stryker's own viewer, the way its html reporter builds it.
function html(report) {
  const require = createRequire(import.meta.url);
  const app = readFileSync(
    require.resolve('mutation-testing-elements/dist/mutation-test-elements.js'),
    'utf8'
  );
  const data = JSON.stringify(report).replace(/</g, '<"+"');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mutation sweep</title><script>${app}</script></head><body>
<mutation-test-report-app titlePostfix="Mutation sweep"></mutation-test-report-app>
<script>document.querySelector('mutation-test-report-app').report = ${data};</script></body></html>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--plan');
  const plan = at >= 0 ? JSON.parse(readFileSync(args.splice(at, 2)[1], 'utf8')).parts : null;
  const [dir, ...files] = args;
  if (!dir || !files.length) {
    console.error(
      'usage: node scripts/mutation-report.mjs <out dir> [--plan plan.json] <part-N.json>...'
    );
    process.exit(2);
  }
  // With a plan, part-N.json is the report of part N. A lost part's code is
  // left out, so the next run tests it: the copies other parts carry of the
  // report they started from are partial for code nobody had finished
  // (run 41664879261 showed src/core/actions.js as 126 bugs, 4 % caught).
  const number = (f) => Number(/part-(\d+)\.json$/.exec(f)?.[1]);
  if (plan && files.some((f) => !number(f))) {
    console.error('with --plan, part reports must be named part-N.json');
    process.exit(2);
  }
  const ordered = plan
    ? Array.from({ length: plan.length }, (_, i) => files.find((f) => number(f) === i + 1))
    : files;
  function* read() {
    for (const f of ordered) yield f ? JSON.parse(readFileSync(f, 'utf8')) : { files: {} };
  }
  const report = merge(read(), plan);
  mkdirSync(dir, { recursive: true });
  // What each part held and what the join kept from it, for the log.
  writeFileSync(path.join(dir, 'parts.txt'), report.log.join('\n') + '\n');
  delete report.log;
  writeFileSync(path.join(dir, 'mutation.json'), JSON.stringify(report));
  writeFileSync(path.join(dir, 'mutation.html'), html(report));
  writeFileSync(path.join(dir, 'summary.md'), summary(report));
  writeFileSync(path.join(dir, 'survivors.txt'), survivors(report) + '\n');
  console.log(summary(report).split('\n').slice(0, 10).join('\n'));
}
