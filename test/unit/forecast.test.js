import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
const cmd = (s, type, kind, x, y) => C.cultivationCommand(s, { type, kind, x, y });
function run(s, secs) {
  for (let i = 0; i < Math.round(secs * 4); i++) C.stepCultivation(s, 0.25);
}
// At the hiding place, at noon, carrying the heart in a sealed carrier.
function carrying(seed = 7) {
  const s = C.createState(seed, { cultivation: true }),
    h = C.hidingPlace(s.world.seed);
  for (let y = h.y - 3; y <= h.y + 3; y++)
    for (let x = h.x - 3; x <= h.x + 3; x++) C.markExplored(s.world, x, y, 0);
  for (const r of C.RESOURCES) C.earn(s, r, 300, 'hand');
  s.player = { x: h.x + 0.5, y: h.y + 1.5, z: 0 };
  cmd(s, 'craft', 'carrier');
  assert.equal(cmd(s, 'heart', null, h.x, h.y), 'lifted');
  s.time = 0;
  return s;
}
// The time the rules take for `until` to come true, standing still.
function timeTo(s, until, limit = 900) {
  for (let t = 0; t < limit; t += 0.25) {
    if (until()) return t;
    run(s, 0.25);
  }
  return Infinity;
}

test('nothing carried: no clock', () => {
  const s = C.createState(7, { cultivation: true });
  assert.equal(C.cargoForecast(s), null);
  assert.equal(C.cargoForecast(C.createState(7)), null, 'old worlds have no crystal');
});

test('in the noon sun the heart clock says when it starts cracking, and the rules agree', () => {
  const s = carrying(),
    f = C.cargoForecast(s);
  assert.equal(f.what, 'heart');
  assert.equal(f.state, 'warming');
  assert.ok(f.crackIn > 20 && f.crackIn < 60, 'about 40 s of noon sun: ' + f.crackIn);
  const real = timeTo(s, () => s.cultivation.heart.health < 100);
  assert.ok(Math.abs(real - f.crackIn) <= 0.5, `forecast ${f.crackIn} s, rules ${real} s`);
});

test('once cracking, the clock says when the heart breaks, and the rules agree', () => {
  const s = carrying();
  s.cultivation.carrierWarmth = C.HEART_WARM_LINE + 1;
  const f = C.cargoForecast(s);
  assert.equal(f.state, 'cracking');
  assert.ok(f.lostIn > 0 && f.lostIn < C.FORECAST_HORIZON, 'breaks within the horizon');
  const lost = s.cultivation.heartLost || 0,
    real = timeTo(s, () => (s.cultivation.heartLost || 0) > lost);
  assert.ok(Math.abs(real - f.lostIn) <= 0.5, `forecast ${f.lostIn} s, rules ${real} s`);
});

test('a cracking carrier out of the sun cools before the heart breaks, and says when', () => {
  const s = carrying();
  s.time = C.DAY_LENGTH / 2; // midnight: no sun warms it
  s.cultivation.carrierWarmth = C.HEART_WARM_LINE + 1;
  const f = C.cargoForecast(s);
  assert.equal(f.state, 'cracking');
  assert.equal(f.lostIn, undefined, 'it cools long before it breaks');
  assert.ok(Math.abs(f.safeIn - 1 / C.HEART_WARM_COOL) <= 0.5, 'one degree to lose: ' + f.safeIn);
});

test('at night a sound carrier is safe; reading the clock changes nothing', () => {
  const s = carrying();
  s.time = C.DAY_LENGTH / 2;
  const before = JSON.stringify(s.cultivation);
  assert.equal(C.cargoForecast(s).state, 'safe');
  assert.equal(JSON.stringify(s.cultivation), before, 'the forecast only reads');
});

