/* Fresh-world evaluation of the shipped Perfect brain. Seed reservations survive
 * interrupted runs; evaluation never changes the strategy or its tuning knobs. */
import { randomInt, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { bench, pickSeeds } from './perfect-bench.mjs';
import { KNOBS } from '../src/core/perfect.js';
import { TICK_HZ } from '../src/engine/clock.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Exclusive creation also prevents two runners sharing this directory from
// using the same seed. Never remove reservations, even for unfinished games.
export function reserveSeeds(directory, count, draw = () => randomInt(1, 2 ** 32)) {
  mkdirSync(directory, { recursive: true });
  const excluded = new Set(pickSeeds('12'));
  const seeds = [];
  for (let tries = 0; seeds.length < count; tries++) {
    if (tries > 10000 + count * 10) throw new Error('Cannot reserve fresh seeds');
    const seed = draw();
    if (!Number.isInteger(seed) || seed < 1 || seed >= 2 ** 32) throw new Error('Invalid world seed');
    if (excluded.has(seed)) continue;
    try {
      writeFileSync(join(directory, `${seed}.json`), JSON.stringify({ seed, reserved: new Date().toISOString() }) + '\n', { flag: 'wx' });
      seeds.push(seed);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  return seeds;
}

export function speedSummary(runs) {
  const wins = runs.filter((r) => r.embark !== null && r.evaluationValid !== false).map((r) => r.embark).sort((a, b) => a - b);
  return {
    completed: runs.length, invalid: runs.filter(r => r.evaluationValid === false).length, won: wins.length, timedOut: runs.filter((r) => r.evaluationValid !== false && r.embark === null && !r.stalled && r.stopReason !== 'wall-budget').length,
    budgetExceeded: runs.filter(r => r.stopReason === 'wall-budget').length,
    stalled: runs.filter((r) => r.stalled).length,
    fastest: wins[0] ?? null,
    medianWin: wins.length ? (wins[Math.floor((wins.length - 1) / 2)] + wins[Math.floor(wins.length / 2)]) / 2 : null,
    slowestWin: wins.at(-1) ?? null,
    under40Hours: wins.filter((t) => t < 40 * 3600).length
  };
}

function provenance() {
  const files = ['scripts/playtest.mjs', 'scripts/perfect-bench.mjs', 'scripts/autoplay-driver.mjs',
    'src/game/autoplay-session.js', 'src/game/autoplay-seeds.js', 'src/game/perfect.js', 'src/game/controller.js', 'src/game/input.js', 'src/game/main.js',
    'src/engine/clock.js', 'src/engine/simulation.js',
    ...readdirSync(join(ROOT, 'src/core')).filter((f) => f.endsWith('.js')).map((f) => `src/core/${f}`)];
  const hash = createHash('sha256');
  for (const f of files.sort()) hash.update(f).update('\0').update(readFileSync(join(ROOT, f))).update('\0');
  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    sourceHash: hash.digest('hex'), node: process.version, knobs: { ...KNOBS },
    win: 'first Embark eligible', driver: 'shared fixed-tick engine + shipped AUTO', tickHz: TICK_HZ,
    clock: 'foreground simulation seconds, including walking and waiting; no offline production'
  };
}

export function options(argv) {
  const opts = { worlds: 4, batches: 1, jobs: Math.min(4, availableParallelism()), hours: 60, wallSeconds: 0,
    state: resolve(ROOT, '../.mte-playtests') };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !Object.hasOwn(opts, key) || argv[i + 1] === undefined) throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    opts[key] = key === 'state' ? resolve(argv[i + 1]) : Number(argv[i + 1]);
  }
  for (const key of ['worlds', 'batches', 'jobs', 'hours']) {
    if (!Number.isFinite(opts[key]) || opts[key] < (key === 'batches' ? 0 : Number.MIN_VALUE) || (key !== 'hours' && !Number.isInteger(opts[key]))) throw new Error(`Invalid --${key}`);
  }
  if (!Number.isFinite(opts.wallSeconds) || opts.wallSeconds < 0) throw new Error('Invalid --wallSeconds');
  return opts;
}

async function main() {
  const opts = options(process.argv.slice(2));
  const seedsDir = join(opts.state, 'seeds');
  const meta = provenance();
  const runs = [];
  console.log(`Hold AUTO only, shared engine at ${TICK_HZ} fixed ticks/second, no rendering; win = first Embark. No offline production.\nState: ${opts.state}\nSource: ${meta.sourceHash}`);
  for (let batch = 0; opts.batches === 0 || batch < opts.batches; batch++) {
    const seeds = reserveSeeds(seedsDir, opts.worlds);
    console.log(`Batch ${batch + 1}: ${seeds.join(', ')}`);
    const result = await bench({ seeds, hours: opts.hours, wallSeconds: opts.wallSeconds, jobs: opts.jobs, driver: 'auto',
      canStart: () => {
        const stable = provenance().sourceHash === meta.sourceHash;
        if (!stable) process.exitCode = 1;
        return stable;
      },
      log: (m) => process.stdout.write(m),
      onProgress({ seed, point }) {
        const file = join(seedsDir, `${seed}.json`);
        const reservation = JSON.parse(readFileSync(file, 'utf8'));
        writeFileSync(file, JSON.stringify({ ...reservation, ...meta, hours: opts.hours, wallSeconds: opts.wallSeconds, progress: point }, null, 2) + '\n');
      },
      onResult(run) {
        run.sourceHashAtResult = provenance().sourceHash;
        run.evaluationValid = run.sourceHashAtResult === meta.sourceHash;
        // Each world is saved immediately, even if another worker later fails.
        const file = join(seedsDir, `${run.seed}.json`);
        const reservation = JSON.parse(readFileSync(file, 'utf8'));
        writeFileSync(file, JSON.stringify({ ...reservation, finished: new Date().toISOString(), hours: opts.hours, wallSeconds: opts.wallSeconds, ...meta, run }, null, 2) + '\n');
        if (!run.evaluationValid || run.embark === null || run.behaviour.refused > 0) process.exitCode = 1;
        console.log(`  seed ${run.seed}: ${!run.evaluationValid ? 'INVALID (source changed)' : run.stopReason === 'wall-budget' ? 'WALL BUDGET' : run.stalled ? 'STALLED (' + run.stopReason + ')' : run.embark === null ? 'TIMEOUT' : (run.embark / 3600).toFixed(3) + ' h to win'}; refused ${run.behaviour.refused}, waiting ${(100 * run.behaviour.waited / run.played).toFixed(1)}%, blocked ${run.diagnostics.seconds.blocked.toFixed(1)} s`);
      }
    });
    runs.push(...result.runs);
    const s = speedSummary(runs);
    const h = (t) => t === null ? 'none' : (t / 3600).toFixed(3) + ' h';
    console.log(`This invocation: ${s.won}/${s.completed} won; ${s.invalid} invalid; ${s.stalled} stalled; ${s.timedOut} timed out at ${opts.hours} h; ${s.budgetExceeded} stopped at wall-time budget. Fastest ${h(s.fastest)}, median of wins ${h(s.medianWin)}, slowest win ${h(s.slowestWin)}. Under 40 h: ${s.under40Hours}.`);
    if (provenance().sourceHash !== meta.sourceHash) {
      console.error('Source changed: finished worlds were retained; no further worlds will start.');
      process.exitCode = 1; break;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
