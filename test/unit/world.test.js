import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, findNear } from './helpers.js';

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

test('surface terrain has every resource, with crystal the rarest', () => {
  const s = C.createState(12345);
  const counts = {};
  for (let y = -120; y < 120; y++) for (let x = -120; x < 120; x++) {
    const t = C.tileAt(s.world, x, y, SURFACE);
    counts[t] = (counts[t] || 0) + 1;
  }
  assert.ok(counts[T.FOREST] > 5000, 'enough forest');
  assert.ok(counts[T.STONE] > 1500, 'enough stone');
  assert.ok(counts[T.ORE] > 500, 'ore exists');
  assert.ok(counts[T.CRYSTAL] > 50, 'crystal exists');
  assert.ok(counts[T.CRYSTAL] < counts[T.ORE], 'crystal is rarer than ore');
  const resources = counts[T.FOREST] + counts[T.STONE] + counts[T.ORE] + counts[T.CRYSTAL];
  assert.ok(resources < 0.45 * 240 * 240, 'most land holds nothing: resources take exploring');
});

test('resources start thin near home and grow richer far out', () => {
  for (const seed of [12345, 777, 20260101]) {
    const w = C.createWorld(seed);
    let crystalNear = 0, nearRich = 0, nearN = 0, farRich = 0, farN = 0;
    for (let y = -220; y < 220; y += 2) for (let x = -220; x < 220; x += 2) {
      const t = C.tileAt(w, x, y, SURFACE), d = Math.hypot(x, y);
      if (t === T.CRYSTAL && d < 40) crystalNear++;
      if (t !== T.FOREST && t !== T.STONE) continue;
      if (d < 30) { nearRich += C.richness(w, x, y, SURFACE); nearN++; }
      if (d > 180) { farRich += C.richness(w, x, y, SURFACE); farN++; }
    }
    assert.equal(crystalNear, 0, 'no crystal close to home');
    assert.ok(farRich / farN > 1.8 * (nearRich / nearN), 'deposits far out are much richer');
  }
});

test('every start has forest and stone within reach of home', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = C.createState(seed * 7919);
    for (const type of [T.FOREST, T.STONE, T.ORE]) {
      assert.ok(findNear(s, (st, x, y) => typeAt(st, x, y) === type, 45), 'seed ' + seed * 7919 + ' type ' + type);
    }
  }
});

test('seams run in veins rather than scattered tile by tile', () => {
  const w = C.createWorld(4242);
  for (const [z, type] of [[-2, T.ORE_SEAM], [-2, T.STONE_SEAM], [-6, T.CRYSTAL_SEAM]]) {
    let n = 0, joined = 0;
    for (let y = -64; y < 64; y++) for (let x = -64; x < 64; x++) {
      if (C.tileAt(w, x, y, z) !== type) continue;
      n++;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => C.tileAt(w, x + dx, y + dy, z) === type)) joined++;
    }
    assert.ok(n > 20 && joined > 0.8 * n, 'type ' + type + ': ' + joined + ' of ' + n + ' touch another');
  }
});

test('spawn is on walkable dry land at the surface', () => {
  const s = C.createState(12345);
  assert.equal(s.player.z, SURFACE);
  const x = Math.floor(s.player.x), y = Math.floor(s.player.y);
  assert.ok(C.walkable(s.world, x, y, SURFACE));
  assert.notEqual(C.tileAt(s.world, x, y, SURFACE), T.WATER);
});

test('underground layers are solid rock with one shaft and one way up per chunk', () => {
  const w = C.createWorld(4242);
  for (const z of [-1, -4]) {
    let walk = 0, shafts = 0, rises = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (C.walkable(w, x, y, z)) walk++;
      if (C.tileAt(w, x, y, z) === T.SHAFT) shafts++;
      if (C.tileAt(w, x, y, z) === T.RISE) rises++;
    }
    assert.equal(walk, rises, 'nothing is open until dug, but the foot of each ladder up');
    assert.equal(shafts, 4, 'a 2x2-chunk area holds four shafts');
    assert.ok(rises >= (z === -1 ? 1 : 4) && rises <= 4, 'and a way up under each way down above');
  }
  const shaft = C.shaftInChunk(w.seed, 0, 0, -1);
  assert.equal(C.tileAt(w, shaft.x, shaft.y, -1), T.SHAFT);
});

test('crystal and spore beds only appear in deeper layers', () => {
  const w = C.createWorld(77);
  const kinds = (z) => {
    const seen = new Set();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) seen.add(C.tileAt(w, x, y, z));
    return seen;
  };
  assert.ok(!kinds(-1).has(T.CRYSTAL_SEAM) && !kinds(-1).has(T.SPORE_BED));
  assert.ok(kinds(-3).has(T.CRYSTAL_SEAM) && !kinds(-3).has(T.SPORE_BED));
  assert.ok(kinds(-4).has(T.SPORE_BED));
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

test('tile heights: walls and mountains stand up, water sits low, fog is flat', () => {
  const s = C.createState(4242);
  const w = s.world;
  const solid = C.nearestTile(0, 0, 40, (x, y) => C.TILE_INFO[C.tileAt(w, x, y, -1)].solid);
  assert.equal(C.tileHeight(w, solid.x, solid.y, -1), 0, 'unseen rock gives nothing away');
  C.markExplored(w, solid.x, solid.y, -1);
  assert.equal(C.tileHeight(w, solid.x, solid.y, -1), 1, 'seen, underground rock reaches the layer above');
  C.setRichness(w, solid.x, solid.y, -1, 0);
  assert.equal(C.tileHeight(w, solid.x, solid.y, -1), 0, 'once seen, a dug tile is open floor');

  const rock = C.nearestTile(0, 0, 300, (x, y) => C.tileAt(w, x, y, SURFACE) === T.ROCK);
  assert.equal(C.tileHeight(w, rock.x, rock.y, SURFACE), 0, 'unexplored land hides its shape');
  C.markExplored(w, rock.x, rock.y, SURFACE);
  const h = C.tileHeight(w, rock.x, rock.y, SURFACE);
  assert.ok(h >= C.RELIEF_MIN && h <= C.RELIEF_MAX && h > 0.5, 'a mountain is tall, within the relief bounds (' + h + ')');
  assert.equal(C.tileHeight(w, rock.x, rock.y, SURFACE), h, 'and keeps its height');

  const water = C.nearestTile(0, 0, 300, (x, y) => C.tileAt(w, x, y, SURFACE) === T.WATER);
  C.markExplored(w, water.x, water.y, SURFACE);
  assert.ok(C.tileHeight(w, water.x, water.y, SURFACE) < 0, 'water sits below the ground');
});
