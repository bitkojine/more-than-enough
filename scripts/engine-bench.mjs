/* Bounded saved-world fixture, not a fresh-seed evaluation or a completed game.
 * Compare the actual AUTO command stream under fine and coalesced scheduling.
 * No world file is written. Keep the fixture short before attempting long runs. */
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as C from '../src/core/index.js';
import { economyForState } from '../src/core/economy-context.js';
import { createAutoplaySession } from './autoplay-driver.mjs';

const { values } = parseArgs({ options: { save: { type: 'string' }, ticks: { type: 'string', default: '3600' },
  'budget-ms': { type: 'string', default: '1000' } } });
const ticks = Number(values.ticks);
const budgetMs = Number(values['budget-ms']);
if (!values.save || !Number.isSafeInteger(ticks) || ticks < 1 || ticks > 36000 ||
    !Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > 10000) {
  throw new Error('Use --save <fixture.json> and --ticks 1..36000');
}
const raw = JSON.parse(readFileSync(values.save, 'utf8'));
const saved = JSON.stringify(raw.run?.failureState || raw.failureState || raw);
assert.ok(C.deserialize(saved), 'fixture must be a readable kept save');
function run(fast) {
  const acts = [];
  const session = createAutoplaySession(JSON.parse(saved).seed, (intent, result) =>
    acts.push([session.state.time, { ...intent }, result]));
  Object.assign(session.state, C.deserialize(saved));
  const started = performance.now();
  session.press();
  let advanced = 0;
  while (advanced < ticks && performance.now() - started < budgetMs) {
    if (fast) advanced += session.advanceChunk(ticks - advanced);
    else { session.tick(); advanced++; }
  }
  const wallMs = performance.now() - started;
  session.release();
  const canonical = C.serialize(session.state);
  return { advanced, wallMs, work: session.work, economyWork: economyForState(session.state)?.work,
    acts, canonical, buffers: session.state.extractors.map(e => e.buffer) };
}
const fine = run(false);
if (fine.advanced < ticks) {
  console.log(JSON.stringify({ kind: 'bounded saved-world fixture stopped at wall-time budget; not a completed game',
    requestedTicks: ticks, advancedTicks: fine.advanced, wallMs: fine.wallMs, budgetMs, work: fine.work }, null, 2));
  process.exit(2);
}
const fast = run(true);
if (fast.advanced < ticks) {
  console.log(JSON.stringify({ kind: 'coalesced fixture stopped at wall-time budget; not a completed game',
    requestedTicks: ticks, advancedTicks: fast.advanced, wallMs: fast.wallMs, budgetMs, work: fast.work }, null, 2));
  process.exit(2);
}
assert.deepEqual(fast.acts, fine.acts, 'commands and their exact game ticks must match');
assert.equal(fast.canonical, fine.canonical, 'canonical world must match');
assert.deepEqual(fast.buffers, fine.buffers, 'unrounded buffers must match');
const report = result => ({ wallMs: result.wallMs, work: result.work, economyWork: result.economyWork,
  actions: result.acts.length });
console.log(JSON.stringify({ kind: 'bounded saved-world AUTO fixture; not a completed game',
  gameSeconds: ticks / 60, fine: report(fine), fast: report(fast),
  canonicalStateEqual: true, commandsEqual: true, unroundedBuffersEqual: true,
  stateHash: createHash('sha256').update(fast.canonical).digest('hex') }, null, 2));
