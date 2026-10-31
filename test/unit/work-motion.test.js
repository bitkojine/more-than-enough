import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../src/vendor/three/three.module.js';
import { solveArm, miningStroke, UPPER_ARM, FOREARM } from '../../src/game/render/work-motion.js';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test('the one-handed mining grip is reachable with fixed arm lengths over the complete contact stroke', () => {
  for (let i = 14; i <= 84; i++) {
    const p = miningStroke(i / 100),
      driver = p.position.clone().add(new T.Vector3(0, p.grip, 0).applyQuaternion(p.quaternion));
    const a = solveArm([-0.26, 0.13, 0], driver.toArray(), -1);
    close(a.shoulder.distanceTo(a.elbow), UPPER_ARM);
    close(a.elbow.distanceTo(a.hand), FOREARM);
    assert.ok(a.error < 0.004, 'the driving grip stays within reach');
  }
});
test('the pickaxe clears the hood at wind-up and strikes down in front with a continuous arc', () => {
  const head = (t) => {
    const p = miningStroke(t);
    return new T.Vector3(0.28, 0.43, 0).applyQuaternion(p.quaternion).add(p.position);
  };
  const wind = head(0.32),
    contact = head(0.56);
  assert.ok(wind.x < -0.5);
  assert.ok(wind.y > 0.3);
  assert.ok(contact.y < -0.18);
  assert.ok(contact.z > 0.55);
  for (let i = 1; i <= 1000; i++) assert.ok(head(i / 1000).distanceTo(head((i - 1) / 1000)) < 0.04);
});
