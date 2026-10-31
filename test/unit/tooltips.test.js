import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { describeLook, describeWorld } from '../../src/game/tooltips.js';
test('inspection rejects hidden cells without generating chunks or exposing buildings', () => {
  const s = C.createState(72631),
    before = s.world.chunks.size;
  assert.equal(describeWorld(s, 90000, 90000, -8), null);
  assert.equal(s.world.chunks.size, before);
});
test('inspection shares localized catalog identities and reads physical facilities without changing progress', () => {
  const s = C.createState(72631),
    x = Math.floor(s.player.x),
    y = Math.floor(s.player.y),
    z = s.player.z;
  assert.ok(C.isExplored(s.world, x, y, z));
  const before = C.serialize(s);
  assert.equal(describeWorld(s, x, y, z), null, 'plain ground under the player says nothing');
  assert.equal(C.serialize(s), before);
  let deposit = null;
  for (let r = 1; r < 60 && !deposit; r++)
    for (let dx = -r; dx <= r && !deposit; dx++)
      for (const dy of [-r, r]) {
        const t = C.tileAt(s.world, x + dx, y + dy, z);
        if (C.TILE_INFO[t].res && C.richness(s.world, x + dx, y + dy, z) > 0) {
          deposit = { x: x + dx, y: y + dy };
          break;
        }
      }
  assert.ok(deposit, 'a deposit near spawn');
  C.markExplored(s.world, deposit.x, deposit.y, z);
  const info = describeWorld(s, deposit.x, deposit.y, z);
  assert.equal(info.name, C.TILE_NAME[C.tileAt(s.world, deposit.x, deposit.y, z)]);
  assert.ok(info.description);
  for (const r of C.RESOURCES) {
    const info = describeLook(C.resourceLook(r));
    assert.equal(info.name, C.RESOURCE_LABEL[r]);
    assert.ok(info.description.length > 30);
  }
  assert.equal(describeLook('missing'), null);
});
test('plain ground and dug tunnels stay quiet; deposits, finds and ways speak up', () => {
  for (const type of [
    C.T.GRASS,
    C.T.TUNNEL,
    C.T.SOIL,
    C.T.HOME,
    C.T.ROCK,
    C.T.WALL,
    C.T.HEDGE,
    C.T.BEDROCK,
    C.T.WATER
  ])
    assert.equal(C.tileHint(type), null, C.TILE_KEY[type]);
  for (const type of [
    C.T.STONE,
    C.T.ORE_SEAM,
    C.T.GEODE,
    C.T.CACHE,
    C.T.CAVE,
    C.T.RISE,
    C.T.SHAFT,
    C.T.SHAFT_OPEN
  ])
    assert.ok(C.tileHint(type), C.TILE_KEY[type]);
  for (const thing of Object.values(C.LOOK))
    assert.doesNotMatch(thing.does || '', /walkable/i, thing.id);
});
