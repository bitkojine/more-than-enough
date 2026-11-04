/* The room's own copy of each player's progress (server/src/shadow.js)
 * replays only acts that could have happened: in play-time order, no later
 * than the room's clock allows, and no further from the last act than anyone
 * can go (STRIDE tiles a second plus STRIDE_SLACK, one layer a second plus
 * one). The mutation sweep (sweep 1, 2026-11-04) found that switching any of
 * these checks off left every test passing: the tests that tried a leap or a
 * future act counted refusals the rules would have made anyway. Here each
 * act is a walk ('w'), which the rules always accept, so an act is refused
 * only by these checks, and each check is tried on both sides of its edge. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { Room, Bucket } from '../../server/src/room.js';
import { C } from './helpers.js';

const T0 = 1_700_000_000_000;

async function walker() {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  await r.init(
    JSON.stringify({ t: 'create', key, world: { seed: 4242, mods: [], props: [], ext: [] } }),
    T0
  );
  const j = await r.join(key, undefined, T0, false);
  const s = C.joinState(j.welcome, r.id, null, null);
  const { x, y, z } = s.player;
  const edits = new Bucket(T0, 1e9, 1e9);
  // Two minutes of the room's clock, so the clock check doesn't stop acts
  // inside it.
  const now = T0 + 120_000;
  // Whether the room's copy took a walk to (dx, dy, dz) from where the game
  // started, at play time ms.
  const walk = (ms, dx, dy = 0, dz = 0) => {
    const before = r.shadow?.report(j.id)?.refused ?? 0;
    const out = r.message(
      j.id,
      JSON.stringify({ t: 'acts', ms, a: [['w', ms, x + dx, y + dy, z + dz]] }),
      now,
      edits
    );
    assert.ok(!out.drop, 'the room took the message');
    return r.shadow.report(j.id).refused === before;
  };
  return { walk };
}

test('shadow pace: a walk as fast as anyone can go is kept, a step further is refused', async () => {
  const { walk } = await walker();
  assert.ok(walk(1000, 0), 'the first act sets where the player is');
  // 2 s later: 40 tiles a second and 4 of slack is 84 tiles.
  assert.ok(walk(3000, 84), 'exactly 84 tiles in 2 s is kept');
  assert.ok(!walk(5000, 84 + 84.5), '84.5 tiles in the next 2 s is refused');
  // A refused act doesn't move the player: from 84, 84 again in 2 s is fine.
  assert.ok(walk(7000, 168), 'from where the last kept act was');
  assert.ok(!walk(9000, 168, 85), 'the same limit holds going north');
});

test('shadow pace: acts must come in play-time order, a millisecond of rounding aside', async () => {
  const { walk } = await walker();
  assert.ok(walk(5000, 0));
  assert.ok(!walk(4998, 0), 'an act from 2 ms before what was played is refused');
  assert.ok(walk(4999, 0), 'one from 1 ms before is rounding, and kept');
});

test("shadow pace: acts from beyond the room's clock are refused", async () => {
  const { walk } = await walker();
  assert.ok(walk(1000, 0));
  assert.ok(walk(100_000, 0), 'play time the room has seen pass is kept');
  assert.ok(!walk(10 * 60_000, 0), 'ten minutes when the room has seen two is refused');
});

test('shadow pace: one layer a second plus one, no more', async () => {
  const { walk } = await walker();
  assert.ok(walk(1000, 0));
  assert.ok(walk(2000, 0, 0, -2), 'two layers down in a second is kept');
  assert.ok(!walk(3000, 0, 0, -5), 'three more in the next second is refused');
  assert.ok(walk(4000, 0, 0, -5), 'three in two seconds from the last kept act is kept');
});
