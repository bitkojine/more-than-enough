import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

test('nearest search prunes distant explored branches after finding a nearby answer', () => {
  const w = C.createWorld(12345);
  C.markExplored(w, 32, 32, 0);
  for (let i = 0; i < 1000; i++) C.markExplored(w, -1000 - i * 16, -1000, 0);
  const work = { nodes: 0, chunks: 0, cells: 0 };
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 120000, () => true, work), { x: 32, y: 32 });
  assert.equal(work.chunks, 1, 'a thousand distant known chunks cannot improve the near result');
  assert.equal(work.cells, 1);
  assert.ok(work.nodes < 100, `tree work stays bounded: ${work.nodes}`);
  w.explored = new Map(w.explored);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 120000, () => true), { x: 32, y: 32 }, 'plain-Map snapshots retain the same result');
});

for (const dense of [false, true]) test(`explored search preserves exhaustive ring ordering (${dense ? 'dense' : 'sparse'} fog)`, () => {
  const w = C.createState(20260101).world;
  for (const z of [0, -1]) {
    for (let y = -36; y <= 36; y++) for (let x = -36; x <= 36; x++) {
      if (dense || (x * x + y * y) % 17 < 3) C.markExplored(w, x, y, z);
    }
    for (const [x, y] of [[0.5, 0.5], [-15.8, 16.2], [34.2, -34.8], [100.5, 100.5]]) {
      for (const maxR of [0, 4, 5, 16, 40, 120]) for (const modulus of [1, 7, 31]) {
        const pred = (tx, ty) => (tx * 13 + ty * 11) % modulus === 0;
        assert.deepEqual(C.nearestExploredTile(w, x, y, z, maxR, pred),
          C.nearestTile(x, y, maxR, (tx, ty) => C.isExplored(w, tx, ty, z) && pred(tx, ty)));
      }
    }
  }
});

test('explored search never queries terrain hidden by fog, and sees new reveals immediately', () => {
  const w = C.createState(12345).world;
  w.explored.clear();
  C.markExplored(w, -32, 32, -1);
  let calls = 0;
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, -1, 120, (x, y) => {
    assert.equal(C.isExplored(w, x, y, -1), true); calls++; return true;
  }), { x: -32, y: 32 });
  assert.equal(calls, 1);
  C.markExplored(w, 1, 0, -1);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, -1, 120, () => true), { x: 1, y: 0 });
});
