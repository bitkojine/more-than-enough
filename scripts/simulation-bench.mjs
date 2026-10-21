/* Paired component benchmark against the frozen pre-optimization tick.
 * It measures CPU cost and exact state parity, not autoplay skill or a win. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as C from '../src/core/index.js';
import { step as reference } from '../test/support/reference-sim.js';
import { productionFixture } from '../test/support/production-fixture.js';

const args = process.argv.slice(2);
const number = (flag, fallback) => args.includes(flag) ? Number(args[args.indexOf(flag) + 1]) : fallback;
const ticks = number('--ticks', 18000), samples = number('--samples', 5);
if (![ticks, samples].every((n) => Number.isInteger(n) && n > 0)) throw new Error('Use positive integer ticks and samples');
let fixture = productionFixture();
if (args.includes('--save')) {
  const raw = JSON.parse(readFileSync(args[args.indexOf('--save') + 1], 'utf8'));
  fixture = C.deserialize(JSON.stringify(raw.run?.failureState || raw));
  if (!fixture) throw new Error('The supplied save cannot be loaded');
}
const run = (step) => {
  const state = structuredClone(fixture), start = performance.now();
  for (let i = 0; i < ticks; i++) { step(state, 1 / 60); state.events.length = 0; }
  return { ms: performance.now() - start, state };
};
const times = { reference: [], optimized: [] };
for (let i = -1; i < samples; i++) {
  // Alternate order; the first pair warms up both implementations.
  const order = i % 2 ? ['reference', 'optimized'] : ['optimized', 'reference'];
  const results = {};
  for (const name of order) results[name] = run(name === 'reference' ? reference : C.step);
  assert.equal(C.serialize(results.optimized.state), C.serialize(results.reference.state));
  assert.deepEqual(results.optimized.state.extractors, results.reference.state.extractors);
  if (i >= 0) for (const name of order) times[name].push(results[name].ms);
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(JSON.stringify({ component: 'economy tick, identical inputs and visual-event policy', ticks, samples,
  buildings: fixture.extractors.length, timesMs: times, speedup: median(times.reference) / median(times.optimized),
  exactStateParity: true, fixtureHash: createHash('sha256').update(C.serialize(fixture)).digest('hex') }, null, 2));
