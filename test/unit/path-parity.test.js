import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { findPath as reference } from '../support/reference-paths.js';

test('walking route lookup preserves positions without repeatedly scanning route length', () => {
  let reads = 0;
  const nodes = new Proxy(Array.from({ length: 10000 }, (_, x) => ({ x, y: 0 })), {
    get(target, key) { if (typeof key === 'string' && /^\d+$/.test(key)) reads++; return target[key]; }
  });
  const r = { z: 0, from: { x: -1, y: 0 }, nodes };
  assert.equal(C.routePosition(r, 9999, 0), 10000);
  reads = 0;
  for (let x = 0; x < 1000; x++) assert.equal(C.routePosition(r, x, 0), x + 1);
  assert.equal(C.routePosition(r, -1, 0), 0);
  assert.equal(C.routePosition(r, 0, 1), -1);
  assert.equal(reads, 0, 'cached queries do no route-length work');
  const duplicate = { z: -1, from: { x: 0, y: 0 }, nodes: [{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }] };
  assert.equal(C.routePosition(duplicate, 1, 0), 3);
  assert.equal(C.routePosition(duplicate, 0, 0), 2);
});

test('integer A* follows a shortest open route without flooding the surrounding area', () => {
  const s = C.createState(12345);
  s.world.chunks.clear(); s.world.hotKey = -1; s.world.hotChunk = null;
  for (let cy = -1; cy <= 7; cy++) for (let cx = -1; cx <= 10; cx++) {
    s.world.chunks.set(C.packKey(cx, cy, 0), { type: new Uint8Array(C.CHUNK_SIZE ** 2), rich: new Uint8Array(C.CHUNK_SIZE ** 2) });
  }
  const directed = {}, flood = {};
  const a = C.findPath(s, 0, 0, 150, 90, { work: directed });
  const b = C.findPath(s, 0, 0, 150, 90, { heuristic: false, work: flood });
  assert.equal(a.length, 240); assert.equal(b.length, a.length);
  assert.equal(directed.expanded, 241, 'open-route work grows with route length');
  assert.ok(flood.expanded > 10000, 'the bounded comparison exposes area-filling work');
});

for (const seed of [12345, 777, 20260101]) test(`path optimization preserves exact routes and tie breaks on seed ${seed}`, () => {
  const s = C.createState(seed);
  for (const z of [0, -1]) {
    s.player.z = z;
    const x = Math.floor(s.player.x), y = Math.floor(s.player.y);
    if (z < 0) C.setRichness(s.world, x, y, z, 0);
    C.revealAround(s);
    for (const gear of [1, 6]) {
      s.tools.pickaxe = gear; s.tools.boots = gear;
      for (const opts of [{ known: true }, {}, { dig: true }]) {
        for (const [dx, dy] of [[0, 0], [7, 3], [-8, 6], [4, -7]]) {
          const expected = reference(s, x, y, x + dx, y + dy, opts);
          assert.deepEqual(C.findPath(s, x, y, x + dx, y + dy, { ...opts, heuristic: false }), expected);
          const actual = C.findPath(s, x, y, x + dx, y + dy, opts);
          const price = path => path === null ? null : path.reduce((sum, node, i) => sum +
            (i === path.length - 1 || !node.dig ? 1 : 3), 0);
          assert.equal(price(actual), price(expected), 'A* must retain shortest weighted route cost');
          if (actual) {
            let px = x, py = y;
            for (const [i, node] of actual.entries()) {
              assert.equal(Math.abs(node.x - px) + Math.abs(node.y - py), 1);
              if (i < actual.length - 1) {
                if (opts.known) assert.ok(C.isExplored(s.world, node.x, node.y, z));
                assert.ok(C.walkable(s.world, node.x, node.y, z) || opts.dig && C.diggable(s, node.x, node.y));
                if (!C.canWade(s) && C.walkable(s.world, node.x, node.y, z)) assert.equal(C.swimsAt(s.world, node.x, node.y, z), false);
              }
              px = node.x; py = node.y;
            }
            assert.equal(px, x + dx); assert.equal(py, y + dy);
          }
        }
      }
    }
  }
});
