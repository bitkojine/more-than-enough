import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTickClock, TICK_HZ } from '../../src/engine/clock.js';
import { serialize } from '../../src/core/index.js';
import { createAutoplaySession } from '../../scripts/autoplay-driver.mjs';

test('wall-time adapters produce the same ticks at 10, 30, 60 and jittery render schedules', () => {
  const schedules = [Array(10).fill(0.1), Array(30).fill(1 / 30), Array(60).fill(1 / 60),
    Array.from({ length: 10 }, () => [0.01, 0.02, 0.03, 0.04]).flat()];
  for (const schedule of schedules) {
    let calls = 0;
    const clock = createTickClock(() => calls++);
    for (const dt of schedule) clock.advance(dt);
    assert.equal(calls, TICK_HZ);
    assert.equal(clock.ticks, TICK_HZ);
    assert.ok(clock.alpha < 1e-8);
  }
});

test('headless advancement has no frame budget, while browser catch-up is bounded', () => {
  let calls = 0;
  const clock = createTickClock(() => calls++);
  clock.advanceTicks(3600);
  assert.equal(calls, 3600);
  assert.equal(clock.advance(3600), 6, 'a long browser suspension cannot create a spiral of catch-up');
  assert.equal(clock.advance(0), 0, 'discarded wall time does not remain queued');
  assert.throws(() => clock.advanceTicks(1.5));
  assert.throws(() => clock.advance(-1));
});

test('pausing discards partial active time instead of banking it for the return', () => {
  let calls = 0;
  const clock = createTickClock(() => calls++);
  clock.advance(0.008);
  clock.reset();
  clock.advance(0.009);
  assert.equal(calls, 0);
});

test('AUTO state is identical with no rendering, 30 Hz rendering, 60 Hz rendering or jitter', () => {
  const direct = createAutoplaySession(7654321);
  direct.press();
  direct.advanceTicks(30 * TICK_HZ);
  direct.release();
  const expected = serialize(direct.state);
  for (const pattern of [[1 / 30], [1 / 60], [0.01, 0.02, 0.03, 0.04]]) {
    const session = createAutoplaySession(7654321);
    const clock = createTickClock(session.tick);
    session.press();
    const repetitions = Math.round(30 / pattern.reduce((a, b) => a + b, 0));
    for (let i = 0; i < repetitions; i++) for (const dt of pattern) clock.advance(dt);
    session.release();
    assert.equal(clock.ticks, 30 * TICK_HZ);
    assert.equal(serialize(session.state), expected);
    assert.deepEqual(session.state.extractors, direct.state.extractors);
  }
});
