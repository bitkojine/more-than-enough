/* Benchmark for the Perfect button's brain (src/core/perfect.js).
 *
 * Holds Perfect from the first spawn on several seeds, the way the unit
 * tests do (test/unit/helpers.js holdPerfect: real walking, one act every
 * 0.25 s), until Embark opens or the hour cap is hit, one seed per worker.
 * For each seed it reports when every milestone was reached and how the
 * brain behaved: acts the game refused, steps that went nowhere, time spent
 * waiting, trips between layers and how short they were.
 *
 *   node scripts/perfect-bench.mjs [--seeds 12345,777,99 | --seeds 8] [--hours 60]
 *                                  [--out run.json] [--against old.json]
 *
 * `--seeds 8` takes the first 8 of a fixed list, so runs stay comparable.
 * `--against` prints the change from an earlier `--out` file, seed by seed.
 * A full run to Embark is ~36-45 h of game time, about 4 minutes per seed. */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';

const SEEDS = [12345, 777, 99, 20260101, 4242, 2415085376, 4055616911, 3668339994, 31337, 8080, 1, 65535];
const SHORT_TRIP = 30; // seconds below the surface that count as popping in and out

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seeds = /^\d+$/.test(args.seeds) && Number(args.seeds) <= SEEDS.length
    ? SEEDS.slice(0, Number(args.seeds))
    : args.seeds.split(',').map(Number);
  const hours = Number(args.hours);
  const runs = [];
  const queue = [...seeds];
  const lanes = Array.from({ length: Math.min(seeds.length, availableParallelism()) }, async () => {
    while (queue.length) {
      const seed = queue.shift();
      const run = await new Promise((done, fail) => {
        const w = new Worker(new URL(import.meta.url), { workerData: { seed, hours } });
        w.once('message', done);
        w.once('error', fail);
      });
      process.stderr.write(`seed ${seed}: ${run.embark === null ? 'no Embark' : 'Embark'} at ${h(run.played)}\n`);
      runs.push(run);
    }
  });
  await Promise.all(lanes);
  runs.sort((a, b) => seeds.indexOf(a.seed) - seeds.indexOf(b.seed));
  const result = { hours, runs, summary: summarize(runs) };
  if (args.out) writeFileSync(args.out, JSON.stringify(result, null, 1) + '\n');
  report(result, args.against && JSON.parse(readFileSync(args.against, 'utf8')));
}

function parseArgs(argv) {
  const args = { seeds: '12345,777,99', hours: '60' };
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

/* ---------------------------------------------------------------- a seed */

async function play({ seed, hours }) {
  const C = await import('../src/core/index.js');
  const { holdPerfect } = await import('../test/unit/helpers.js');
  const s = C.createState(seed);
  const milestones = {};
  const b = { refused: 0, nowhere: 0, walks: 0, waited: 0, layerChanges: 0, shortTrips: 0, goals: 0 };
  let z = s.player.z, wentDown = 0, at = { x: s.player.x, y: s.player.y }, goal = null, waitFrom = null;
  const mind = C.newMind();
  const { played, last } = holdPerfect(s, hours * 3600, {
    mind,
    tick() {
      for (const g of C.advanceGoals(s)) milestones[g.id] = s.time;
      s.events.length = 0;
    },
    seen(intent, result) {
      if (waitFrom !== null) { b.waited += s.time - waitFrom; waitFrom = null; }
      if (intent.type === 'wait') { if (intent.why !== 'embark') waitFrom = s.time - 1; }
      else if (intent.type === 'walk') {
        b.walks++;
        if (Math.hypot(s.player.x - at.x, s.player.y - at.y) < 0.01) b.nowhere++;
      } else if (result && result.ok === false) b.refused++;
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
  return { seed, played, embark, milestones, behaviour: b, abundance: s.abundanceLv, buildings: s.extractors.length };
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

function report({ runs, summary }, before) {
  const old = (seed) => before && before.runs.find((r) => r.seed === seed);
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
  console.log('\nmedian Embark ' + h(summary.embark) + delta(summary.embark, before?.summary.embark) + `, ${summary.embarked}/${runs.length} seeds reached it`);
  console.log('milestones (median):');
  for (const [id, t] of Object.entries(summary.milestones).sort((a, b) => a[1] - b[1])) {
    console.log('  ' + id.padEnd(22) + h(t) + delta(t, before?.summary.milestones[id]));
  }
}

// Last, so every function and constant above is ready.
if (isMainThread) await main();
else parentPort.postMessage(await play(workerData));
