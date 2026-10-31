import { WALK_ANIMATION_RATE } from './motion.js';

/* The 2D figure is the fallback for when the 3D rig isn't drawing (before it
 * loads, without WebGL, a player's own pack, friends): its walk frame. The
 * actor owns stride phase, so rendering the same state twice cannot advance
 * it. Frame 0 is the planted pose. */
export function characterFrame(clip, actor, { moving = false, water = false, time = 0 } = {}) {
  if (!moving || water || actor.walking === false || clip.pics.length < 2) return 0;
  if (actor.stride != null) return Math.floor(actor.stride * clip.pics.length) % clip.pics.length;
  return 1 + (Math.floor(time * (clip.fps || 6) * WALK_ANIMATION_RATE) % (clip.pics.length - 1));
}
