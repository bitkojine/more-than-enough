import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reserveSeeds, speedSummary, options } from '../../scripts/playtest.mjs';

test('fresh evaluation excludes benchmark seeds and reservations from interrupted runs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mte-seeds-'));
  try {
    const draws = [12345, 777, 200000, 200000, 200001];
    assert.deepEqual(reserveSeeds(dir, 2, () => draws.shift()), [200000, 200001]);
    const next = [200001, 200000, 200002];
    assert.deepEqual(reserveSeeds(dir, 1, () => next.shift()), [200002]);
  } finally { rmSync(dir, { recursive: true }); }
});

test('timeouts are distinct from wins and never become fastest wins', () => {
  const s = speedSummary([{ embark: null }, { embark: 39 * 3600 }, { embark: 41 * 3600 }]);
  assert.equal(s.won, 2);
  assert.equal(s.timedOut, 1);
  assert.equal(s.fastest, 39 * 3600);
  assert.equal(s.medianWin, 40 * 3600);
  assert.equal(s.under40Hours, 1);
  assert.equal(speedSummary([{ embark: null }]).fastest, null);
  const bounded = speedSummary([{ embark: null, stopReason: 'wall-budget' }]);
  assert.equal(bounded.timedOut, 0); assert.equal(bounded.budgetExceeded, 1);
});

test('invalid or unbounded individual games are rejected before reserving seeds', () => {
  for (const args of [['--worlds', '0'], ['--hours', 'Infinity'], ['--jobs', '-1'], ['--batches', '1.5'], ['--wallSeconds', '-1'], ['--wallSeconds', 'Infinity'], ['--fps', '1'], ['--fps', '120'], ['--seeds', '12345'], ['--state']]) {
    assert.throws(() => options(args));
  }
  assert.equal(options(['--batches', '0']).batches, 0);
  assert.equal(options(['--wallSeconds', '60']).wallSeconds, 60);
});


test('a source-invalidated win is retained but excluded from evaluation wins and speed statistics',()=>{
 const summary=speedSummary([{embark:1,evaluationValid:false},{embark:7200,evaluationValid:true}]);
 assert.equal(summary.completed,2);assert.equal(summary.invalid,1);assert.equal(summary.won,1);
 assert.equal(summary.fastest,7200);assert.equal(summary.medianWin,7200);
});
