/* What a route may cross. A mutation run (2026-11-02, Stryker on
 * src/core/paths.js) showed that no test caught a route walking onto water
 * without Boots, digging through rock it can't break, or a walk that stopped
 * cutting straight across open ground. These pin each rule on a small
 * hand-made map. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

const CS = C.CHUNK_SIZE;

// A world of plain `base` tiles on layer z around the origin.
function flat(z, base) {
  const s = C.createState(12345);
  const w = s.world;
  w.chunks.clear();
  w.hotKey = -1;
  w.hotChunk = null;
  for (let cy = -2; cy <= 2; cy++)
    for (let cx = -2; cx <= 2; cx++)
      w.chunks.set(C.packKey(cx, cy, z), {
        type: new Uint8Array(CS * CS).fill(base),
        rich: new Uint8Array(CS * CS).fill(200) // all rock still whole
      });
  s.player = { ...s.player, x: 0.5, y: 0.5, z };
  s.tools.boots = 0;
  s.tools.pickaxe = 1;
  for (let y = -30; y <= 30; y++) for (let x = -30; x <= 30; x++) C.markExplored(w, x, y, z);
  return s;
}
function put(s, x, y, t) {
  const z = s.player.z,
    cx = Math.floor(x / CS),
    cy = Math.floor(y / CS);
  C.tileAt(s.world, x, y, z); // the chunk being read is held aside as the hot one
  s.world.hotChunk.type[(y - cy * CS) * CS + (x - cx * CS)] = t;
  assert.equal(C.tileAt(s.world, x, y, z), t, 'the map helper writes the tile');
}
// A wall of `t` down column x, from y0 to y1, with a gap at `gap`.
function wall(s, x, t, gap, y0 = -20, y1 = 20) {
  for (let y = y0; y <= y1; y++) if (y !== gap) put(s, x, y, t);
}
const on = (s, route, t) => route.filter((p) => C.tileAt(s.world, p.x, p.y, s.player.z) === t);

test('routes: without Boots a route goes round water; with them it wades straight across', () => {
  const s = flat(0, C.T.GRASS);
  wall(s, 5, C.T.WATER, 8);
  const round = C.findPath(s, 0, 0, 10, 0, { pad: 25 });
  assert.ok(round, 'there is a way round');
  assert.deepEqual(on(s, round, C.T.WATER), [], 'and it never steps on water');
  assert.ok(
    round.some((p) => p.x === 5 && p.y === 8),
    'it goes through the gap'
  );
  s.tools.boots = C.GEAR.water;
  assert.ok(C.canWade(s));
  const straight = C.findPath(s, 0, 0, 10, 0, { pad: 25 });
  assert.equal(straight.length, 10, 'Boots take the straight way');
  assert.equal(on(s, straight, C.T.WATER).length, 1);
  s.tools.boots = 0;
  wall(s, 5, C.T.WATER, null, -40, 40);
  assert.equal(C.findPath(s, 0, 0, 10, 0, { pad: 25 }), null, 'no gap, no way');
});

test('routes: digging goes through rock your pickaxe breaks, never bedrock or harder rock', () => {
  const s = flat(-1, C.T.TUNNEL);
  wall(s, 5, C.T.BEDROCK, 12);
  for (let y = -20; y <= 20; y++) if (y !== 12) put(s, 6, y, C.T.TUNNEL);
  put(s, 5, 0, C.T.STONE_SEAM);
  put(s, 5, 1, C.T.ORE_SEAM);
  const dug = C.findPath(s, 0, 0, 10, 0, { pad: 25, dig: true });
  assert.equal(dug.length, 10, 'straight through the stone seam');
  assert.deepEqual(
    dug.filter((p) => p.dig).map((p) => [p.x, p.y]),
    [[5, 0]],
    'and only that tile is marked to dig'
  );
  put(s, 5, 0, C.T.BEDROCK);
  const hard = C.findPath(s, 0, 0, 10, 0, { pad: 25, dig: true });
  assert.deepEqual(on(s, hard, C.T.BEDROCK), [], 'bedrock is never dug');
  assert.deepEqual(on(s, hard, C.T.ORE_SEAM), [], 'nor ore seams a level 1 pickaxe cannot break');
  assert.ok(
    hard.some((p) => p.x === 5 && p.y === 12),
    'it walks round by the gap instead'
  );
  s.tools.pickaxe = C.GEAR.rock[C.T.ORE_SEAM];
  const ore = C.findPath(s, 0, 0, 10, 0, { pad: 25, dig: true });
  assert.equal(ore.length, 12, 'a better pickaxe breaks the ore seam, one row over');
  assert.deepEqual(
    ore.filter((p) => p.dig).map((p) => [p.x, p.y]),
    [[5, 1]]
  );
  assert.equal(C.diggable(s, 5, 0), false, 'bedrock');
  assert.equal(C.diggable(s, 5, 1), true);
  assert.equal(C.diggable(s, 0, 0), false, 'an open tunnel is not rock');
});

test('routes: without digging, rock is a wall', () => {
  const s = flat(-1, C.T.TUNNEL);
  wall(s, 5, C.T.STONE_SEAM, null, -40, 40);
  assert.equal(C.findPath(s, 0, 0, 10, 0, { pad: 25 }), null);
  assert.equal(C.findPath(s, 0, 0, 10, 0, { pad: 25, dig: true }).length, 10);
});

test('walks: across open ground Mica heads for the furthest tile in a clear line', () => {
  const s = flat(0, C.T.GRASS);
  const w = C.planWalk(s, 6, 6);
  assert.equal(w.nodes.length, 12, 'a staircase of tiles');
  const aim = C.walkAim(s, w);
  const d = Math.hypot(aim.x - s.player.x, aim.y - s.player.y);
  assert.ok(d > 4, 'not just the next tile but straight across: ' + JSON.stringify(aim));
});

test('walks: round a corner Mica heads for the corner, not through the wall', () => {
  const s = flat(-1, C.T.TUNNEL);
  for (let y = -20; y <= 20; y++) for (let x = 1; x <= 20; x++) put(s, x, y, C.T.BEDROCK);
  for (let x = 1; x <= 8; x++) put(s, x, 4, C.T.TUNNEL);
  for (let y = 0; y <= 4; y++) put(s, 0, y, C.T.TUNNEL);
  const w = C.planWalk(s, 8, 4);
  const aim = C.walkAim(s, w);
  assert.ok(aim.x < 1 && aim.y <= 4.5, 'down the corridor first: ' + JSON.stringify(aim));
});

test('walks: a walk planned through ground later found blocked is planned again', () => {
  const s = flat(0, C.T.GRASS);
  const w = C.planWalk(s, 8, 0);
  put(s, 2, 0, C.T.WATER);
  assert.equal(C.walkAim(s, w), null);
  s.player.z = -1;
  assert.equal(C.walkAim(s, w), null, 'and so is one from another layer');
});
