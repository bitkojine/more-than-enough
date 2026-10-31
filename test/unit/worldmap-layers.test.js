import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../../src/core/index.js';
import {
  mapLayers,
  stepLayer,
  shownType,
  edgeTiles,
  sampleEdges
} from '../../src/game/worldmap-layers.js';

const { T, SURFACE } = Core;

test('the map offers every layer you have explored, top first, and the one you are on', () => {
  const w = Core.createWorld(7);
  assert.deepEqual(mapLayers(w), [SURFACE]);
  Core.markExplored(w, 3, 4, -2);
  Core.markExplored(w, 0, 0, SURFACE);
  assert.deepEqual(mapLayers(w, -3), [SURFACE, -2, -3]);
});

test('stepping layers stops at the top and the deepest explored', () => {
  const all = [0, -1, -2, -4];
  assert.equal(stepLayer(all, 0, 1), 0);
  assert.equal(stepLayer(all, 0, -1), -1);
  assert.equal(stepLayer(all, -2, -1), -4, 'a layer you never explored is skipped');
  assert.equal(stepLayer(all, -4, -1), -4);
  assert.equal(stepLayer(all, -3, 1), -2, 'from a layer not listed, the nearest');
});

// Finds a tile of type `type` on layer z near the origin.
function find(w, type, z) {
  for (let r = 0; r < 400; r++)
    for (let y = -r; y <= r; y++)
      for (const x of [-r, r]) {
        if (Core.tileAt(w, x, y, z) === type) return { x, y };
        if (Core.tileAt(w, y, x, z) === type) return { x: y, y: x };
      }
  throw new Error('no tile of type ' + type);
}

test('the map never marks a way between layers: it shows the ground beside it', () => {
  const w = Core.createWorld(11);
  for (const [type, z] of [
    [T.CAVE, SURFACE],
    [T.SHAFT, -1],
    [T.RISE, -1]
  ]) {
    const p = find(w, type, z);
    const shown = shownType(w, p.x, p.y, z);
    assert.notEqual(shown, type);
    assert.ok(![T.CAVE, T.SHAFT, T.SHAFT_OPEN, T.RISE].includes(shown));
  }
  // An old dug hole too, and the light it lets into the layer below.
  const at = find(w, T.SOIL, -1);
  w.holes.add(Core.packKey(at.x, at.y, -1));
  assert.equal(shownType(w, at.x, at.y, -1), Core.tileAt(w, at.x + 1, at.y, -1));
  const plain = find(w, T.GRASS, SURFACE);
  assert.equal(shownType(w, plain.x, plain.y, SURFACE), T.GRASS, 'everything else shows as itself');
});

test("the clouds' edge is the unexplored tiles beside explored ones, as the view finds it", () => {
  const w = Core.createWorld(3);
  Core.markExplored(w, 5, 5, SURFACE);
  const edge = edgeTiles(w, 0, 0, SURFACE);
  const pairs = [];
  for (let i = 0; i < edge.length; i += 2) pairs.push(edge[i] + ',' + edge[i + 1]);
  assert.deepEqual(pairs.sort(), ['4,5', '5,4', '5,6', '6,5']);
  // Over a chunk border too: the tile across it is found in its own chunk.
  Core.markExplored(w, 15, 2, SURFACE);
  assert.deepEqual(edgeTiles(w, 1, 0, SURFACE), [16, 2]);
});

test('zoomed out the edge is thinned to one puff per square, never lost', () => {
  const line = [];
  for (let x = 0; x < 64; x++) line.push(x, 10);
  assert.equal(sampleEdges([line], 1).length, 128);
  const four = sampleEdges([line], 4);
  assert.equal(four.length, 32);
  assert.deepEqual(four.slice(0, 4), [0, 10, 4, 10]);
  assert.equal(
    sampleEdges([line, [-3, 10]], 16).length,
    10,
    'from every chunk, negative tiles included'
  );
});
