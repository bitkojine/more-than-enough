/* What floats over a player's head: their name, the AUTO badge, and the
 * "z z" of a friend dozing off (sprites.js). Each is the same size at every
 * zoom and drawn over the night so it always reads. */

// A player's name over their head: a tag in their colour, the same size at
// every zoom, drawn over the night so it always reads. (x, y) is its centre.
// `taken`: boxes of the tags already drawn; one that would cover any of
// them isn't drawn (returns false), so a crowd's names stay readable.
export function drawNameTag(ctx, x, y, name, color, taken = null) {
  ctx.save();
  ctx.font = '800 12px system-ui, sans-serif'; // i18n-ok: a font
  const w = Math.ceil(ctx.measureText(name).width) + 14;
  if (taken) {
    const box = { l: x - w / 2 - 2, r: x + w / 2 + 2, t: y - 11, b: y + 11 };
    if (taken.some((o) => o.l < box.r && box.l < o.r && o.t < box.b && box.t < o.b)) {
      ctx.restore();
      return false;
    }
    taken.push(box);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(10,8,6,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 9, w, 18, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0c0a08';
  ctx.fillText(name, x, y + 0.5);
  ctx.restore();
  return true;
}

// AUTO's tag over your head while it plays: gold, with a star that slowly
// turns, the same size at every zoom. (x, y) is its centre.
export function drawAutoTag(ctx, x, y, label, time, taken = null) {
  ctx.save();
  ctx.font = '800 12px system-ui, sans-serif'; // i18n-ok: a font
  const w = Math.ceil(ctx.measureText(label).width) + 30;
  if (taken) taken.push({ l: x - w / 2 - 2, r: x + w / 2 + 2, t: y - 11, b: y + 11 });
  ctx.shadowColor = 'rgba(255,209,102,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#33280f';
  ctx.strokeStyle = '#ffe39a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 10, w, 20, 10);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // the star
  const sx = x - w / 2 + 11,
    r = 5.5,
    a0 = time * 1.5 - Math.PI / 2;
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = a0 + (i * Math.PI) / 5,
      rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(sx + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fbeec4';
  ctx.fillText(label, x + 8, y + 0.5);
  ctx.restore();
}

// Three letters drifting up and away from (x, y), fading in and out: a doze
// (small z's) or deep sleep (big Z's). `dir` is which way they drift.
export function drawSnore(
  ctx,
  letter,
  x,
  y,
  dir,
  u,
  time,
  { speed, size, rise, drift, weight, outline = false }
) {
  ctx.save();
  ctx.fillStyle = '#dfe9ff';
  ctx.strokeStyle = 'rgba(10,8,6,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const k = (time * speed + i / 3) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.font = `${weight} ${Math.round(u * size * (1 + k))}px system-ui, sans-serif`; // i18n-ok: a font
    const lx = x + dir * k * u * drift,
      ly = y - k * u * rise;
    if (outline) ctx.strokeText(letter, lx, ly);
    ctx.fillText(letter, lx, ly);
  }
  ctx.restore();
}
