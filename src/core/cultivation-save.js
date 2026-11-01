/* A crystal world's saved state checked (validCultivation) and mended so
 * it loads (mendCultivation), including saves from before the heart and
 * from the old rounding bug. save.js calls these; nothing here runs in play. */

import { newHeart } from './cultivation-heart.js';
import {
  CULTIVATION_MODEL,
  MACHINE_REPAIRS,
  machineSections,
  newCultivation
} from './cultivation-model.js';

const cell = (x, y, z) => `${x},${y},${z}`;
// Recover saves produced by the earlier weighted-average rounding bug, while
// keeping genuinely invalid condition values rejected by the validator.
export function recoverCultivationRounding(c) {
  // Worlds from before the heart: a machine already past its second section has it.
  if (c && typeof c === 'object' && !c.heart && Array.isArray(c.facilities))
    c.heart =
      c.completed || c.facilities.some((b) => b?.kind === 'machine' && (b.sections ?? 0) >= 2)
        ? { where: 'installed', health: 100 }
        : newHeart();
  const fix = (b) => {
    if (typeof b?.quality === 'number' && b.quality > 100 && b.quality <= 100 + 1e-9)
      b.quality = 100;
  };
  fix(c);
  if (Array.isArray(c?.facilities))
    c.facilities.forEach((b) => {
      fix(b);
      if (b && typeof b === 'object') delete b.closed;
      if (b?.kind === 'machine' && b.sections === undefined) b.sections = c.restored ? 1 : 0;
    });
}
export function validCultivation(c) {
  const number = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  const pos = (b, top = -2) =>
    !!b &&
    Number.isInteger(b.x) &&
    Number.isInteger(b.y) &&
    Math.abs(b.x) < 2 ** 20 &&
    Math.abs(b.y) < 2 ** 20 &&
    Number.isInteger(b.z) &&
    b.z >= -512 &&
    b.z <= top;
  if (
    !c ||
    c.model !== CULTIVATION_MODEL ||
    !Array.isArray(c.facilities) ||
    !c.wild ||
    Array.isArray(c.wild) ||
    typeof c.wild !== 'object' ||
    !c.gear ||
    !number(c.quality, 0, 100) ||
    !number(c.phase, 0, 0.25 - 1e-10) ||
    !Number.isSafeInteger(c.nextId) ||
    !number(c.clock, 0, Number.MAX_SAFE_INTEGER)
  )
    return false;
  if (c.starter && !number(c.starter.health, 0, 100)) return false;
  if (c.completed !== undefined && typeof c.completed !== 'boolean') return false;
  if (c.completedAt !== undefined && !number(c.completedAt, 0, Number.MAX_SAFE_INTEGER))
    return false;
  const ids = new Map(),
    cells = new Set();
  for (const b of c.facilities) {
    if (
      !b ||
      !['chamber', 'cooler', 'vault', 'conduit', 'machine', 'shelter'].includes(b.kind) ||
      !Number.isSafeInteger(b.id) ||
      b.id < 1 ||
      b.id >= c.nextId ||
      ids.has(b.id) ||
      !pos(b, b.kind === 'shelter' ? 0 : -2) ||
      !number(b.temperature, -1000, 1000) ||
      !number(b.buffer, 0, 40) ||
      !number(b.quality, 0, 100) ||
      (b.health !== undefined && !number(b.health, 0, 100))
    )
      return false;
    if (
      b.sections !== undefined &&
      (b.kind !== 'machine' ||
        !Number.isInteger(b.sections) ||
        b.sections < 0 ||
        b.sections > MACHINE_REPAIRS.length)
    )
      return false;
    const k = cell(b.x, b.y, b.z);
    if (cells.has(k)) return false;
    cells.add(k);
    ids.set(b.id, b);
  }
  for (const b of c.facilities)
    if (
      b.kind === 'conduit' &&
      (ids.get(b.from)?.kind !== 'chamber' || ids.get(b.to)?.kind !== 'vault')
    )
      return false;
  if (
    c.completed &&
    !c.facilities.some((b) => b.kind === 'machine' && machineSections(b) === MACHINE_REPAIRS.length)
  )
    return false;
  if (
    c.heart !== undefined &&
    (!c.heart ||
      !number(c.heart.health, 0, 100) ||
      !(
        ['station', 'carried', 'installed'].includes(c.heart.where) ||
        ids.get(c.heart.where)?.kind === 'shelter'
      ))
  )
    return false;
  if (c.heartLost !== undefined && !(Number.isSafeInteger(c.heartLost) && c.heartLost >= 0))
    return false;
  return Object.values(c.wild).every(
    (w) => pos(w) && number(w.health, 0, 100) && number(w.regrow, 0, 45)
  );
}
/* A saved cultivation mended so it loads: a number out of range goes back
 * inside it, a part that can't be placed (no position, an unknown kind, a
 * second one on the same cell, a conduit to nothing) is dropped, and the rest
 * of the world stays. One bad field never sets a whole save aside (nothing
 * loses player data, AGENTS.md). Null only for another model's state: a newer
 * game's save, set aside until the update arrives. */
