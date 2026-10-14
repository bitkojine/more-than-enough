import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, richAt, findNear, standOn, run, mushroomGarden } from './helpers.js';

const forest = (s, x, y) => typeAt(s, x, y) === T.FOREST && richAt(s, x, y) > 0;

test('every forest tile grows one kind of mushroom, from what its kind of forest grows, and keeps it', () => {
  const s = C.createState(4242);
  const seen = new Set();
  for (let y = -150; y < 150; y += 3) for (let x = -150; x < 150; x += 3) {
    if (typeAt(s, x, y, 0) !== T.FOREST) continue;
    const k = C.mushroomAt(s.seed, T.FOREST, x, y, 0);
    assert.ok(C.MUSHROOMS[k].kinds.includes(C.forestKind(s.seed, x, y)), `${k} grows in this forest`);
    assert.equal(C.mushroomAt(s.seed, T.FOREST, x, y, 0), k, 'the same tile always grows the same kind');
    seen.add(k);
  }
  assert.ok(seen.size >= 8, 'a stretch of forest grows many kinds (' + seen.size + ')');
  assert.equal(C.mushroomAt(s.seed, T.STONE, 0, 0, 0), null, 'nothing grows on stone');
});

test('spore beds grow cave mushrooms, the crystal cap only deep down', () => {
  const caveAt = (layer) => new Set(Array.from({ length: 400 }, (_, i) => C.mushroomAt(9, T.SPORE_BED, i, i * 7, -layer)));
  for (const k of caveAt(4)) assert.equal(C.MUSHROOMS[k].where, 'cave');
  assert.ok(!caveAt(4).has('crystalCap'));
  assert.ok(caveAt(8).has('crystalCap'));
});

test('every kind of mushroom has a picture and a name, and some are magic', () => {
  for (const k of C.MUSHROOM_KEYS) assert.ok(C.LOOK[C.mushroomLook(k)], k);
  assert.ok(C.MUSHROOM_KEYS.filter((k) => C.MUSHROOMS[k].magic).length >= 2);
  for (const kind of Object.keys(C.FOREST_KINDS)) assert.ok(C.forestMushrooms(kind).length >= 5, kind);
});

test('foraging counts the kind picked and celebrates only the first of each kind, ever', () => {
  const s = C.createState(12345);
  const t = findNear(s, forest);
  standOn(s, t);
  const kind = C.mushroomAt(s.seed, T.FOREST, t.x, t.y, 0);
  const first = C.harvestAt(s, t.x, t.y);
  assert.equal(first.mushroom, kind);
  assert.equal(first.newKind, true);
  assert.equal(C.harvestAt(s, t.x, t.y).newKind, false);
  assert.equal(s.mushrooms[kind], 2);
  assert.deepEqual(s.mushroomsEver, [kind]);
  const back = C.deserialize(C.serialize(s));
  assert.deepEqual(back.mushrooms, s.mushrooms, 'saved');
  assert.deepEqual(back.mushroomsEver, s.mushroomsEver);
});

test('every resource gained is counted by where it came from, adding up to what was gathered', () => {
  const s = C.createState(12345);
  standOn(s, findNear(s, forest));
  C.harvest(s);
  const p = { x: Math.floor(s.player.x), y: Math.floor(s.player.y) };
  s.extractors.push(mushroomGarden(p.x + 1, p.y, 5));
  C.collect(s);
  s.abundanceLv = 1;
  run(s, 2);
  for (const r of C.RESOURCES) {
    const sum = Object.values(s.sources[r]).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - s.stats[r]) < 1e-6, r + ' sources add up');
  }
  assert.equal(s.sources.mycelium.hand, 1);
  assert.equal(s.sources.mycelium.buildings, 5);
  assert.ok(s.sources.stone.engine > 0);
  const back = C.deserialize(C.serialize(s));
  assert.deepEqual(back.sources, s.sources, 'saved');
});
