import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera } from '../../src/game/camera.js';
import { bankCopy, bankLayers, BANK_MAX } from '../../src/game/render/fog.js';

// iOS Safari gives no canvas more than this many pixels; createPattern on
// one past it throws InvalidStateError (v0.151.0 crashed zoomed in on Mica).
const IOS_CANVAS_PIXELS = 4096 * 4096;

test('the cloud bank kept at the size it shows at, while that is small', () => {
  assert.deepEqual(bankCopy(320, 312), { w: 320, h: 312, sx: 1, sy: 1 });
  assert.deepEqual(bankCopy(0.2, 0), { w: 1, h: 1, sx: 0.2, sy: 0 });
});

test('zoomed all the way in on a big phone, the cloud bank fits any canvas', () => {
  for (const [width, height, dpr] of [[428, 830, 3], [430, 932, 3], [1024, 1366, 2], [2560, 1440, 2]]) {
    const cam = createCamera({ getContext: () => ({}) });
    // As camera.resize() sizes things for this screen.
    Object.assign(cam, { width, height, baseTilePx: Math.max(34, Math.min(64, Math.min(width / 7.2, height / 11))) });
    cam.setZoom(1000); // clamped to the closest zoom there is
    const shown = [9 * cam.tilePx * dpr, 9 * cam.depthPx * dpr];
    const copy = bankCopy(...shown);
    assert.ok(copy.w <= BANK_MAX && copy.h <= BANK_MAX, `${width}x${height}: ${copy.w}x${copy.h}`);
    assert.ok(copy.w * copy.h <= IOS_CANVAS_PIXELS);
    // Stretched back, it still covers what it shows: the clouds look the same.
    assert.ok(Math.abs(copy.w * copy.sx - shown[0]) < 1e-6 && Math.abs(copy.h * copy.sy - shown[1]) < 1e-6);
    assert.ok(shown[0] * shown[1] > IOS_CANVAS_PIXELS || width > 1000, 'the case that crashed is covered');
  }
});

// v0.152: the bank was sized to the screen, so far out every redraw of the
// far map (each time the zoom crossed a step) laid different clouds: they
// flickered, and looked the same at any zoom.
test('the cloud bank is fixed to the land: its pictures are whole steps of tiles', () => {
  for (let u = 80; u > 0.5; u *= 0.93) {
    for (const l of bankLayers(u)) {
      assert.equal(l.span, 9 * 4 ** l.k, `tile ${u}px`);
      assert.ok(l.alpha > 0 && l.alpha <= 1);
    }
  }
});

test('close up the bank is one nine-tile picture, as before', () => {
  for (const u of [36, 48, 54, 200]) assert.deepEqual(bankLayers(u), [{ k: 0, span: 9, alpha: 1 }]);
});

test('zooming out fades the bigger pictures in without a jump', () => {
  // What shows: the biggest opaque picture, and how far the next is in.
  const shows = (u) => {
    const l = bankLayers(u);
    return l.length === 1 ? l[0].k : l[0].k + l[1].alpha;
  };
  let last = shows(60);
  for (let u = 60; u > 0.5; u *= 0.99) {
    const now = shows(u);
    assert.ok(now >= last - 1e-9 && now - last < 0.02, `tile ${u}px: ${last} -> ${now}`);
    last = now;
  }
  assert.ok(last > 2, 'far out, wider clouds than up close');
});
