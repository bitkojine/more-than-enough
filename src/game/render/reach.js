/* Placing and reach, drawn over the world (Watch, 2026-10-26). While you
 * place or move a building, the tiles it fits on are softly lit and the
 * building stands on its tile as a ghost. For the one building in focus
 * (placed, moved or whose card is open) a pale area shows how far it reaches,
 * with one thin solid edge, and each building it helps wears a small round
 * badge: ×2 for a Stoneworks, a crate for a depot, a snowflake for a cooling
 * tower, a link for a conduit. No lines between buildings, no dashed boxes,
 * no white chalk (docs/ui.md, Planning marks). */
import * as Core from '../../core/index.js';
import { reachOf } from '../reach.js';

const TAU = Math.PI * 2;
const FIT_FILL = 'rgba(140,220,255,0.16)';
const AREA_FILL = 'rgba(140,220,255,0.13)';
const AREA_EDGE = 'rgba(160,226,255,0.85)';
const GHOST_ALPHA = 0.72;
const BADGE_BACK = '#1b2a22';
const BADGE_RING = '#8fe36b';
const BADGE_INK = '#c9f7ad';

// A tile's top on screen, as a rounded rectangle path.
function tileTop(ctx, cam, s, x, y, inset) {
  const top = cam.z + Core.tileHeight(s.world, x, y, cam.z);
  const a = cam.project(x, y, top), b = cam.project(x + 1, y + 1, top);
  const w = b.x - a.x - inset * 2, h = b.y - a.y - inset * 2;
  if (w <= 0 || h <= 0) return false;
  const r = Math.min(7, h / 3);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(a.x + inset, a.y + inset, w, h, r) : ctx.rect(a.x + inset, a.y + inset, w, h);
  return true;
}

// The tiles in row y the building being placed fits on, softly lit (drawn
// with that row, so whatever stands in front still covers them).
export function drawFits(ctx, cam, s, view, y) {
  const p = view.placing;
  if (!p) return;
  const row = p.rows.get(y);
  if (!row) return;
  ctx.fillStyle = FIT_FILL;
  for (const x of row) if (tileTop(ctx, cam, s, x, y, 2)) ctx.fill();
}

// Under the ghost: a soft green pool, so its tile reads as chosen.
export function drawGhostSpot(ctx, cam, at) {
  const c = cam.project(at.x + 0.5, at.y + 0.5, cam.z);
  const rx = cam.tilePx * 0.62, ry = cam.depthPx * 0.62;
  const g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, rx);
  g.addColorStop(0, 'rgba(160,240,120,0.55)');
  g.addColorStop(1, 'rgba(160,240,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, TAU); ctx.fill();
}

export const ghostAlpha = GHOST_ALPHA;

// How far the building in focus reaches, and a badge on each it helps.
export function drawReach(ctx, cam, s, view) {
  const f = view.focus;
  if (!f || f.z !== cam.z) return;
  const reach = reachOf(s, f);
  if (!reach) return;
  const c = cam.project(f.x + 0.5, f.y + 0.5, cam.z), k = reach.r + 0.5;
  ctx.save();
  ctx.beginPath();
  if (reach.shape === 'circle') ctx.ellipse(c.x, c.y, k * cam.tilePx, k * cam.depthPx, 0, 0, TAU);
  else {
    const n = cam.project(f.x + 0.5, f.y + 0.5 - k, cam.z), e = cam.project(f.x + 0.5 + k, f.y + 0.5, cam.z);
    const so = cam.project(f.x + 0.5, f.y + 0.5 + k, cam.z), w = cam.project(f.x + 0.5 - k, f.y + 0.5, cam.z);
    ctx.moveTo(n.x, n.y); ctx.lineTo(e.x, e.y); ctx.lineTo(so.x, so.y); ctx.lineTo(w.x, w.y); ctx.closePath();
  }
  ctx.fillStyle = AREA_FILL; ctx.fill();
  ctx.strokeStyle = AREA_EDGE; ctx.lineWidth = 1.5; ctx.stroke();
  for (const t of reach.targets) badge(ctx, cam, t, reach.badge);
  ctx.restore();
}

// A small round badge over a building's top right, its picture drawn in.
function badge(ctx, cam, t, kind) {
  const top = cam.project(t.x + 0.5, t.y, cam.z);
  const r = Math.max(9, Math.min(15, cam.tilePx * 0.16));
  const x = top.x + cam.tilePx * 0.3, y = top.y + cam.depthPx * 0.1;
  ctx.fillStyle = BADGE_BACK; ctx.strokeStyle = BADGE_RING; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = BADGE_INK; ctx.strokeStyle = BADGE_INK;
  const u = r * 0.5;
  if (kind === 'double') {
    ctx.font = `800 ${Math.round(r * 0.95)}px system-ui, sans-serif`; // i18n-ok: a font
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('×2', x, y + 1); // i18n-ok: a number, the same in every language
  } else if (kind === 'collect') {
    // A crate with an arrow into it.
    ctx.fillRect(x - u, y - u * 0.1, u * 2, u * 1.1);
    ctx.beginPath(); ctx.moveTo(x - u * 0.55, y - u * 0.75); ctx.lineTo(x + u * 0.55, y - u * 0.75); ctx.lineTo(x, y - u * 0.15); ctx.closePath(); ctx.fill();
  } else if (kind === 'cool') {
    ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * u * 1.1, y - Math.sin(a) * u * 1.1); ctx.lineTo(x + Math.cos(a) * u * 1.1, y + Math.sin(a) * u * 1.1); ctx.stroke();
    }
  } else {
    // Two links of a chain.
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.beginPath(); ctx.ellipse(x - u * 0.45, y, u * 0.65, u * 0.4, -0.6, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + u * 0.45, y, u * 0.65, u * 0.4, -0.6, 0, TAU); ctx.stroke();
  }
}
