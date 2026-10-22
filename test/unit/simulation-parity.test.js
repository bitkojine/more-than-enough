import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { step as referenceStep } from '../support/reference-sim.js';
import { productionFixture } from '../support/production-fixture.js';

function changes(s, i) {
  if (i === 30) s.extractors.push({ key: 'garden', res: 'mycelium', x: 30, y: 30, z: 0, buffer: 0 });
  if (i === 60) s.extractors[40] = { key: 'mine', res: 'ore', x: 40, y: 40, z: 0, buffer: 0.625 };
  if (i === 90) s.extractors[0].owner = 'someone-else';
  if (i === 120) s.unlocks.logistics = false;
  if (i === 150) { s.unlocks.logistics = true; s.resUp.mycelium++; s.tools.overclock++; }
  if (i === 180) s.extractors = s.extractors.slice(0, 80);
}

for (const dt of [1 / 60, 0.1, 0.25, 0.4, 0.013]) test(`optimized economy exactly matches the scalar tick at dt=${dt}`, () => {
  const a = productionFixture(), b = structuredClone(a);
  for (let i = 0; i < 240; i++) {
    changes(a, i); changes(b, i); C.invalidateSupports(b);
    referenceStep(a, dt); C.step(b, dt);
    assert.deepEqual(b.inv, a.inv);
    assert.deepEqual(b.stats, a.stats);
    assert.deepEqual(b.sources, a.sources);
    assert.deepEqual(b.extractors, a.extractors, 'unrounded building buffers also match');
    assert.deepEqual(b.events, a.events, 'visual events retain their original order');
    a.events.length = 0; b.events.length = 0;
  }
  assert.equal(C.serialize(b), C.serialize(a));
});

test('headless mode suppresses only visual events, with identical canonical state', () => {
  const a = productionFixture(), b = structuredClone(a);
  C.step(a, 0.1); C.step(b, 0.1, { visualEvents: false });
  assert.ok(a.events.length > 0);
  assert.equal(b.events.length, 0);
  assert.equal(C.serialize(b), C.serialize(a));
  assert.deepEqual(b.extractors, a.extractors);
});
