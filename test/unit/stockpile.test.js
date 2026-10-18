/* The stockpile: amounts become piles on a logarithmic scale (one pile per
 * unit of each of the two leading digits), each in a fixed slot of its
 * resource's block of home ground. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T } from './helpers.js';

// A world holding `inv`.
function yardWorld(inv, seed = 7) {
  const s = C.createState(seed);
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

// Every tile under each pile, as "x,y".
const tilesOf = (p) => {
  const out = [];
  for (let y = p.y; y < p.y + p.span; y++) for (let x = p.x; x < p.x + p.span; x++) out.push(x + ',' + y);
  return out;
};

test('yard: an empty inventory has no piles; otherwise every pile has its own ground, inside home', () => {
  assert.deepEqual(C.yardLayout(yardWorld({})), []);
  const rich = [
    { mycelium: 3452, stone: 871, ore: 46000000, crystal: 7 },
    { mycelium: 9.9e12, stone: 9.9e11, ore: 9.9e10, crystal: 99999999 },
    { mycelium: 1.9e12, stone: 4.9e9, ore: 2e15, crystal: 5.5e8 }
  ];
  for (const inv of rich) {
    const s = yardWorld(inv);
    const yard = C.yardLayout(s);
    const want = C.RESOURCES.reduce((n, r) => n + C.pileTiers(s.inv[r]).length, 0);
    assert.equal(yard.length, want, 'every pile placed');
    const seen = new Set();
    for (const p of yard) {
      assert.ok(p.span <= C.pileSpan(p.tier));
      for (const k of tilesOf(p)) {
        assert.ok(!seen.has(k), `tile ${k} holds one pile`);
        seen.add(k);
        const [x, y] = k.split(',').map(Number);
        assert.equal(C.tileAt(s.world, x, y, C.SURFACE), T.HOME, `pile on home ground at ${k}`);
        assert.ok(Math.abs(x) < C.HOME_HALF && Math.abs(y) < C.HOME_HALF, `a tile of home ground between ${k} and the wild`);
        assert.ok(x !== 0 && y !== 0, 'the crossroads stay open');
      }
    }
  }
  const ore = C.yardLayout(yardWorld(rich[0])).filter((p) => p.res === 'ore');
  assert.deepEqual(ore.map((p) => [p.tier, p.span]), [[7, 2], [7, 2], [7, 2], [7, 2], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1], [6, 1]]);
});

test('yard: each resource has its own block; a lone big pile takes the whole corner', () => {
  const s = yardWorld({ mycelium: 1e12, stone: 3e9, ore: 55, crystal: 9 });
  const yard = C.yardLayout(s);
  const quarter = (p) => (p.y < 0 ? 'north' : 'south') + '-' + (p.x < 0 ? 'west' : 'east');
  for (const [res, q] of [['mycelium', 'north-west'], ['stone', 'north-east'], ['ore', 'south-east'], ['crystal', 'south-west']]) {
    for (const p of yard.filter((p) => p.res === res)) assert.equal(quarter(p), q, res);
  }
  const capital = yard.find((p) => p.res === 'mycelium');
  assert.equal(capital.tier, 12);
  assert.equal(capital.span, C.pileSpan(12), 'a single 10^12 pile stands at full size');
  assert.equal(capital.x + capital.span, 0, 'right by the road');
  for (const p of yard.filter((p) => p.res === 'stone')) assert.ok(p.span < C.pileSpan(9) && p.span >= 2, 'three share the corner, smaller');
  // Same amounts, same yard.
  assert.deepEqual(C.yardLayout(s), yard);
});

test('yard: piles keep a tile apart', () => {
  for (const inv of [{ mycelium: 98765432109, stone: 4321098, ore: 55555, crystal: 9 }, { mycelium: 2.2e12, stone: 5.5e10, ore: 9.9e9, crystal: 7.7e8 }]) {
    const yard = C.yardLayout(yardWorld(inv));
    for (const a of yard) {
      for (const b of yard) {
        if (a === b) continue;
        const gapX = Math.max(b.x - (a.x + a.span), a.x - (b.x + b.span));
        const gapY = Math.max(b.y - (a.y + a.span), a.y - (b.y + b.span));
        assert.ok(Math.max(gapX, gapY) >= 1, `${a.res}${a.tier} at ${a.x},${a.y} and ${b.res}${b.tier} at ${b.x},${b.y} touch`);
      }
    }
  }
});
