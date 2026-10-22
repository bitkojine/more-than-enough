/* How characters move. Everything a character does (you or a friend) is an
 * act: a short move with a start, like a pickaxe swing or a hop, played on
 * top of how they idle, walk or ride a boat. A pose is how far their picture
 * is shifted and tilted around their feet, and what tool is in their hand;
 * pictures are never scaled, so everyone stays the same size.
 *
 * Acts reach friends as a name and a count (see src/net/protocol.js), so a
 * friend's swing plays on your screen as it does on theirs. */

import { ACT_COUNT } from '../../net/protocol.js';

const TAU = Math.PI * 2;
const WALK_RATE = 12;      // radians per second of the step bob (one step per half turn)

// How long each act lasts, in seconds.
export const ACT_TIME = Object.freeze({
  swing: 0.3,    // a pickaxe swing: rock, ore, crystal, dirt
  pick: 0.45,    // bending down to pick mushrooms into the basket
  collect: 0.4,  // reaching out to empty a building
  build: 0.7,    // two hammer taps, putting something up
  cheer: 0.8,    // two hops: a milestone, an upgrade
  down: 0.95,    // dropping in from above after going down a layer
  up: 0.9        // climbing up out of the way up, hand over hand
});

/**
 * What a character is doing, kept on the device that draws them: the act
 * playing (if any) and how long they have stood still.
 */
export function createActor() {
  let kind = null, at = 0, n = 0, stillAt = 0, heardN = null;
  const now = () => performance.now() / 1000;
  const actor = {
    // Starts an act (one of ACTS) now.
    act(k) {
      if (!ACT_TIME[k]) return;
      kind = k; at = now(); n = (n + 1) % ACT_COUNT;
    },
    // A friend's act as their game sent it: plays it when the count moves on.
    heard(k, count) {
      if (count === heardN) return;
      const first = heardN === null;
      heardN = count;
      if (!first && k) { kind = k; at = now(); }
    },
    // Whether an act is still playing.
    get busy() { return !!kind && now() - at < ACT_TIME[kind]; },
    // For the wire: the latest act and its count.
    get sent() { return { a: kind, n }; },
    // What to draw this frame: the act and how far into it, and how long
    // they have been standing still.
    view(moving) {
      const t = now();
      if (moving) stillAt = t;
      const busy = kind && t - at < ACT_TIME[kind];
      return { act: busy ? kind : null, t: busy ? t - at : 0, idle: t - stillAt };
    }
  };
  return actor;
}

const ease = (k) => k * k * (3 - 2 * k);
const bump = (k) => Math.sin(Math.PI * Math.max(0, Math.min(1, k)));

/**
 * Where a character's picture goes this frame. `a` is an actor's view,
 * `time` a clock in seconds, `seed` keeps friends out of step; `steady`
 * (holding up the sign) keeps them still enough for a camera. Returns
 * {dx, dy} in tiles (dy up is negative, dx forward is positive), `rot` in
 * radians (positive leans forward, `rock` of it the boat's rocking, which
 * the boat shares), `turn` (looking back over their shoulder), `tool`
 * ({kind, angle} or null) and `clip` (only what's above their feet shows,
 * climbing out of the ground).
 */
export function pose(a, { moving = false, boat = false, steady = false, time = 0, seed = 0, equipment = null } = {}) {
  const p = { dx: 0, dy: 0, rot: 0, rock: 0, turn: false, tool: null, clip: false };
  if (moving) {
    // Walking: leaning into it, swaying from foot to foot, bobbing each step.
    const w = Math.sin(time * WALK_RATE);
    if (!boat) p.dy -= Math.abs(w) * 0.03;
    p.rot += 0.06 + w * 0.035;
  } else {
    // Standing: breathing, a little sway.
    p.dy -= 0.012 * (0.5 + 0.5 * Math.sin(time * 2.2 + seed));
    p.rot += 0.012 * Math.sin(time * 1.1 + seed * 1.7);
    if (!a.act && !steady && a.idle > 3) {
      // Standing a while: now and then a look around, and a long look at
      // what they hold.
      const cycle = (a.idle - 3 + seed) % 9;
      if (cycle > 3 && cycle < 4.6) p.turn = true;
      if (cycle > 6 && cycle < 8.2) p.rot += 0.09 * bump((cycle - 6) / 2.2);
    }
  }
  if (boat) { p.rock = 0.045 * Math.sin(time * 1.7 + seed); p.rot += p.rock; }
  if (!a.act) return p;
  const k = Math.min(1, a.t / ACT_TIME[a.act]);
  switch (a.act) {
    case 'swing':
      // Wind up over the shoulder, strike down in front, settle.
      if (k < 0.4) { const w = ease(k / 0.4); p.rot -= 0.1 * w; p.tool = { kind: 'pickaxe', angle: -1.1 * w }; }
      else if (k < 0.6) { const w = ease((k - 0.4) / 0.2); p.rot += -0.1 + 0.32 * w; p.tool = { kind: 'pickaxe', angle: -1.1 + 2.7 * w }; }
      else { const w = ease((k - 0.6) / 0.4); p.rot += 0.22 * (1 - w); p.tool = { kind: 'pickaxe', angle: 1.6 - 1.2 * w }; }
      break;
    case 'pick':
      // A deep bow to the ground and back up, basket in hand.
      p.rot += 0.42 * bump(k);
      p.tool = { kind: 'basket', angle: -0.42 * bump(k) };
      break;
    case 'collect':
      p.rot += 0.18 * bump(k);
      p.dy -= 0.12 * bump(k);
      break;
    case 'build': {
      // Two taps of the hammer, bending to the work.
      const tap = Math.abs(Math.sin(k * TAU));
      p.rot += 0.14 * bump(k) + 0.1 * tap;
      p.tool = { kind: 'pickaxe', angle: -0.6 + 1.6 * tap };
      break;
    }
    case 'cheer':
      p.dy -= 0.32 * Math.abs(Math.sin(k * TAU)) * (1 - k * 0.4);
      p.rot += 0.08 * Math.sin(k * TAU * 2);
      break;
    case 'down':
      // Falling in from above, then landing with a little bounce.
      if (k < 0.6) p.dy -= 1.6 * (1 - (k / 0.6) ** 2);
      else p.dy -= 0.1 * bump((k - 0.6) / 0.4);
      p.rot += k < 0.6 ? 0.06 * Math.sin(time * 18) : 0;
      break;
    case 'up':
      // Climbing out of the ground hand over hand, then a hop onto it.
      if (k < 0.7) { p.dy += 0.75 * (1 - k / 0.7); p.rot += 0.12 * Math.sin(k * TAU * 3); p.clip = true; }
      else p.dy -= 0.16 * bump((k - 0.7) / 0.3);
      break;
  }
  if (p.tool && equipment && !equipment[p.tool.kind]) p.tool = null;
  return p;
}
