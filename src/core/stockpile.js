/* The stockpile: everything you own, piled up on the ground around home.
 *
 * Amounts are shown on a logarithmic scale, like the tiles of 2048. Each
 * power of ten is its own kind of pile (one stone, a stack of 10, a pile of
 * 100, a cart of 1,000, ... up to a crowned capital), and ten of a kind merge
 * into one of the next. Only the two leading digits are shown: 3,452 stone
 * is 3 carts and 4 piles, so a resource never stands as more than 18 piles,
 * and a glance at the biggest tells you the order of magnitude.
 *
 * The yard is only a picture of the inventory: nothing is carried there, and
 * piles never get in the way of walking or gathering. It stands on the
 * square of home ground every world starts in (see terrain.js), which is
 * laid out like a town: two roads cross in the middle, and each resource
 * owns one of the four blocks between them (mycelium north-west, stone
 * north-east, ore south-east, crystal south-west). In its block, the leading
 * digit's piles stand in the corner by the crossroads, as big as their count
 * allows (one pile gets the whole corner, nine share it), and the second
 * digit's piles stand in a row along the block's outer edges. Every pile has
 * a fixed slot, so nothing ever stands outside home ground or on another
 * pile. Pure: the same amounts always give the same yard. */

import { RESOURCES } from './tiles.js';
import { HOME_HALF } from './terrain.js';

export const PILE_BASE = 10;     // each kind of pile is this many of the one below
export const PILE_DIGITS = 2;    // how many leading digits of an amount stand as piles
export const SPAN_FROM = 7;      // piles for 10^7 and up take a square of tiles...
// ...one tile wider for every power of ten (10^7: 2x2, 10^8: 3x3, ...), as
// far as their slot allows.
export const pileSpan = (tier) => (tier < SPAN_FROM ? 1 : tier - SPAN_FROM + 2);
export const HOME_SIDE = 2 * HOME_HALF + 1; // home ground's side, in tiles
export const BLOCK = HOME_HALF - 1;  // each block's side, in tiles (a tile of margin to the wild)

// The piles that show amount `a`, as tiers (0 = ones, 1 = tens, ...),
// biggest first: as many of each as its digit, for the leading PILE_DIGITS.
export function pileTiers(a) {
  const n = Math.floor(Math.max(0, a));
  if (!(n > 0)) return [];
  let digits, exp;
  if (n < 1e21) {
    digits = String(n);
    exp = digits.length - 1;
  } else { // too big for plain digits: keep the leading ones
    const [m, e] = n.toExponential(15).split('e');
    digits = m.replace('.', '').replace(/0+$/, '');
    exp = Number(e);
  }
  const out = [];
  for (let i = 0; i < Math.min(digits.length, PILE_DIGITS); i++) {
    for (let k = 0; k < digits.charCodeAt(i) - 48; k++) out.push(exp - i);
  }
  return out;
}

// Home: where every world starts, the middle of home ground.
export const home = () => ({ x: 0, y: 0 });

// Slots in a block, in its own grid: (u, v) tiles out from the crossroads'
// corner, u along the road, v away from it.
// The leading digit's n piles: a square grid of square slots with a tile
// between them, in the corner by the crossroads.
function leadSlots(n) {
  const k = n === 1 ? 1 : n <= 4 ? 2 : 3;          // slots per row
  const size = Math.floor((BLOCK - 2 - (k - 1)) / k);  // leaves two rows for the second digit
  const out = [];
  for (let i = 0; i < n; i++) out.push({ u: (i % k) * (size + 1), v: Math.floor(i / k) * (size + 1), size });
  return out;
}
// The second digit's piles: single tiles along the block's outer edges,
// every other tile, from the roads outwards.
const EDGE_SLOTS = (() => {
  const out = [], far = BLOCK - 1;
  for (let i = 0; i < BLOCK; i += 2) out.push({ u: i, v: far, size: 1 });
  for (let i = 0; i < far - 1; i += 2) out.push({ u: far, v: i, size: 1 });
  return out;
})();

// Each resource's block: which way u and v run from the crossroads.
const BLOCKS = [
  { du: -1, dv: -1 }, // mycelium: north-west
  { du: 1, dv: -1 },  // stone: north-east
  { du: 1, dv: 1 },   // ore: south-east
  { du: -1, dv: 1 }   // crystal: south-west
];

/**
 * @typedef {object} Pile
 * @property {number} x      north-west tile of its square
 * @property {number} y
 * @property {number} span   side of its square, in tiles
 * @property {string} res
 * @property {number} tier   power of ten it stands for
 */

/**
 * Every pile in the yard, each in its slot.
 * @param {object} s  game state
 * @returns {Pile[]}
 */
export function yardLayout(s) {
  const out = [];
  RESOURCES.forEach((res, r) => {
    const tiers = pileTiers(s.inv[res]);
    if (!tiers.length) return;
    const top = tiers[0];
    const lead = tiers.filter((t) => t === top).length;
    const slots = [...leadSlots(lead), ...EDGE_SLOTS];
    const { du, dv } = BLOCKS[r];
    tiers.forEach((tier, i) => {
      const slot = slots[i];
      const span = Math.min(slot.size, pileSpan(tier));
      // Centred in its slot, then turned into the block's corner of the map:
      // the block starts one tile out from the crossroads (the roads).
      const u = 1 + slot.u + ((slot.size - span) >> 1), v = 1 + slot.v + ((slot.size - span) >> 1);
      out.push({
        x: du > 0 ? u : -u - span + 1,
        y: dv > 0 ? v : -v - span + 1,
        span, res, tier
      });
    });
  });
  return out;
}
