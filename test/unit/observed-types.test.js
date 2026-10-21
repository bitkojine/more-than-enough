import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

test('typed searches preserve exhaustive nearest-target ordering across resources and fog', () => {
  const s = C.createState(777), w = s.world;
  for (let y = -36; y <= 36; y++) for (let x = -36; x <= 36; x++) if ((x * 13 + y * 7) % 5) C.markExplored(w, x, y, 0);
  for (const type of [C.T.FOREST, C.T.STONE, C.T.ORE, C.T.CRYSTAL, C.T.CAVE, C.T.WATER]) {
    for (const [x, y] of [[0.5, 0.5], [-15.8, 16.2], [34.2, -34.8]]) for (const radius of [4, 16, 40]) {
      const pred = (tx, ty) => (tx * 13 + ty * 11) % 7 === 0;
      const expected = C.nearestTile(x, y, radius, (tx, ty) => C.isExplored(w, tx, ty, 0) && C.tileAt(w, tx, ty, 0) === type && pred(tx, ty));
      assert.deepEqual(C.nearestExploredTile(w, x, y, 0, radius, pred, null, type), expected);
    }
  }
});

test('repeated missing-resource searches do not rescan ten thousand unrelated known tiles', () => {
  const w = C.createWorld(12345);
  for (let cy = 0; cy < 14; cy++) for (let cx = 0; cx < 14; cx++) w.chunks.set(C.packKey(cx, cy, 0), {
    type: new Uint8Array(256), rich: new Uint8Array(256).fill(1) });
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) C.markExplored(w, x, y, 0);
  const first = { cells: 0, nodes: 0, chunks: 0 }, second = { cells: 0, nodes: 0, chunks: 0 };
  assert.equal(C.nearestExploredTile(w, 0.5, 0.5, 0, 300, () => true, first, C.T.CRYSTAL), null);
  assert.equal(first.classifiedCells, 10000);
  assert.equal(C.nearestExploredTile(w, 0.5, 0.5, 0, 300, () => true, second, C.T.CRYSTAL), null);
  assert.equal(second.classifiedCells || 0, 0);
  assert.equal(second.cells, 0);
  const reveal = (x, y, type) => {
    w.chunks.get(C.packKey(C.chunkCoord(x), C.chunkCoord(y), 0)).type[C.chunkIndex(x, y)] = type;
    C.markExplored(w, x, y, 0);
  };
  reveal(110, 110, C.T.CRYSTAL); // a newly seen cell in an already classified chunk
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 300, () => true, null, C.T.CRYSTAL), { x: 110, y: 110 });
  reveal(200, 200, C.T.ORE); // a newly explored chunk
  const added = { cells: 0, nodes: 0, chunks: 0 };
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 300, () => true, added, C.T.ORE), { x: 200, y: 200 });
  assert.equal(added.classifiedCells, 1, 'only the new chunk needs classification');
});

test('surface classification never reads an unseen cell', () => {
  const w = C.createWorld(12345), type = new Uint8Array(256).fill(C.T.STONE);
  w.chunks.set(C.packKey(0, 0, 0), { type: new Proxy(type, { get(target, key) {
    if (typeof key === 'string' && /^\d+$/.test(key)) assert.equal(Number(key), 5);
    return target[key];
  } }), rich: new Uint8Array(256).fill(1) });
  C.markExplored(w, 5, 0, 0);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 100, () => true, null, C.T.STONE), { x: 5, y: 0 });
});

test('observed type changes update the derived index without a save-format change', () => {
  const w = C.createWorld(12345);
  w.chunks.set(C.packKey(0, 0, 0), { type: new Uint8Array(256).fill(C.T.BEDROCK), rich: new Uint8Array(256).fill(1) });
  C.markExplored(w, 10, 0, 0);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 30, () => true, null, C.T.BEDROCK), { x: 10, y: 0 });
  C.setRichness(w, 10, 0, 0, 0);
  assert.equal(C.nearestExploredTile(w, 0.5, 0.5, 0, 30, () => true, null, C.T.BEDROCK), null);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 30, () => true, null, C.T.TUNNEL), { x: 10, y: 0 });
});

test('fog replacement and saving cannot retain stale typed candidates', () => {
  const s = C.createState(777), w = s.world, x = 32, y = 32;
  C.markExplored(w, x, y, 0);
  const type = C.tileAt(w, x, y, 0), pred = (tx, ty) => tx === x && ty === y;
  const saved = C.serialize(s);
  assert.deepEqual(C.nearestExploredTile(w, 0.5, 0.5, 0, 100, pred, null, type), { x, y });
  assert.equal(C.serialize(s), saved, 'derived classification is absent from saves');
  w.explored.set(C.packKey(2, 2, 0), new Uint8Array(32));
  C.markExplored(w, 33, 33, 0); // normal observation after an external map replacement
  assert.equal(C.nearestExploredTile(w, 0.5, 0.5, 0, 100, pred, null, type), null);
  const loaded = C.deserialize(saved);
  assert.deepEqual(C.nearestExploredTile(loaded.world, 0.5, 0.5, 0, 100, pred, null, type), { x, y });
  loaded.world.explored = new Map(loaded.world.explored);
  assert.deepEqual(C.nearestExploredTile(loaded.world, 0.5, 0.5, 0, 100, pred, null, type), { x, y }, 'plain-Map snapshots retain the correct fallback');
});
