import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutoplaySession, playAutoplay, createProgressWatch, createMovementWatch, createLayerWatch } from '../../scripts/autoplay-driver.mjs';
import { createState, RESOURCES, serialize, deserialize } from '../../src/core/index.js';

test('the shipped AUTO handler plays from spawn with only a held button and stops on release', () => {
  const actions = [];
  const session = createAutoplaySession(78934561, (intent, result) => actions.push({ intent, result }));
  for (let i = 0; i < 120; i++) session.tick();
  assert.equal(actions.length, 0, 'no AUTO actions without the button held');
  session.press();
  for (let i = 0; i < 60 * 30; i++) session.tick();
  assert.ok(actions.some(({ intent }) => intent.type === 'walk'));
  assert.ok(actions.some(({ intent }) => intent.type === 'harvestAt'));
  assert.equal(actions.filter(({ result }) => result === false).length, 0);
  assert.ok(session.state.stats.gathers > 0);
  session.release();
  const count = actions.length;
  const position = { ...session.state.player };
  for (let i = 0; i < 120; i++) session.tick();
  assert.equal(actions.length, count, 'release stops decisions and actions');
  assert.deepEqual(session.state.player, position, 'release also stops walking');
});

test('AUTO games respect tick counts and report an unfinished game as a timeout', () => {
  const session = createAutoplaySession(78934562);
  assert.throws(() => session.advanceTicks(1.5));
  const run = playAutoplay({ seed: 78934562, hours: 0.001 });
  assert.equal(run.embark, null);
  assert.equal(run.driver, 'shared fixed-tick engine + shipped AUTO');
  assert.equal(run.tickHz, 60);
  assert.ok(Math.abs(run.played - 3.6) < 1 / 60);
});

test('looping through known land cannot hide a five-minute stall', () => {
  const s = createState(12345), watch = createProgressWatch();
  assert.equal(watch.sample(1, s), false);
  s.player.x += 10; // walking alone is not productive progress
  assert.equal(watch.sample(300, s), false);
  assert.equal(watch.sample(301, s), true);
  assert.equal(watch.longest, 300);
  s.stats.mycelium++;
  assert.equal(watch.sample(302, s), false, 'earning resources resumes productive progress');
});

test('exploring or recharging counts as progress even before resources are earned', () => {
  const s = createState(12345), watch = createProgressWatch();
  s.battery = 0;
  watch.sample(1, s);
  s.world.revealed++;
  assert.equal(watch.sample(300, s), false);
  s.battery += 0.1;
  assert.equal(watch.sample(599, s), false);
});

test('passive income cannot hide pacing between the same mine tiles', () => {
  const s = createState(12345), watch = createMovementWatch();
  for (let second = 1; second <= 300; second++) {
    s.stats.mycelium += 100;
    s.player.x = second % 2;
    assert.equal(watch.sample(second, s, 'moving'), false);
  }
  assert.equal(watch.sample(301, s, 'moving'), true);
  s.stats.gathers++;
  assert.equal(watch.sample(302, s, 'moving'), false);
});

test('a long route through known land does not count as pacing in a small area', () => {
  const s = createState(12345), watch = createMovementWatch();
  for (let second = 1; second <= 600; second++) {
    s.player.x = second;
    assert.equal(watch.sample(second, s, 'moving'), false);
  }
});

test('quiet-tick scheduling preserves the actual shipped AUTO command stream and saved world', () => {
  // Constructed integration fixture, not a fresh-seed win evaluation.
  const fineActs = [], fastActs = [];
  const fine = createAutoplaySession(78934563, intent => fineActs.push([fine.state.time, { ...intent }]));
  const fast = createAutoplaySession(78934563, intent => fastActs.push([fast.state.time, { ...intent }]));
  for (const session of [fine, fast]) {
    session.state.unlocks.logistics = true;
    for (const r of RESOURCES) session.state.inv[r] = 1e6;
    session.press();
  }
  for (let i = 0; i < 1800; i++) fine.tick();
  fast.advanceTicks(1800);
  assert.deepEqual(fastActs, fineActs, 'commands occur on the same game ticks');
  assert.equal(serialize(fast.state), serialize(fine.state));
  assert.deepEqual(fast.state.extractors, fine.state.extractors);
  assert.ok(fast.work.idleTicksSkipped > 0, 'the fast run actually coalesced quiet ticks');
  assert.ok(fast.work.updates < fine.work.updates);
});

test('passive income cannot hide repeated climbing and descending between samples', () => {
  const s = createState(12345), watch = createLayerWatch();
  for (let second = 1; second <= 300; second++) {
    s.stats.mycelium += 1000;
    assert.equal(watch.sample(second, s, second * 2, second * 2), false);
  }
  assert.equal(watch.sample(301, s, 602, 602), true);
  s.stats.gathers++;
  assert.equal(watch.sample(302, s, 604, 604), false);
});

test('a one-way climb is not mistaken for a layer oscillation', () => {
  const s = createState(12345), watch = createLayerWatch();
  for (let second = 1; second <= 600; second++) assert.equal(watch.sample(second, s, second, 0), false);
});

test('a wall-time budget stops an unfinished world with its canonical state retained', () => {
  const run = playAutoplay({ seed: 78934564, hours: 40, wallSeconds: 1e-9 });
  assert.equal(run.embark, null);
  assert.equal(run.stopReason, 'wall-budget');
  assert.equal(run.stalled, false);
  assert.ok(deserialize(JSON.stringify(run.failureState)));
  assert.throws(() => playAutoplay({ seed: 78934564, hours: 1, wallSeconds: -1 }));
});
