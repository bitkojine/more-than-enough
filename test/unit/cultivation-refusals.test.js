/* What each crystal command costs and when it says no. A mutation run
 * (2026-11-02, Stryker on src/core/cultivation-commands.js) showed that no
 * test caught a command going through without paying, or one that should
 * have been refused: these pin each payment and each "why not" answer. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { unlockOptional } from './helpers.js';

const R = C.CULTIVATION_RECIPES;
const cmd = (s, type, extra = {}) =>
  C.cultivationCommand(s, { type, x: Math.floor(s.player.x), y: Math.floor(s.player.y), ...extra });

// A crystal world, opened up around (0, 0) two layers down, with everything
// unlocked and nothing in hand.
function world() {
  const s = unlockOptional(C.createState(7, { cultivation: true }));
  s.tools.pickaxe = 3;
  for (let y = -8; y <= 8; y++)
    for (let x = -8; x <= 8; x++) {
      const t = C.tileAt(s.world, x, y, -2);
      if (!C.TILE_INFO[t].rise && !C.TILE_INFO[t].descend) {
        C.setRichness(s.world, x, y, -2, 0);
        C.markExplored(s.world, x, y, -2);
      }
    }
  s.player = { ...s.player, x: 0.5, y: 0.5, z: -2 };
  for (const k of Object.keys(s.inv)) s.inv[k] = 0;
  return s;
}
const give = (s, cost) => {
  for (const [k, n] of Object.entries(cost)) s.inv[k] = (s.inv[k] || 0) + n;
};
// A building of `kind` at the player's tile, placed directly.
function place(s, kind, extra = {}) {
  const c = s.cultivation;
  const b = {
    kind,
    id: c.nextId++,
    x: Math.floor(s.player.x),
    y: Math.floor(s.player.y),
    z: s.player.z,
    temperature: 12,
    buffer: 0,
    quality: 100,
    ...extra
  };
  c.facilities.push(b);
  C.forgetCultivationIndex(c);
  return b;
}
// What a refused command must leave alone (an empty list of covered lights
// made on the way counts as nothing).
const snapshot = (s) =>
  JSON.stringify([s.inv, { ...s.cultivation, shaded: s.cultivation.shaded || {} }]);

// Each paid command: one short of any part of its price is refused and
// changes nothing; the exact price goes through and takes exactly that.
const PAID = [
  ['build a chamber', 'build', { kind: 'chamber' }, () => R.chamber, () => {}],
  ['craft a lantern', 'craft', { kind: 'lantern' }, () => R.lantern, () => {}],
  ['craft a carrier', 'craft', { kind: 'carrier' }, () => R.carrier, () => {}],
  [
    'line the carrier at the bench',
    'line',
    {},
    () => R.lining,
    (s) => {
      s.cultivation.gear.carrier = true;
      place(s, 'bench');
    }
  ],
  [
    'tend a chamber',
    'tend',
    {},
    () => R.tend,
    (s) => place(s, 'chamber', { health: 80, needsTend: true })
  ],
  ['reinforce a vault', 'reinforce', {}, () => R.reinforce, (s) => place(s, 'vault')],
  [
    'cover a lamp',
    'shade',
    {},
    () => R.shade,
    (s) => s.world.props.set(C.packKey(0, 0, -2), 'lamp')
  ]
];

for (const [what, type, extra, price, setup] of PAID) {
  test(`crystal commands: ${what} costs exactly its price`, () => {
    for (const short of Object.keys(price())) {
      const s = world();
      setup(s);
      give(s, price());
      s.inv[short] -= 1;
      const before = snapshot(s);
      assert.equal(cmd(s, type, extra), 'materials', 'one ' + short + ' short');
      assert.equal(snapshot(s), before, 'and nothing changes');
    }
    const s = world();
    setup(s);
    give(s, price());
    assert.equal(cmd(s, type, extra), 'ok');
    for (const k of Object.keys(price())) assert.equal(s.inv[k], 0, k + ' is paid');
  });
}

test('crystal commands: covering a lamp is paid once; uncovering and covering again are free', () => {
  const s = world();
  s.world.props.set(C.packKey(0, 0, -2), 'lamp');
  give(s, R.shade);
  assert.equal(cmd(s, 'shade'), 'ok');
  assert.equal(s.inv.mycelium, 0);
  assert.equal(cmd(s, 'shade'), 'ok', 'uncovered with nothing in hand');
  assert.equal(cmd(s, 'shade'), 'ok', 'and covered again');
  assert.equal(s.cultivation.shaded[C.packKey(0, 0, -2)], true);
});

test('crystal commands: covering needs a light there', () => {
  const s = world();
  give(s, R.shade);
  assert.equal(cmd(s, 'shade'), 'site');
  s.world.props.set(C.packKey(0, 0, -2), 'boulder-not-a-prop');
  assert.equal(cmd(s, 'shade'), 'site', 'an unknown prop is no light');
});

test('crystal commands: refused in a shared world and in a world without crystal', () => {
  const s = world();
  give(s, R.lantern);
  s.shared = 'W'.repeat(22);
  assert.equal(cmd(s, 'craft', { kind: 'lantern' }), 'invalid');
  assert.equal(s.cultivation.gear.lantern, false);
  const old = C.createState(7);
  assert.equal(C.cultivationCommand(old, { type: 'craft', kind: 'lantern' }), 'invalid');
});

test('crystal commands: a tile you have not seen, or not a whole tile, is refused', () => {
  const s = world();
  give(s, R.chamber);
  assert.equal(cmd(s, 'build', { kind: 'chamber', x: 0.5 }), 'unseen');
  assert.equal(cmd(s, 'build', { kind: 'chamber', x: 40, y: 40 }), 'unseen');
  assert.equal(s.inv.stone, R.chamber.stone, 'nothing paid');
});

test('crystal commands: work done at a building needs one of the right kind there', () => {
  const s = world();
  give(s, R.tend);
  assert.equal(cmd(s, 'tend'), 'building', 'nothing there');
  place(s, 'vault');
  assert.equal(cmd(s, 'tend'), 'invalid', 'a vault cannot be tended');
  assert.equal(cmd(s, 'nonsense'), 'invalid');
});

test('crystal commands: crafting one you already have is refused, and only lanterns and carriers', () => {
  const s = world();
  give(s, R.lantern);
  give(s, R.lantern);
  assert.equal(cmd(s, 'craft', { kind: 'lantern' }), 'ok');
  assert.equal(cmd(s, 'craft', { kind: 'lantern' }), 'invalid');
  assert.equal(s.inv.ore, R.lantern.ore, 'the second is not paid');
  assert.equal(cmd(s, 'craft', { kind: 'chamber' }), 'invalid');
});

test('crystal commands: lining needs the carrier, and happens once', () => {
  const s = world();
  place(s, 'bench');
  give(s, R.lining);
  give(s, R.lining);
  assert.equal(cmd(s, 'line'), 'equipment', 'no carrier yet');
  s.cultivation.gear.carrier = true;
  assert.equal(cmd(s, 'line'), 'ok');
  assert.equal(cmd(s, 'line'), 'invalid', 'already lined');
  assert.equal(s.inv.mycelium, R.lining.mycelium, 'paid once');
});

test('crystal commands: planting needs a specimen in hand and an empty chamber', () => {
  const s = world();
  const b = place(s, 'chamber');
  assert.equal(cmd(s, 'plant'), 'starter');
  s.cultivation.starter = { health: 70 };
  b.health = 1;
  assert.equal(cmd(s, 'plant'), 'occupied', 'anything alive in it');
  assert.ok(s.cultivation.starter, 'and the specimen stays in hand');
  b.health = 0;
  assert.equal(cmd(s, 'plant'), 'ok', 'a dead chamber takes one');
  assert.equal(b.health, 70);
  assert.equal(b.needsTend, true, 'a hurt specimen needs tending');
  assert.equal(s.cultivation.starter, null);
  const healthy = world();
  const h = place(healthy, 'chamber');
  healthy.cultivation.starter = { health: 100 };
  assert.equal(cmd(healthy, 'plant'), 'ok');
  assert.equal(h.needsTend, false, 'a whole one does not');
});

test('crystal commands: tending needs a living chamber no warmer than 22 °C', () => {
  const s = world();
  const b = place(s, 'chamber', { health: 0, needsTend: true });
  give(s, R.tend);
  assert.equal(cmd(s, 'tend'), 'dead');
  b.health = 50;
  b.temperature = 22.1;
  assert.equal(cmd(s, 'tend'), 'unsafe');
  assert.equal(b.needsTend, true);
  b.temperature = 22;
  assert.equal(cmd(s, 'tend'), 'ok', 'exactly 22 °C is safe');
  assert.equal(b.needsTend, false);
});

test('crystal commands: collecting needs a whole crystal, and takes them all', () => {
  const s = world();
  const b = place(s, 'vault', { buffer: 0.9, quality: 80 });
  assert.equal(cmd(s, 'collect'), 'empty');
  b.buffer = 1;
  assert.equal(cmd(s, 'collect'), 'ok', 'exactly one is enough');
  assert.equal(s.inv.crystal, 1);
  assert.equal(b.buffer, 0);
  assert.equal(s.cultivation.quality, 80);
});

test('crystal commands: storing fills a vault up to what it holds, and no further', () => {
  const s = world();
  const b = place(s, 'vault', { buffer: 15, quality: 100 });
  s.inv.crystal = 9;
  s.cultivation.quality = 60;
  assert.equal(cmd(s, 'store'), 'ok');
  assert.equal(b.buffer, 20, 'a plain vault holds 20');
  assert.equal(s.inv.crystal, 4, 'and the rest stays in hand');
  assert.equal(cmd(s, 'store'), 'empty', 'full');
  assert.equal(s.inv.crystal, 4);
  b.reinforced = true;
  assert.equal(cmd(s, 'store'), 'ok', 'a reinforced one holds 40');
  assert.equal(b.buffer, 24);
  assert.equal(s.inv.crystal, 0);
  assert.equal(cmd(s, 'store'), 'empty', 'nothing in hand');
});

test('crystal commands: reinforcing happens once', () => {
  const s = world();
  place(s, 'chamber');
  give(s, R.reinforce);
  give(s, R.reinforce);
  assert.equal(cmd(s, 'reinforce'), 'ok');
  assert.equal(cmd(s, 'reinforce'), 'occupied');
  assert.equal(s.inv.crystal, R.reinforce.crystal, 'paid once');
});

test('crystal commands: the machine is woken once, whole, good and cool', () => {
  const s = world();
  const m = s.cultivation.facilities.find((b) => b.kind === 'machine');
  Object.assign(m, { x: 0, y: 0, z: -2, sections: 0, health: 100, quality: 100, temperature: 12 });
  place(s, 'cooler', { y: 1 }); // without one, a machine runs at 30 °C down here
  s.cultivation.completed = false;
  assert.equal(cmd(s, 'activate'), 'sections');
  m.sections = C.MACHINE_REPAIRS.length;
  m.quality = 59;
  assert.equal(cmd(s, 'activate'), 'quality');
  m.quality = 60;
  m.health = 0;
  assert.equal(cmd(s, 'activate'), 'quality', 'a dead machine');
  m.health = 100;
  m.temperature = 23;
  assert.equal(cmd(s, 'activate'), 'cooling');
  m.temperature = 12;
  assert.equal(cmd(s, 'activate'), 'activated');
  assert.ok(C.cultivationTarget(s, m) <= 22, 'the cooler keeps it cool');
  assert.equal(s.cultivation.completed, true);
  assert.equal(cmd(s, 'activate'), 'completed');
});

test('crystal commands: repairing needs good crystal, cool air and the price', () => {
  const s = world();
  const m = s.cultivation.facilities.find((b) => b.kind === 'machine');
  Object.assign(m, { x: 0, y: 0, z: -2, sections: 0, health: 0, quality: 0, temperature: 12 });
  place(s, 'cooler', { y: 1 });
  const price = C.machineRepairCost(m);
  s.cultivation.completed = false;
  s.cultivation.quality = 59;
  give(s, price);
  assert.equal(cmd(s, 'repair'), 'quality');
  s.cultivation.quality = 75;
  s.inv.stone -= 1;
  assert.equal(cmd(s, 'repair'), 'materials');
  s.inv.stone += 1;
  assert.equal(cmd(s, 'repair'), 'discovery');
  for (const k of Object.keys(price)) assert.equal(s.inv[k], 0, k + ' is paid');
  assert.equal(m.sections, 1);
  assert.equal(m.quality, 75, 'the machine takes the crystal it was made with');
  assert.equal(m.health, 100);
  assert.equal(s.cultivation.restored, true);
});

test('crystal commands: the heart rests only in a shelter, from your hands', () => {
  const s = world();
  s.cultivation.gear.carrier = true;
  s.cultivation.heart = { where: 'carried', health: 100 };
  assert.equal(cmd(s, 'heart'), 'site', 'no shelter here');
  const shelter = place(s, 'shelter');
  s.cultivation.heart.where = 'station';
  assert.equal(cmd(s, 'heart'), 'gone', 'not in hand');
  s.cultivation.heart.where = 'carried';
  assert.equal(cmd(s, 'heart'), 'ok');
  assert.equal(s.cultivation.heart.where, shelter.id);
  assert.equal(cmd(s, 'heart'), 'lifted', 'and is taken back');
  assert.equal(s.cultivation.heart.where, 'carried');
});
