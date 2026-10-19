import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from './helpers.js';
import { createFresh, offers } from '../../src/game/fresh.js';

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
const none = { build: false, upgrades: false };
const gardenCost = (s) => C.extractorCost(s, 'garden');
function giveGarden(s) { Object.assign(s.inv, gardenCost(s)); }

test('NEW shows once something becomes affordable, and stays when you walk or spend', () => {
  const s = C.createState(12345);
  const fresh = createFresh({ store: memoryStore() });
  assert.deepEqual(fresh.check(s), none, 'nothing new in a new world');
  giveGarden(s);
  assert.equal(fresh.check(s).build, true);
  s.player.x += 40; // far from anywhere to build: still new
  assert.equal(fresh.check(s).build, true);
  for (const r of C.RESOURCES) s.inv[r] = 0; // spent on something else: still new
  assert.equal(fresh.check(s).build, true);
});

test('opening the sheet sees it; the rows say NEW while it stays open', () => {
  const s = C.createState(12345);
  const fresh = createFresh({ store: memoryStore() });
  fresh.check(s);
  giveGarden(s);
  fresh.check(s);
  assert.ok(fresh.see(s, 'build').has('garden'));
  assert.deepEqual(fresh.check(s, 'build'), none, 'not on the button while its sheet is open');
  assert.ok(fresh.see(s, 'build').has('garden'), 'still tagged while open');
  assert.deepEqual(fresh.check(s), none, 'closed: seen');
  assert.equal(fresh.see(s, 'build').size, 0, 'opened again: nothing new');
});

test('every new level counts again; buying it clears it', () => {
  const s = C.createState(12345);
  const fresh = createFresh({ store: memoryStore() });
  fresh.check(s);
  giveGarden(s);
  fresh.see(s, 'build');
  fresh.check(s);
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 3, y: 3, z: C.SURFACE, buffer: 0 });
  for (const r of C.RESOURCES) s.inv[r] = 0;
  assert.equal(fresh.check(s).build, false);
  giveGarden(s); // the second garden, at its own price
  assert.equal(fresh.check(s).build, true, 'the next one is new');
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 4, y: 3, z: C.SURFACE, buffer: 0 });
  for (const r of C.RESOURCES) s.inv[r] = 0;
  assert.equal(fresh.check(s).build, false, 'bought (say by Auto-play) without looking: nothing left to see');
});

test('what was seen is kept per world, and an unrecorded world starts with today as seen', () => {
  const store = memoryStore();
  const s = C.createState(12345);
  s.inv.mycelium = 1e6; s.inv.stone = 1e6; s.inv.ore = 1e6; s.inv.crystal = 1e6;
  assert.ok(offers(s).length > 3);
  assert.deepEqual(createFresh({ store }).check(s), none, 'an old save gets no burst of NEW');
  const other = C.createState(777);
  const fresh = createFresh({ store });
  fresh.check(other);
  giveGarden(other);
  assert.equal(fresh.check(other).build, true);
  fresh.see(other, 'build');
  assert.deepEqual(createFresh({ store }).check(other), none, 'a reload remembers it was seen');
});

test('upgrades count too, and props only once you have been where they go', () => {
  const s = C.createState(12345);
  const fresh = createFresh({ store: memoryStore() });
  fresh.check(s);
  s.inv.mycelium = 5;
  assert.ok(!offers(s).some(([, id]) => id === 'glowcap'), 'mine lights wait for the mine');
  s.underground.deepest = C.SURFACE - 1;
  assert.ok(offers(s).some(([, id]) => id === 'glowcap'));
  const up = C.PATH_FAMILIES.find((f) => f.id === 'tools').nodes[0];
  Object.assign(s.inv, C.upgradeCost(s, up));
  assert.equal(fresh.check(s).upgrades, true);
  assert.ok(fresh.see(s, 'upgrades').has(up));
});
