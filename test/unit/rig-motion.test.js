import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legTarget, rigPose, actionPose, LEG_LENGTH } from '../../src/game/render/rig-motion.js';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test('rig walk closes continuously at contact and toe-off, including foot rotation', () => {
  for (const phase of [0, 0.5, 1]) {
    const before = legTarget(phase - 1e-9),
      after = legTarget(phase + 1e-9);
    for (const k of ['y', 'z', 'pitch']) close(before[k], after[k]);
  }
});
test('IK keeps both bones their authored length across the complete gait', () => {
  for (const blend of [0, 0.2, 0.5, 1])
    for (let i = 0; i <= 1000; i++) {
      const p = rigPose({ phase: i / 1000, walking: true, blend });
      for (const leg of [p.left, p.right]) {
        close(Math.hypot(leg.knee.y - p.hipY, leg.knee.z), LEG_LENGTH);
        close(Math.hypot(leg.foot.y - leg.knee.y, leg.foot.z - leg.knee.z), LEG_LENGTH);
        const pitch = leg.foot.pitch,
          minY =
            leg.foot.y -
            0.086 * Math.cos(pitch) -
            Math.max(0.211 * Math.sin(pitch), -0.109 * Math.sin(pitch));
        assert.ok(minY >= -1e-7, 'shoe sole must not penetrate the ground');
      }
    }
});
test('opposite legs exchange contact and passing roles without changing proportions', () => {
  for (let i = 0; i < 100; i++) {
    const a = rigPose({ phase: i / 100, walking: true }),
      b = rigPose({ phase: i / 100 + 0.5, walking: true });
    close(a.left.foot.y, b.right.foot.y);
    close(a.left.foot.z, b.right.foot.z);
    close(a.leftArm, b.rightArm);
  }
  const p = rigPose({ phase: 0.25, walking: true });
  assert.ok(p.right.foot.y > p.left.foot.y + 0.05);
});
test('idle plants both feet and never depends on simulation or display clocks', () => {
  const a = rigPose({ phase: 0 }),
    b = rigPose({ phase: 0.7 });
  assert.deepEqual(a, b);
  close(a.left.foot.y, 0.09);
  close(a.right.foot.y, 0.09);
  close(a.left.foot.z, 0);
  close(a.right.foot.z, 0);
});

test('secondary motion closes at the loop seam and blends completely to rest', () => {
  const a = rigPose({ phase: 1 - 1e-9, walking: true }),
    b = rigPose({ phase: 1e-9, walking: true });
  for (const key of Object.keys(a)) if (typeof a[key] === 'number') close(a[key], b[key]);
  const first = rigPose({ phase: 0.15, walking: true }),
    second = rigPose({ phase: 0.55, walking: true });
  for (const key of [
    'roll',
    'twist',
    'headRoll',
    'leftElbow',
    'leftWrist',
    'clothFront',
    'clothLeft'
  ])
    assert.ok(Math.abs(first[key] - second[key]) > 0.005, key + ' should articulate');
  assert.deepEqual(rigPose({ phase: 0.2, blend: 0 }), rigPose({ phase: 0.8, blend: 0 }));
});
test('each work performance has anticipation and returns continuously to neutral', () => {
  const actions = ['pick', 'collect', 'build', 'swing', 'cheer', 'up', 'down'];
  const signatures = new Set();
  for (const action of actions) {
    for (const t of [0, 1])
      for (const value of Object.values(actionPose(action, t))) close(value, 0);
    signatures.add(JSON.stringify(actionPose(action, 0.3)));
    for (let i = 1; i < 200; i++) {
      const a = actionPose(action, (i - 1) / 200),
        b = actionPose(action, i / 200);
      for (const key of Object.keys(a))
        assert.ok(Math.abs(a[key] - b[key]) < 0.25, action + ' ' + key + ' must not snap');
    }
  }
  assert.equal(signatures.size, actions.length);
  assert.ok(actionPose('swing', 0.25).bow < 0, 'strike has a backward anticipation');
  assert.ok(actionPose('swing', 0.6).bow > 0, 'contact follows through forward');
});
test('action crouches preserve leg lengths and floor clearance while blending with travel', () => {
  for (const action of ['pick', 'collect', 'build', 'swing', 'cheer', 'up', 'down'])
    for (let i = 0; i <= 100; i++) {
      const p = rigPose({ phase: i / 100, blend: 0.6, action, progress: i / 100 });
      for (const leg of [p.left, p.right]) {
        close(Math.hypot(leg.knee.y - p.hipY, leg.knee.z), LEG_LENGTH);
        close(Math.hypot(leg.foot.y - leg.knee.y, leg.foot.z - leg.knee.z), LEG_LENGTH);
        const pitch = leg.foot.pitch;
        assert.ok(
          leg.foot.y -
            0.086 * Math.cos(pitch) -
            Math.max(0.211 * Math.sin(pitch), -0.109 * Math.sin(pitch)) >=
            -1e-7
        );
      }
    }
});
test('idle breath and head movement use supplied presentation time; steady mode plants the upper body', () => {
  const a = rigPose({ time: 0.5 }),
    b = rigPose({ time: 1.7 });
  assert.notEqual(a.breath, b.breath);
  assert.notEqual(a.headYaw, b.headYaw);
  assert.deepEqual(a.left, b.left);
  assert.deepEqual(a.right, b.right);
  assert.deepEqual(rigPose({ time: 0.5, steady: true }), rigPose({ time: 1.7, steady: true }));
});

test('Mica carrying poses protect the hands without changing travel or overriding work', () => {
  for (const walking of [false, true])
    for (const phase of [0, 0.2, 0.5, 0.9]) {
      const a = rigPose({ walking, phase, time: 4 }),
        b = rigPose({ walking, phase, time: 4, carrying: true });
      assert.deepEqual(a.left, b.left);
      assert.deepEqual(a.right, b.right);
      close(a.hipY, b.hipY);
      assert.ok(b.leftArm < -0.4 && b.rightArm < -0.4);
      assert.ok(b.armSpread < -0.5);
    }
  assert.deepEqual(
    rigPose({ carrying: true, action: 'swing', progress: 0.4 }),
    rigPose({ action: 'swing', progress: 0.4 })
  );
  assert.deepEqual(rigPose({ carrying: true, steady: true }), rigPose({ steady: true }));
});
test('Mica blinking and curious idle are bounded presentation gestures with planted feet', () => {
  const a = rigPose({ time: 0 }),
    b = rigPose({ time: 4 });
  assert.notEqual(a.headRoll, b.headRoll);
  assert.deepEqual(a.left, b.left);
  assert.deepEqual(a.right, b.right);
  assert.ok(rigPose({ time: 3.1 }).blink < 0.1);
  close(rigPose({ time: 3.3 }).blink, 1);
  for (let i = 0; i < 1000; i++) {
    const p = rigPose({ time: i * 0.01 });
    assert.ok(p.blink >= 0.05 && p.blink <= 1);
    assert.ok(Math.abs(p.headRoll) < 0.08);
  }
});
