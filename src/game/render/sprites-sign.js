/* The invite sign a player holds up in a shared world (sprites.js draws
 * the players; renderer.js the sign): a board in both hands carrying the
 * invite's QR code, and how big it is on screen. */

const TAU = Math.PI * 2;
export const HANDS = 0.55; // how far up a figure their hands are, of its height
const SIGN_COLOR = '#3f9bd6'; // the invite's friendly sky blue (style.css #btnInvite)
const ease = (t) => 1 - (1 - t) ** 3 + Math.sin(t * Math.PI) * 0.15; // up with a little bounce

// The sign you hold up to invite a friend: a board held in both hands in
// front of you (hands at `hands` px down the screen), `side` px across.
// Yours carries the real QR code (`face`, a canvas of its modules), big
// enough for a friend's camera to scan; a friend's shows a small QR-like
// pattern (`face` a number to vary it). `caption` is written along the
// board's bottom edge. `t` 0..1 raises it from your hands' height.
export function drawSign(ctx, x, hands, u, t, time, face, side = u * 0.62, caption = '') {
  const lift = ease(t);
  const rim = Math.max(u * 0.06, side * 0.05);
  const foot = caption ? Math.round(side * 0.13) : 0; // room for the caption
  const bottom = hands + rim * 0.5 + (1 - lift) * side * 0.3 + Math.sin(time * 3) * u * 0.02;
  const left = x - side / 2,
    upper = bottom - rim - foot - side;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, t * 2);
  ctx.fillStyle = SIGN_COLOR;
  ctx.beginPath();
  ctx.roundRect(left - rim, upper - rim, side + rim * 2, side + rim * 2 + foot, rim * 2);
  ctx.fill();
  if (caption) {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(foot * 0.62)}px system-ui, sans-serif`; // i18n-ok: a font
    ctx.fillText(caption, x, upper + side + rim * 0.4 + foot / 2, side);
  }
  // Both hands gripping its bottom edge.
  const hr = Math.max(3, u * 0.08),
    hx = Math.min(side * 0.3, u * 0.24);
  ctx.fillStyle = '#f2c9a0';
  ctx.strokeStyle = 'rgba(40,24,14,0.85)';
  ctx.lineWidth = Math.max(1.5, u * 0.03);
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + d * hx, bottom - rim * 0.2, hr, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(left, upper, side, side);
  if (typeof face === 'object' && face) {
    // The real code, square pixels and no blur, so cameras read it.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(face, left, upper, side, side);
  } else {
    // A QR-ish pattern: three finder squares and some dots.
    const seed = face || 0,
      cell = side / 9;
    ctx.fillStyle = '#111';
    const finder = (cx, cy) => {
      ctx.fillRect(left + cx * cell, upper + cy * cell, cell * 3, cell * 3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(left + (cx + 1) * cell, upper + (cy + 1) * cell, cell, cell);
      ctx.fillStyle = '#111';
    };
    finder(0.5, 0.5);
    finder(5.5, 0.5);
    finder(0.5, 5.5);
    for (let i = 0; i < 12; i++) {
      const cx = 4 + ((i * 7 + seed) % 5),
        cy = 4 + ((i * 3 + seed * 5) % 5);
      if ((i + seed) % 3)
        ctx.fillRect(left + cx * cell - cell / 2, upper + cy * cell - cell / 2, cell, cell);
    }
  }
  ctx.restore();
  // Where it stands on screen, to catch taps on it.
  return { x: left - rim, y: upper - rim, w: side + rim * 2, h: side + rim * 2 + foot };
}

// How big your own sign is on screen: as big as fits above you, so a friend's
// phone can scan it from a step away.
export function signSide(cam) {
  return Math.round(Math.min(cam.width * 0.62, cam.height * 0.36, 340));
}
