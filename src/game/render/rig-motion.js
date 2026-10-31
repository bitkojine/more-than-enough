/* Presentation only. Model faces +Z; +X is its anatomical left. */
export const LEG_LENGTH = 0.23;
const TAU = Math.PI * 2;
const ankleY = (pitch) =>
  Math.max(
    0.09,
    0.086 * Math.cos(pitch) + Math.max(0.211 * Math.sin(pitch), -0.109 * Math.sin(pitch))
  );
export function legTarget(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.5) {
    const pitch = -0.12 * Math.cos(TAU * p);
    return { y: ankleY(pitch), z: 0.16 * (1 - 4 * p), pitch };
  }
  const t = (p - 0.5) * 2;
  const pitch = 0.12 * Math.cos(Math.PI * t) + 0.08 * Math.sin(Math.PI * t);
  return {
    y: ankleY(pitch) + 0.09 * Math.sin(Math.PI * t) ** 2,
    z: 0.16 * (-1 - 2 * t + 12 * t * t - 8 * t * t * t),
    pitch
  };
}
export function solveLeg(hipY, foot) {
  const dy = foot.y - hipY,
    dz = foot.z,
    d = Math.hypot(dy, dz);
  const reach = Math.min(LEG_LENGTH * 2 - 1e-7, Math.max(1e-7, d));
  const a = reach / 2,
    h = Math.sqrt(Math.max(0, LEG_LENGTH ** 2 - a * a));
  const uy = dy / (d || 1),
    uz = dz / (d || 1);
  return {
    knee: { y: hipY + a * uy + h * uz, z: a * uz - h * uy },
    foot: { ...foot, y: hipY + uy * reach, z: uz * reach }
  };
}
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
// Anticipation -> contact -> recovery. Distinct performances share action
// timing with gameplay; they never determine when a resource is earned.
export function actionPose(action, progress) {
  const t = clamp(progress),
    envelope = Math.sin(Math.PI * t) ** 2;
  const p = {
    bow: 0,
    twist: 0,
    crouch: 0,
    left: 0,
    right: 0,
    leftElbow: 0,
    rightElbow: 0,
    spread: 0
  };
  if (action === 'pick') {
    const reach = ease(t / 0.22) * (1 - ease((t - 0.45) / 0.25));
    p.bow = 0.65 * reach;
    p.crouch = 0.14 * reach;
    p.right = -0.85 * envelope;
    p.rightElbow = -0.5 * envelope;
    p.left = -0.25 * envelope;
  } else if (action === 'collect') {
    p.bow = 0.16 * envelope;
    p.twist = -0.12 * envelope;
    p.right = -1.1 * envelope;
    p.rightElbow = -0.3 * envelope;
    p.left = -0.35 * envelope;
  } else if (action === 'build') {
    const press = Math.sin(Math.PI * t * 2) ** 2;
    p.bow = 0.18 * envelope + 0.06 * press * envelope;
    p.crouch = 0.035 * envelope;
    p.right = -0.6 * envelope;
    p.left = -0.5 * envelope;
  } else if (action === 'swing') {
    const q = action === 'build' ? (t * 2) % 1 : t;
    const wind = ease(q / 0.38) * (1 - ease((q - 0.38) / 0.18));
    const strike = ease((q - 0.38) / 0.18) * (1 - ease((q - 0.56) / 0.44));
    const gate = action === 'build' ? envelope : 1;
    p.spread = gate * (0.12 * wind + 0.06 * strike);
    p.bow = gate * (-0.1 * wind + 0.26 * strike);
    p.twist = gate * (0.13 * wind - 0.1 * strike);
    p.crouch = 0.025 * strike * gate;
    p.right = gate * (-1.65 * wind - 0.85 * strike);
    p.left = gate * (-0.8 * wind - 0.45 * strike);
    p.rightElbow = -0.6 * wind * gate;
    p.leftElbow = -0.35 * wind * gate;
  } else if (action === 'cheer') {
    p.spread = 0.9 * envelope;
    p.left = p.right = -2.4 * envelope;
    p.leftElbow = p.rightElbow = -0.35 * envelope;
  } else if (action === 'up') {
    p.left = -envelope * (1.3 + 0.5 * Math.sin(TAU * t * 3));
    p.right = -envelope * (1.3 - 0.5 * Math.sin(TAU * t * 3));
    p.leftElbow = p.rightElbow = -0.45 * envelope;
    p.bow = 0.12 * envelope;
  } else if (action === 'down') {
    p.spread = 0.18 * envelope;
    p.left = p.right = -0.55 * envelope;
    p.crouch = 0.045 * Math.sin(Math.PI * clamp((t - 0.55) / 0.45)) ** 2;
    p.bow = 0.15 * envelope;
  }
  return p;
}
export function rigPose({
  phase = 0,
  walking = false,
  blend = null,
  action = null,
  progress = 0,
  time = 0,
  steady = false,
  carrying = false
} = {}) {
  const p = ((phase % 1) + 1) % 1,
    w = TAU * p,
    weight = clamp(blend ?? (walking ? 1 : 0));
  const work = actionPose(action, progress),
    idle = (1 - weight) * (steady ? 0 : 1);
  // Quiet attention is presentation-only. Finite windows return to neutral;
  // signing/boat steady mode disables every personality layer.
  const window = (at, start, width) => {
    const x = (at - start) / width;
    return x > 0 && x < 1 ? Math.sin(Math.PI * x) ** 2 : 0;
  };
  const curiosity = (action ? 0 : idle) * window(((time % 9) + 9) % 9, 2.8, 2.6);
  const blink = steady ? 1 : 1 - 0.94 * window(((time % 4.7) + 4.7) % 4.7, 3.0, 0.2);
  const settle = action === 'build' ? (1 - weight) * window(progress, 0.72, 0.28) : 0;
  const hipY = 0.549 + weight * (0.52 - 0.012 * Math.cos(w * 2) - 0.549) - work.crouch;
  const target = (phase) => {
    if (!weight) return { y: 0.09, z: 0, pitch: 0 };
    const raw = legTarget(phase),
      pitch = raw.pitch * weight;
    return { y: Math.max(ankleY(pitch), 0.09 + (raw.y - 0.09) * weight), z: raw.z * weight, pitch };
  };
  const left = target(p),
    right = target(p + 0.5),
    swing = weight * (0.36 * Math.cos(w) + 0.045 * Math.sin(w * 3));
  const roll = weight * 0.055 * Math.sin(w),
    twist = weight * 0.085 * Math.sin(w + 0.3);
  const pose = {
    hipY,
    left: solveLeg(hipY, left),
    right: solveLeg(hipY, right),
    leftArm: swing + work.left,
    rightArm: -swing + work.right,
    armSpread: work.spread,
    leftElbow: -0.15 - weight * 0.16 * (1 + Math.sin(w - 0.4)) + work.leftElbow,
    rightElbow: -0.15 - weight * 0.16 * (1 - Math.sin(w - 0.4)) + work.rightElbow,
    leftWrist: weight * 0.09 * Math.sin(w - 0.7),
    rightWrist: -weight * 0.09 * Math.sin(w - 0.7),
    lean: work.bow + weight * (0.045 + 0.025 * Math.sin(w * 2 - 0.4)),
    roll,
    twist: twist + work.twist,
    breath: idle * 0.006 * Math.sin(time * 2.1),
    headPitch:
      -work.bow * 0.45 +
      weight * 0.025 * Math.sin(w * 2 - 0.8) -
      0.055 * curiosity -
      0.045 * settle,
    headRoll: -roll * 0.7 + weight * 0.018 * Math.sin(w - 0.7) + 0.07 * curiosity,
    headYaw: -twist * 0.6 + idle * 0.035 * Math.sin(time * 0.7) + 0.11 * curiosity,
    blink,
    clothFront: weight * (0.035 + 0.055 * Math.sin(w * 2 - 0.85)) + work.bow * 0.16,
    clothBack: weight * (-0.045 + 0.065 * Math.sin(w * 2 - 1.3)) - work.bow * 0.12,
    clothLeft: weight * 0.075 * Math.sin(w - 0.9),
    clothRight: -weight * 0.075 * Math.sin(w - 0.9)
  };
  if (carrying && !steady && !action) {
    // A protective two-hand hold. Travel/feet retain exactly the same targets;
    // work actions temporarily take precedence over the cargo presentation.
    pose.leftArm = -0.55 + swing * 0.12;
    pose.rightArm = -0.55 - swing * 0.12;
    pose.leftElbow = pose.rightElbow = -1.05;
    pose.armSpread = -0.87;
    pose.leftWrist = pose.rightWrist = 0.04;
    pose.headPitch += 0.035;
  }
  // Normalize signed zero so a fully settled pose is phase-independent.
  for (const k of Object.keys(pose)) if (pose[k] === 0) pose[k] = 0;
  return pose;
}
