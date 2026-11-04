/* Whether a loaded crystal world is whole (validCultivation in
 * src/core/cultivation-save.js): the game plays only one that is, and mends
 * the rest first. Mutation sweep 1 (2026-11-04) found 205 planted bugs in
 * cultivation-save.js that no test caught, most of them loosening one of
 * these checks, so a broken save could have been played as it was. Each test
 * here starts from a world that is whole and breaks one thing, to the first
 * value past its edge, and keeps the last value inside it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

const facility = (id, kind, x, z = -2, extra = {}) => ({
  id,
  kind,
  x,
  y: 0,
  z,
  temperature: 22,
  buffer: 0,
  quality: 100,
  ...extra
});

// A world with one of each kind, a route, a sheltered heart and wild crystal.
function whole() {
  const c = C.newCultivation();
  c.facilities = [
    facility(1, 'chamber', 0),
    facility(2, 'vault', 1),
    facility(3, 'conduit', 2, -2, { from: 1, to: 2 }),
    facility(4, 'machine', 3, -2, { sections: 0, health: 0 }),
    facility(5, 'shelter', 4, 0),
    facility(6, 'bench', 5, 0),
    facility(7, 'cooler', 6)
  ];
  c.nextId = 8;
  c.heart = { where: 5, health: 100 };
  c.wild = { a: { x: 9, y: 9, z: -3, health: 100, regrow: 45 } };
  return c;
}
const ok = (change, why) => {
  const c = whole();
  change(c);
  assert.equal(C.validCultivation(c), true, why);
};
const bad = (change, why) => {
  const c = whole();
  change(c);
  assert.equal(C.validCultivation(c), false, why);
};
const f = (c, id) => c.facilities.find((b) => b.id === id);

test('cultivation valid: a whole world is', () => {
  assert.equal(C.validCultivation(whole()), true);
  assert.equal(C.validCultivation(C.newCultivation()), true, 'a new one too');
  assert.equal(C.validCultivation(null), false);
});

test('cultivation valid: the world as a whole', () => {
  bad((c) => (c.model = 'other'), 'another model');
  bad((c) => (c.facilities = {}), 'facilities are a list');
  bad((c) => (c.wild = []), 'wild crystal is by key');
  bad((c) => (c.wild = null));
  bad((c) => (c.wild = 5), 'a number has no keys, but is no list of crystal either');
  bad((c) => (c.gear = null));
  for (const [k, lo, hi] of [
    ['quality', 0, 100],
    ['clock', 0, Number.MAX_SAFE_INTEGER]
  ]) {
    ok((c) => (c[k] = lo), `${k} ${lo}`);
    ok((c) => (c[k] = hi), `${k} ${hi}`);
    bad((c) => (c[k] = lo - 1), `${k} below`);
    bad((c) => (c[k] = NaN), `${k} NaN`);
  }
  bad((c) => (c.quality = 100.5));
  ok((c) => (c.phase = 0.25 - 1e-10), 'just before a quarter');
  bad((c) => (c.phase = 0.25), 'the phase wraps before a quarter');
  bad((c) => (c.phase = -0.01));
  bad((c) => (c.nextId = 1.5));
  ok((c) => (c.starter = { health: 0 }));
  bad((c) => (c.starter = { health: 101 }));
  bad((c) => (c.starter = { health: -1 }));
  ok((c) => (c.completedAt = 0));
  bad((c) => (c.completedAt = -1));
  bad((c) => (c.completed = 'yes'));
  bad(
    (c) => (c.completed = 'yes') && (f(c, 4).sections = C.MACHINE_REPAIRS.length),
    'won or not is true or false, even with the machine whole'
  );
  for (const k of ['heartLost', 'crystalLost', 'storeLost']) {
    ok((c) => (c[k] = 0), k + ' 0');
    bad((c) => (c[k] = -1), k + ' below 0');
    bad((c) => (c[k] = 0.5), k + ' a count');
  }
  ok((c) => (c.carrierWarmth = 0));
  ok((c) => (c.carrierWarmth = C.HEART_WARM_MAX));
  bad((c) => (c.carrierWarmth = C.HEART_WARM_MAX + 0.1));
  bad((c) => (c.carrierWarmth = -0.1));
});

test('cultivation valid: wild crystal', () => {
  const w = (c) => c.wild.a;
  ok((c) => (w(c).health = 0));
  bad((c) => (w(c).health = 100.1));
  bad((c) => (w(c).health = -0.1));
  ok((c) => (w(c).regrow = 0));
  bad((c) => (w(c).regrow = 45.1));
  bad((c) => (w(c).regrow = -0.1));
  bad((c) => (w(c).z = 0), 'wild crystal grows underground');
  ok((c) => (w(c).z = -512));
  bad((c) => (w(c).z = -513));
  bad((c) => (w(c).x = 0.5));
  bad((c) => (w(c).y = 2 ** 20));
  ok((c) => (w(c).y = 2 ** 20 - 1));
  bad((c) => (w(c).x = -(2 ** 20)));
  bad((c) => (w(c).z = -2.5));
  bad((c) => (c.wild.b = null));
});

test('cultivation valid: each facility', () => {
  bad((c) => (f(c, 1).kind = 'tower'), 'an unknown kind');
  bad((c) => (c.facilities[0] = null));
  bad((c) => (f(c, 7).id = 0), 'ids start at 1');
  bad((c) => (f(c, 7).id = 8), 'below nextId');
  ok((c) => (f(c, 7).id = 9) && (c.nextId = 10));
  bad((c) => (f(c, 7).id = 7.5));
  bad((c) => (f(c, 7).id = 1), 'two share an id');
  bad((c) => (f(c, 7).x = 0), 'two share a tile');
  ok((c) => (f(c, 7).z = -3) && (f(c, 7).x = 0), 'the same x and y a layer down');
  bad((c) => (f(c, 1).z = -1), 'a chamber is underground');
  bad((c) => (f(c, 1).z = 0));
  ok((c) => (f(c, 5).z = -2), 'a shelter can be underground');
  bad((c) => (f(c, 5).z = 1), 'nothing above the surface');
  ok((c) => (f(c, 6).z = 0), 'a bench on the surface');
  bad((c) => (f(c, 6).z = 1));
  for (const [k, lo, hi] of [
    ['temperature', -1000, 1000],
    ['buffer', 0, 40],
    ['quality', 0, 100],
    ['health', 0, 100]
  ]) {
    ok((c) => (f(c, 1)[k] = lo), `${k} ${lo}`);
    ok((c) => (f(c, 1)[k] = hi), `${k} ${hi}`);
    bad((c) => (f(c, 1)[k] = lo - 0.5), `${k} below`);
    bad((c) => (f(c, 1)[k] = hi + 0.5), `${k} above`);
  }
  ok((c) => delete f(c, 1).health, 'health is optional');
  bad((c) => delete f(c, 1).buffer, 'buffer is not');
});

test("cultivation valid: the machine's sections, routes, the heart", () => {
  ok((c) => (f(c, 4).sections = C.MACHINE_REPAIRS.length));
  bad((c) => (f(c, 4).sections = C.MACHINE_REPAIRS.length + 1));
  bad((c) => (f(c, 4).sections = -1));
  bad((c) => (f(c, 4).sections = 1.5));
  ok((c) => delete f(c, 4).sections);
  bad((c) => (f(c, 1).sections = 0), 'only the machine has sections');
  bad((c) => (f(c, 3).from = 2), 'a route starts at a chamber');
  bad((c) => (f(c, 3).to = 1), 'and ends at a vault');
  bad((c) => (f(c, 3).to = 99), 'to something that is there');
  bad((c) => (f(c, 3).from = 99), 'from something that is there');
  bad((c) => (c.completed = true), 'a world won has a repaired machine');
  ok((c) => (c.completed = true) && (f(c, 4).sections = C.MACHINE_REPAIRS.length));
  ok((c) => (c.completed = false));
  for (const where of ['station', 'carried', 'installed', 5])
    ok((c) => (c.heart.where = where), 'the heart ' + where);
  bad((c) => (c.heart.where = 1), 'a heart rests only in a shelter');
  bad((c) => (c.heart.where = 'lost'));
  ok((c) => (c.heart = undefined));
  bad((c) => (c.heart = null));
  ok((c) => (c.heart.health = 0));
  bad((c) => (c.heart.health = 100.5));
  bad((c) => (c.heart.health = -0.5));
});
