/* The stockpile: amounts become piles on a logarithmic scale (one pile per
 * unit of each digit), laid out around home on explored ground. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T } from './helpers.js';

// A world with everything within `r` of home explored, holding `inv`.
function yardWorld(inv, r = 40, seed = 7) {
  const s = C.createState(seed);
  const h = C.home(s);
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) C.markExplored(s.world, h.x + x, h.y + y, C.SURFACE);
  Object.assign(s.inv, { wood: 0, stone: 0, ore: 0, crystal: 0 }, inv);
  return s;
}

test('piles: one per unit of each digit, the place being the tier', () => {
  assert.deepEqual(C.pileTiers(0), []);
  assert.deepEqual(C.pileTiers(0.99), []);
  assert.deepEqual(C.pileTiers(7), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(C.pileTiers(3452), [3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0]);
  assert.deepEqual(C.pileTiers(1000000), [6]);
  assert.deepEqual(C.pileTiers(20.7), [1, 1]);
  // Past plain digits (1e21+), the leading digits still read right.
  assert.deepEqual(C.pileTiers(1.5e22), [22, 21, 21, 21, 21, 21]);
  assert.deepEqual(C.pileTiers(3e25), [25, 25, 25]);
});

test('piles: big ones cover a square that grows one tile per power of ten', () => {
  for (let t = 0; t < C.SPAN_FROM; t++) assert.equal(C.pileSpan(t), 1);
  for (let t = C.SPAN_FROM; t < 20; t++) assert.equal(C.pileSpan(t), C.pileSpan(t - 1) + 1, `tier ${t}`);
});

test('yard: an empty inventory has no piles; otherwise every pile has its own ground', () => {
  assert.deepEqual(C.yardLayout(yardWorld({})), []);
  const s = yardWorld({ wood: 3452, stone: 871, ore: 46000000, crystal: 7 });
  const yard = C.yardLayout(s);
  const want = C.RESOURCES.reduce((n, r) => n + C.pileTiers(s.inv[r]).length, 0);
  assert.equal(yard.length, want, 'every pile placed');
  const seen = new Set();
  for (const p of yard) {
    assert.equal(p.span, C.pileSpan(p.tier));
    for (let y = p.y; y < p.y + p.span; y++) {
      for (let x = p.x; x < p.x + p.span; x++) {
        assert.ok(!seen.has(x + ',' + y), `tile ${x},${y} holds one pile`);
        seen.add(x + ',' + y);
        assert.ok(C.yardCost(s.world, x, y) >= 0, `pile on yard ground at ${x},${y}`);
      }
    }
  }
  const ore = yard.filter((p) => p.res === 'ore');
  assert.deepEqual(ore.map((p) => [p.tier, p.span]), [[7, 2], [7, 2], [7, 2], [7, 2], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1]]);
});

test('yard: biggest piles nearest home, and the same state gives the same yard', () => {
  const s = yardWorld({ wood: 98765, stone: 4321, ore: 55, crystal: 9 });
  const h = C.home(s);
  const yard = C.yardLayout(s);
  const dist = (p) => Math.max(Math.abs(p.x - h.x), Math.abs(p.y - h.y));
  const tier4 = yard.filter((p) => p.tier === 4).map(dist);
  const tier0 = yard.filter((p) => p.tier === 0).map(dist);
  assert.ok(Math.max(...tier4) <= Math.min(...tier0), 'ten-thousands sit inside the ones');
  assert.deepEqual(C.yardLayout(s), yard);
  const memo = {};
  assert.deepEqual(C.yardLayout(s, memo), yard, 'a memo changes nothing...');
  s.inv.wood += 1;
  assert.deepEqual(C.yardLayout(s, memo), C.yardLayout(s), '...even when reused');
});

test('yard: home ground first, never on anything you can gather, water, rock, holes, buildings or the unexplored', () => {
  const s = yardWorld({ wood: 9999, stone: 9999, ore: 9999, crystal: 9999 }, 30);
  const h = C.home(s);
  C.digHole(s.world, h.x, h.y, C.SURFACE);
  s.extractors.push({ key: 'sapling', x: h.x + 1, y: h.y, z: C.SURFACE, buffer: 0 });
  const yard = C.yardLayout(s);
  for (const p of yard) {
    const t = C.tileAt(s.world, p.x, p.y, C.SURFACE);
    assert.ok(t !== T.WATER && t !== T.ROCK, 'not on water or rock');
    assert.ok(!C.TILE_INFO[t].harvest, `never hides a resource (${C.TILE_NAME[t]} at ${p.x},${p.y})`);
    assert.ok(!(p.x === h.x && p.y === h.y), 'not on the hole');
    assert.ok(!(p.x === h.x + 1 && p.y === h.y), 'not on the building');
  }
  // Home ground is preferred: no grass is used while home ground that costs
  // less (its ring, against the grass's ring plus its avoidance) is left free.
  const ringOf = (x, y) => Math.max(Math.abs(x - h.x), Math.abs(y - h.y));
  const used = new Set(yard.map((p) => p.x + ',' + p.y));
  const worst = Math.max(...yard.map((p) => ringOf(p.x, p.y) + C.yardCost(s.world, p.x, p.y)));
  for (let y = h.y - 30; y <= h.y + 30; y++) {
    for (let x = h.x - 30; x <= h.x + 30; x++) {
      if (C.yardCost(s.world, x, y) === 0 && ringOf(x, y) < worst && !(x === h.x + 1 && y === h.y)) {
        assert.ok(used.has(x + ',' + y), `free home ground at ${x},${y} (ring ${ringOf(x, y)}) beats grass costing ${worst}`);
      }
    }
  }
  const fresh = C.createState(7);
  Object.assign(fresh.inv, { wood: 999 });
  for (const p of C.yardLayout(fresh)) assert.ok(C.isExplored(fresh.world, p.x, p.y, C.SURFACE), 'only explored ground');
});
