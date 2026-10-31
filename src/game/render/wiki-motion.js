/* Wiki's pose, as pure presentation: no clock, no state, no randomness.
 * Wiki rides on Mica's hood; this decides where it looks, how far its cap is
 * folded and whether its mouth moves. Nothing here changes gameplay. */
const TAU = Math.PI * 2;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// look: the yaw (radians, relative to Mica's hood) toward what the player
// points at, or null. fold: 0 open .. 1 shut. talk: seconds into a line, or
// null. rest: nothing has caught Wiki's attention for a while.
export function wikiPose({ time = 0, look = null, fold = 0, talk = null, rest = false } = {}) {
  const f = clamp(fold),
    breath = Math.sin(time * 2.2);
  const p = {
    bob: 0.004 * breath,
    turn: 0,
    lean: 0.04,
    capTilt: 0,
    rimScale: 1 - 0.34 * f,
    rimDrop: 0.035 * f,
    capDrop: 0.02 * f,
    blink: 1,
    mouth: 0,
    squash: 1 + 0.015 * breath
  };
  if (look !== null && Number.isFinite(look)) {
    p.turn = wrapAngle(look);
    // Leaning toward the thing reads at hood scale; a slight cap tilt follows.
    p.lean = 0.28 * (1 - f);
    p.capTilt = -0.1 * (1 - f);
  }
  // Two quick blinks every few seconds, never while folded shut.
  const cycle = ((time % 4.3) + 4.3) % 4.3;
  if (cycle < 0.14) p.blink = 0.1 + (0.9 * Math.abs(cycle - 0.07)) / 0.07;
  if (rest && look === null) p.blink = Math.min(p.blink, 0.14);
  if (talk !== null && Number.isFinite(talk) && talk >= 0 && talk < 1.6) {
    // The mouth opens and closes a few times, then settles: a line is short.
    p.mouth = Math.abs(Math.sin(talk * TAU * 2.2)) * (1 - talk / 1.6);
    p.bob += 0.006 * Math.abs(Math.sin(talk * TAU * 2.2)) * (1 - talk / 1.6);
    p.blink = Math.max(p.blink, 0.9);
  }
  return p;
}
