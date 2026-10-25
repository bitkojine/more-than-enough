// Walking: a tap finds the way round what's in the way (core paths.js
// planWalk/walkAim, through the controller), and running into a corner you
// only clip eases you round it (core sim.js move). Neither is ever faster
// than walking, so a shared world's room accepts every step (shadow.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { createController } from '../../src/game/controller.js';

const feedback = () => new Proxy({}, { get: () => () => {} });
const DT = 1 / 60;

// Open grass from (X0, Y0), with `rocks` ("x,y" strings) standing in it.
const X0 = 300, Y0 = 300, SIZE = 30;
function field(rocks = [], { seen = true } = {}) {
  const s = C.createState(12345);
  for (let y = Y0 - 2; y < Y0 + SIZE + 2; y++) for (let x = X0 - 2; x < X0 + SIZE + 2; x++) {
    C.tileAt(s.world, x, y, 0);
    s.world.chunks.get(C.packKey(C.chunkCoord(x), C.chunkCoord(y), 0)).type[C.chunkIndex(x, y)] = rocks.includes(`${x},${y}`) ? C.T.ROCK : C.T.GRASS;
    if (seen) C.markExplored(s.world, x, y, 0);
  }
  return s;
}
const wall = (x0, y0, x1, y1) => {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(`${x},${y}`);
  return out;
};
function controller(s) {
  return createController({ game: { state: s, saveSoon() {} }, fx: feedback(), hud: feedback(), audio: feedback(),
    look: { color: () => '' }, actor: { act() {} }, cam: { unproject: (x, y) => ({ x, y }) } });
}
// Steers until the walk ends (or `seconds` pass), holding every tick to walking pace.
function walk(s, c, seconds = 20) {
  const most = C.walkSpeed(s) * DT + 1e-9;
  for (let t = 0; t < seconds * 60 && c.walking; t++) {
    const x = s.player.x, y = s.player.y;
    c.steer(DT, { x: 0, y: 0 });
    assert.ok(Math.hypot(s.player.x - x, s.player.y - y) <= most, 'never faster than walking');
  }
}

test('running straight at a corner you only clip eases round it and carries on', () => {
  const s = field(wall(X0 + 10, Y0 + 5, X0 + 10, Y0 + 9));
  // Heading east a little below the wall's top end: the head clips its corner.
  s.player = { x: X0 + 8.5, y: Y0 + 5.1, z: 0 };
  const most = C.walkSpeed(s) * DT + 1e-9;
  for (let i = 0; i < 120; i++) {
    const x = s.player.x, y = s.player.y;
    C.move(s, 1, 0, DT);
    assert.ok(Math.hypot(s.player.x - x, s.player.y - y) <= most, 'never faster than walking');
  }
  assert.ok(s.player.x > X0 + 11, 'got past the wall');
  assert.ok(s.player.y < Y0 + 5, 'round its nearer end');
});

test('running straight into a flat wall still stops you', () => {
  const s = field(wall(X0 + 10, Y0 + 2, X0 + 10, Y0 + 12));
  s.player = { x: X0 + 9.5, y: Y0 + 7.5, z: 0 };
  for (let i = 0; i < 60; i++) C.move(s, 1, 0, DT);
  assert.ok(s.player.x < X0 + 10 - C.PLAYER_RADIUS + 1e-9);
  assert.equal(s.player.y, Y0 + 7.5, 'not pushed aside');
});

test('running at a corner on a slant still slides along the wall as before', () => {
  const s = field(wall(X0 + 10, Y0 + 2, X0 + 10, Y0 + 12));
  s.player = { x: X0 + 9.5, y: Y0 + 7.5, z: 0 };
  for (let i = 0; i < 30; i++) C.move(s, 1, -1, DT);
  assert.ok(s.player.y < Y0 + 7.5 - 0.5, 'slid north along it');
});

