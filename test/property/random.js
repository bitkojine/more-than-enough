/* A tiny seeded PRNG for the property tests, with the runner that drives
 * them. No dependencies, and reproducible: a failing case prints the seed
 * that made it, so `PROP_SEEDS=<seed> npm test` replays it exactly. */

// mulberry32: 32-bit state, one multiply-xor round. Good enough to search a
// state space, and small enough to trust: every call is visible here.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float: next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    // A small number, biased toward small ones (most bugs live near zero).
    size: (lo, hi) => lo + Math.floor(Math.pow(next(), 2) * (hi - lo + 1))
  };
}

// The seeds a suite runs by default. Fixed, so a red build is reproducible;
// `PROP_SEEDS` (a count or a list) widens the search when hunting.
export function seeds(count = 12) {
  const env = process.env.PROP_SEEDS;
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return Array.from({ length: n }, (_, i) => 0x9e37 + i * 0x1000 + 1);
    return env.split(',').map((x) => Number(x) >>> 0);
  }
  return Array.from({ length: count }, (_, i) => 0x9e37 + i * 0x1000 + 1);
}

/* ------------------------------------------------------------- running */

// Runs `body(r, seed)` for each seed in `list`. A thrown assertion is a
// failure: it rethrows with the seed in the message, so the failing case
// replays exactly (`PROP_SEEDS=<seed> npm test`). A whole game is short
// enough to read, and the same seed finds it again every time.
export function property(body, { seeds: list = seeds() } = {}) {
  for (const seed of list) {
    try {
      body(rng(seed), seed);
    } catch (err) {
      err.message = `property failed at seed ${seed}\n  ${err.message}`;
      throw err;
    }
  }
}
