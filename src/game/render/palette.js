/* Colour helpers shared by everything that draws the ground. The colours
 * themselves come from the texture pack (look.js). */

import * as Core from '../../core/index.js';

// Stable per-tile variation for decoration.
export const tv = (x, y, salt) => Core.hash2(x, y, salt);

const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);

// Slight brightness variation so flat ground doesn't look like a grid.
export function shade(hex, f, dim = 1) {
  const m = (0.84 + f * 0.34) * dim;
  const c = (i) => Math.round(channel(hex, i) * m);
  return `rgb(${c(1)},${c(3)},${c(5)})`;
}

// '#rrggbb' at opacity a.
export function rgba(hex, a) {
  return `rgba(${channel(hex, 1)},${channel(hex, 3)},${channel(hex, 5)},${a})`;
}
