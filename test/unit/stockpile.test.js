/* The stockpile: amounts become piles on a logarithmic scale (one pile per
 * unit of each of the two leading digits), laid out around home on explored
 * ground, each resource in its own district. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T } from './helpers.js';

// A world with everything within `r` of home explored, holding `inv`.
function yardWorld(inv, r = 40, seed = 7) {
  const s = C.createState(seed);
  const h = C.home(s);
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) C.markExplored(s.world, h.x + x, h.y + y, C.SURFACE);
  Object.assign(s.inv, { mycelium: 0, stone: 0, ore: 0, crystal: 0 }, inv);
  return s;
}

test('piles: one per unit of each of the two leading digits, the place being the tier', () => {
  assert.deepEqual(C.pileTiers(0), []);
  assert.deepEqual(C.pileTiers(0.99), []);
  assert.deepEqual(C.pileTiers(7), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(C.pileTiers(3452), [3, 3, 3, 2, 2, 2, 2]);
  assert.deepEqual(C.pileTiers(1000000), [6]);
  assert.deepEqual(C.pileTiers(1099), [3]);
  assert.deepEqual(C.pileTiers(20.7), [1, 1]);
  // Past plain digits (1e21+), the leading digits still read right.
  assert.deepEqual(C.pileTiers(1.5e22), [22, 21, 21, 21, 21, 21]);
  assert.deepEqual(C.pileTiers(3e25), [25, 25, 25]);
  // However rich, a resource never stands as more than 18 piles.
  for (const a of [99, 999999, 9.99e14, 987654321987, 1e300]) assert.ok(C.pileTiers(a).length <= 18, `${a}`);
});

test('piles: big ones cover a square that grows one tile per power of ten', () => {
  for (let t = 0; t < C.SPAN_FROM; t++) assert.equal(C.pileSpan(t), 1);
  for (let t = C.SPAN_FROM; t < 20; t++) assert.equal(C.pileSpan(t), C.pileSpan(t - 1) + 1, `tier ${t}`);
});

test('yard: an empty inventory has no piles; otherwise every pile has its own ground', () => {
  assert.deepEqual(C.yardLayout(yardWorld({})), []);
  const s = yardWorld({ mycelium: 3452, stone: 871, ore: 46000000, crystal: 7 });
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
  const s = yardWorld({ mycelium: 98765, stone: 4321, ore: 55, crystal: 9 });
  const h = C.home(s);
  const yard = C.yardLayout(s);
  const dist = (p) => Math.max(Math.abs(p.x - h.x), Math.abs(p.y - h.y));
  const tier4 = yard.filter((p) => p.tier === 4).map(dist);
  const tier0 = yard.filter((p) => p.tier === 0).map(dist);
  assert.ok(Math.max(...tier4) <= Math.min(...tier0), 'ten-thousands sit inside the ones');
  assert.deepEqual(C.yardLayout(s), yard);
  const memo = {};
  assert.deepEqual(C.yardLayout(s, memo), yard, 'a memo changes nothing...');
  s.inv.mycelium += 1;
  assert.deepEqual(C.yardLayout(s, memo), C.yardLayout(s), '...even when reused');
});

test('yard: never on anything you can gather, water, rock, holes, buildings, the open middle or the unexplored', () => {
  const s = yardWorld({ mycelium: 9999, stone: 9999, ore: 9999, crystal: 9999 }, 30);
  const h = C.home(s);
  s.world.holes.add(C.packKey(h.x + 2, h.y, C.SURFACE)); // dug in an older version
  s.extractors.push({ key: 'compost', x: h.x + 3, y: h.y, z: C.SURFACE, buffer: 0 });
  const yard = C.yardLayout(s);
  for (const p of yard) {
    for (let y = p.y; y < p.y + p.span; y++) {
      for (let x = p.x; x < p.x + p.span; x++) {
        const t = C.tileAt(s.world, x, y, C.SURFACE);
        assert.ok(t !== T.WATER && t !== T.ROCK, 'not on water or rock');
        assert.ok(!C.TILE_INFO[t].harvest, `never hides a resource (${C.TILE_NAME[t]} at ${x},${y})`);
        assert.ok(!(x === h.x + 2 && y === h.y), 'not on the hole');
        assert.ok(!(x === h.x + 3 && y === h.y), 'not on the building');
        assert.ok(Math.max(Math.abs(x - h.x), Math.abs(y - h.y)) > C.PLAZA, 'the middle of home stays open');
      }
    }
  }
  const fresh = C.createState(7);
  Object.assign(fresh.inv, { mycelium: 999 });
  for (const p of C.yardLayout(fresh)) assert.ok(C.isExplored(fresh.world, p.x, p.y, C.SURFACE), 'only explored ground');
});

test('yard: piles keep a tile apart, and each resource keeps to its own side of home', () => {
  const s = yardWorld({ mycelium: 98765432109, stone: 4321098, ore: 55555, crystal: 9 }, 50);
  const h = C.home(s);
  const yard = C.yardLayout(s);
  assert.equal(yard.length, 9 + 8 + 4 + 3 + 5 + 5 + 9);
  for (const a of yard) {
    for (const b of yard) {
      if (a === b) continue;
      const gapX = Math.max(b.x - (a.x + a.span), a.x - (b.x + b.span));
      const gapY = Math.max(b.y - (a.y + a.span), a.y - (b.y + b.span));
      assert.ok(Math.max(gapX, gapY) >= C.PILE_GAP, `${a.res}${a.tier} at ${a.x},${a.y} and ${b.res}${b.tier} at ${b.x},${b.y} touch`);
    }
  }
  // The middle of each resource's piles lies its way from home: mycelium
  // north, stone east, ore south, crystal west.
  const side = (res) => {
    const ps = yard.filter((p) => p.res === res);
    const dx = ps.reduce((n, p) => n + p.x + p.span / 2, 0) / ps.length - h.x - 0.5;
    const dy = ps.reduce((n, p) => n + p.y + p.span / 2, 0) / ps.length - h.y - 0.5;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
  };
  assert.deepEqual(C.RESOURCES.map(side), ['north', 'east', 'south', 'west']);
});

test('yard: as amounts change, piles that stay called for never move', () => {
  const s = yardWorld({ mycelium: 3452, stone: 871, ore: 46, crystal: 7 });
  const memo = {};
  let yard = C.yardLayout(s, memo);
  const at = (p) => p.res + p.tier + '@' + p.x + ',' + p.y;
  for (const [res, add] of [['mycelium', 1], ['stone', 9], ['ore', 954], ['mycelium', 6548], ['crystal', -5], ['stone', -871]]) {
    const before = new Set(yard.map(at));
    s.inv[res] += add;
    const next = C.yardSettle(s, yard, memo);
    // Same piles as a fresh layout would have, kind for kind...
    const kinds = (list) => list.map((p) => p.res + p.tier).sort().join();
    assert.equal(kinds(next), kinds(C.yardLayout(s)), `${res} ${add}: the right piles`);
    // ...and every kind that was there and still is keeps its spots.
    const stays = new Map();
    for (const p of next) stays.set(p.res + p.tier, (stays.get(p.res + p.tier) || 0) + 1);
    const moved = [...before].filter((k) => {
      const kind = k.split('@')[0];
      return stays.get(kind) && !next.some((p) => at(p) === k);
    });
    for (const k of moved) {
      const kind = k.split('@')[0];
      const had = [...before].filter((b) => b.split('@')[0] === kind).length;
      assert.ok(stays.get(kind) < had, `${k} moved though its kind kept ${stays.get(kind)} of ${had}`);
    }
    const seen = new Set();
    for (const p of next) {
      for (let y = p.y; y < p.y + p.span; y++) for (let x = p.x; x < p.x + p.span; x++) {
        assert.ok(!seen.has(x + ',' + y), 'no two piles share a tile');
        seen.add(x + ',' + y);
      }
    }
    yard = next;
  }
});

test('yard: a pile on ground that stops being yard (a building put there) moves', () => {
  const s = yardWorld({ mycelium: 5 });
  const yard = C.yardLayout(s, {});
  const p = yard[0];
  s.extractors.push({ key: 'compost', x: p.x, y: p.y, z: C.SURFACE, buffer: 0 });
  const next = C.yardSettle(s, yard, {});
  assert.equal(next.length, 5);
  assert.ok(!next.some((q) => q.x === p.x && q.y === p.y), 'nothing stands on the building');
});
