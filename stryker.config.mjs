// Mutation testing (Watch, 2026-11-02: proof that our tests test things of
// value). Stryker plants one small bug at a time in the code and runs the
// tests that reach it; a bug no test catches has "survived". Run in parts by
// .github/workflows/mutation.yml (scripts/mutation-plan.mjs picks each
// part's code, scripts/mutation-report.mjs joins them). By hand, one file:
//   npx stryker run --mutate src/core/paths.js
import { readdirSync } from 'node:fs';

// Every unit and property test file, but the ones that read or measure the
// source as text: Stryker's rewritten copy of a file trips them (i18n checks
// no player text is written into the code; file-size and load-budget measure
// files, and instrumenting makes every file bigger). Those are proven by
// planting a violation instead.
const DEEP = Boolean(process.env.MUTATION_DEEP);
const READS_SOURCE = new Set(['i18n.test.js', 'file-size.test.js', 'load-budget.test.js']);
const testFiles = ['test/unit', 'test/property'].flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.test.js') && !READS_SOURCE.has(f))
    .sort()
    .map((f) => dir + '/' + f)
);

export default {
  testRunner: 'tap',
  plugins: ['@stryker-mutator/tap-runner'],
  // A planted bug that loops while it allocates can grow a test process to
  // several GB before its timeout; four at once starved GitHub's 16 GB
  // runners until they dropped ("lost communication", 9 of 90 parts on
  // 2026-11-03). Capped, such a process runs out of memory and fails at once,
  // which counts as caught. Every test passes with 1 GB.
  // Node 26 (CI's) no longer writes TAP when its output is piped, only its
  // own readable format, so the TAP runner could not read a failing test
  // file and called every caught bug a RuntimeError (run 41666543632: 1.1 %
  // "caught"). Ask for TAP.
  tap: { testFiles, nodeArgs: ['--max-old-space-size=1536', '--test-reporter=tap'] },
  // A deep sweep (MUTATION_DEEP, .github/workflows/mutation.yml) plants bugs
  // in the build and check scripts too.
  mutate: [
    'src/core/**/*.js',
    'src/net/**/*.js',
    'server/src/**/*.js',
    'src/game/**/*.js',
    ...(DEEP ? ['scripts/**/*.js', 'scripts/**/*.mjs'] : [])
  ],
  // Run each planted bug only against the test files that reach it, and all
  // of them (not just the first to catch it), so the report says which test
  // files catch what, and which catch nothing.
  coverageAnalysis: 'perTest',
  disableBail: true,
  // A bug in code that runs as a module loads (the tables in content.js,
  // goals.js) is run against every test file, minutes each, since every test
  // loads it; those were most of the sweep's time. Left out, and counted as
  // "Ignored" in the report.
  ignoreStatic: true,
  // index.html's inline script is hashed by a test: leave every file as is.
  disableTypeChecks: false,
  // A planted bug that makes a test loop forever is stopped after the test
  // file's own time x 1.5 plus this; a minute each was most of some parts'
  // time.
  timeoutMS: 15000,
  // The first run of every test file, before any bug is planted, takes about
  // 2.5 minutes here and over 5 on a CI runner (Stryker's default limit).
  dryRunTimeoutMinutes: 30,
  reporters: ['json', 'progress-append-only'],
  // Each part of the sweep names its own (MUTATION_REPORT).
  jsonReporter: { fileName: process.env.MUTATION_REPORT || 'reports/mutation/mutation.json' },
  ignorePatterns: ['node_modules', '.git', 'reports', 'parts', 'site', 'render-checks', 'dist'],
  tempDirName: '.stryker-tmp'
};