export function mendCultivation(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return newCultivation();
  if (c.model !== CULTIVATION_MODEL) return null;
  recoverCultivationRounding(c);
  const into = (n, min, max, dflt) => (Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt);
  const obj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const pos = (b, top = -2) =>
    obj(b) &&
    Number.isInteger(b.x) &&
    Number.isInteger(b.y) &&
    Math.abs(b.x) < 2 ** 20 &&
    Math.abs(b.y) < 2 ** 20 &&
    Number.isInteger(b.z) &&
    b.z >= -512 &&
    b.z <= top;
  c.quality = into(c.quality, 0, 100, 100);
  c.phase = into(c.phase, 0, 0.25 - 1e-10, 0);
  c.clock = into(c.clock, 0, Number.MAX_SAFE_INTEGER, 0);
  if (!obj(c.gear)) c.gear = { lantern: false, carrier: false };
  if (!obj(c.wild)) c.wild = {};
  for (const [k, w] of Object.entries(c.wild)) {
    if (!pos(w)) {
      delete c.wild[k];
      continue;
    }
    w.health = into(w.health, 0, 100, 100);
    w.regrow = into(w.regrow, 0, 45, 0);
  }
  if (c.starter !== null && c.starter !== undefined)
    c.starter = obj(c.starter)
      ? ((c.starter.health = into(c.starter.health, 0, 100, 100)), c.starter)
      : null;
  if (c.completed !== undefined && typeof c.completed !== 'boolean') c.completed = !!c.completed;
  if (c.completedAt !== undefined && !Number.isFinite(c.completedAt)) delete c.completedAt;
  else if (c.completedAt !== undefined)
    c.completedAt = into(c.completedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const kinds = ['chamber', 'cooler', 'vault', 'conduit', 'machine', 'shelter'],
    cells = new Set(),
    ids = new Map(),
    renumber = [];
  c.facilities = (Array.isArray(c.facilities) ? c.facilities : []).filter((b) => {
    if (!obj(b) || !kinds.includes(b.kind) || !pos(b, b.kind === 'shelter' ? 0 : -2)) return false;
    const k = cell(b.x, b.y, b.z);
    if (cells.has(k)) return false;
    cells.add(k);
    b.temperature = into(b.temperature, -1000, 1000, 22);
    b.buffer = into(b.buffer, 0, 40, 0);
    b.quality = into(b.quality, 0, 100, 100);
    if (b.health !== undefined) b.health = into(b.health, 0, 100, 0);
    if (b.kind === 'machine')
      b.sections = Math.floor(into(b.sections, 0, MACHINE_REPAIRS.length, 0));
    else delete b.sections;
    if (Number.isSafeInteger(b.id) && b.id >= 1 && !ids.has(b.id)) ids.set(b.id, b);
    else renumber.push(b);
    return true;
  });
  c.nextId = Math.max(
    Number.isSafeInteger(c.nextId) ? c.nextId : 1,
    ...[...ids.keys()].map((id) => id + 1)
  );
  for (const b of renumber) {
    b.id = c.nextId++;
    ids.set(b.id, b);
  }
  c.facilities = c.facilities.filter(
    (b) =>
      b.kind !== 'conduit' ||
      (ids.get(b.from)?.kind === 'chamber' && ids.get(b.to)?.kind === 'vault')
  );
  // A world saved as won keeps its win: the machine it was won with is whole.
  if (c.completed) {
    const m = c.facilities.find((b) => b.kind === 'machine');
    if (m) m.sections = MACHINE_REPAIRS.length;
    else {
      c.completed = false;
      delete c.completedAt;
    }
  }
  if (c.heart !== undefined) {
    const h = c.heart,
      placed =
        obj(h) &&
        (['station', 'carried', 'installed'].includes(h.where) ||
          ids.get(h.where)?.kind === 'shelter');
    // A heart with nowhere it can be is where the machine says: in it, or still at the hiding place.
    c.heart = placed
      ? ((h.health = into(h.health, 0, 100, 100)), h)
      : {
          where: c.facilities.some((b) => b.kind === 'machine' && b.sections >= 2)
            ? 'installed'
            : 'station',
          health: into(h?.health, 0, 100, 100)
        };
  }
  if (c.heartLost !== undefined)
    c.heartLost = Math.floor(into(c.heartLost, 0, Number.MAX_SAFE_INTEGER, 0));
  return c;
}
