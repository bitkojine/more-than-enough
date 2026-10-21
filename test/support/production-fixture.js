import * as C from '../../src/core/index.js';

// A component benchmark fixture, not a played world or a win evaluation.
export function productionFixture() {
  const s = C.createState(12345);
  s.unlocks.logistics = true;
  s.tools.overclock = 4;
  s.abundanceLv = 4;
  s.perks.legacy = 3;
  for (const [i, r] of C.RESOURCES.entries()) {
    s.resUp[r] = 4 + i;
    s.inv[r] = 1e12 + 0.1875;
    s.stats[r] = 2e12 + 0.3125;
    s.sources[r].buildings = 3e11;
  }
  const kinds = Object.keys(C.EXTRACTORS);
  s.extractors = Array.from({ length: 180 }, (_, i) => {
    const key = kinds[i % kinds.length];
    return { key, res: C.EXTRACTORS[key].res, x: i % 15 - 7, y: Math.floor(i / 15) - 6, z: 0, buffer: i * 0.1875 };
  });
  return s;
}
