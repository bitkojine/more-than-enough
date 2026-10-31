import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, unlockOptional } from './helpers.js';
function world(optional = true) {
  const s = C.createState(7, { cultivation: true });
  if (optional) unlockOptional(s);
  for (const r of C.RESOURCES) C.earn(s, r, 200, 'hand');
  assert.equal(C.cultivationCommand(s, { type: 'craft', kind: 'lantern' }), 'ok');
  s.time = C.DAY_LENGTH / 2;
  return s;
}
const toggle = (s) => C.cultivationCommand(s, { type: 'lantern' });
test('switching carried lights is exclusive, spends extinguished flares and drains only the active lantern', () => {
  const s = world();
  assert.equal(toggle(s), 'ok');
  assert.equal(C.activeCarriedLight(s), 'lantern');
  for (let i = 0; i < 40; i++) {
    assert.equal(C.useFlare(s), 'lit');
    assert.equal(s.cultivation.lantern, false);
    assert.equal(C.activeCarriedLight(s), 'flare');
    const battery = s.battery;
    C.tickBattery(s, 1);
    assert.equal(s.battery, battery);
    assert.equal(toggle(s), 'ok');
    assert.equal(s.flare, 0);
    assert.equal(C.activeCarriedLight(s), 'lantern');
    C.tickBattery(s, 1);
    assert.ok(s.battery < battery);
  }
  C.pay(s.inv, { ore: s.inv.ore });
  const before = C.serialize(s);
  assert.equal(C.useFlare(s), 'materials');
  assert.equal(C.serialize(s), before, 'failed ignition cannot switch the working light off');
  assert.equal(toggle(s), 'ok');
  assert.equal(C.activeCarriedLight(s), null);
});
test('old overlapping lights load as one active flare without losing battery, gear or resources', () => {
  const s = world();
  s.cultivation.lantern = true;
  s.flare = 47.25;
  s.battery = 0.25;
  const d = C.deserialize(C.serialize(s));
  assert.equal(d.cultivation.lantern, false);
  assert.equal(d.flare, 47.25);
  assert.equal(d.battery, 0.25);
  assert.deepEqual(d.inv, s.inv);
  assert.deepEqual(d.cultivation.gear, s.cultivation.gear);
  assert.equal(C.serialize(C.deserialize(C.serialize(d))), C.serialize(d));
});
test('locked flares stay saved and do not suppress the active lantern', () => {
  const s = world(false);
  s.flare = 42;
  assert.equal(toggle(s), 'ok');
  assert.equal(s.flare, 42);
  assert.equal(C.activeCarriedLight(s), 'lantern');
  const d = C.deserialize(C.serialize(s));
  assert.equal(d.cultivation.lantern, true);
  assert.equal(d.flare, 42);
  assert.equal(C.flareLit(d), false);
});
test('legacy lantern is suppressed during a flare and resumes after it burns out', () => {
  const s = C.createState(7);
  s.time = C.DAY_LENGTH / 2;
  s.inv.ore = 1;
  assert.equal(C.useFlare(s), 'lit');
  assert.equal(C.activeCarriedLight(s), 'flare');
  const battery = s.battery;
  C.tickBattery(s, 5);
  assert.equal(s.battery, battery);
  C.burnFlare(s, C.FLARE_TIME);
  assert.equal(C.activeCarriedLight(s), 'lantern');
  C.tickBattery(s, 5);
  assert.ok(s.battery < battery);
});
test('a focused new world can build a solar charger through canonical water placement and charge beside it', () => {
  const s = world(false),
    p = s.player;
  const spot = C.nearestTile(
    p.x,
    p.y,
    80,
    (x, y) =>
      C.tileAt(s.world, x, y, 0) === C.T.WATER &&
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ].some(([dx, dy]) => C.TILE_INFO[C.tileAt(s.world, x + dx, y + dy, 0)].land)
  );
  assert.ok(spot);
  s.tools.boots = 2;
  s.player = { x: spot.x + 0.5, y: spot.y + 0.5, z: 0 };
  C.markExplored(s.world, spot.x, spot.y, 0);
  assert.equal(C.contentLocked(s, 'solar'), false);
  assert.equal(C.placeProp(s, 'solar').ok, true);
  assert.equal(s.spending.totals.props.stone, C.PROPS.solar.cost.stone);
  const [dx, dy] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ].find(([dx, dy]) => C.TILE_INFO[C.tileAt(s.world, spot.x + dx, spot.y + dy, 0)].land);
  s.player = { x: spot.x + dx + 0.5, y: spot.y + dy + 0.5, z: 0 };
  s.battery = 0;
  s.time = 0;
  C.tickBattery(s, C.CHARGE_TIME);
  assert.equal(s.battery, 1);
  s.time = C.DAY_LENGTH / 2;
  s.battery = 0;
  C.tickBattery(s, 1);
  assert.equal(s.battery, 0, 'solar cannot charge at night');
  s.world.props.set(C.packKey(spot.x, spot.y, 0), 'wheel');
  C.tickBattery(s, C.CHARGE_TIME);
  assert.equal(s.battery, 1, 'a wheel charges at night');
  const loaded = C.deserialize(C.serialize(s));
  assert.equal(loaded.battery, 1);
  assert.ok(C.chargerNear(loaded));
  s.player.z = -1;
  s.battery = 0;
  C.tickBattery(s, C.CHARGE_TIME);
  assert.equal(s.battery, 0, 'surface infrastructure cannot charge Mica on another layer');
});

test('carried lights emit on surface and underground, by day and night', () => {
  for (const z of [0, -1, -2, -8])
    for (const time of [0, C.DAY_LENGTH / 2]) {
      const s = world();
      s.player.z = z;
      s.time = time;
      const x = Math.floor(s.player.x),
        y = Math.floor(s.player.y);
      C.tileAt(s.world, x, y, z);
      s.world.hotChunk.type[C.chunkIndex(x, y)] = C.T.TUNNEL;
      C.markExplored(s.world, x, y, z);
      assert.equal(toggle(s), 'ok');
      assert.equal(C.carriedLightLevel(s), C.LANTERN_LEVEL);
      assert.equal(C.useFlare(s), 'lit');
      assert.equal(C.activeCarriedLight(s), 'flare');
      assert.equal(C.carriedLightLevel(s), Math.min(C.LIGHT_MAX, C.FLARE_LIGHT + 1));
      assert.equal(s.cultivation.lantern, false);
    }
});
