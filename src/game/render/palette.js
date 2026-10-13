/* Colours shared by everything that draws the ground: each tile type's base
 * colour and the per-tile variation that keeps flat ground from looking like
 * a grid. */

import * as Core from '../../core/index.js';

const { T } = Core;

// Stable per-tile variation for decoration.
export const tv = (x, y, salt) => Core.hash2(x, y, salt);

export const BASE_COLOR = [];
BASE_COLOR[T.GRASS] = '#243018';
BASE_COLOR[T.FOREST] = '#0e1a0c';
BASE_COLOR[T.STONE] = '#34372e';
BASE_COLOR[T.ORE] = '#34372e';
BASE_COLOR[T.CRYSTAL] = '#141d30';
BASE_COLOR[T.WATER] = '#0e2138';
BASE_COLOR[T.ROCK] = '#0b0e11';
BASE_COLOR[T.TUNNEL] = '#29251e';
BASE_COLOR[T.SOIL] = '#59452f';
BASE_COLOR[T.STONE_SEAM] = '#55524b';
BASE_COLOR[T.ORE_SEAM] = '#744629';
BASE_COLOR[T.CRYSTAL_SEAM] = '#27566a';
BASE_COLOR[T.FOSSIL] = '#554b62';
BASE_COLOR[T.BEDROCK] = '#14171a';
BASE_COLOR[T.SHAFT] = '#574b32';
BASE_COLOR[T.SHAFT_OPEN] = '#315747';

// Slight brightness variation so flat ground doesn't look like a grid.
export function shade(hex, f, dim = 1) {
  const m = (0.84 + f * 0.34) * dim;
  const c = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * m);
  return `rgb(${c(1)},${c(3)},${c(5)})`;
}
