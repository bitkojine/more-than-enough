/* Short-lived visual effects in world space: particles, floating text, the
 * shake of a struck rock or tree, and the "flyers" that carry what you gather
 * off to the stockpile, so you see where it goes. All effects belong to the
 * layer they were spawned on; changing layers clears them. */

import { resourceLook } from '../core/index.js';
import { fmt } from './format.js';

// Budgets keep bursts cheap.
const MAX_PARTICLES = 160;
const FLYER_SPEED = 3;             // tiles per second, on average: just under walking, so you can follow one home
const FLYER_MIN = 0.8;             // shortest flight, in seconds
const FLYER_LIFT = 0.7;            // how high a flyer floats, in tiles
const FLYER_RISE = 0.5;            // seconds to lift off, and to settle at the end
const FLYER_MERGE = 2;             // gains from near a launch this soon after it ride along with it
const FLYER_NEAR = 1;              // tiles from a launch that count as near it (a row of buildings shares)
const TALLY_LIFE = 2.4;            // seconds a "+n" stays up after its last gain
const TALLY_MERGE = 1.6;           // gains this soon after the last one add to it
const HIT_TIME = 0.28;             // how long a struck rock or tree shakes, in seconds

const rand = Math.random;
const TAU = Math.PI * 2;

/**
 * @param {object} look  the texture pack: sparks take their resource's colour from it
 * @param {(res: string) => {x: number, y: number}} landing  where a flyer of
 *   `res` lands: a spot in the stockpile
 * @param {(x: number, y: number) => boolean} seen  whether a world point is on
 *   screen: flyers off it are the first to make way when there are too many
 * @param {() => number} budget  how many flyers may be in the air at once (it
 *   follows the device's quality level)
 */
