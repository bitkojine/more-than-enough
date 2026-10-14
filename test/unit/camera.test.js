import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, LAYER_HEIGHT } from '../../src/game/camera.js';
import { DEFAULT_TILE } from '../../src/core/catalog.js';

// A camera on a 400x400 screen with 40px tiles, looking at (0, 0) on layer z.
function camera(relief = () => 0, z = 0) {
  const cam = createCamera({ getContext: () => ({}) });
  Object.assign(cam, { width: 400, height: 400, baseTilePx: 40 });
  cam.setZoom(1);
  cam.follow({ x: 0, y: 0, z });
  cam.relief = relief;
  return cam;
}

const tileUnder = (cam, x, y, h) => {
  const p = cam.project(x, y, h);
  const w = cam.unproject(p.x, p.y);
  return [Math.floor(w.x), Math.floor(w.y)];
};

test('the view leans slightly, and project/unproject are inverses on the floor', () => {
  const cam = camera();
  assert.ok(cam.pitch() > 0 && cam.pitch() < 0.4, 'never quite straight down, never steep');
  assert.ok(cam.depthPx < cam.tilePx, 'rows are a little shallower than tiles are wide');
  assert.ok(cam.risePx > 0, 'so height always shows');
  for (const [x, y] of [[0, 0], [2.25, -3.5], [-4.9, 4.1]]) {
    const p = cam.project(x, y);
    const w = cam.unproject(p.x, p.y);
    assert.ok(Math.abs(w.x - x) < 1e-9 && Math.abs(w.y - y) < 1e-9);
  }
});

test('height lifts things straight up', () => {
  const cam = camera();
  const floor = cam.project(1, 1, 0), raised = cam.project(1, 1, 1);
  assert.equal(raised.x, floor.x, 'height never moves things sideways');
  assert.ok(Math.abs(floor.y - raised.y - cam.risePx) < 1e-9, 'a layer of height lifts by risePx');
  // Layers are absolute heights: the camera's own layer floor sits where z = 0 would flat.
  const deep = camera(() => 0, -3);
  assert.deepEqual(deep.project(0, 0, -3), { x: 200, y: 200 });
});

test('picking hits the top or south face you can see', () => {
  // One wall (height 1) at (0, 0); everything else is floor.
  const cam = camera((x, y) => (x === 0 && y === 0 ? 1 : 0));
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
  const v = camera().visibleTiles();
  const rows = 400 / camera().depthPx, cols = 400 / 40;
  assert.ok(v.y1 - v.y0 > rows, 'more rows than fit flat, for raised tops');
  assert.ok(v.x1 - v.x0 >= cols && v.x1 - v.x0 <= cols + 3, 'and just the columns on screen');
});

test('a layer stands taller than the wanderer, so tunnels and cliffs read to scale', async () => {
  const { readFileSync } = await import('node:fs');
  const svg = readFileSync(new URL('../../packs/default/characters/wanderer.svg', import.meta.url), 'utf8');
  const tall = Number(svg.match(/height="([\d.]+)"/)[1]) / DEFAULT_TILE; // in tiles, as drawn
  assert.ok(LAYER_HEIGHT > tall * 1.15, `a layer (${LAYER_HEIGHT} tiles) fits the wanderer (${tall.toFixed(2)}) with headroom`);
});

test('the boat is to scale: its mast stands above the wanderer standing on its deck', async () => {
  const { readFileSync } = await import('node:fs');
  const { BOAT_DECK } = await import('../../src/core/catalog.js');
  const size = (f) => Number(readFileSync(new URL('../../packs/default/characters/' + f, import.meta.url), 'utf8').match(/height="([\d.]+)"/)[1]);
  const aboveDeck = size('boat.svg') * (1 - BOAT_DECK);
  assert.ok(aboveDeck > size('wanderer.svg') * 1.3, `mast and sail (${aboveDeck}) tower over the wanderer (${size('wanderer.svg')})`);
});
