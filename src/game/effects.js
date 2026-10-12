/* Short-lived visual effects in world space: particles, floating text, and the
 * "flyers" that carry gathered resources into the player's pack. All effects
 * belong to the layer they were spawned on; changing layers clears them. */

export const RES_COLOR = { wood: '#d2a458', stone: '#c3c8bf', ore: '#e0903c', crystal: '#7fe8ff' };

// Budgets keep bursts cheap. Without a lifetime a fast flyer can overshoot and
// orbit the player forever, piling up sprites and pop particles.
const MAX_PARTICLES = 160;
const MAX_FLYERS = 40;
const FLYER_LIFE = 0.8; // seconds before a flyer force-lands

const rand = Math.random;
const TAU = Math.PI * 2;

export function createEffects() {
  const particles = [];
  const floats = [];
  const flyers = [];

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

  // A handful of sprites zip from a tile to the player, so every inventory gain
  // is visible on screen.
  function flyersFrom(tx, ty, res, amount) {
    const n = Math.max(1, Math.min(7, Math.ceil(amount * 0.35)));
    for (let i = 0; i < n && flyers.length < MAX_FLYERS; i++) {
      flyers.push({
        x: tx + 0.5 + (rand() - 0.5) * 0.5, y: ty + 0.5 + (rand() - 0.5) * 0.5,
        res, seed: rand() * TAU, delay: rand() * 0.16, t: 0, vx: 0, vy: 0
      });
    }
  }

  function text(x, y, label, color, vy = -1.1, life = 1.0) {
    floats.push({ x, y, vy, life, max: life, text: label, color });
  }

  function gathered(tx, ty, res, amount) {
    const color = RES_COLOR[res];
    for (let i = 0; i < 6; i++) {
      const a = rand() * TAU, sp = 1.2 + rand() * 2.2;
      addParticle({
        x: tx + 0.5 + (rand() - 0.5) * 0.5, y: ty + 0.5 + (rand() - 0.5) * 0.5,
        vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp * 0.6 - 1.4,
        life: 0.45 + rand() * 0.25, max: 0.7, size: 1.6 + rand() * 2.2, color
      });
    }
    text(tx + 0.5, ty + 0.2, '+' + Math.floor(amount), color, -1.3, 0.9);
    flyersFrom(tx, ty, res, amount);
  }

  function dug(tx, ty) {
    burst(tx + 0.5, ty + 0.5, 5, [0.8, 1.4], 0.8, [0.3, 0.2], [1.4, 1.6], '#86735c');
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
    floats.length = 0;
    flyers.length = 0;
  }

  function update(dt, player) {
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
      f.vy *= 0.96;
    }
    // Flyers ease in toward the player with a little wobble. They land once the
    // player is within this frame's travel, so they can never step past and
    // circle back; the life cap catches anything else.
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      if (f.t < f.delay) continue;
      const dx = player.x - f.x, dy = player.y - f.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      f.vx += (dx / d) * 26 * dt;
      f.vy += (dy / d) * 26 * dt;
      const wob = Math.sin(f.t * 20 + f.seed) * 2.6;
      f.vx += (-dy / d) * wob * dt;
      f.vy += (dx / d) * wob * dt;
      let v = Math.hypot(f.vx, f.vy);
      if (v > 10) { f.vx *= 10 / v; f.vy *= 10 / v; v = 10; }
      if (f.t >= FLYER_LIFE || d <= v * dt + 0.2) {
        burst(player.x, player.y - 0.2, 3, [1, 1.8], 0.7, [0.22, 0.18], [1.2, 1.6], RES_COLOR[f.res]);
        flyers.splice(i, 1);
        continue;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
  }

  return { particles, floats, flyers, gathered, flyersFrom, text, dug, built, wake, clear, update };
}