test('easing round a corner never steps onto water you cannot go on', () => {
  const s = field(wall(X0 + 10, Y0 + 5, X0 + 10, Y0 + 9));
  for (let x = X0 + 5; x <= X0 + 15; x++) s.world.chunks.get(C.packKey(C.chunkCoord(x), C.chunkCoord(Y0 + 4), 0)).type[C.chunkIndex(x, Y0 + 4)] = C.T.WATER;
  s.player = { x: X0 + 8.5, y: Y0 + 5.35, z: 0 };
  for (let i = 0; i < 120; i++) C.move(s, 1, 0, DT);
  assert.ok(!C.onWater(s));
  assert.ok(s.player.y >= Y0 + 5 + C.PLAYER_RADIUS - 1e-9, 'stayed on the shore');
});

test('a tap behind a wall walks round it to the spot', () => {
  // A cup open to the north, Mica inside it, the tap straight south beyond it.
  const rocks = [...wall(X0 + 8, Y0 + 12, X0 + 16, Y0 + 12), ...wall(X0 + 8, Y0 + 6, X0 + 8, Y0 + 12), ...wall(X0 + 16, Y0 + 6, X0 + 16, Y0 + 12)];
  const s = field(rocks);
  s.player = { x: X0 + 12.5, y: Y0 + 10.5, z: 0 };
  const c = controller(s);
  c.tap(X0 + 12.5, Y0 + 16.5);
  assert.ok(c.walking);
  walk(s, c);
  assert.equal(c.walking, false);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y)], [X0 + 12, Y0 + 16]);
});

test('a tap into the fog walks on, and finds a new way round a wall it comes upon', () => {
  const s = field(wall(X0 + 5, Y0 + 10, X0 + 20, Y0 + 10), { seen: false });
  s.player = { x: X0 + 12.5, y: Y0 + 4.5, z: 0 };
  C.markExplored(s.world, X0 + 12, Y0 + 4, 0);
  const c = controller(s);
  c.tap(X0 + 12.5, Y0 + 16.5);
  // Planned as if the fog were open ground: straight through the hidden wall.
  for (let t = 0; t < 20 * 60 && c.walking; t++) { c.steer(DT, { x: 0, y: 0 }); C.revealAround(s, 3); }
  assert.equal(c.walking, false);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y)], [X0 + 12, Y0 + 16]);
});

test('a planned walk never looks through the fog', () => {
  const open = field([], { seen: false }), walled = field(wall(X0 + 5, Y0 + 10, X0 + 20, Y0 + 10), { seen: false });
  for (const s of [open, walled]) s.player = { x: X0 + 12.5, y: Y0 + 4.5, z: 0 };
  assert.deepEqual(C.planWalk(open, X0 + 12, Y0 + 16).nodes, C.planWalk(walled, X0 + 12, Y0 + 16).nodes);
});

test('a tap on rock you cannot stand on walks up beside it and stops', () => {
  const s = field(wall(X0 + 12, Y0 + 12, X0 + 12, Y0 + 12));
  s.player = { x: X0 + 12.5, y: Y0 + 4.5, z: 0 };
  const c = controller(s);
  c.tap(X0 + 12.5, Y0 + 12.5);
  walk(s, c);
  assert.equal(c.walking, false);
  assert.ok(C.tileDist2(s.player, X0 + 12, Y0 + 12, 0) <= 1.5 * 1.5, 'beside it');
});

test('no way there at all still heads straight for it, as before', () => {
  // A ring of rock round the goal: nothing gets in.
  const rocks = wall(X0 + 10, Y0 + 10, X0 + 14, Y0 + 14).filter((k) => k !== `${X0 + 12},${Y0 + 12}`);
  const s = field(rocks);
  s.player = { x: X0 + 12.5, y: Y0 + 4.5, z: 0 };
  assert.equal(C.planWalk(s, X0 + 12, Y0 + 12), null);
  const c = controller(s);
  c.tap(X0 + 12.5, Y0 + 12.5);
  walk(s, c);
  assert.equal(c.walking, false, 'gave up once blocked');
  assert.ok(s.player.y > Y0 + 9, 'walked up to the ring');
});

test('walking: a walk planned to the tile you stand on is done, not a crash', () => {
  const s = C.createState(7);
  const w = C.planWalk(s, Math.floor(s.player.x), Math.floor(s.player.y));
  assert.deepEqual(w.nodes, []);
  assert.equal(C.walkAim(s, w), 'done');
});
