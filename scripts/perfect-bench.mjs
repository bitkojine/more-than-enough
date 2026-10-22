/* Benchmark for the Perfect button's brain (src/core/perfect.js). Its
 * score is the one Watch chose: hours of play, held from the first spawn,
 * until Embark opens (median over the seeds; lower is better).
 *
 * Holds Perfect from spawn on several seeds the way the unit tests do
 * (test/unit/helpers.js holdPerfect: real walking, one act every 0.25 s),
 * one seed per worker, and reports when every milestone was reached and how
 * the brain behaved: acts the game refused, steps that went nowhere, time
 * spent waiting, trips between layers and how many were only a quick pop down.
 *
 *   node scripts/perfect-bench.mjs [--seeds 4 | --seeds 12345,777] [--hours 60]
 *       [--knobs '{"stick":20}'] [--out run.json] [--against old.json]
 *       [--check] [--write]
 *
 * `--seeds 4` takes the first 4 of a fixed list, so runs stay comparable.
 * `--knobs` overrides the brain's KNOBS for this run. `--against` prints the
 * change from an earlier `--out` file. `--check` (CI) fails unless every seed
 * reaches Embark with no refused acts or quick pops down. With unchanged
 * canonical rules, it also rejects a slower median beyond TOLERANCE; faster
 * wins always pass. Changed rules report timing without comparing the old
 * balance target. `--write` records a reviewed baseline and rules fingerprint. */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TRAINING_SEEDS as SEEDS } from '../src/game/autoplay-seeds.js';
const SHORT_TRIP = 30;    // seconds below the surface that count as popping in and out
const TOLERANCE = 0.02;   // maximum slowdown under unchanged rules
const BASELINE = fileURLToPath(new URL('../test/perfect-baseline.json', import.meta.url));

// Scope strategy timing comparisons to the canonical rules, excluding the brain.
export function rulesFingerprint() {
  const root = new URL('../src/core/', import.meta.url), hash = createHash('sha256');
  for (const name of readdirSync(root).filter(n => n.endsWith('.js') && n !== 'perfect.js').sort()) {
    hash.update(name).update('\0').update(readFileSync(new URL(name, root))).update('\0');
  }
  return hash.digest('hex');
}

/** Plays `seeds` (numbers) for up to `hours` each with `knobs`; resolves to { hours, knobs, runs, summary }. */
export async function bench({ seeds, hours = 60, wallSeconds = 0, knobs = {}, driver = 'core', jobs = availableParallelism(), canStart = () => true, onResult = () => {}, onProgress = () => {}, log = () => {} }) {
  if (!seeds.length || !Number.isFinite(hours) || hours <= 0 || !Number.isInteger(jobs) || jobs < 1) throw new Error('Benchmark needs seeds, a positive time cap and a positive worker count');
  const runs = [];
  const queue = [...seeds];
  const lanes = Array.from({ length: Math.min(seeds.length, jobs, availableParallelism()) }, async () => {
    while (queue.length) {
      if (!canStart()) break;
      const seed = queue.shift();
      const run = await new Promise((done, fail) => {
        const w = new Worker(new URL(import.meta.url), { workerData: { seed, hours, wallSeconds, knobs, driver } });
        w.on('message', (message) => {
          if (message.progress === true) {
            if (message.driver === 'core') log(`seed ${seed}: core regression, ${message.hours.toFixed(0)} simulated h played; ${message.point.buildings} buildings, ${message.point.goal || "no goal"}\n`);
            else log(`seed ${seed}: AUTO still held, ${message.hours.toFixed(0)} simulated h played; ${message.point.buildings} buildings, ${message.point.badge}, ${Math.round(message.point.seconds.blocked)} s blocked\n`);
            onProgress({ seed, point: message.point });
          }
          else done(message);
        });
        w.once('error', fail);
        w.once('exit', (code) => { if (code !== 0) fail(new Error(`seed ${seed}: worker exited ${code}`)); });
      });
      log(`seed ${seed}: ${run.embark === null ? 'no Embark' : 'Embark'} at ${h(run.played)}\n`);
      runs.push(run);
      onResult(run);
    }
  });
  await Promise.all(lanes);
  runs.sort((a, b) => seeds.indexOf(a.seed) - seeds.indexOf(b.seed));
  return { hours, knobs, runs, rulesHash: rulesFingerprint(), summary: summarize(runs) };
}

