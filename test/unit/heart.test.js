import { unlockOptional } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
const cmd = (s, type, kind, x, y) => C.cultivationCommand(s, { type, kind, x, y });
// The crystal clock alone, so a test can choose the time of day.
function run(s, secs) {
  for (let i = 0; i < Math.round(secs * 4); i++) C.stepCultivation(s, 0.25);
}
// Stands you at the hiding place with its ground seen and a carrier made.
function atHidingPlace(seed = 7) {
  const s = C.createState(seed, { cultivation: true }),
    h = C.hidingPlace(s.world.seed);
  for (let y = h.y - 3; y <= h.y + 3; y++)
    for (let x = h.x - 3; x <= h.x + 3; x++) C.markExplored(s.world, x, y, 0);
  for (const r of C.RESOURCES) C.earn(s, r, 300, 'hand');
  s.player = { x: h.x + 0.5, y: h.y + 1.5, z: 0 };
  return { s, h };
}

test('the hiding place is open grass far from home, fixed by the seed', () => {
  for (const seed of [1, 7, 99, 12345, 4000000000]) {
    const a = C.hidingPlace(seed),
      b = C.hidingPlace(seed),
      s = C.createState(seed, { cultivation: true });
    assert.deepEqual(a, b);
    const d = Math.hypot(a.x, a.y);
    assert.ok(d > C.HEART_DISTANCE - 80 && d < C.HEART_DISTANCE + 80, `${seed}: ${d} m`);
    assert.equal(C.tileAt(s.world, a.x, a.y, 0), C.T.GRASS);
  }
});

test('new worlds start with the heart at the hiding place; older saves keep their progress', () => {
  const s = C.createState(7, { cultivation: true });
  assert.deepEqual(s.cultivation.heart, { where: 'station', health: 100 });
  const old = JSON.parse(JSON.stringify(s.cultivation));
  delete old.heart;
  C.recoverCultivationRounding(old);
  assert.equal(old.heart.where, 'station');
  const done = JSON.parse(JSON.stringify(s.cultivation));
  delete done.heart;
  done.facilities.push({
    kind: 'machine',
    sections: 2,
    id: done.nextId++,
    x: 0,
    y: 0,
    z: -2,
    temperature: 18,
    health: 100,
    quality: 100,
    buffer: 0
  });
  C.recoverCultivationRounding(done);
  assert.equal(
    done.heart.where,
    'installed',
    'a machine past its second section already has its heart'
  );
  assert.ok(C.validCultivation(done));
  const bad = JSON.parse(JSON.stringify(s.cultivation));
  bad.heart = { where: 'pocket', health: 50 };
  assert.equal(C.validCultivation(bad), false);
  bad.heart = { where: 'carried', health: 120 };
  assert.equal(C.validCultivation(bad), false);
});

test('taking the heart needs a sealed carrier, which protects it from sunlight', () => {
  const { s, h } = atHidingPlace();
  assert.equal(cmd(s, 'heart', null, h.x, h.y), 'equipment');
  assert.equal(cmd(s, 'craft', 'carrier'), 'ok');
  assert.equal(cmd(s, 'heart', null, h.x, h.y), 'lifted');
  assert.equal(s.cultivation.heart.where, 'carried');
  assert.equal(cmd(s, 'heart', null, h.x, h.y), 'gone');
  s.time = 0;
  run(s, 10);
  assert.equal(s.cultivation.heart.health, 100, 'the sealed carrier blocks sunlight');
  s.cultivation.gear.carrier = false;
  run(s, 10);
  const noon = 100 - s.cultivation.heart.health;
  assert.ok(Math.abs(noon - C.HEART_SUN * 10) < 0.05, 'unprotected full sun: ' + noon);
  s.time = C.DAY_LENGTH / 2;
  const before = s.cultivation.heart.health;
  run(s, 10);
  assert.equal(s.cultivation.heart.health, before, 'nothing at night');
  assert.ok(C.deserialize(C.serialize(s)).cultivation.heart.where === 'carried');
});

