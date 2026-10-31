import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { createController } from '../../src/game/controller.js';
import { characterDirection } from '../../src/game/render/character-direction.js';
const feedback = () => new Proxy({}, { get: () => () => {} });
function controller(s) {
  return createController({
    game: { state: s, saveSoon() {} },
    fx: feedback(),
    hud: feedback(),
    audio: feedback(),
    look: { color: () => '' },
    actor: { act() {} },
    cam: { unproject: (x, y) => ({ x, y }) }
  });
}
test('generic Gather faces the actual harvested tile and stopping preserves that direction', () => {
  const s = C.createState(12345),
    t = C.nearestTile(
      s.player.x,
      s.player.y,
      100,
      (x, y) => C.tileAt(s.world, x, y, 0) === C.T.FOREST && C.richness(s.world, x, y, 0) > 3
    );
  assert.ok(t);
  s.player = { x: t.x + 0.5, y: t.y + 1.5, z: 0 };
  C.revealAround(s);
  // Remove alternative nearby richness so the core chooses the known northern target.
  for (let y = t.y - 2; y <= t.y + 3; y++)
    for (let x = t.x - 2; x <= t.x + 2; x++)
      if (x !== t.x || y !== t.y) C.setRichness(s.world, x, y, 0, 0);
  const c = controller(s);
  c.press();
  assert.equal(characterDirection(c.facing), 'n');
  const facing = { ...c.facing };
  c.steer(0.016, { x: 0, y: 0 });
  assert.deepEqual(c.facing, facing);
});
test('collection faces an actual collected source rather than the previous walking direction', () => {
  const s = C.createState(12345);
  s.player = { x: 0.5, y: 0.5, z: 0 };
  s.extractors = [{ key: 'garden', res: 'mycelium', x: 1, y: 0, z: 0, buffer: 4 }];
  C.revealAround(s);
  const c = controller(s);
  c.facing = { x: -1, y: 0 };
  assert.equal(c.perform({ type: 'collect' }), true);
  assert.equal(characterDirection(c.facing), 'e');
  assert.equal(s.extractors[0].buffer, 0);
});
