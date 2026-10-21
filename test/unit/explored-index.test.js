import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExploredChunks, visitExploredChunks } from '../../src/core/explored-index.js';
import { packKey, unpackKey } from '../../src/core/coords.js';
import * as C from '../../src/core/index.js';

const collect = (map, z, x0, y0, x1, y1) => {
  const out = [];
  visitExploredChunks(map, z, x0, y0, x1, y1, (x, y, mask) => out.push([x, y, [...mask]]));
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};

test('spatial fog index matches Map across insertion, replacement, deletion, clear and layers', () => {
  const map = new ExploredChunks(), plain = new Map();
  const verify = () => {
    for (const z of [0, -1, -12]) for (const bounds of [[-100, -100, 100, 100], [-16, 0, 20, 40], [0, 0, 0, 0]]) {
      assert.deepEqual(collect(map, z, ...bounds), collect(plain, z, ...bounds));
    }
    assert.deepEqual([...map], [...plain]);
  };
  for (let i = 0; i < 90; i++) {
    const key = packKey((i * 7) % 93 - 46, (i * 11) % 83 - 41, [0, -1, -12][i % 3]);
    const mask = new Uint8Array(32); mask[i % 32] = 7;
    map.set(key, mask); plain.set(key, mask);
    if (i % 9 === 0) verify();
  }
  for (const key of [...map.keys()].filter((_, i) => i % 3 === 0)) {
    map.set(key, new Uint8Array(32).fill(1)); plain.set(key, new Uint8Array(32).fill(1));
  }
  verify();
  for (const key of [...map.keys()].filter((_, i) => i % 2 === 0)) assert.equal(map.delete(key), plain.delete(key));
  verify();
  map.clear(); plain.clear(); verify();
});

test('fog index is derived, cloneable and save-compatible at coordinate extremes', () => {
  const map = new ExploredChunks();
  for (const x of [-1048576, -65536, 65536, 1048575]) map.set(packKey(x, x, -511), new Uint8Array(32).fill(4));
  assert.deepEqual(collect(map, -511, -1048576, -1048576, 1048575, 1048575),
    collect(structuredClone(map), -511, -1048576, -1048576, 1048575, 1048575));
  const s = C.createState(12345), before = C.serialize(s);
  assert.equal(C.serialize(C.deserialize(before)), before);
});

test('sparse query work depends on known chunks, not the square of search radius', () => {
  const s = C.createState(12345);
  s.world.explored.clear();
  C.markExplored(s.world, 32, 32, 0);
  const measurements = [];
  for (const radius of [120, 1200, 120000]) {
    const work = { nodes: 0, chunks: 0, cells: 0 };
    assert.deepEqual(C.nearestExploredTile(s.world, 0.5, 0.5, 0, radius, () => true, work), { x: 32, y: 32 });
    assert.equal(work.chunks, 1);
    assert.ok(work.nodes <= 22, `visited ${work.nodes} index nodes`);
    assert.ok(work.cells <= 256);
    measurements.push(work);
  }
  assert.deepEqual(measurements[1], measurements[0]);
  assert.deepEqual(measurements[2], measurements[0]);
});
