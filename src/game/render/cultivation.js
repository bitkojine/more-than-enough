/* New machinery uses the existing pack and projection, with physical
 * cooling fans and condition marks added to the familiar buildings. */
import * as Core from '../../core/index.js';
import { litInk } from './lighting.js';
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
export function drawCultivation(ctx, cam, s, look, b) {
  const u = cam.tilePx,
    p = cam.project(b.x + 0.5, b.y + 0.65, b.z);
  if (p.x < -u * 2 || p.x > cam.width + u * 2 || p.y < -u || p.y > cam.height + u * 3) return;
  const id = Core.CULTIVATION_LOOK[b.kind];
  const heart = s.cultivation.heart?.where;
  const phase =
    b.kind === 'machine'
      ? s.cultivation.completed
        ? 4
        : Core.machineSections(b)
      : b.kind === 'station'
        ? heart === 'station'
          ? 1
          : 0
        : b.kind === 'shelter'
          ? heart === b.id
            ? 1
            : 0
          : b.kind === 'chamber'
            ? b.health > 0
              ? 1
              : 0
            : b.buffer > 0
              ? 1
              : 0;
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
}
// Condition feedback follows the same posed head anchor as the figure.
// The capsule/crystal itself is painted into the selected carrying pose.
export function drawCrystalCargo(ctx, cam, s, look, character) {
  const c = s.cultivation,
    heart = c?.heart?.where === 'carried';
  if (!c || !character || (!heart && !c.starter && s.inv.crystal <= 0)) return;
  // Big enough to read at any zoom, coloured by how sound it is (Watch,
  // 2026-10-25: this bar is where what you carry shows its health).
  const quality = heart ? c.heart.health : (c.starter?.health ?? c.quality),
    u = cam.tilePx;
  const w = Math.max(36, u * 0.5),
    h = Math.max(6, u * 0.08),
    x = character.x - w / 2,
    y = character.top - u * 0.12 - h;
  ctx.fillStyle = 'rgba(12,18,20,.85)';
  ctx.beginPath();
  ctx.roundRect(x - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
  ctx.fill();
  ctx.fillStyle = quality < 35 ? '#ff8a72' : quality < 65 ? '#f0b552' : '#7fd07a';
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(h, (w * Math.max(0, Math.min(100, quality))) / 100), h, h / 2);
  ctx.fill();
}
