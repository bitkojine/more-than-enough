import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

function reference(s) {
  const list = s.extractors.filter(e => C.ownBuilding(s, e) && e.buffer >= 1 && C.tileDist2(s.player, e.x, e.y, e.z) <= C.COLLECT_RANGE ** 2);
  return list.length ? { total: Math.floor(list.reduce((n, e) => n + e.buffer, 0)), list } : null;
}

test('spatial collection preserves exhaustive results, order, ownership and duplicate coordinates', () => {
  const s = C.createState(12345); s.me = 'me';
  s.extractors = Array.from({ length: 200 }, (_, i) => ({ key: 'garden', res: 'mycelium',
    x: i % 13 - 6, y: Math.floor(i / 13) - 7, z: i % 3 ? 0 : -1,
    buffer: i / 7, ...(i % 5 ? {} : { owner: 'other' }) }));
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 0, y: 0, z: 0, buffer: 2.9 });
  s.extractors.push({ key: 'quarry', res: 'stone', x: 0, y: 0, z: 0, buffer: 3.1 });
  for (const x of [-6.2, -0.5, 0.5, 3.7]) for (const y of [-3.1, 0.5, 5.2]) for (const z of [0, -1]) {
    s.player = { x, y, z };
    assert.deepEqual(C.collectTarget(s), reference(s));
  }
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 3, y: 5, z: -1, buffer: 7 });
  assert.deepEqual(C.collectTarget(s), reference(s), 'new buildings update the index');
  s.extractors = s.extractors.slice(0, 60);
  assert.deepEqual(C.collectTarget(s), reference(s), 'a replaced list updates the index');
});

test('collection does not inspect output of thousands of distant buildings', () => {
  const s = C.createState(12345); let reads = 0;
  s.extractors = Array.from({ length: 10000 }, (_, i) => ({ key: 'garden', res: 'mycelium',
    x: 1000 + i, y: 1000, z: 0, get buffer() { reads++; return 2; } }));
  for (let i = 0; i < 10; i++) assert.equal(C.collectTarget(s), null);
  assert.equal(reads, 0);
});
