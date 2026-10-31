/* A QR code on a canvas: your sign's invite link (together.js) and the link
 * that brings your world to another device (devices.js). */

import { qrcode } from '../vendor/qrcode.js';

// A canvas of a QR code for `text`: one pixel per module times SCALE, with
// the quiet margin scanners need, black on white.
const QR_SCALE = 8,
  QR_QUIET = 4;
export function qrCanvas(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (n + QR_QUIET * 2) * QR_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c))
        ctx.fillRect((c + QR_QUIET) * QR_SCALE, (r + QR_QUIET) * QR_SCALE, QR_SCALE, QR_SCALE);
  }
  return canvas;
}
