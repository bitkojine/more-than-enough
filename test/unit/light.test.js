/* Light: the battery of the device in your hands, which only drains in the
 * dark and only water power charges, and the solar panels and water wheels
 * that do (core light.js). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, findNear, standOn, away, holdPerfect } from './helpers.js';

const { SURFACE } = C;
const NOON = 0, MIDNIGHT = C.DAY_LENGTH / 2;

// Water on the surface with land beside it, near spawn.
function shore(s) {
  const land = (x, y) => C.walkable(s.world, x, y, SURFACE) && !C.swimsAt(s.world, x, y, SURFACE);
  return findNear(s, (st, x, y) => typeAt(st, x, y, SURFACE) === T.WATER && (land(x + 1, y) || land(x - 1, y) || land(x, y + 1) || land(x, y - 1)), 200);
}

// A tile of a river between regions: walking out from the origin along a row.
function river(seed) {
  for (const dir of [1, -1]) {
    for (let x = 0; Math.abs(x) < 2000; x += dir) {
      if (C.landAt(seed, x, 0).border === 'river' && C.tileAt(C.createWorld(seed), x, 0, SURFACE) === T.WATER) return { x, y: 0 };
    }
  }
  return null;
}

test('the battery drains only in the dark, at one BATTERY_LIFE from full to flat', () => {
  const s = away(C.createState(12345));
  assert.equal(s.battery, 1, 'a new world starts full');
  s.time = NOON;
  for (let i = 0; i < 40; i++) C.step(s, 0.25);
  assert.equal(s.battery, 1, 'daylight needs no screen');
  s.time = MIDNIGHT;
  for (let i = 0; i < 40; i++) C.step(s, 0.25);
  assert.ok(Math.abs(s.battery - (1 - 10 / C.BATTERY_LIFE)) < 1e-9, 'ten seconds of night: ' + s.battery);
  s.battery = 0.001;
  for (let i = 0; i < 40; i++) C.step(s, 0.25);
  assert.equal(s.battery, 0, 'never below flat');
  const before = s.battery;
  C.produceAway(s, 3600, true);
  assert.equal(s.battery, before, 'and nothing happens to it while you are away');
});

test('a low battery only shrinks your light, in the dark', () => {
  const s = away(C.createState(12345));
  s.time = MIDNIGHT;
  assert.equal(C.lightScale(s), 1, 'full');
  s.battery = C.BATTERY_LOW;
  assert.equal(C.lightScale(s), 1, 'down to BATTERY_LOW it reaches as far as ever');
  s.battery = C.BATTERY_LOW / 2;
  assert.ok(C.lightScale(s) < 1 && C.lightScale(s) > C.BATTERY_DIM, 'then it shrinks');
  s.battery = 0;
  assert.equal(C.lightScale(s), C.BATTERY_DIM, 'to BATTERY_DIM when flat');
  s.time = NOON;
  assert.equal(C.lightScale(s), 1, 'and by day it makes no difference');

  // Flat at night, the fog lifts over less of the land around you.
  const lit = (battery) => {
    const t = away(C.createState(4242));
    t.time = MIDNIGHT;
    t.battery = battery;
    t.world.explored.clear();
    C.revealAround(t);
    let n = 0;
    for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) n += C.isExplored(t.world, Math.floor(t.player.x) + x, Math.floor(t.player.y) + y, SURFACE) ? 1 : 0;
    return n;
  };
  assert.ok(lit(0) < lit(1) / 3, 'flat: ' + lit(0) + ' tiles, full: ' + lit(1));
});

test('a solar panel goes on water, charges by day only, and is saved', () => {
  const s = away(C.createState(12345));
  Object.assign(s.inv, { stone: 500, ore: 500 });
  assert.equal(C.canPlaceProp(s, 'solar'), false, 'not on land');
  const w = shore(s);
  assert.ok(w, 'water by the shore near spawn');
  standOn(s, w);
  assert.equal(C.canPlaceProp(s, 'solar'), true);
  assert.equal(C.canPlaceProp(s, 'wheel'), false, 'a water wheel needs a river');
  assert.equal(C.canPlaceProp(s, 'glowcap'), false, 'tunnel props stay in the mine');
  assert.equal(C.placeProp(s, 'solar').ok, true);
  assert.equal(s.inv.stone, 500 - C.PROPS.solar.cost.stone);
  assert.equal(C.canPlaceProp(s, 'solar'), false, 'one per tile');

  s.battery = 0.2;
  s.time = MIDNIGHT;
  assert.equal(C.chargerNear(s), null, 'the sun is down');
  C.step(s, 0.25);
  assert.ok(s.battery < 0.2, 'so it still drains');
  s.time = NOON;
  assert.deepEqual(C.chargerNear(s), { x: w.x, y: w.y, kind: 'solar' });
  for (let i = 0; i < 4 * C.CHARGE_TIME; i++) C.step(s, 0.25);
  assert.equal(s.battery, 1, 'charged full in CHARGE_TIME');
  s.player.x += C.CHARGE_RANGE + 2;
  assert.equal(C.chargerNear(s), null, 'only within CHARGE_RANGE');

  const back = C.deserialize(C.serialize(s));
  assert.deepEqual([...back.world.props], [...s.world.props], 'the panel is saved');
  assert.equal(back.battery, s.battery);
  const old = JSON.parse(C.serialize(s));
  delete old.battery;
  old.props.push([C.packKey(w.x + 1, w.y, SURFACE), 'glowcap']);
  const loaded = C.deserialize(JSON.stringify(old));
  assert.equal(loaded.battery, 1, 'a save from before the battery starts full');
  assert.equal(loaded.world.props.size, 1, 'a tunnel prop on the surface is dropped');
});

test('a water wheel goes only on a river, and charges day and night', () => {
  const seed = 12345;
  const r = river(seed);
  assert.ok(r, 'a river along the row');
  const s = away(C.createState(seed));
  Object.assign(s.inv, { stone: 500, ore: 500 });
  standOn(s, r);
  assert.equal(C.canPlaceProp(s, 'wheel'), true);
  assert.equal(C.placeProp(s, 'wheel').ok, true);
  s.time = MIDNIGHT;
  s.battery = 0.5;
  C.step(s, 1);
  assert.ok(s.battery > 0.5, 'charging at midnight');
  assert.ok(C.charging('wheel', MIDNIGHT) && C.charging('wheel', NOON));
  assert.ok(!C.charging('solar', MIDNIGHT) && C.charging('solar', NOON));
  assert.ok(!C.charging('glowcap', NOON), 'a glowcap charges nothing');
});

test('Perfect puts a solar panel by the shore and charges there when low', () => {
  const s = away(C.createState(12345));
  s.tools.boots = C.GEAR.water;
  Object.assign(s.inv, { stone: 100, ore: 100 });
  const w = shore(s);
  for (let y = -40; y <= 40; y++) for (let x = -40; x <= 40; x++) C.markExplored(s.world, w.x + x, w.y + y, SURFACE);
  s.time = NOON;
  s.battery = 0.8;
  const mind = C.newMind();
  holdPerfect(s, 120, { mind, seen(intent) { if (intent.type === 'prop') assert.equal(intent.kind, 'solar'); } });
  const panels = [...s.world.props].filter(([, k]) => k === 'solar');
  assert.equal(panels.length, 1, 'one panel, near home');

  // Low by day, it goes back to a panel and stays till the battery's full.
  s.time = NOON + C.DAY_LENGTH * 10;
  s.player.x += 15;
  s.battery = 0.3;
  let charged = 0;
  holdPerfect(s, 40, { mind, seen(intent) { if (intent.type === 'charge') charged++; } });
  assert.ok(charged > 0, 'it charged');
  assert.ok(s.battery > 0.9, 'up to full: ' + s.battery);
});
