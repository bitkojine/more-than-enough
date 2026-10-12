import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T } from './helpers.js';

const { SURFACE } = C;

function region(w, z, x0, y0, size) {
  const out = [];
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) out.push(C.tileAt(w, x, y, z), C.richness(w, x, y, z));
  return out;
}

test('coordinates pack into unique numeric keys and unpack back', () => {
  for (const [x, y, z] of [[0, 0, 0], [-5000, 4000, 0], [12, -7, -3], [1048575, -1048576, -512], [-1, -1, 511]]) {
    assert.deepEqual(C.unpackKey(C.packKey(x, y, z)), { x, y, z });
  }
  assert.notEqual(C.packKey(3, 4, 0), C.packKey(3, 4, -1), 'layers never share a key');
  assert.ok(C.packKey(1048575, 1048575, 511) <= Number.MAX_SAFE_INTEGER);
});

test('the same seed yields the same world; different seeds differ', () => {
  const a = region(C.createWorld(12345), SURFACE, -40, -40, 80);
  assert.deepEqual(region(C.createWorld(12345), SURFACE, -40, -40, 80), a);
  assert.notDeepEqual(region(C.createWorld(54321), SURFACE, -40, -40, 80), a);
});

test('generation is order-independent and seamless across chunks', () => {
  const w = C.createWorld(999);
  const first = C.tileAt(w, 5, 7, SURFACE);
  C.tileAt(w, 100, 100, SURFACE); C.tileAt(w, -50, -50, -2); C.tileAt(w, 5, 7, -1);
  assert.equal(C.tileAt(w, 5, 7, SURFACE), first);
  // evict everything, then regenerate
  for (let i = 0; i < 600; i++) C.tileAt(w, i * 16, 0, SURFACE);
  assert.equal(C.tileAt(w, 5, 7, SURFACE), first);
  assert.equal(typeof C.tileAt(w, 15, -2, SURFACE) + typeof C.tileAt(w, 16, -2, SURFACE), 'numbernumber');
});

test('the world is endless in every direction', () => {
  const w = C.createWorld(12345);
  assert.equal(typeof C.tileAt(w, -999999, 888888, SURFACE), 'number');
});

test('surface terrain has a sensible resource mix', () => {
  const s = C.createState(12345);
  const counts = {};
  for (let y = -60; y < 60; y++) for (let x = -60; x < 60; x++) {
    const t = C.tileAt(s.world, x, y, SURFACE);
    counts[t] = (counts[t] || 0) + 1;
  }
  assert.ok(counts[T.FOREST] > 400, 'enough forest');
  assert.ok(counts[T.STONE] > 300, 'enough stone');
  assert.ok(counts[T.ORE] > 100, 'ore exists');
  assert.ok(counts[T.CRYSTAL] > 20, 'crystal exists');
  assert.ok(counts[T.CRYSTAL] < counts[T.ORE], 'crystal is rarer than ore');
});

test('spawn is on walkable dry land at the surface', () => {
  const s = C.createState(12345);
  assert.equal(s.player.z, SURFACE);
  const x = Math.floor(s.player.x), y = Math.floor(s.player.y);
  assert.ok(C.walkable(s.world, x, y, SURFACE));
  assert.notEqual(C.tileAt(s.world, x, y, SURFACE), T.WATER);
});

test('underground layers are solid rock with one shaft per chunk', () => {
  const w = C.createWorld(4242);
  for (const z of [-1, -4]) {
    let walk = 0, shafts = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (C.walkable(w, x, y, z)) walk++;
      if (C.tileAt(w, x, y, z) === T.SHAFT) shafts++;
    }
    assert.equal(walk, 0, 'nothing is open until dug');
    assert.equal(shafts, 4, 'a 2x2-chunk area holds four shafts');
  }
  const shaft = C.shaftInChunk(w.seed, 0, 0, -1);
  assert.equal(C.tileAt(w, shaft.x, shaft.y, -1), T.SHAFT);
});

test('crystal and fossils only appear in deeper layers', () => {
  const w = C.createWorld(77);
  const kinds = (z) => {
    const seen = new Set();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) seen.add(C.tileAt(w, x, y, z));
    return seen;
  };
  assert.ok(!kinds(-1).has(T.CRYSTAL_SEAM) && !kinds(-1).has(T.FOSSIL));
  assert.ok(kinds(-3).has(T.CRYSTAL_SEAM) && !kinds(-3).has(T.FOSSIL));
  assert.ok(kinds(-4).has(T.FOSSIL));
});

test('richness edits are stored only where they differ from generation', () => {
  const w = C.createWorld(1);
  const base = C.richness(w, 3, 3, -1);
  C.setRichness(w, 3, 3, -1, 0);
  assert.equal(C.tileAt(w, 3, 3, -1) === T.TUNNEL || C.tileAt(w, 3, 3, -1) === T.SHAFT_OPEN, true, 'a cleared tile opens up');
  assert.equal(w.mods.size, 1);
  C.setRichness(w, 3, 3, -1, base);
  assert.equal(w.mods.size, 0);
});

test('fog is tracked per tile and per layer', () => {
  const w = C.createWorld(1);
  C.markExplored(w, -17, 33, SURFACE);
  assert.ok(C.isExplored(w, -17, 33, SURFACE));
  assert.ok(!C.isExplored(w, -16, 33, SURFACE));
  assert.ok(!C.isExplored(w, -17, 33, -1));
});
