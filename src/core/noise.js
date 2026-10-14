/* Positional hashing and value noise. Every value is a pure function of its
 * inputs (no shared RNG stream), so terrain can be generated in any order. */

// Uniform [0, 1) from an integer lattice point and a seed.
export function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smoothstep(x - x0), fy = smoothstep(y - y0);
  const v00 = hash2(x0, y0, seed), v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed), v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fy;
}

// Fractal Brownian motion: summed octaves of value noise, normalised to [0, 1).
export function fbm(x, y, seed, octaves = 4) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// fbm piles up around 0.5, so a raw cut-off says little about how much of the
// map lies above it. fbmAbove(share, octaves) is the cut-off that about
// `share` of all points exceed (0 = none, 1 = all), read off a fixed sample
// taken once per octave count.
const FBM_SAMPLE = 8192;
const fbmSorted = {};
export function fbmAbove(share, octaves = 4) {
  if (share <= 0) return Infinity;
  if (share >= 1) return -Infinity;
  let s = fbmSorted[octaves];
  if (!s) {
    s = fbmSorted[octaves] = new Float64Array(FBM_SAMPLE);
    for (let i = 0; i < FBM_SAMPLE; i++) s[i] = fbm(hash2(i, 1, 9001) * 5000, hash2(i, 2, 9001) * 5000, 9002 + i, octaves);
    s.sort();
  }
  return s[Math.floor((1 - share) * (FBM_SAMPLE - 1))];
}