/** Takes `--seeds` as a count from the fixed list or a comma-separated list. */
export function pickSeeds(arg) {
  return /^\d+$/.test(arg) && Number(arg) <= SEEDS.length ? SEEDS.slice(0, Number(arg)) : arg.split(',').map(Number);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseline = args.check && readJson(BASELINE);
  const seeds = args.seeds ? pickSeeds(args.seeds) : baseline ? baseline.seeds : SEEDS.slice(0, 4);
  const result = await bench({ seeds, hours: Number(args.hours || 60), jobs: Number(args.jobs || availableParallelism()), knobs: JSON.parse(args.knobs || '{}'), log: (m) => process.stderr.write(m) });
  if (args.out) writeFileSync(args.out, JSON.stringify(result, null, 1) + '\n');
  report(result, args.against ? readJson(args.against) : baseline || null);
  if (args.check && result.rulesHash !== baseline?.rulesHash) {
    console.log("Canonical rules changed or baseline has no rules fingerprint: completion time is informational; completion and behavior checks still apply.");
  }
  if (args.write) {
    const embark = Object.fromEntries(result.runs.map((r) => [r.seed, r.embark]));
    writeFileSync(BASELINE, JSON.stringify({ seeds, rulesHash: result.rulesHash, median: result.summary.embark, embark }, null, 1) + '\n');
    console.log('\nrecorded in test/perfect-baseline.json');
  }
  if (args.check) {
    const problems = check(result, baseline);
    for (const p of problems) console.log('FAIL ' + p);
    if (problems.length) process.exit(1);
    console.log('\nPerfect completion and behavior checks passed');
  }
}

// Core actions return booleans, nullable harvest/collection results, or
// {ok}. A rejected boolean/null must not disappear from the audit report.
export function actionWasRefused(result) {
  return result === false || result === null || result?.ok === false;
}

// What --check objects to in `result`, measured against `baseline`.
export function check({ runs, summary, rulesHash }, baseline) {
  const out = [];
  for (const r of runs) {
    if (r.embark === null) out.push(`seed ${r.seed} never reached Embark`);
    if (r.behaviour.refused) out.push(`seed ${r.seed}: the game refused ${r.behaviour.refused} acts Perfect picked`);
    if (r.behaviour.shortTrips) out.push(`seed ${r.seed}: ${r.behaviour.shortTrips} trips down lasted under ${SHORT_TRIP} s`);
  }
  if (summary.embark !== null && baseline && rulesHash && rulesHash === baseline.rulesHash) {
    const d = (summary.embark - baseline.median) / baseline.median;
    if (d > TOLERANCE) out.push(`median Embark ${h(summary.embark)} is ${pct(d)} slower than the baseline ${h(baseline.median)}: investigate the strategy regression under unchanged rules`);
  }
  return out;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, '');
    args[name] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/* ---------------------------------------------------------------- a seed */

async function play({ seed, hours, wallSeconds, knobs, driver }) {
  if (driver === 'auto') {
    if (Object.keys(knobs).length) throw new Error('AUTO evaluation uses only the shipped strategy');
    const { playAutoplay } = await import('./autoplay-driver.mjs');
    return playAutoplay({ seed, hours, wallSeconds,
      onProgress: (played, point) => parentPort.postMessage({ progress: true, hours: played / 3600, point }) });
  }
  const C = await import('../src/core/index.js');
  const { holdPerfect } = await import('../test/unit/helpers.js');
  const s = C.createState(seed);
  const milestones = {};
  const b = { refused: 0, nowhere: 0, walks: 0, waited: 0, layerChanges: 0, shortTrips: 0, goals: 0 };
  let z = s.player.z, wentDown = 0, at = { x: s.player.x, y: s.player.y }, goal = null, waitFrom = null;
  const mind = C.newMind(knobs);
  let nextProgress = 3600;
  const { played, last } = holdPerfect(s, hours * 3600, {
    mind,
    tick() {
      for (const g of C.advanceGoals(s)) milestones[g.id] = s.time;
      s.events.length = 0;
      if (s.time >= nextProgress) {
        parentPort.postMessage({ progress: true, driver: 'core', hours: s.time / 3600,
          point: { buildings: s.extractors.length, goal: mind.goal?.id || null } });
        nextProgress += 3600;
      }
    },
    seen(intent, result) {
      if (waitFrom !== null) { b.waited += s.time - waitFrom; waitFrom = null; }
      if (intent.type === 'wait') { if (intent.why !== 'embark') waitFrom = s.time; }
      else if (intent.type === 'walk') {
        b.walks++;
        if (Math.hypot(s.player.x - at.x, s.player.y - at.y) < 0.01) b.nowhere++;
      } else if (actionWasRefused(result)) b.refused++;
      at = { x: s.player.x, y: s.player.y };
      if (s.player.z !== z) {
        b.layerChanges++;
        if (z === C.SURFACE) wentDown = s.time;
        else if (s.player.z === C.SURFACE && s.time - wentDown < SHORT_TRIP) b.shortTrips++;
        z = s.player.z;
      }
      if (mind.goal !== goal) { goal = mind.goal; if (goal) b.goals++; }
    }
  });
  if (waitFrom !== null) b.waited += s.time - waitFrom;
  const embark = last && last.why === 'embark' ? played : null;
  return { seed, played, embark, milestones, behaviour: b, driver: 'core-action regression helper (not shipped AUTO host)', abundance: s.abundanceLv, buildings: s.extractors.length,
    ...(embark === null ? { failureState: JSON.parse(C.serialize(s)) } : {}) };
}

