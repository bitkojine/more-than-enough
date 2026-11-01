/* New machinery uses the existing pack and projection, with physical
 * cooling fans and condition marks added to the familiar buildings. */
import * as Core from '../../core/index.js';
import { litInk } from './lighting.js';
import { cargoClock, facilityClock } from '../cargo-clock.js';
export function cultivationRows(s, z) {
  const rows = new Map(),
    put = (b) => {
      if (!rows.has(b.y)) rows.set(b.y, []);
      rows.get(b.y).push(b);
    };
  for (const b of s.cultivation?.facilities || [])
    if (b.z === z && Core.isExplored(s.world, b.x, b.y, z)) put(b);
  // The hiding place is drawn like a building, though nobody built it.
  if (s.cultivation && z === 0) {
    const h = Core.hidingPlace(s.world.seed);
    if (Core.isExplored(s.world, h.x, h.y, 0)) put({ kind: 'station', x: h.x, y: h.y, z: 0 });
  }
  return rows;
}
// Which look a crystal building wears: the machine by its sections, the
// hiding place and a shelter lit while the heart is there, the rest by
// whether they hold anything alive.
function facilityPhase(s, b) {
  const heart = s.cultivation.heart?.where;
  if (b.kind === 'machine') return s.cultivation.completed ? 4 : Core.machineSections(b);
  if (b.kind === 'station') return heart === 'station' ? 1 : 0;
  if (b.kind === 'shelter') return heart === b.id ? 1 : 0;
  if (b.kind === 'chamber') return b.health > 0 ? 1 : 0;
  return b.buffer > 0 ? 1 : 0;
}
// Draws a crystal building; returns where a clock over it goes, or nothing
// when it is off screen.
export function drawCultivation(ctx, cam, s, look, b) {
  const u = cam.tilePx,
    p = cam.project(b.x + 0.5, b.y + 0.65, b.z);
  if (p.x < -u * 2 || p.x > cam.width + u * 2 || p.y < -u || p.y > cam.height + u * 3) return;
  const id = Core.CULTIVATION_LOOK[b.kind];
  const phase = facilityPhase(s, b);
  const pic = look.level(id, phase),
    h = look.stand(ctx, pic, p.x, p.y, u);
  ctx.save();
  ctx.strokeStyle = litInk(ctx, '#eee9dc');
  ctx.lineWidth = Math.max(1, u * 0.025);
  if (b.kind === 'chamber' && b.health !== undefined && b.health < 60) {
    ctx.strokeStyle = litInk(ctx, '#ffc09c');
    const x = p.x - u * 0.18,
      y = p.y - h * 0.45;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + u * 0.1, y + u * 0.12);
    ctx.lineTo(x - u * 0.03, y + u * 0.22);
    ctx.stroke();
  }
  if (b.reinforced) {
    ctx.strokeRect(p.x - u * 0.3, p.y - h * 0.2, u * 0.6, u * 0.12);
  }
  const danger = b.temperature > 22 || b.needsTend || b.health === 0;
  if (danger) {
    ctx.fillStyle = '#ffc09c';
    ctx.beginPath();
    ctx.moveTo(p.x + u * 0.3, p.y - h - u * 0.15);
    ctx.lineTo(p.x + u * 0.42, p.y - h + u * 0.08);
    ctx.lineTo(p.x + u * 0.18, p.y - h + u * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return { x: p.x, y: p.y - h - u * 0.3 };
}
// A chamber's colony dying in the heat, or the heart mending in its
// shelter, at `top` (from drawCultivation); null when no clock runs.
export function facilityClockAt(s, b, top) {
  if (!top || (b.kind !== 'chamber' && b.kind !== 'shelter')) return null;
  const clock = memo(s, b, 'facility', () => facilityClock(s, b));
  return clock && { ...clock, ...top };
}
// Over Mica, what the carried crystal or heart is running out of time for,
// or how sound it is: a clock, never a bar (Watch, 2026-11-01: "timers that
// tick down"; 2026-10-25: this is where what you carry shows its health).
// `named`: your name tag is shown there, so the clock sits above it.
export function cargoClockAt(s, at, cam, named) {
  if (!s.cultivation) return null;
  const clock = memo(s, s.cultivation, 'cargo', () => cargoClock(s));
  const y = at.top - cam.tilePx * (named ? 0.2 : 0.12) - (named ? 22 : 11);
  return clock && { ...clock, x: at.x, y };
}
// The rules step four times a second, so a clock changes no faster; each
// object keeps its last reading till the crystal clock or Mica's tile moves.
const readings = new WeakMap();
function memo(s, owner, kind, read) {
  const p = s.player,
    key = `${kind}|${s.cultivation.clock}|${Math.floor(p.x)},${Math.floor(p.y)},${p.z}|${s.inv.crystal}`;
  const last = readings.get(owner);
  if (last?.key === key) return last.value;
  const value = read();
  readings.set(owner, { key, value });
  return value;
}
const TONE = { calm: '#7fd07a', warn: '#f0b552', danger: '#ff8a72' };
// A clock tag, the same size at every zoom; danger is a filled red tag.
// `taken`: boxes of the tags already drawn; one that would cover any of
// them waits (as name tags do), so yours, drawn first, always shows.
export function drawClock(ctx, { x, y, text, tone }, taken = []) {
  ctx.save();
  ctx.font = '800 12px system-ui, sans-serif'; // i18n-ok: a font
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.ceil(ctx.measureText(text).width) + 14,
    box = { l: x - w / 2 - 2, r: x + w / 2 + 2, t: y - 11, b: y + 11 };
  if (taken.some((o) => o.l < box.r && box.l < o.r && o.t < box.b && box.t < o.b)) {
    ctx.restore();
    return;
  }
  taken.push(box);
  ctx.fillStyle = tone === 'danger' ? TONE.danger : 'rgba(12,18,20,.85)';
  ctx.strokeStyle = tone === 'danger' ? 'rgba(10,8,6,0.85)' : TONE[tone];
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 9, w, 18, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tone === 'danger' ? '#1a0a06' : TONE[tone];
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}
