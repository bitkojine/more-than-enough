/* The stockpile: everything you own, piled up on the ground around home.
 *
 * Amounts are shown on a logarithmic scale, read like an abacus. Each power
 * of ten is its own kind of pile (a log, a bundle of 10, a pile of 100, a
 * cart of 1,000, ...), and each digit of the amount is how many of that
 * kind there are: 3,452 wood is 3 carts, 4 piles, 5 bundles and 2 logs. So
 * the yard grows with the number of digits, and a glance at the biggest piles
 * tells you the order of magnitude.
 *
 * The yard is only a picture of the inventory: nothing is carried there, and
 * piles never get in the way of walking or gathering. It spirals out from home
 * (where the world started) over ground you have explored, biggest piles in
 * the middle. It takes open grass first and spreads over deposits (covering
 * their trees and boulders) only when that is much closer; it never covers
 * water, rock, holes or buildings. Pure: the same state always gives the same
 * yard. */

import { SURFACE } from './coords.js';
import { RESOURCES, TILE_INFO } from './tiles.js';
import { tileAt, findSpawn, holeBelow, isExplored } from './world.js';

export const YARD_RADIUS = 64;   // how far from home the yard can spread, in tiles
export const PILE_BASE = 10;     // each kind of pile is this many of the one below
export const SPAN_FROM = 7;      // piles for 10^7 and up take a square of tiles...
// ...one tile wider for every power of ten (10^7: 2x2, 10^8: 3x3, ...), so
// every power of ten still looks different from the next.
export const pileSpan = (tier) => (tier < SPAN_FROM ? 1 : tier - SPAN_FROM + 2);

// The piles that show amount `a`, as tiers (0 = ones, 1 = tens, ...),
// biggest first.
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
  for (let i = 0; i < digits.length; i++) {
    for (let k = 0; k < digits.charCodeAt(i) - 48; k++) out.push(exp - i);
  }
  return out;
}

// How many tiles further out the yard would rather go than use surface tile
// (x, y), or -1 if no pile can stand there. (Only ground you've seen: a pile
// out in the dark would hang over nothing.)
export function yardCost(w, x, y) {
  const avoid = TILE_INFO[tileAt(w, x, y, SURFACE)].yard;
  if (avoid === undefined || !isExplored(w, x, y, SURFACE) || holeBelow(w, x, y, SURFACE)) return -1;
  return avoid;
}

// Home: where the world started (also where every new world starts you).
export const home = (s) => findSpawn(s.world);

// The ground within R of home, as a grid: how much the yard avoids each
// tile (-1 = never), and every usable tile in order of preference (ring by
// ring around home, each ring clockwise from due north, plus avoidance).
export function yardGround(s, R) {
  const side = 2 * R + 1;
  const h = home(s);
  const avoid = new Int8Array(side * side);
  for (let gy = 0; gy < side; gy++) {
    for (let gx = 0; gx < side; gx++) avoid[gy * side + gx] = yardCost(s.world, h.x - R + gx, h.y - R + gy);
  }
  for (const e of s.extractors) {
    const gx = e.x - h.x + R, gy = e.y - h.y + R;
    if (e.z === SURFACE && gx >= 0 && gy >= 0 && gx < side && gy < side) avoid[gy * side + gx] = -1;
  }
  const order = [];
  for (let r = 0; r <= R; r++) {
    for (const [dx, dy] of ring(r)) {
      const i = (dy + R) * side + (dx + R);
      if (avoid[i] >= 0) order.push({ i, cost: r + avoid[i], n: order.length });
    }
  }
  order.sort((p, q) => p.cost - q.cost || p.n - q.n);
  return { home: h, R, side, avoid, order: order.map((o) => o.i) };
}

// Every pile in the yard: [{ x, y, span, res, tier }], (x, y) being the
// north-west tile of its span x span square. Biggest tiers nearest home,
// resources taking turns within a tier.
//
// Reading the ground is the slow part and doesn't change as amounts do, so
// callers can pass a `memo` object to keep it between calls; it is re-read
// when the world, its fog, holes or buildings change.
export function yardLayout(s, memo = null) {
  const want = [];
  const lists = RESOURCES.map((r) => ({ res: r, tiers: pileTiers(s.inv[r]) }));
  const top = Math.max(-1, ...lists.map((l) => (l.tiers.length ? l.tiers[0] : -1)));
  for (let tier = top; tier >= 0; tier--) {
    const counts = lists.map((l) => l.tiers.filter((t) => t === tier).length);
    for (let k = 0; k < Math.max(...counts); k++) {
      lists.forEach((l, i) => { if (k < counts[i]) want.push({ res: l.res, tier, span: pileSpan(tier) }); });
    }
  }
  if (!want.length) return [];

  const area = want.reduce((n, p) => n + p.span * p.span, 0);
  const R = Math.min(YARD_RADIUS, Math.ceil(Math.sqrt(area) * 1.5) + 6);
  const key = s.world.revealed + '|' + s.world.holes.size + '|' + s.extractors.length;
  let g = memo && memo.world === s.world && memo.key === key && memo.ground.R >= R ? memo.ground : null;
  if (!g) {
    g = yardGround(s, Math.max(R, memo && memo.world === s.world ? memo.ground.R : 0));
    if (memo) Object.assign(memo, { world: s.world, key, ground: g });
  }
  const { side, avoid, order } = g;

  const used = new Uint8Array(side * side);
  const fits = (gx, gy, span) => {
    if (gx < 0 || gy < 0 || gx + span > side || gy + span > side) return false;
    for (let y = gy; y < gy + span; y++) {
      for (let x = gx; x < gx + span; x++) if (used[y * side + x] || avoid[y * side + x] < 0) return false;
    }
    return true;
  };
  const out = [];
  let next = 0; // single tiles only ever move further out
  for (const p of want) {
    const half = (p.span - 1) >> 1;
    for (let k = p.span === 1 ? next : 0; k < order.length; k++) {
      const gx = (order[k] % side) - half, gy = Math.floor(order[k] / side) - half;
      if (!fits(gx, gy, p.span)) continue;
      for (let y = gy; y < gy + p.span; y++) used.fill(1, y * side + gx, y * side + gx + p.span);
      out.push({ x: g.home.x - g.R + gx, y: g.home.y - g.R + gy, ...p });
      if (p.span === 1) next = k + 1;
      break;
    }
  }
  return out;
}

// The tiles at distance r (Chebyshev) from the centre, clockwise from north.
function ring(r) {
  if (r === 0) return [[0, 0]];
  const cells = [];
  for (let x = -r; x < r; x++) cells.push([x, -r]);
  for (let y = -r; y < r; y++) cells.push([r, y]);
  for (let x = r; x > -r; x--) cells.push([x, r]);
  for (let y = r; y > -r; y--) cells.push([-r, y]);
  return cells;
}
