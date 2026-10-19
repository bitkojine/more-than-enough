import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { scene } from '../../src/game/render/scene.js';

// A shared world where another player built, placed props and left a
// tombstone both on land you've explored and out under the clouds.
function world() {
  const s = C.createState(7);
  s.world.explored.clear();
  C.markExplored(s.world, 2, 3, 0);
  const theirs = (x, y, z = 0) => ({ key: 'garden', res: 'mycelium', x, y, z, buffer: 0, owner: 'them' });
  s.extractors = [theirs(2, 3), theirs(40, 3), theirs(2, 3, -1)];
  s.world.props.clear();
  s.world.props.set(C.packKey(2, 3, 0), 'lamp');
  s.world.props.set(C.packKey(41, 3, 0), 'flag');
  const view = {
    graves: [{ x: 2.5, y: 3.5, z: 0 }, { x: 40.5, y: 9.5, z: 0 }],
    friends: [{ x: 60.5, y: 60.5, z: 0 }]
  };
  return { s, view };
}

test('only what stands on explored tiles is drawn; the clouds hide the rest', () => {
  const { s, view } = world();
  const sc = scene(s, view, 0);
  assert.deepEqual([...sc.buildings.values()].flat().map((e) => [e.x, e.y]), [[2, 3]], 'a building under the clouds does not show through them');
  assert.deepEqual([...sc.built], [C.packKey(2, 3, 0)]);
  assert.deepEqual(sc.placed, [{ x: 2, y: 3, kind: 'lamp' }], 'nor a flag, and no beacon points at it');
  assert.deepEqual([...sc.graves.values()].flat().map((g) => g.x), [2.5], 'nor a tombstone');
  assert.equal(sc.friends.size, 0);
  assert.equal(sc.aloft.length, 1, 'friends always show, so you can find each other: out in the clouds, over them');
});

test('they appear once you explore their tile', () => {
  const { s, view } = world();
  C.markExplored(s.world, 40, 3, 0);
  C.markExplored(s.world, 41, 3, 0);
  C.markExplored(s.world, 40, 9, 0);
  const sc = scene(s, view, 0);
  assert.equal([...sc.buildings.values()].flat().length, 2);
  assert.equal(sc.placed.length, 2);
  assert.equal([...sc.graves.values()].flat().length, 2);
});

test('a friend on explored land is drawn in their row, not over the clouds', () => {
  const { s, view } = world();
  const f = view.friends[0];
  C.markExplored(s.world, Math.floor(f.x), Math.floor(f.y), 0);
  const sc = scene(s, view, 0);
  assert.equal(sc.aloft.length, 0);
  assert.equal(sc.friends.get(Math.floor(f.y)).length, 1);
});

test('each layer has its own fog', () => {
  const { s, view } = world();
  assert.equal(scene(s, view, -1).buildings.size, 0, 'explored on the surface is not explored below');
  C.markExplored(s.world, 2, 3, -1);
  assert.equal(scene(s, view, -1).buildings.get(3).length, 1);
});