test('a hot chamber gives a clock to its colony dying, and the rules agree; a cool one none', () => {
  const s = C.createState(7, { cultivation: true });
  const b = { kind: 'chamber', id: 99, x: 0, y: 0, z: -2, temperature: 40, health: 50, buffer: 0 };
  s.cultivation.facilities.push(b);
  // Underground at -2 a chamber's spot is 12 + 18 = 30 °C with no cooling tower.
  const f = C.facilityForecast(s, b);
  assert.ok(f?.dies > 0, 'a hot chamber dies: ' + JSON.stringify(f));
  const real = timeTo(s, () => b.health <= 0);
  assert.ok(Math.abs(real - f.dies) <= 0.5, `forecast ${f.dies} s, rules ${real} s`);
  const cool = { kind: 'chamber', id: 98, x: 9, y: 9, z: -2, temperature: 18, health: 50 };
  s.cultivation.facilities.push(cool, { kind: 'cooler', id: 97, x: 10, y: 9, z: -2 });
  assert.equal(C.facilityForecast(s, cool), null);
});

test('a cool shelter says when the heart is mended, and the rules agree', () => {
  const s = C.createState(7, { cultivation: true });
  const b = { kind: 'shelter', id: 5, x: 3, y: 3, z: 0, temperature: 18 };
  s.cultivation.facilities.push(b);
  s.cultivation.heart = { where: 5, health: 80 };
  const f = C.facilityForecast(s, b);
  assert.ok(Math.abs(f.mended - 20 / C.HEART_MEND) <= 0.5, JSON.stringify(f));
  const real = timeTo(s, () => s.cultivation.heart.health >= 100);
  assert.ok(Math.abs(real - f.mended) <= 0.5, `forecast ${f.mended} s, rules ${real} s`);
  assert.equal(C.facilityForecast(s, b), null, 'mended: no clock');
});

test('the clocks are worded as ticking times, never bars', async () => {
  const { cargoClock, facilityClock, batteryClock } = await import('../../src/game/cargo-clock.js');
  const s = carrying();
  assert.match(cargoClock(s).text, /^Cracks in 0:[0-9]{2}$/);
  assert.equal(cargoClock(s).tone, 'warn');
  s.cultivation.carrierWarmth = C.HEART_WARM_LINE + 1;
  assert.match(cargoClock(s).text, /^Heart breaks in [0-9]+:[0-9]{2}$/);
  assert.equal(cargoClock(s).tone, 'danger');
  s.time = C.DAY_LENGTH / 2;
  assert.match(cargoClock(s).text, /^Cracking! Cool in 0:0[0-9]$/);
  s.cultivation.carrierWarmth = 0;
  assert.equal(cargoClock(s).text, 'Heart 100%');
  const shelter = { kind: 'shelter', id: 77, x: 3, y: 3, z: 0, temperature: 18 };
  s.cultivation.facilities.push(shelter);
  s.cultivation.heart = { where: 77, health: 90 };
  assert.equal(facilityClock(s, shelter).text, 'Mended in 0:40');
  s.battery = 0.5;
  assert.equal(batteryClock(s).text, '7:30', 'half of 15 minutes of dark');
  s.battery = 1;
  assert.equal(batteryClock(s), null, 'full: nothing to show');
});

// Watch, 2026-11-01: "Quality falls to 0, then all is lost".
test('carried crystal cracks to 0% and the whole load crumbles, when its clock said', () => {
  const s = carrying();
  const c = s.cultivation;
  c.heart = { where: 'station', health: 100 };
  s.inv.crystal = 12;
  c.quality = 30;
  c.carrierWarmth = C.HEART_WARM_LINE + 2;
  const f = C.cargoForecast(s);
  assert.equal(f.what, 'crystal');
  assert.equal(f.state, 'cracking');
  const real = timeTo(s, () => s.inv.crystal === 0);
  assert.ok(Math.abs(real - f.lostIn) <= 0.5, `forecast ${f.lostIn} s, rules ${real} s`);
  assert.equal(c.crystalLost, 1, 'counted, so the log can say so');
  assert.equal(c.quality, 100, 'the next crystal starts sound');
  assert.ok(C.validCultivation(c), 'and it saves');
});
