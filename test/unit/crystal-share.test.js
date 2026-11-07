/* Someone else's crystal shared in a crystal room (0.200.0): you tend or
 * harvest another player's building, their game does it to its own, and
 * what came of it comes back to you, each written down so the room's copy
 * of both does the same at the same point (src/core/cultivation-share.js,
 * server/src/room-jobs.js). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import { T0, holdAuto, crystalRoom, play } from './crystal-room.js';

const chamberOf = (s) => s.cultivation.facilities.find((b) => b.kind === 'chamber');
const copyOf = (r, id) => r.shadowOf().of(id, r, T0 + 1e6).s;
const clean = (r, g) => {
  const rep = r.shadowOf().report(g.id);
  return { off: rep.off, refused: rep.refused };
};

// The first player plays until their chamber holds crystal; a friend comes
// in beside it, on the same layer.
async function besideACrop() {
  const { r, key } = await crystalRoom(15);
  const a = await play(r, key, undefined, T0);
  const grown = (s) => (chamberOf(s)?.buffer || 0) >= 2;
  assert.deepEqual(holdAuto(a.s, a.sync, grown), []);
  a.sync(true);
  const crop = chamberOf(a.s);
  assert.ok(crop && crop.buffer >= 2, 'crystal grew');
  const b = await play(r, P.randomHex(32), a.invite(), T0 + 1e6);
  // Where a friend's game would stand by it: beside it, the tile seen.
  Object.assign(b.s.player, { x: crop.x + 1.5, y: crop.y + 0.5, z: crop.z });
  C.revealAround(b.s);
  C.markExplored(b.s.world, crop.x, crop.y, crop.z);
  return { r, a, b, crop };
}

test('share: harvesting a friend’s chamber takes its crystal in their game and gives it to you, the room agreeing', async () => {
  const { r, a, b, crop } = await besideACrop();
  assert.equal(C.theirsAt(b.s, crop.x, crop.y, crop.z)?.by, a.id);
  const had = crop.buffer;
  assert.equal(C.cultivationCommand(b.s, { type: 'collect', x: crop.x, y: crop.y }), 'asked');
  assert.equal(b.s.inv.crystal, 0, 'nothing yet: their game hands it over');
  b.sync();
  assert.equal(r.heard.at(-1).m.t, 'take', 'asked of the owner’s game');
  assert.equal(crop.buffer, had % 1, 'taken from theirs');
  a.sync(true);
  assert.equal(r.heard.at(-1).m.t, 'given');
  assert.equal(b.s.inv.crystal, Math.floor(had), 'yours now');
  b.sync(true);
  assert.equal(copyOf(r, b.id).inv.crystal, b.s.inv.crystal, 'in the room’s copy of you too');
  assert.equal(chamberOf(copyOf(r, a.id)).buffer, crop.buffer, 'and of them');
  for (const g of [a, b]) assert.deepEqual(clean(r, g), { off: 0, refused: 0 });
});

test('share: a friend tends your chamber with what they carry; one that couldn’t be tended gives it back', async () => {
  const { r, a, b, crop } = await besideACrop();
  // The friend has what a tend takes, in the game and the room's copy alike.
  for (const s of [b.s, copyOf(r, b.id)])
    for (const [k, n] of Object.entries(C.CULTIVATION_RECIPES.tend)) C.earn(s, k, n * 2);
  const before = { ...b.s.inv };
  crop.needsTend = chamberOf(copyOf(r, a.id)).needsTend = true;
  assert.equal(C.cultivationCommand(b.s, { type: 'tend', x: crop.x, y: crop.y }), 'asked');
  b.sync();
  a.sync(true);
  b.sync(true);
  assert.equal(crop.needsTend, false, 'tended');
  assert.equal(chamberOf(copyOf(r, a.id)).needsTend, false);
  for (const [k, n] of Object.entries(C.CULTIVATION_RECIPES.tend))
    assert.equal(b.s.inv[k], before[k] - n, 'paid ' + k);
  // Too warm to tend: what it cost comes back.
  crop.temperature = chamberOf(copyOf(r, a.id)).temperature = 40;
  assert.equal(C.cultivationCommand(b.s, { type: 'tend', x: crop.x, y: crop.y }), 'asked');
  b.sync();
  a.sync(true);
  b.sync(true);
  assert.equal(r.heard.at(-1).m.ok, false);
  for (const [k, n] of Object.entries(C.CULTIVATION_RECIPES.tend))
    assert.equal(b.s.inv[k], before[k] - n, 'only the first tend paid for ' + k);
  for (const g of [a, b]) assert.deepEqual(clean(r, g), { off: 0, refused: 0 });
});

test('share: an owner who isn’t there has it done in the room’s copy, and comes back to it', async () => {
  const { r, a, b, crop } = await besideACrop();
  const had = Math.floor(crop.buffer);
  r.left(a.id, true, T0 + 2e6);
  a.online = false;
  assert.equal(C.cultivationCommand(b.s, { type: 'collect', x: crop.x, y: crop.y }), 'asked');
  b.sync();
  assert.equal(r.heard.at(-1).m.t, 'given', 'answered at once');
  assert.equal(b.s.inv.crystal, had);
  b.sync(true);
  assert.deepEqual(clean(r, b), { off: 0, refused: 0 });
  const kept = JSON.parse(r.saveFor(a.id, r.players.get(a.id)));
  const room = kept.cultivation.facilities.find((f) => f.kind === 'chamber');
  assert.ok(room.buffer < 1, 'their kept progress has it taken');
});

test('share: a job’s parts are checked, and nothing is done twice or at a building that isn’t yours', () => {
  assert.deepEqual(C.cleanJob({ k: 'collect', x: 1, y: 2, z: -2 }), {
    type: 'collect',
    x: 1,
    y: 2,
    z: -2
  });
  for (const bad of [{ k: 'repair', x: 1, y: 2, z: -2 }, { k: 'tend', x: 1.5, y: 2, z: -2 }, null])
    assert.equal(C.cleanJob(bad), null);
  assert.deepEqual(C.cleanGot({ ok: true, c: 3, q: 80 }), { ok: true, n: 3, q: 80 });
  for (const bad of [
    { ok: 1, c: 3, q: 80 },
    { ok: true, c: -1, q: 80 },
    { ok: true, c: 3, q: 101 }
  ])
    assert.equal(C.cleanGot(bad), null);
  const s = C.createState(9, { cultivation: true });
  s.cultivation.facilities.push({
    kind: 'chamber',
    id: 1,
    x: 3,
    y: 4,
    z: -2,
    buffer: 5.5,
    quality: 90
  });
  const req = { type: 'collect', x: 3, y: 4, z: -2 };
  assert.deepEqual(C.doShared(s, req), { ok: true, n: 5, q: 90 });
  assert.deepEqual(C.doShared(s, req), { ok: false, n: 0, q: 0 }, 'not twice');
  assert.equal(C.doShared(s, { ...req, x: 9 }).ok, false, 'nothing there');
  assert.equal(C.doShared(s, { ...req, type: 'repair' }).ok, false);
  assert.equal(
    C.askShared(s, 'repair', { kind: 'machine', x: 1, y: 1, z: -2, by: 'ab'.repeat(8) }),
    'invalid'
  );
  assert.equal(P.cleanActs([['t', 1, 0, 0, -2, 4]]).length, 1);
  assert.equal(P.cleanActs([['g', 1, 0, 0, -2, -4]]), null);
});
