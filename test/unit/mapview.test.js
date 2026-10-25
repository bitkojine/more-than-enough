import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../../src/core/index.js';
import { createCamera, MAP_PX } from '../../src/game/camera.js';
import { createMapView } from '../../src/game/mapview.js';
import { edgePoint } from '../../src/game/render/atlas.js';

// The map's HUD bits, as plain objects: the pill, its name and the map button.
function fakeEl() {
  const node = () => ({ hidden: false, disabled: false, textContent: '', innerHTML: '', attrs: {}, classList: { toggle() {} }, setAttribute(k, v) { this.attrs[k] = v; } });
  const name = node();
  name.firstElementChild = node(); name.lastElementChild = node();
  return { map: node(), mapLayer: node(), mapLayerName: name, mapUp: node(), mapDown: node() };
}

function setup() {
  globalThis.document = { body: { classList: { toggle() {} } } };
  const cam = createCamera({ getContext: () => ({}) });
  Object.assign(cam, { width: 390, height: 844, baseTilePx: 48 });
  cam.setZoom(1);
  const state = { world: Core.createWorld(5), player: { x: 10.5, y: 20.5, z: Core.SURFACE } };
  Core.markExplored(state.world, 0, 0, -2);
  const el = fakeEl();
  const mv = createMapView({ cam, getState: () => state, el, changed() {} });
  const settle = () => { for (let i = 0; i < 200; i++) mv.tick(0.05); };
  return { cam, state, el, mv, settle };
}

test('the map button glides all the way out to the map, and back to the zoom you had', () => {
  const { cam, mv, el, settle } = setup();
  cam.setZoom(1.6);
  mv.button();
  settle();
  assert.ok(mv.on() && cam.tilePx < MAP_PX, 'out on the map');
  assert.equal(el.map.attrs['aria-pressed'], 'true');
  mv.button();
  settle();
  assert.ok(!mv.on());
  assert.equal(cam.zoom, 1.6);
  assert.equal(el.map.attrs['aria-pressed'], 'false');
});

test('a drag pans the map without moving you; the button brings it back first', () => {
  const { cam, mv, state, el, settle } = setup();
  mv.button(); settle();
  mv.pan(100, -50);
  mv.tick(0.016);
  const look = mv.look();
  assert.ok(look.x < state.player.x && look.y > state.player.y, 'the land follows the finger');
  assert.equal(state.player.x, 10.5);
  assert.match(el.map.innerHTML, /circle/, 'the button turns to a crosshair');
  const zoom = cam.zoom;
  mv.button();
  assert.equal(mv.look(), null, 'back on you');
  assert.equal(cam.zoom, zoom, 'still on the map');
});

test('zooming about a point keeps that point under the finger', () => {
  const { cam, mv } = setup();
  mv.button(); for (let i = 0; i < 200; i++) mv.tick(0.05);
  const at = (sx, sy) => { const l = mv.look() || { x: 10.5, y: 20.5 }; return { x: l.x + (sx - cam.width / 2) / cam.tilePx, y: l.y + (sy - cam.height / 2) / cam.depthPx }; };
  const before = at(300, 200), was = cam.tilePx;
  cam.setZoom(cam.zoom / 2);
  mv.zoomed(was, 300, 200);
  const after = at(300, 200);
  assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9);
});

test('the layer pill steps through explored layers, and zooming back in lets go', () => {
  const { cam, mv, el, settle } = setup();
  mv.button(); settle();
  assert.equal(el.mapLayer.hidden, false, 'shown once you have been underground');
  assert.equal(el.mapUp.disabled, true);
  mv.layer(-1);
  assert.equal(mv.shown(), -2, 'an unexplored layer is skipped');
  assert.equal(el.mapLayerName.lastElementChild.textContent, '2');
  mv.pan(40, 0);
  cam.setZoom(1);
  settle();
  assert.equal(mv.look(), null, 'zoomed in, the view is on you again');
  assert.equal(mv.shown(), Core.SURFACE);
  assert.equal(el.mapLayer.hidden, true);
});

test('an off-screen mark sits on the edge of the room left for it, on the way to it', () => {
  const room = { l: 18, t: 100, r: 372, b: 694 };
  const cx = (room.l + room.r) / 2, cy = (room.t + room.b) / 2;
  const right = edgePoint(5000, cy, cx, cy, room);
  assert.equal(right.x, room.r);
  assert.equal(right.y, cy);
  const up = edgePoint(cx - 300, -5000, cx, cy, room);
  assert.equal(up.y, room.t);
  assert.ok(up.x > room.l && up.x < cx);
});
