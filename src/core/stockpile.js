/* The stockpile: everything you own, piled up on the ground around home.
 *
 * Amounts are shown on a logarithmic scale, read like an abacus. Each power
 * of ten is its own kind of pile (one stone, a stack of 10, a pile of 100,
 * a cart of 1,000, ...), and each digit of the amount is how many of that
 * kind there are: 3,452 stone is 3 carts, 4 piles, 5 stacks and 2 stones. So
 * the yard grows with the number of digits, and a glance at the biggest piles
 * tells you the order of magnitude.
 *
 * The yard is only a picture of the inventory: nothing is carried there, and
 * piles never get in the way of walking or gathering. It fills the home
 * clearing every world starts in (home ground, see terrain.js), biggest piles
 * in the middle, and once that is full spills onto open grass around it. It
 * never stands on anything you can gather, nor on water, mountains, holes or
 * buildings. Pure: the same state always gives the same yard. */

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

/**
 * @typedef {object} Pile
 * @property {number} x      north-west tile of its square
 * @property {number} y
 * @property {number} span   side of its square, in tiles
 * @property {string} res
 * @property {number} tier   power of ten it stands for
 */

// The piles the inventory calls for (without places): biggest tiers first,
// resources taking turns within a tier.
function yardWant(s) {
  const want = [];
  const lists = RESOURCES.map((r) => ({ res: r, tiers: pileTiers(s.inv[r]) }));
  const top = Math.max(-1, ...lists.map((l) => (l.tiers.length ? l.tiers[0] : -1)));
  for (let tier = top; tier >= 0; tier--) {
    const counts = lists.map((l) => l.tiers.filter((t) => t === tier).length);
    for (let k = 0; k < Math.max(...counts); k++) {
      lists.forEach((l, i) => { if (k < counts[i]) want.push({ res: l.res, tier, span: pileSpan(tier) }); });
    }
  }
  return want;
}

// The ground for `want` piles. Reading the ground is the slow part and
// doesn't change as amounts do, so callers can pass a `memo` object to keep
// it between calls; it is re-read when the world, its fog or buildings
// change.
function groundFor(s, want, memo) {
  const area = want.reduce((n, p) => n + p.span * p.span, 0);
  const R = Math.min(YARD_RADIUS, Math.ceil(Math.sqrt(area) * 1.5) + 6);
  const key = s.world.revealed + '|' + s.extractors.length;
  if (memo && memo.world === s.world && memo.key === key && memo.ground.R >= R) return memo.ground;
  const g = yardGround(s, Math.max(R, memo && memo.world === s.world ? memo.ground.R : 0));
  if (memo) Object.assign(memo, { world: s.world, key, ground: g });
  return g;
}

// Places piles on ground `g`, each on the first free spot in order of
// preference, around what `used` already holds. Returns the placed piles.
function place(g, want, used) {
  const { side, order } = g;
  const out = [];
  let next = 0; // single tiles only ever move further out
  for (const p of want) {
    const half = (p.span - 1) >> 1;
    for (let k = p.span === 1 ? next : 0; k < order.length; k++) {
      const gx = (order[k] % side) - half, gy = Math.floor(order[k] / side) - half;
      if (!fits(g, used, gx, gy, p.span)) continue;
      claim(g, used, gx, gy, p.span);
      out.push({ x: g.home.x - g.R + gx, y: g.home.y - g.R + gy, ...p });
      if (p.span === 1) next = k + 1;
      break;
    }
  }
  return out;
}

function claim(g, used, gx, gy, span) {
  for (let y = gy; y < gy + span; y++) used.fill(1, y * g.side + gx, y * g.side + gx + span);
}

/**
 * Every pile in the yard, tidily laid out: biggest tiers nearest home.
 * @param {object} s  game state
 * @param {object} [memo]  kept between calls to skip re-reading the ground
 * @returns {Pile[]}
 */
export function yardLayout(s, memo = null) {
  const want = yardWant(s);
  if (!want.length) return [];
  const g = groundFor(s, want, memo);
  return place(g, want, new Uint8Array(g.side * g.side));
}

/**
 * The yard after amounts change, disturbing as little as possible: piles
 * still called for stay exactly where they are, piles no longer called for
 * go (the furthest out first), and new ones take the best free spots. Over
 * time this drifts from the tidy layout; yardLayout() tidies it.
 * @param {object} s  game state
 * @param {Pile[]} current  the yard as it stands
 * @param {object} [memo]
 * @returns {Pile[]}
 */
export function yardSettle(s, current, memo = null) {
  const want = yardWant(s);
  if (!want.length) return [];
  const g = groundFor(s, want, memo);
  const used = new Uint8Array(g.side * g.side);
  const ox = g.home.x - g.R, oy = g.home.y - g.R;
  // How many of each kind of pile are still called for.
  const need = new Map();
  for (const p of want) need.set(p.res + p.tier, (need.get(p.res + p.tier) || 0) + 1);
  const ring = (p) => Math.max(Math.abs(p.x - g.home.x), Math.abs(p.y - g.home.y));
  const kept = [];
  for (const p of [...current].sort((a, b) => ring(a) - ring(b))) {
    const k = p.res + p.tier, gx = p.x - ox, gy = p.y - oy;
    if (!need.get(k) || !fits(g, used, gx, gy, p.span)) continue;
    need.set(k, need.get(k) - 1);
    claim(g, used, gx, gy, p.span);
    kept.push(p);
  }
  const missing = want.filter((p) => {
    const k = p.res + p.tier;
    if (!need.get(k)) return false;
    need.set(k, need.get(k) - 1);
    return true;
  });
  return kept.concat(place(g, missing, used));
}

// Whether a span x span square at grid (gx, gy) is free yard ground.
function fits(g, used, gx, gy, span) {
  if (gx < 0 || gy < 0 || gx + span > g.side || gy + span > g.side) return false;
  for (let y = gy; y < gy + span; y++) {
    for (let x = gx; x < gx + span; x++) if (used[y * g.side + x] || g.avoid[y * g.side + x] < 0) return false;
  }
  return true;
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
