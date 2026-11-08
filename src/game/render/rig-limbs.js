/* Bending Mica's limbs to a target (rig-model.js): an arm by its solved
 * shoulder, elbow and hand (work-motion.js solveArm), a leg by its knee and
 * foot, and building them. `rig` is a limb's bones: {upper, lower, hand} or {upper, lower, foot}. */
import * as T from '../../vendor/three/three.module.js';
import { solveArm, UPPER_ARM, FOREARM } from './work-motion.js';
import { LEG_LENGTH } from './rig-motion.js';
import { shoeGeometry } from './rig-geometry.js';

const DOWN = new T.Vector3(0, -1, 0);
// Arms hang this far out (radians) so sleeves and mittens clear the coat.
export const REST_SPREAD = 0.76;
// The render layer holding only the mittens (rigged-character.js drawHands).
export const MITTENS = 1;

// An arm and a leg, built onto Mica's skeleton. `k` is rig-model.js's kit:
// its bone() and mesh() makers, the spine and hips bones and the materials.
export function buildArm(k, side) {
  const upper = k.bone(side > 0 ? 'leftUpperArm' : 'rightUpperArm', k.spine, side * 0.26, 0.13, 0),
    lower = k.bone(side > 0 ? 'leftForearm' : 'rightForearm', upper, 0, -UPPER_ARM, 0),
    hand = k.bone(side > 0 ? 'leftHand' : 'rightHand', lower, 0, -FOREARM, 0);
  upper.rotation.z = side * REST_SPREAD;
  const sleeve = k.mesh(
    new T.CylinderGeometry(0.095, 0.105, UPPER_ARM + 0.03, 32, 6),
    k.orange,
    upper,
    0,
    0.015 - (UPPER_ARM + 0.03) / 2,
    0
  );
  sleeve.scale.z = 0.95;
  const cuff = k.mesh(
    new T.TorusGeometry(0.099, 0.006, 8, 32),
    k.thread,
    upper,
    0,
    -UPPER_ARM - 0.015,
    0
  );
  cuff.rotation.x = Math.PI / 2;
  k.mesh(
    new T.CylinderGeometry(0.052, 0.055, FOREARM - 0.11, 16),
    k.black,
    lower,
    0,
    -0.04 - (FOREARM - 0.11) / 2,
    0
  );
  // The mitten and its thumb are also drawn on their own, over a sign held up.
  for (const mitten of [
    k.ellipsoid(hand, k.black, 0, -0.02, 0, 0.108, 0.115, 0.087),
    k.ellipsoid(hand, k.black, -side * 0.076, -0.005, 0.04, 0.04, 0.06, 0.04)
  ])
    mitten.layers.enable(MITTENS);
  return { upper, lower, hand };
}

export function buildLeg(k, side) {
  const upper = k.bone(side > 0 ? 'leftThigh' : 'rightThigh', k.hips, side * 0.125, 0, 0),
    lower = k.bone(side > 0 ? 'leftShin' : 'rightShin', upper, 0, -LEG_LENGTH, 0),
    foot = k.bone(side > 0 ? 'leftFoot' : 'rightFoot', lower, 0, -LEG_LENGTH, 0);
  k.mesh(
    new T.CylinderGeometry(0.083, 0.074, LEG_LENGTH, 24),
    k.black,
    upper,
    0,
    -LEG_LENGTH / 2,
    0
  );
  k.mesh(
    new T.CylinderGeometry(0.074, 0.066, LEG_LENGTH - 0.025, 24),
    k.linen,
    lower,
    0,
    -LEG_LENGTH / 2,
    0
  );
  for (let i = 0; i < 4; i++) {
    const band = k.mesh(
      new T.TorusGeometry(0.073 - i * 0.0015, 0.0035, 6, 32),
      k.cream,
      lower,
      0,
      -0.045 - i * 0.05,
      0
    );
    band.rotation.x = Math.PI / 2 + 0.04;
  }
  k.mesh(shoeGeometry(0.205, 0.3, 0.022, { sole: true }), k.sole, foot, 0, -0.086, 0);
  k.mesh(shoeGeometry(0.19, 0.25, 0.062), k.black, foot, 0, -0.055, 0);
  return { upper, lower, foot };
}

// `weight` blends from the pose the arm already has (0) to the target (1).
export function poseArm(rig, side, target, orientation, weight = 1) {
  const shoulder = rig.upper.position.toArray(),
    solution = solveArm(shoulder, target, side);
  const q1 = new T.Quaternion().setFromUnitVectors(
    DOWN,
    solution.elbow.clone().sub(solution.shoulder).normalize()
  );
  const q2 = new T.Quaternion().setFromUnitVectors(
    DOWN,
    solution.hand.clone().sub(solution.elbow).normalize()
  );
  const qHand = q2.clone().invert().multiply(orientation);
  rig.upper.quaternion.slerp(q1, weight);
  rig.lower.quaternion.slerp(q1.clone().invert().multiply(q2), weight);
  rig.hand.quaternion.slerp(qHand, weight);
}

export function poseLeg(target, rig, hipY) {
  const knee = new T.Vector3(0, target.knee.y - hipY, target.knee.z),
    ankle = new T.Vector3(0, target.foot.y - target.knee.y, target.foot.z - target.knee.z);
  const q1 = new T.Quaternion().setFromUnitVectors(DOWN, knee.normalize()),
    q2 = new T.Quaternion().setFromUnitVectors(DOWN, ankle.normalize());
  rig.upper.quaternion.copy(q1);
  rig.lower.quaternion.copy(q1).invert().multiply(q2);
  rig.foot.quaternion
    .copy(q2)
    .invert()
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), target.foot.pitch));
}