export function createEffects(look, landing, seen, budget) {
  const resColor = (res) => look.color(resourceLook(res));
  const particles = [];
  const floats = [];
  const flyers = [];
  const hits = new Map();          // packed tile key -> seconds of shaking left

  // A tile was struck: what stands on it shakes, and chips of it fly.
  function hit(key, tx, ty, color) {
    hits.set(key, HIT_TIME);
    burst(tx + 0.5, ty + 0.45, 7, [1.4, 1.8], 1.6, [0.35, 0.25], [1.6, 2.2], color);
  }

  // How far a struck tile is shaken right now, -1..1 (0 when still).
  function shake(key) {
    const left = hits.get(key);
    return left ? Math.sin(left * 70) * (left / HIT_TIME) : 0;
  }

  function addParticle(p) { if (particles.length < MAX_PARTICLES) particles.push(p); }

  function burst(x, y, n, speed, lift, life, size, color) {
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, sp = speed[0] + rand() * speed[1];
      addParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - lift,
        life: life[0] + rand() * life[1], max: life[0] + life[1],
        size: size[0] + rand() * size[1], color
      });
    }
  }

  // What you gather floats off to the stockpile, unhurried, so you can see
  // where it goes and follow it home (off screen when the yard is far). A run
  // of gains from one spot rides along on the flyer just launched from there,
  // so a steady stream reads as a trail of bundles rather than a blur.
  //
  // Over budget, what's on screen still shows: a flyer off screen makes way
  // (nobody sees it go). With every flyer on screen (a busy spawn), the ones
  // on their way keep going, since replacing them would restart every trail
  // and none would reach home; the gain rides on the newest of its kind, or,
  // the first of its kind, takes the oldest one's place, so a new building
  // always shows.
  function flyersFrom(tx, ty, res, amount) {
    let newest = null;
    for (const f of flyers) {
      if (f.res !== res) continue;
      if (f.t < FLYER_MERGE && Math.abs(f.tx - tx) <= FLYER_NEAR && Math.abs(f.ty - ty) <= FLYER_NEAR) { f.amount += amount; return; }
      if (!newest || f.t < newest.t) newest = f;
    }
    // (A budget that just shrank sheds the extra the same way.)
    while (flyers.length >= budget()) {
      const gone = flyers.findIndex((f) => !seen(f.x, f.y));
      if (gone < 0 && newest) { newest.amount += amount; return; }
      flyers.splice(Math.max(0, gone), 1);
    }
    const to = landing(res);
    const x0 = tx + 0.5 + (rand() - 0.5) * 0.4, y0 = ty + 0.5 + (rand() - 0.5) * 0.4;
    const x1 = to.x + (rand() - 0.5) * 0.4, y1 = to.y + (rand() - 0.5) * 0.4;
    flyers.push({
      x: x0, y: y0, x0, y0, x1, y1, tx, ty, res, amount,
      dur: Math.max(FLYER_MIN, Math.hypot(x1 - x0, y1 - y0) / FLYER_SPEED),
      bob: rand() * TAU, t: 0
    });
  }

  // Floating text; `icon` (a look id) is drawn after it.
  function text(x, y, label, color, icon = null, vy = -1.1, life = 1.0) {
    floats.push({ x, y, vy, life, max: life, text: label, color, icon, pop: 0 });
  }

  // A running "+n" of what you just got: gains of the same thing in quick
  // succession add up on one label, which pops and stays up a while longer,
  // so a run of swings reads as +1, +2, +3 rather than a blur of +1s.
  function tally(x, y, amount, color, icon) {
    const f = floats.find((o) => o.amount !== undefined && o.icon === icon && o.max - o.life < TALLY_MERGE &&
      Math.abs(o.x - x) < 1.5 && Math.abs(o.y - y) < 2);
    if (f) {
      f.amount += amount;
      f.text = '+' + fmt(f.amount);
      f.max = (f.max - f.life) + TALLY_LIFE; // age kept, so a long run moves on
      f.life = TALLY_LIFE;
      f.pop = 1;
      return;
    }
    text(x, y, '+' + fmt(amount), color, icon, -1, TALLY_LIFE);
    floats[floats.length - 1].amount = amount;
  }

  function gathered(tx, ty, res, amount) {
    const color = resColor(res);
    for (let i = 0; i < 6; i++) {
      const a = rand() * TAU, sp = 1.2 + rand() * 2.2;
      addParticle({
        x: tx + 0.5 + (rand() - 0.5) * 0.5, y: ty + 0.5 + (rand() - 0.5) * 0.5,
        vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp * 0.6 - 1.4,
        life: 0.45 + rand() * 0.25, max: 0.7, size: 1.6 + rand() * 2.2, color
      });
    }
    tally(tx + 0.5, ty - 0.3, Math.floor(amount), color, resourceLook(res));
    flyersFrom(tx, ty, res, amount);
  }

  // A find dug out: a burst of its colour, and what it paid, stacked and
  // held a while so it can be read.
  function found(tx, ty, color, gained) {
    burst(tx + 0.5, ty + 0.4, 22, [2.2, 1.6], 1.4, [0.6, 0.5], [2, 2.4], color);
    Object.keys(gained).forEach((res, i) => {
      text(tx + 0.5, ty - 0.3 - i * 0.55, '+' + fmt(gained[res]), resColor(res), resourceLook(res), -0.6, TALLY_LIFE + 0.8);
      flyersFrom(tx, ty, res, gained[res]);
    });
  }

  function dug(tx, ty) {
    burst(tx + 0.5, ty + 0.5, 5, [0.8, 1.4], 0.8, [0.3, 0.2], [1.4, 1.6], '#86735c');
  }

  // Dirt dug out of the way: clods thrown to either side that fall and
  // vanish (nothing flies to the stockpile), and a dim +0.
  function tossed(tx, ty, color) {
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      addParticle({
        x: tx + 0.5, y: ty + 0.4, vx: side * (1.6 + rand() * 1.4), vy: -2.2 - rand() * 1.2,
        life: 0.55 + rand() * 0.2, max: 0.75, size: 2.6 + rand() * 1.8, color
      });
    }
    text(tx + 0.5, ty + 0.2, '+0', '#a99a86', null, -0.9, 0.8);
  }

  // A milestone: a golden ring of sparks around the player.
  function celebrate(x, y) {
    burst(x, y - 0.2, 24, [2.4, 1.6], 1.6, [0.7, 0.5], [2, 2.4], '#ffd166');
  }

  // A stockpile pile going away: a puff of its resource's colour.
  function poof(x, y, color) {
    burst(x, y - 0.1, 8, [0.8, 1.2], 0.9, [0.3, 0.25], [1.6, 2], color);
  }

  function built(tx, ty) {
    burst(tx + 0.5, ty + 0.5, 14, [2, 0], 1, [0.6, 0.4], [2, 2], '#9fe08a');
  }

  // Ripples behind a boat, opposite to its heading.
  function wake(x, y, dirX, dirY) {
    addParticle({
      x: x - dirX * 0.4, y: y - dirY * 0.4,
      vx: -dirX * 0.3 + (rand() - 0.5) * 0.8, vy: -dirY * 0.3 + (rand() - 0.5) * 0.8 - 0.25,
      life: 0.35 + rand() * 0.25, max: 0.6, size: 1 + rand() * 1.6, color: 'rgba(190,225,255,0.5)'
    });
  }

  function clear() {
    particles.length = 0;
    hits.clear();
    floats.length = 0;
    flyers.length = 0;
  }

  function update(dt) {
    for (const [key, left] of hits) {
      if (left <= dt) hits.delete(key); else hits.set(key, left - dt);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 5.5 * dt;
      p.vx *= 0.94;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      if (f.life <= 0) { floats.splice(i, 1); continue; }
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.08, dt); // rises, then hangs where it can be read
      f.pop = Math.max(0, f.pop - dt * 5);
    }
    // Flyers lift off, drift home at an even pace with a gentle bob, and
    // settle onto their spot in the yard.
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      if (f.t >= f.dur) {
        burst(f.x1, f.y1 - 0.2, 3, [1, 1.8], 0.7, [0.22, 0.18], [1.2, 1.6], resColor(f.res));
        flyers.splice(i, 1);
        continue;
      }
      const k = f.t / f.dur, e = k * k * (3 - 2 * k);
      const up = Math.min(1, f.t / FLYER_RISE, (f.dur - f.t) / FLYER_RISE);
      f.x = f.x0 + (f.x1 - f.x0) * e;
      f.y = f.y0 + (f.y1 - f.y0) * e - up * (FLYER_LIFT + Math.sin(f.t * 3 + f.bob) * 0.08);
    }
  }

  return { particles, floats, flyers, gathered, hit, shake, flyersFrom, text, tally, found, dug, tossed, built, poof, celebrate, wake, clear, update };
}
