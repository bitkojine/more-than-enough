// Clipping is an illegal state (Watch, 2026-10-25): no two solid parts of
// Mica, Wiki or the gear they carry may pass through each other, and no model
// may pass through itself. The sweep poses the real rig every way the game
// can (test/support/rig-poses.js); RIG_SWEEP=full walks every step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../src/vendor/three/three.module.js';
import { createRigModel, coatRadius } from '../../src/game/render/rig-model.js';
import { findClips, trianglesCross } from '../../src/game/render/rig-clips.js';
import { rigPoses } from '../support/rig-poses.js';
const rig = createRigModel();

test('the detector sees two crossing triangles and ignores two apart', () => {
  const flat = [0, 0, 0, 1, 0, 0, 0, 1, 0],
    through = [0.2, 0.2, -1, 0.2, 0.2, 1, 0.6, 0.2, 0],
    beside = [2, 2, -1, 2, 2, 1, 2.4, 2, 0];
  assert.ok(trianglesCross(flat, through));
  assert.equal(trianglesCross(flat, beside), null);
});

test('the detector catches a lantern hung through the coat', () => {
  rig.pose({ lantern: true });
  assert.deepEqual(findClips(rig), []);
  const lantern = rig.scene.getObjectByName('lantern'),
    home = lantern.position.clone();
  // Its glass sits 0.12 below its ring: centre the glass on the coat's side.
  const y = 0.7;
  lantern.position.copy(
    lantern.parent.worldToLocal(new T.Vector3(coatRadius((y - 0.48) / 0.55), y + 0.12, 0))
  );
  rig.scene.updateMatrixWorld(true);
  assert.ok(
    findClips(rig).some((c) => [c.a, c.b].includes('lantern') && [c.a, c.b].includes('coat'))
  );
  lantern.position.copy(home);
  rig.scene.updateMatrixWorld(true);
  assert.deepEqual(findClips(rig), []);
});

test('only joints and grips may touch, and every seam stays small', () => {
  const names = new Set(rig.solids().map((s) => s.name));
  for (const pose of [
    {},
    { pickaxe: 6, basket: 5, lantern: true, wiki: {}, cargo: 'sealed' },
    { pickaxe: 6, action: 'swing', progress: 0.5 },
    { basket: 5, action: 'pick', progress: 0.5 },
    { lantern: true, action: 'collect', work: 'lantern', progress: 0.5 },
    { flare: true },
    { flare: true, basket: 5, action: 'pick', progress: 0.5 }
  ]) {
    rig.pose(pose);
    for (const name of rig.solids().map((s) => s.name)) names.add(name);
    for (const c of rig.contacts()) {
      if (c.at)
        assert.ok(
          c.r <= 0.3,
          `the ${c.a}/${c.b} seam is a joint, not a licence to clip (r=${c.r})`
        );
      else
        assert.ok(
          WHOLE.has(c.a + '/' + c.b),
          `${c.a}/${c.b} may only touch where they are joined or held`
        );
    }
  }
  for (const c of rig.contacts())
    for (const n of [c.a, c.b]) assert.ok(names.has(n), 'contacts name real solids: ' + n);
});
// Pairs that may meet anywhere: a hand and its arm, the collar where it is
// sewn on, Wiki's fibre feet on the hood, and a hand holding its gear.
const WHOLE = new Set([
  'leftArm/leftHand',
  'rightArm/rightHand',
  'collar/coat',
  'collar/head',
  'wikiFeet/head',
  'rightHand/pickaxe',
  'leftHand/basket',
  'leftHand/cargo',
  'rightHand/cargo',
  'leftHand/lantern',
  'leftHand/flare',
  'rightHand/flare'
]);

test('no pose makes Mica, Wiki or their gear clip', () => {
  const bad = [];
  for (const pose of rigPoses({ full: process.env.RIG_SWEEP === 'full' })) {
    rig.pose(pose);
    const clips = findClips(rig);
    if (clips.length)
      bad.push(
        JSON.stringify(pose) +
          '\n    ' +
          clips
            .map((c) => `${c.a}/${c.b}${c.self ? ' (self)' : ''} ×${c.crossings} at ${c.at}`)
            .join('\n    ')
      );
  }
  assert.equal(bad.length, 0, `${bad.length} poses clip:\n  ` + bad.slice(0, 12).join('\n  '));
});

// Watch (2026-10-26): holding Gather, the tool stayed in hand only mid-stroke
// and went back on Mica's back between strokes, every loop.
test('Gather held: the tool stays in hand from stroke to stroke', () => {
  const flow = { joined: true, onward: true };
  for (const progress of [0, 0.02, 0.5, 0.98, 1]) {
    rig.pose({ basket: 5, pickaxe: 6, action: 'pick', progress, flow });
    assert.equal(rig.inspect().basket.held, true, `basket in hand at ${progress}`);
    rig.pose({ pickaxe: 6, action: 'swing', progress, flow });
    assert.equal(rig.inspect().pickaxe.stowed, false, `pickaxe in hand at ${progress}`);
  }
  rig.pose({ basket: 5, action: 'pick', progress: 0.99, flow: { joined: true, onward: false } });
  assert.equal(rig.inspect().basket.held, false, 'let go: the last stroke puts the basket away');
});

// Full-world replay found the carrying elbow just inside the coat as the
// walk blend settled while breathing. Gait-only samples at time 0 missed it.
test('carrying arms clear the coat while breathing through walk-to-idle blends', () => {
  const times = [0, 17.2264, Math.PI / 4.2, (3 * Math.PI) / 4.2];
  for (const cargo of ['sealed', 'specimen'])
    for (const blend of [0, 0.5, 1])
      for (const phase of [0, 0.25])
        for (const time of times) {
          const pose = { walking: true, phase, blend, time, pickaxe: 3, basket: 2, cargo };
          rig.pose(pose);
          assert.deepEqual(findClips(rig), [], JSON.stringify(pose));
        }
});