/* -------------------------------------------------------------- reporting */

const median = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

function summarize(runs) {
  const ids = [...new Set(runs.flatMap((r) => Object.keys(r.milestones)))];
  const milestones = {};
  for (const id of ids) milestones[id] = median(runs.map((r) => r.milestones[id] ?? null));
  return {
    embark: runs.every((r) => r.embark !== null) ? median(runs.map((r) => r.embark)) : null,
    embarked: runs.filter((r) => r.embark !== null).length,
    milestones,
    refused: runs.reduce((n, r) => n + r.behaviour.refused, 0),
    shortTrips: runs.reduce((n, r) => n + r.behaviour.shortTrips, 0),
    nowhereShare: runs.reduce((n, r) => n + r.behaviour.nowhere, 0) / Math.max(1, runs.reduce((n, r) => n + r.behaviour.walks, 0)),
    waitShare: runs.reduce((n, r) => n + r.behaviour.waited, 0) / Math.max(1, runs.reduce((n, r) => n + r.played, 0))
  };
}

function h(sec) {
  if (sec === null || sec === undefined) return '-';
  return sec < 3600 ? (sec / 60).toFixed(1) + ' min' : (sec / 3600).toFixed(2) + ' h';
}
const pct = (x) => (100 * x).toFixed(1) + '%';
function delta(now, then) {
  if (now === null || then === null || then === undefined) return '';
  const d = (now - then) / then;
  return ` (${d > 0 ? '+' : ''}${(100 * d).toFixed(1)}%)`;
}

// `before`: an earlier --out file, or the baseline (only Embark times).
function report({ runs, summary }, before) {
  const old = (seed) => before && (before.runs ? before.runs.find((r) => r.seed === seed) : { embark: before.embark[seed] });
  console.log('seed        Embark            refused  nowhere  waiting  layer changes  short trips');
  for (const r of runs) {
    const b = r.behaviour;
    console.log([
      String(r.seed).padEnd(11),
      (h(r.embark) + delta(r.embark, old(r.seed)?.embark)).padEnd(17),
      String(b.refused).padStart(7),
      pct(b.nowhere / Math.max(1, b.walks)).padStart(8),
      pct(b.waited / r.played).padStart(8),
      String(b.layerChanges).padStart(14),
      String(b.shortTrips).padStart(12)
    ].join(' '));
  }
  console.log('\nmedian Embark ' + h(summary.embark) + delta(summary.embark, before && (before.summary ? before.summary.embark : before.median)) + `, ${summary.embarked}/${runs.length} seeds reached it`);
  console.log('milestones (median):');
  for (const [id, t] of Object.entries(summary.milestones).sort((a, b) => a[1] - b[1])) {
    console.log('  ' + id.padEnd(22) + h(t) + delta(t, before?.summary?.milestones[id]));
  }
}

// Last, so every function and constant above is ready. Run as a script it
// benchmarks; as a worker it plays one seed; imported, it only lends bench().
if (!isMainThread) parentPort.postMessage(await play(workerData));
else if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
