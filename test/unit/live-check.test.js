import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problems, latestRuns, GRACE_MIN } from '../../scripts/live-check.mjs';

const run = (name, conclusion, status = 'completed') => ({ name, conclusion, status, html_url: 'u' });
const site = { up: true, live: 'a', want: 'a', ageMin: 99 };
const rooms = { up: true, live: 'c', want: 'c', current: true, ageMin: 99 };

test('live check: all green and current is no problem', () => {
  assert.deepEqual(problems({ runs: [run('Test and deploy', 'success'), run('Room service', 'cancelled')], site, rooms }), []);
});

test('live check: a failed latest run is a problem, an older failure is not', () => {
  const runs = latestRuns([run('Room service', 'failure'), run('Room service', 'success'), run('Live check', 'failure')], ['Live check']);
  assert.equal(problems({ runs }).length, 1);
  assert.deepEqual(problems({ runs: latestRuns([run('Room service', 'success'), run('Room service', 'failure')]) }), []);
  assert.deepEqual(problems({ runs: [run('Room service', null, 'in_progress')] }), []);
});

test('live check: a stale site or room service counts only after the grace time', () => {
  assert.equal(problems({ site: { ...site, live: 'old', ageMin: GRACE_MIN - 1 } }).length, 0);
  assert.equal(problems({ site: { ...site, live: 'old' } }).length, 1);
  assert.equal(problems({ rooms: { ...rooms, current: false, ageMin: GRACE_MIN - 1 } }).length, 0);
  assert.equal(problems({ rooms: { ...rooms, live: null, current: false } }).length, 1);
});

test('live check: a service that does not answer is always a problem', () => {
  assert.equal(problems({ site: { up: false, error: 'x', ageMin: 0 }, rooms: { up: false, error: 'y', ageMin: 0 } }).length, 2);
});
