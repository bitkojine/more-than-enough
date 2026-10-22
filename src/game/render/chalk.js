/* Quiet white-chalk planning marks. Geometry stays in the renderer; no game
 * state, animation, randomness, image downloads or per-pixel texture passes. */

const WHITE = '#f5f2e9';

// Dark backing keeps chalk legible on pale ground/clouds. The fine offset
// stroke gives a dry edge without shimmer; dash patterns distinguish states.
export function chalkPath(ctx, path, { preview = false, width = 1.7 } = {}) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(preview ? [4, 7] : [19, 1.5, 8, 1]);
  ctx.strokeStyle = 'rgba(18,26,22,0.65)';
  ctx.lineWidth = width + 2.2;
  ctx.stroke(path);
  ctx.strokeStyle = WHITE;
  ctx.globalAlpha *= 0.88;
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.translate(0.55, -0.35);
  ctx.strokeStyle = 'rgba(255,255,247,0.35)';
  ctx.lineWidth = Math.max(0.5, width * 0.38);
  ctx.stroke(path);
  ctx.restore();
}

export function chalkLine(ctx, a, b, preview = false) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  const bend = Math.min(0.8, distance * 0.02), nx = -dy / distance, ny = dx / distance;
  const path = new Path2D();
  path.moveTo(a.x, a.y);
  path.quadraticCurveTo((a.x+b.x)/2 + nx*bend, (a.y+b.y)/2 + ny*bend, b.x, b.y);
  chalkPath(ctx, path, { preview });
}

export function chalkBox(ctx, rect, preview = false) {
  const { x, y, w, h } = rect;
  if (w <= 0 || h <= 0) return;
  const dry = Math.min(0.7, w*0.04, h*0.04);
  const path = new Path2D();
  path.moveTo(x+dry, y+dry);
  path.lineTo(x+w-dry, y);
  path.lineTo(x+w, y+h-dry);
  path.lineTo(x, y+h);
  path.closePath();
  chalkPath(ctx, path, { preview });
}

// One cached local ring, translated when drawn. Depots share a radius at a
// given zoom, so moving the camera does not rebuild a sampled ellipse.
let ring = null;
export function chalkEllipse(ctx, x, y, rx, ry, preview = false) {
  if (!(rx > 0 && ry > 0)) return;
  if (!ring || ring.rx !== rx || ring.ry !== ry) {
    const path = new Path2D();
    for (let i=0; i<96; i++) {
      const angle=i*Math.PI*2/96;
      const grain=Math.sin(i*2.43)*0.45 + Math.sin(i*5.37)*0.2;
      const px=Math.cos(angle)*(rx+grain), py=Math.sin(angle)*(ry+grain);
      if (i===0) path.moveTo(px,py); else path.lineTo(px,py);
    }
    path.closePath();
    ring={rx,ry,path};
  }
  ctx.save();
  ctx.translate(x,y);
  chalkPath(ctx,ring.path,{preview});
  ctx.restore();
}