test('a shelter keeps the heart safe and mends it; a heart cracked through returns to the hiding place', () => {
  const { s, h } = atHidingPlace();
  unlockOptional(s);
  s.cultivation.heart = { where: 'station', health: 100 };
  cmd(s, 'craft', 'carrier');
  cmd(s, 'heart', null, h.x, h.y);
  const at = { x: h.x + 1, y: h.y + 1 };
  assert.equal(cmd(s, 'build', 'shelter', h.x, h.y), 'occupied');
  assert.equal(cmd(s, 'build', 'shelter', at.x, at.y), 'ok');
  const shelter = C.cultivationAt(s, at.x, at.y, 0);
  assert.equal(shelter.kind, 'shelter');
  s.cultivation.heart.health = 60;
  s.time = 0;
  assert.equal(cmd(s, 'heart', null, at.x, at.y), 'ok');
  assert.equal(s.cultivation.heart.where, shelter.id);
  run(s, 20);
  assert.ok(
    Math.abs(s.cultivation.heart.health - (60 + C.HEART_MEND * 20)) < 0.05,
    'mends in the shelter, even at noon'
  );
  assert.ok(C.deserialize(C.serialize(s)), 'a resting heart saves');
  assert.equal(cmd(s, 'heart', null, at.x, at.y), 'lifted');
  s.cultivation.heart.health = 0.5;
  s.cultivation.gear.carrier = false;
  run(s, 10);
  assert.deepEqual(s.cultivation.heart, { where: 'station', health: 100 });
  assert.equal(s.cultivation.heartLost, 1);
});

// Watch, 2026-11-01: the carrier blocks light but the sun warms it while it
// holds something. Its temperature is its surroundings plus that warmth, and
// whatever it holds cracks above CRACK_ABOVE ("same carrier, same rule").
test('the loaded carrier warms in the sun until what it holds cracks; out of the sun it cools', () => {
  const { s, h } = atHidingPlace();
  unlockOptional(s);
  s.cultivation.heart = C.newHeart();
  s.inv.crystal = 0;
  cmd(s, 'craft', 'carrier');
  const c = s.cultivation;
  s.time = 0;
  assert.equal(C.carrierSun(s, { x: h.x, y: h.y, z: 0 }), 1, 'the hiding place is open grass');
  // Empty, the carrier doesn't warm.
  run(s, 20);
  assert.equal(c.carrierWarmth || 0, 0);
  assert.equal(cmd(s, 'heart', null, h.x, h.y), 'lifted');
  s.player = { x: h.x + 0.5, y: h.y + 0.5, z: 0 };
  // In the open at noon: no light gets in, but warmth builds; on the surface
  // (18 °C) the heart starts cracking once the sun has added HEART_WARM_LINE.
  run(s, C.HEART_WARM_LINE / C.HEART_WARM_RISE - 1);
  assert.equal(c.heart.health, 100, 'nothing cracks below 22 °C');
  assert.ok(C.carrierReading(s).temperature < C.CRACK_ABOVE);
  run(s, 12);
  assert.ok(c.heart.health < 99.5, 'past 22 °C the heart cracks: ' + c.heart.health);
  assert.equal(C.carrierReading(s).cause, 'sun');
  // Out of the sun it cools at the cooling rate.
  const warm = c.carrierWarmth;
  s.time = C.DAY_LENGTH / 2;
  run(s, 4);
  assert.ok(Math.abs(warm - c.carrierWarmth - C.HEART_WARM_COOL * 4) < 1e-9);
  // Never warmer than the sun can make it.
  c.carrierWarmth = C.HEART_WARM_MAX - 0.01;
  C.warmCarrier(c, 1, 10);
  assert.equal(c.carrierWarmth, C.HEART_WARM_MAX);
  assert.ok(C.validCultivation(c), 'a warm carrier saves');
  c.carrierWarmth = 99;
  assert.equal(C.validCultivation(c), false, 'warmer than the sun can make is refused');
  const mended = C.mendCultivation(JSON.parse(JSON.stringify(c)));
  assert.equal(mended.carrierWarmth, C.HEART_WARM_MAX, 'and mended back inside on load');
});

test('crystal and a starter in the carrier warm and crack like the heart', () => {
  const { s, h } = atHidingPlace();
  unlockOptional(s);
  s.cultivation.heart = C.newHeart();
  cmd(s, 'craft', 'carrier');
  const c = s.cultivation;
  s.player = { x: h.x + 0.5, y: h.y + 0.5, z: 0 };
  s.inv.crystal = 5;
  c.quality = 100;
  s.time = 0;
  run(s, 80);
  assert.ok(c.quality < 100, 'crystal in a sun-warmed carrier cracks: ' + c.quality);
  s.inv.crystal = 0;
  c.carrierWarmth = 0;
  c.starter = { health: 100 };
  run(s, 80);
  assert.ok(c.starter.health < 100, 'so does a starter: ' + c.starter.health);
});

