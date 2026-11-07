/* Where each player's machine stands in a crystal shared world (Watch,
 * 2026-11-05: "side by side"): in a row in the deep under spawn, one place
 * a seat. A player's seat is their colour number in the room (`c`, given
 * once, never reused), so it is the same in every game and in the room.
 *
 * The deep is solid rock until someone digs it, and the machine lies buried
 * in it: you dig its tile out and there it is. The row is worked out from
 * the land as generated, never from what anyone dug since, so a seat's
 * place never moves: it starts under spawn and runs east and west from
 * there, a machine every SEAT_GAP tiles, each in the plain diggable rock
 * nearest that column (never bedrock, a shaft, a find or a way up). */

import { T, TILE_INFO } from './tiles.js';
import { baseTile, findSpawn, nearestTile } from './world.js';

export const SEAT_LAYER = -2;
export const SEAT_GAP = 3; // tiles between two machines in the row
const ROW_SEARCH = 40; // tiles from under spawn the row's start is looked for in
const COLUMN = 4; // tiles up or down a column a seat's open ground is looked for in
const COLUMNS = 400; // columns tried, both ways, before the row gives up

const rows = new WeakMap(); // world -> {start, spots, next}

// Plain rock that digs out to a tunnel.
const buried = (w, x, y) => {
  const info = TILE_INFO[baseTile(w, x, y, SEAT_LAYER)];
  return !!info.solid && !!info.harvest && !info.find && info.cleared === T.TUNNEL;
};

function rowOf(w) {
  let r = rows.get(w);
  if (r) return r;
  const home = findSpawn(w);
  const start =
    nearestTile(home.x + 0.5, home.y + 0.5, ROW_SEARCH, (x, y) => buried(w, x, y)) || home;
  r = { start, spots: [], next: 0 };
  rows.set(w, r);
  return r;
}

/** @returns {{x: number, y: number, z: number} | null} where seat `seat`'s machine stands */
export function machineSeat(w, seat) {
  if (!Number.isSafeInteger(seat) || seat < 0 || seat > 1000) return null;
  const r = rowOf(w);
  while (r.spots.length <= seat && r.next < COLUMNS * 2) {
    // Columns 0, +1, -1, +2, -2... in steps of SEAT_GAP from the start.
    const n = r.next++;
    const dx = (n % 2 ? 1 : -1) * Math.ceil(n / 2) * SEAT_GAP;
    const x = r.start.x + dx;
    for (let d = 0; d <= COLUMN; d++) {
      const y = [r.start.y + d, r.start.y - d].find((y) => buried(w, x, y));
      if (y !== undefined) {
        r.spots.push({ x, y, z: SEAT_LAYER });
        break;
      }
    }
  }
  return r.spots[seat] ?? null;
}

/** @returns {boolean} whether tile (x, y, z) is one of the first `seats` machines' places */
export function seatAt(w, x, y, z, seats = 100) {
  if (z !== SEAT_LAYER) return false;
  for (let i = 0; i < seats; i++) {
    const p = machineSeat(w, i);
    if (!p) return false;
    if (p.x === x && p.y === y) return true;
  }
  return false;
}
