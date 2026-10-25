import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera } from '../../src/game/camera.js';
import { bankCopy, BANK_MAX } from '../../src/game/render/fog.js';

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