test('the surroundings and the sun add up: a warm carrier cracks sooner by heat', () => {
  const { s, h } = atHidingPlace();
  unlockOptional(s);
  cmd(s, 'craft', 'carrier');
  const c = s.cultivation;
  c.heart = { where: 'carried', health: 100 };
  s.player = { x: h.x + 0.5, y: h.y + 0.5, z: 0 };
  s.time = C.DAY_LENGTH / 2; // night: no sun warms it further
  c.carrierWarmth = C.HEART_WARM_LINE + 2; // 24 °C on the 18 °C surface
  run(s, 1);
  const lost = 100 - c.heart.health;
  // About 2 °C over the line, cooling a little through the second.
  assert.ok(lost > 1 && lost < 2 * C.HEAT_BURN, 'lost ' + lost);
});

test('a forest canopy halves the sunlight, a cave mouth blocks it, water cools the carrier', () => {
  const s = C.createState(7, { cultivation: true }),
    find = (want) => {
      for (let y = -200; y < 200; y++)
        for (let x = -200; x < 200; x++) if (want(x, y)) return { x, y };
      throw Error('none near home');
    },
    type = (x, y) => C.tileAt(s.world, x, y, 0),
    dry = (x, y) =>
      [type(x + 1, y), type(x - 1, y), type(x, y + 1), type(x, y - 1)].every(
        (t) => t !== C.T.WATER
      );
  s.time = 0;
  const water = find((x, y) => type(x, y) === C.T.WATER),
    forest = find((x, y) => type(x, y) === C.T.FOREST && dry(x, y)),
    grass = find((x, y) => type(x, y) === C.T.GRASS && dry(x, y)),
    bank = find((x, y) => type(x, y) !== C.T.WATER && type(x + 1, y) === C.T.WATER),
    cave = find((x, y) => type(x, y) === C.T.CAVE && dry(x, y));
  const light = (p) => C.illuminationAt(s, p.x, p.y, 0).level;
  // Real shade: the light field itself, which also cracks exposed crystal.
  assert.equal(light(grass), C.LIGHT_MAX);
  assert.ok(light(forest) > 0 && light(forest) < C.LIGHT_MAX * 0.6, 'forest ' + light(forest));
  assert.equal(light(cave), 0);
  assert.ok(Math.abs(C.carrierSun(s, { ...forest, z: 0 }) - light(forest) / C.LIGHT_MAX) < 1e-9);
  assert.equal(C.carrierSun(s, { ...cave, z: 0 }), 0);
  // Water cools the carrier without making anywhere dark.
  assert.equal(light(bank), C.LIGHT_MAX);
  assert.equal(C.carrierSun(s, { ...water, z: 0 }), 0);
  assert.equal(C.carrierSun(s, { ...bank, z: 0 }), 0);
  assert.equal(C.carrierSun(s, { ...forest, z: -1 }), 0, 'no sun underground');
  s.time = C.DAY_LENGTH / 2;
  assert.equal(C.carrierSun(s, { ...grass, z: 0 }), 0, 'no sun at night');
});

test('open land beside a forest does not light under the canopy, lamps or not', () => {
  const s = C.createState(7, { cultivation: true }),
    type = (x, y) => C.tileAt(s.world, x, y, 0);
  s.time = 0;
  let edge = null;
  for (let y = -200; y < 200 && !edge; y++)
    for (let x = -200; x < 200 && !edge; x++)
      if (type(x, y) === C.T.FOREST && type(x + 1, y) === C.T.GRASS) edge = { x, y };
  const sky = () => C.illuminationAt(s, edge.x, edge.y, 0).sky,
    before = sky();
  assert.equal(before, C.skyThrough(C.T.FOREST));
  // Any lamp in the world builds the full light field; the canopy reads the same.
  s.world.props.set(C.packKey(edge.x + 40, edge.y, 0), 'lamp');
  assert.equal(sky(), before);
});

test('a heart saved by 0.183.0 with warmth on it loads with that warmth in the carrier', () => {
  const s = C.createState(7, { cultivation: true }),
    old = JSON.parse(JSON.stringify(s.cultivation));
  old.heart = { where: 'carried', health: 80, warmth: 3.5 };
  old.gear.carrier = true;
  const c = C.mendCultivation(old);
  assert.ok(C.validCultivation(c));
  assert.equal(c.carrierWarmth, 3.5);
  assert.deepEqual(c.heart, { where: 'carried', health: 80 });
});

