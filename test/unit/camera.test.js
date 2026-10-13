import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, MIN_TILT } from '../../src/game/camera.js';
import { DEFAULT_TILE } from '../../src/core/catalog.js';

// A camera on a 400x400 screen with 40px tiles, looking at (0, 0) on layer z.
function camera(tilt, relief = () => 0, z = 0) {
  const cam = createCamera({ getContext: () => ({}) });
  Object.assign(cam, { width: 400, height: 400, baseTilePx: 40 });
  cam.setZoom(1);
  cam.setTilt(tilt, true);
  cam.follow({ x: 0, y: 0, z });
  cam.relief = relief;
  return cam;
}

const tileUnder = (cam, x, y, h) => {
  const p = cam.project(x, y, h);
  const w = cam.unproject(p.x, p.y);
  return [Math.floor(w.x), Math.floor(w.y)];
};

test('at its flattest the view still leans, and project/unproject are inverses on the floor', () => {
  const cam = camera(0);
  assert.equal(cam.tilt, MIN_TILT, 'never quite straight down');
  assert.ok(cam.risePx > 0, 'so height always shows a little');
  for (const [x, y] of [[0, 0], [2.25, -3.5], [-4.9, 4.1]]) {
    const p = cam.project(x, y);
    const w = cam.unproject(p.x, p.y);
    assert.ok(Math.abs(w.x - x) < 1e-9 && Math.abs(w.y - y) < 1e-9);
  }
});

test('tilting foreshortens rows and lifts height', () => {
  const cam = camera(1);
  assert.ok(cam.depthPx < cam.tilePx * 0.7, 'rows are shallower than tiles are wide');
  assert.ok(cam.risePx > 0);
  const floor = cam.project(1, 1, 0), raised = cam.project(1, 1, 1);
  assert.equal(raised.x, floor.x, 'height never moves things sideways');
  assert.ok(Math.abs(floor.y - raised.y - cam.risePx) < 1e-9, 'a layer of height lifts by risePx');
  // Layers are absolute heights: the camera's own layer floor sits where z = 0 would flat.
  const deep = camera(1, () => 0, -3);
  assert.deepEqual(deep.project(0, 0, -3), { x: 200, y: 200 });
});

test('tilted picking hits the top or south face you can see', () => {
  // One wall (height 1) at (0, 0); everything else is floor.
  const cam = camera(1, (x, y) => (x === 0 && y === 0 ? 1 : 0));
  assert.deepEqual(tileUnder(cam, 0.5, 0.5, 1), [0, 0], 'the wall top picks the wall');
  assert.deepEqual(tileUnder(cam, 0.5, 0.5, 0), [0, 0], 'the floor point behind its face lands on the face');
  // The wall top hides the floor up to risePx/depthPx rows behind it; just
  // past that, the floor peeks out again.
  const behind = -cam.risePx / cam.depthPx - 0.2;
  assert.deepEqual(tileUnder(cam, 0.5, behind, 0), [0, Math.floor(behind)], 'floor peeking out behind the wall top picks that floor');
  assert.deepEqual(tileUnder(cam, 0.5, 1.5, 0), [0, 1], 'floor in front of the wall picks that floor');
  assert.deepEqual(tileUnder(cam, 1.5, 0.5, 0), [1, 0], 'floor beside the wall picks that floor');
  const face = cam.unproject(cam.project(0.5, 1, 0.5).x, cam.project(0.5, 1, 0.5).y);
  assert.deepEqual([Math.floor(face.x), Math.floor(face.y), face.h], [0, 0, 1], 'the south face picks the wall');
});

test('the visible range covers tall tops in front and low ones behind', () => {
  const flat = camera(0).visibleTiles(), tilted = camera(1).visibleTiles();
  assert.ok(tilted.y1 - tilted.y0 > flat.y1 - flat.y0, 'tilting shows more rows');
  assert.equal(tilted.x1 - tilted.x0, flat.x1 - flat.x0, 'but the same columns');
});

test('tilt eases toward its target and is clamped', () => {
  const cam = camera(0);
  cam.setTilt(5);
  assert.equal(cam.tiltTarget, 1);
  cam.tick(0.05);
  assert.ok(cam.tilt > 0 && cam.tilt < 1, 'part of the way there after one frame');
  for (let i = 0; i < 200; i++) cam.tick(0.016);
  assert.equal(cam.tilt, 1);
  cam.setTilt(-1, true);
  assert.equal(cam.tilt, MIN_TILT);
});

test('a layer stands taller than the wanderer, so tunnels and cliffs read to scale', async () => {
  const { readFileSync } = await import('node:fs');
  const svg = readFileSync(new URL('../../packs/default/characters/wanderer.svg', import.meta.url), 'utf8');
  const tall = Number(svg.match(/height="([\d.]+)"/)[1]) / DEFAULT_TILE; // in tiles, as drawn
  const cam = camera(1);
  assert.ok(cam.risePx / cam.tilePx > tall * 1.15, `a layer (${(cam.risePx / cam.tilePx).toFixed(2)} tiles) fits the wanderer (${tall.toFixed(2)}) with headroom`);
});
