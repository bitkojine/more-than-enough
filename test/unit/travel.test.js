import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

// A won crystal world: the machine deep under home, and heart shelters on
// the way to the hiding place, each with seen dry ground around it.
function wonWorld(seed = 7) {
  const s = C.createState(seed, { cultivation: true }),
    c = s.cultivation,
    h = C.hidingPlace(seed),
    see = (x, y, z) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (z < 0) C.setRichness(s.world, x + dx, y + dy, z, 0);
          C.markExplored(s.world, x + dx, y + dy, z);
        }
    };
  const open = (x, y) => {
    for (let r = 0; r < 60; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const ok = [-1, 0, 1].every((oy) =>
            [-1, 0, 1].every((ox) => C.tileAt(s.world, x + dx + ox, y + dy + oy, 0) === C.T.GRASS)
          );
          if (ok) return { x: x + dx, y: y + dy };
        }
    throw Error('no open grass near ' + x + ',' + y);
  };
  const machine = { kind: 'machine', id: c.nextId++, x: 3, y: 4, z: -2, temperature: 12 };
  see(machine.x, machine.y, -2);
  c.facilities.push(machine);
  const shelters = [0.3, 0.9].map((k) => {
    const at = open(Math.round(h.x * k), Math.round(h.y * k)),
      b = {
        kind: 'shelter',
        id: c.nextId++,
        ...at,
        z: 0,
        temperature: 18,
        buffer: 0,
        quality: 100
      };
    see(b.x, b.y, 0);
    c.facilities.push(b);
    return b;
  });
  c.completed = true;
  return { s, c, machine, shelters };
}
const beside = (s, b) => {
  s.player = { x: b.x + 0.5, y: b.y + 1.5, z: b.z };
};
const go = (s, b, to) => C.cultivationCommand(s, { type: 'teleport', x: b.x, y: b.y, to });

test('a woken machine makes every heart shelter a teleport stop, farthest first', () => {
  const { s, c, machine, shelters } = wonWorld();
  assert.deepEqual(
    C.teleportStops(s).map((b) => b.id),
    [shelters[1].id, shelters[0].id]
  );
  c.completed = false;
  assert.deepEqual(C.teleportStops(s), [], 'nothing before it wakes');
  beside(s, shelters[0]);
  assert.equal(go(s, shelters[0]), 'asleep');
  assert.equal(s.player.z, 0);
});

test('from a shelter to the machine and back out to any shelter, carrying everything', () => {
  const { s, c, machine, shelters } = wonWorld();
  s.inv.crystal = 7;
  c.gear.carrier = true;
  c.carrierWarmth = 2.5;
  beside(s, shelters[1]);
  assert.equal(go(s, shelters[1]), 'teleported');
  assert.equal(s.player.z, machine.z);
  assert.ok(C.atInteraction(s, machine.x, machine.y), 'lands beside the machine');
  assert.ok(s.underground.deepest <= machine.z);
  assert.equal(s.inv.crystal, 7);
  assert.equal(c.carrierWarmth, 2.5, 'a doorway, not a rest');
  assert.equal(go(s, machine, shelters[0].id), 'teleported');
  assert.equal(s.player.z, 0);
  assert.ok(C.atInteraction(s, shelters[0].x, shelters[0].y), 'lands beside the shelter');
  assert.equal(C.walkable(s.world, Math.floor(s.player.x), Math.floor(s.player.y), 0), true);
});

test('a teleport needs you beside the stop and a real shelter to go to', () => {
  const { s, machine, shelters } = wonWorld();
  s.player = { x: machine.x + 0.5, y: machine.y + 3.5, z: machine.z };
  assert.equal(go(s, machine, shelters[0].id), 'reach');
  s.player = { x: machine.x + 0.5, y: machine.y + 1.5, z: machine.z };
  assert.equal(go(s, machine, 9999), 'invalid');
  assert.equal(go(s, machine), 'invalid');
  assert.equal(s.player.z, machine.z, 'a refused teleport moves nobody');
});

test('the thief went farther than the hiding place, the other way, fixed by the seed', () => {
  for (const seed of [1, 7, 99, 12345, 4000000000]) {
    const t = C.thiefTrail(seed),
      h = C.hidingPlace(seed),
      s = C.createState(seed, { cultivation: true });
    assert.deepEqual(t, C.thiefTrail(seed));
    const d = Math.hypot(t.x, t.y);
    assert.ok(Math.abs(d - C.THIEF_DISTANCE) < 80, `${seed}: ${d} m`);
    assert.ok(t.x * h.x + t.y * h.y <= 0, `${seed}: away from the hiding place`);
    assert.equal(C.tileAt(s.world, t.x, t.y, 0), C.T.GRASS);
  }
});
