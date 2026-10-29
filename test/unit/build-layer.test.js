// Build offers only what can stand on the layer you're on (Watch, 2026-10-26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

const on = (s, z) => (k) => C.buildsOnLayer(s, k, z);
const kinds = (s, z, list) => list.filter(on(s, z));

test('old worlds build every building and water power on the surface, mine props below', () => {
  const s = C.createState(7);
  const water = Object.keys(C.PROPS).filter((k) => C.PROPS[k].on !== 'tunnel');
  const tunnel = Object.keys(C.PROPS).filter((k) => C.PROPS[k].on === 'tunnel');
  assert.deepEqual(kinds(s, 0, Object.keys(C.EXTRACTORS)), Object.keys(C.EXTRACTORS));
  assert.deepEqual(kinds(s, 0, Object.keys(C.PROPS)), water);
  for (const z of [-1, -3]) {
    assert.deepEqual(kinds(s, z, Object.keys(C.EXTRACTORS)), []);
    assert.deepEqual(kinds(s, z, Object.keys(C.PROPS)), tunnel);
  }
});

test('crystal worlds: garden and quarry up top, mine below, crystal rooms from layer 2 down', () => {
  const s = C.createState(7, { cultivation: true });
  const all = ['garden', 'quarry', 'mine', 'stoneworks', 'depot', 'chamber', 'cooler', 'vault', 'conduit', 'shelter'];
  assert.deepEqual(kinds(s, 0, all), ['garden', 'quarry', 'stoneworks', 'depot', 'shelter']);
  assert.deepEqual(kinds(s, -1, all), ['mine', 'stoneworks', 'depot', 'shelter']);
  assert.deepEqual(kinds(s, -2, all), ['mine', 'stoneworks', 'depot', 'chamber', 'cooler', 'vault', 'conduit', 'shelter']);
  assert.equal(C.buildsOnLayer(s, 'nonsense', 0), false);
});

test('a crystal room the list hides on a layer is one the rules refuse there', () => {
  const s = C.createState(7, { cultivation: true });
  for (const r of C.RESOURCES) C.earn(s, r, 300, 'hand');
  for (const z of [0, -1]) {
    s.player = { x: 0.5, y: 0.5, z };
    C.markExplored(s.world, 0, 0, z);
    for (const kind of C.DEEP_KINDS) {
      assert.equal(C.buildsOnLayer(s, kind), false);
      assert.equal(C.cultivationCommand(s, { type: 'build', kind, x: 0, y: 0 }), 'deep');
    }
  }
});
