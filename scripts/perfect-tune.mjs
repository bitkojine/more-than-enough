/* Re-learning for the Perfect button: searches the brain's KNOBS
 * (src/core/perfect.js) for the quickest median Embark on the benchmark
 * (scripts/perfect-bench.mjs). Run it after a rules change, when the
 * benchmark's --check says Perfect got slower, or whenever the brain changes.
 *
 *   node scripts/perfect-tune.mjs [--seeds 4] [--passes 3] [--from '{"stick":20}']
 *
 * One knob at a time it tries a step up and a step down and keeps whichever
 * beats the best so far by more than GAIN (a setting with any refused act or
 * quick pop down never counts); when a whole pass finds nothing, the step
 * halves. Settings slower than the best are cut off early (the hour cap
 * follows the best run). At the end it plays seeds it was not tuned on, so
 * a gain that only fits the tuning seeds shows. It prints the knobs to put
 * into KNOBS; then record the new score with perfect-bench.mjs --write.
 * Each try is a full benchmark run: expect hours. */

import { KNOBS } from '../src/core/perfect.js';
import { bench, check, pickSeeds } from './perfect-bench.mjs';

const GAIN = 0.003; // a try must be this much quicker (0.3%) to be kept
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => {
  const [k, ...v] = a.trim().split(' ');
  return [k, v.join(' ')];
}));
const seeds = pickSeeds(args.seeds || '4');
const held = pickSeeds('8').filter((x) => !seeds.includes(x)).slice(0, 4);
const passes = Number(args.passes || 3);
const log = (m) => process.stderr.write(m + '\n');
const hours = (sec) => (sec / 3600).toFixed(2) + ' h';

// The score of `knobs` on `on`: median hours to Embark, Infinity if it
// broke a behaviour rule or a seed didn't get there within `cap` seconds.
async function score(knobs, on, cap) {
  const r = await bench({ seeds: on, hours: cap / 3600, knobs });
  const why = check(r, null);
  return why.length ? { t: Infinity, r, why } : { t: r.summary.embark, r };
}

const capFor = (r) => 1.25 * Math.max(...r.runs.map((x) => x.embark));
let best = { ...KNOBS, ...JSON.parse(args.from || '{}') };
let top = await score(best, seeds, 60 * 3600);
if (!isFinite(top.t)) throw new Error('the starting knobs fail the benchmark: ' + top.why.join('; '));
log('start ' + hours(top.t) + ' ' + JSON.stringify(best));
const start = top.t;

let step = 0.5;
for (let pass = 0; pass < passes && step >= 0.1; pass++) {
  let gained = false;
  for (const name of Object.keys(KNOBS)) {
    for (const f of [1 + step, 1 - step]) {
      const tryK = { ...best, [name]: +(best[name] * f).toPrecision(3) };
      const got = await score(tryK, seeds, capFor(top.r));
      log(`  ${name} ${best[name]} -> ${tryK[name]}: ${isFinite(got.t) ? hours(got.t) : 'fails (' + got.why[0] + ')'}`);
      if (got.t < top.t * (1 - GAIN)) {
        best = tryK; top = got; gained = true;
        log(`kept ${name} = ${best[name]}: ${hours(top.t)}`);
        break;
      }
    }
  }
  if (!gained) step /= 2;
  log(`pass ${pass + 1} done, best ${hours(top.t)}, next step ${step}`);
}

// On seeds it never saw: does the gain hold?
const was = await score(KNOBS, held, 60 * 3600);
const now = await score(best, held, 60 * 3600);
console.log(`tuning seeds ${seeds.join(',')}: ${hours(start)} -> ${hours(top.t)}`);
console.log(`other seeds  ${held.join(',')}: ${hours(was.t)} -> ${hours(now.t)}`);
console.log('KNOBS = ' + JSON.stringify(best, null, 2));
