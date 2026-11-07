/* Everyone's crystal buildings in a crystal room (0.199.0): each player sees
 * where everyone else's stand and how they look, and nobody builds on them,
 * in the game and in the room's copy alike (src/core/cultivation-theirs.js,
 * server/src/room-play.js rebuilt). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import { T0, machine, holdAuto, crystalRoom, play } from './crystal-room.js';

const at = (b) => [b.kind, b.x, b.y, b.z];
const where = (list) => list.map(at).sort();

test('theirs: what others are told of a crystal world, and only what fits is taken in', () => {
  const s = C.createState(9, { cultivation: true });
  s.cultivation.facilities.push(
    { kind: 'chamber', id: 1, x: 3, y: 4, z: -2, health: 50 },
    { kind: 'cooler', id: 2, x: 4, y: 4, z: -2, buffer: 0 }
  );
  const list = C.builtOf(s);
  assert.deepEqual(list, [
    ['chamber', 3, 4, -2, 1],
    ['cooler', 4, 4, -2, 0]
  ]);
  const by = 'ab'.repeat(8);
  assert.deepEqual(where(C.cleanBuilt(list, by)), where(s.cultivation.facilities));
  for (const bad of [
    [['tower', 1, 2, -2, 0]],
    [['chamber', 1.5, 2, -2, 0]],
    [['chamber', 1, 2, -2, 9]],
    [['station', 1, 2, 0, 0]],
    'chamber',
    Array(C.THEIRS_EACH + 1).fill(['cooler', 1, 2, -2, 0])
  ])
    assert.equal(C.cleanBuilt(bad, by), null, JSON.stringify(bad).slice(0, 40));
  assert.equal(C.cleanBuilt(list, 'not an id'), null);
  // A welcome's list: yours left out, anything off and nothing is taken.
  const me = 'cd'.repeat(8);
  const welcome = [
    [...list[0], by],
    [...list[1], me]
  ];
  assert.deepEqual(where(C.theirsFrom(welcome, me)), [at(s.cultivation.facilities[0])]);
  assert.deepEqual(C.theirsFrom([[...list[0], 'x']], me), []);
  assert.deepEqual(C.theirsFrom(undefined, me), []);
});

test('theirs: one player at a time, in place of what they had; never your own', () => {
  const s = C.createState(9, { cultivation: true });
  s.me = 'cd'.repeat(8);
  const a = 'ab'.repeat(8),
    b = 'ef'.repeat(8);
  assert.equal(C.setTheirs(s, a, C.cleanBuilt([['chamber', 1, 2, -2, 1]], a)), true);
  assert.equal(C.setTheirs(s, b, C.cleanBuilt([['vault', 5, 2, -2, 0]], b)), true);
  assert.equal(C.setTheirs(s, a, C.cleanBuilt([['cooler', 1, 3, -2, 0]], a)), true);
  assert.deepEqual(where(s.theirs), [
    ['cooler', 1, 3, -2],
    ['vault', 5, 2, -2]
  ]);
  assert.equal(C.theirsAt(s, 1, 3, -2)?.by, a);
  assert.equal(C.theirsAt(s, 1, 2, -2), null, 'gone when they moved it');
  assert.equal(C.setTheirs(s, s.me, C.cleanBuilt([['chamber', 9, 9, -2, 0]], s.me)), false);
  assert.equal(C.setTheirs(s, 'aa'.repeat(8), []), false, 'nothing to drop');
});

test('theirs: two players see each other’s crystal buildings, and neither builds on the other’s', async () => {
  const { r, key } = await crystalRoom(15);
  const a = await play(r, key, undefined, T0);
  assert.deepEqual(holdAuto(a.s, a.sync), [], 'nothing refused');
  a.sync(true);
  const mine = a.s.cultivation.facilities;
  assert.ok(mine.length >= 3, 'built a chamber and more, and found the machine');
  // A friend comes in: the welcome says where the first one's buildings stand.
  const b = await play(r, P.randomHex(32), a.invite(), T0 + 1e6);
  assert.deepEqual(where(b.s.theirs), where(mine));
  assert.ok(b.s.theirs.every((t) => t.by === a.id));
  assert.equal(b.s.theirs.find((t) => t.kind === 'machine')?.look, 0, 'not repaired yet');
  // ...and so does the room's copy of the friend, as it plays on.
  assert.deepEqual(holdAuto(b.s, b.sync), [], 'nothing refused');
  b.sync(true);
  const seen = r.shadowOf().players.get(b.id).s;
  assert.deepEqual(where(seen.theirs.filter((t) => t.by === a.id)), where(mine));
  for (const f of mine) assert.ok(C.theirsAt(seen, f.x, f.y, f.z), 'in its way too');
  for (const f of b.s.cultivation.facilities)
    assert.equal(C.theirsAt(a.s, f.x, f.y, f.z)?.by, b.id, 'the first one heard of ' + at(f));
  for (const f of mine) {
    b.s.player.z = f.z;
    C.markExplored(b.s.world, f.x, f.y, f.z);
    assert.equal(C.facilitySite(b.s, 'chamber', f.x, f.y), 'occupied');
    assert.equal(C.cultivationAt(b.s, f.x, f.y, f.z) ?? null, null, 'never the friend’s own');
  }
  assert.ok(machine(b.s));
  for (const g of [a, b]) {
    const rep = r.shadowOf().report(g.id);
    assert.deepEqual({ off: rep.off, refused: rep.refused }, { off: 0, refused: 0 });
  }
});

test('theirs: a room that restarts tells of everyone’s buildings from what it kept', async () => {
  const { r, key } = await crystalRoom(15);
  const a = await play(r, key, undefined, T0);
  holdAuto(a.s, a.sync);
  a.sync(true);
  // As after a restart: the room has no copies and remembers no lists.
  r.shadow = null;
  r.built = null;
  const all = r.allBuilt();
  assert.deepEqual(where(C.theirsFrom(all, null)), where(a.s.cultivation.facilities));
  assert.ok(all.every((e) => e[5] === a.id));
  // A room that isn't a crystal one tells of none.
  r.eco = 'old';
  assert.deepEqual(r.allBuilt(), []);
});