test('the second machine section seats the heart', () => {
  const s = C.createState(7, { cultivation: true });
  s.tools.pickaxe = 3;
  for (const r of C.RESOURCES) C.earn(s, r, 300, 'hand');
  for (let y = -6; y <= 6; y++)
    for (let x = -6; x <= 6; x++) {
      const t = C.tileAt(s.world, x, y, -2);
      if (!C.TILE_INFO[t].rise && !C.TILE_INFO[t].descend) {
        C.setRichness(s.world, x, y, -2, 0);
        C.markExplored(s.world, x, y, -2);
      }
    }
  s.player = { x: 0.5, y: 0.5, z: -2 };
  C.step(s, 0.25, { visualEvents: false });
  const b = s.cultivation.facilities.find((b) => b.kind === 'machine');
  s.player = { x: b.x + 0.5, y: b.y + 1.5, z: -2 };
  assert.equal(cmd(s, 'build', 'cooler', b.x, b.y + 1), 'ok');
  s.player = { x: b.x + 0.5, y: b.y + 0.5, z: -2 };
  assert.equal(cmd(s, 'repair', null, b.x, b.y), 'discovery');
  assert.equal(C.machineClue(s), 1);
  assert.equal(cmd(s, 'repair', null, b.x, b.y), 'heart');
  C.advanceGoals(s);
  assert.ok(s.goalsDone.includes('cultivationRepair'));
  assert.ok(!s.goalsDone.includes('cultivationHeart'));
  s.cultivation.heart = { where: 'carried', health: 80 };
  assert.equal(cmd(s, 'repair', null, b.x, b.y), 'discovery');
  assert.equal(s.cultivation.heart.where, 'installed');
  assert.equal(b.sections, 2);
  C.advanceGoals(s);
  assert.ok(s.goalsDone.includes('cultivationHeart'));
});

// The camp at the hiding place (Watch, 2026-11-01): a carrier bench there
// lines the carrier with mycelium, once, and the sun warms it half as fast.
test('a carrier bench stands only by the hiding place and lines the carrier once', () => {
  const { s, h } = atHidingPlace();
  s.cultivation.heart = C.newHeart();
  const c = s.cultivation,
    at = { x: h.x + 1, y: h.y + 1 };
  assert.ok(C.buildsOnLayer(s, 'bench', 0));
  assert.equal(C.buildsOnLayer(s, 'bench', -2), false);
  assert.equal(C.facilitySite(s, 'bench', h.x, h.y), 'occupied', 'not on the hiding place itself');
  const far = C.createState(7, { cultivation: true });
  C.markExplored(far.world, 3, -10, 0);
  assert.equal(C.facilitySite(far, 'bench', 3, -10), 'camp', 'not at home');
  assert.equal(cmd(s, 'build', 'bench', at.x, at.y), 'ok');
  const bench = C.cultivationAt(s, at.x, at.y, 0);
  assert.equal(bench.kind, 'bench');
  assert.equal(C.cultivationStatus(s, bench), 'ready');
  assert.equal(cmd(s, 'line', null, at.x, at.y), 'equipment', 'needs a carrier to line');
  cmd(s, 'craft', 'carrier');
  const before = s.inv.mycelium;
  assert.equal(cmd(s, 'line', null, at.x, at.y), 'ok');
  assert.equal(before - s.inv.mycelium, C.CULTIVATION_RECIPES.lining.mycelium);
  assert.equal(c.gear.lining, true);
  assert.equal(cmd(s, 'line', null, at.x, at.y), 'invalid', 'only once');
  s.time = 0;
  assert.equal(C.carrierSun(s, { x: h.x, y: h.y, z: 0 }), C.HEART_LINING);
  const saved = C.deserialize(C.serialize(s));
  assert.equal(saved.cultivation.gear.lining, true);
  assert.equal(C.cultivationAt(saved, at.x, at.y, 0).kind, 'bench');
});

// Watch, 2026-11-01: a shelter feels its spot like every other building.
test('a cool shelter mends the heart; a hot one cracks it', () => {
  const { s, h } = atHidingPlace();
  unlockOptional(s);
  s.cultivation.heart = C.newHeart();
  cmd(s, 'craft', 'carrier');
  cmd(s, 'heart', null, h.x, h.y);
  const at = { x: h.x + 1, y: h.y + 1 };
  cmd(s, 'build', 'shelter', at.x, at.y);
  cmd(s, 'heart', null, at.x, at.y);
  const shelter = C.cultivationAt(s, at.x, at.y, 0),
    heart = s.cultivation.heart;
  heart.health = 60;
  shelter.temperature = C.CRACK_ABOVE + 5;
  C.stepCultivation(s, 0.25);
  assert.ok(heart.health < 60, 'hot: it cracks ' + heart.health);
  shelter.temperature = 18;
  const before = heart.health;
  C.stepCultivation(s, 0.25);
  assert.ok(heart.health > before, 'cool: it mends');
});
