/* Anyone's light hurts all crystal in a crystal room (0.202.0, Watch chose
 * 2026-11-07): someone else's lit lantern or flare near you cracks the
 * crystal you carry outside a carrier, as your own light would. The room
 * sees it (server/src/room-jobs.js shine), your game is told ('lit') and
 * writes it down ('l'), so the room's copy of you cracks the same. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import { T0, holdAuto, crystalRoom, play } from './crystal-room.js';

const copyOf = (r, id) => r.shadowOf().of(id, r, T0 + 1e6).s;
const deep = (s) => s.player.z <= -2;

// One player deep down with a lit lantern; a friend beside them carrying
// crystal with no carrier.
async function lanternBeside() {
  const { r, key } = await crystalRoom(15);
  const a = await play(r, key, undefined, T0);
  assert.deepEqual(holdAuto(a.s, a.sync, deep), []);
  for (const s of [a.s, copyOf(r, a.id)]) s.cultivation.gear.lantern = true;
  if (C.activeCarriedLight(a.s) !== 'lantern')
    assert.equal(C.cultivationCommand(a.s, { type: 'lantern' }), 'ok');
  a.sync(true);
  const b = await play(r, P.randomHex(32), a.invite(), T0 + 1e6);
  Object.assign(b.s.player, { x: a.s.player.x, y: a.s.player.y, z: a.s.player.z });
  C.revealAround(b.s);
  b.sync();
  for (const s of [b.s, copyOf(r, b.id)]) C.earn(s, 'crystal', 5, 'buildings');
  return { r, a, b };
}

test('light: a friend’s lit lantern beside you cracks the crystal you carry, in your game and the room alike', async () => {
  const { r, a, b } = await lanternBeside();
  assert.equal(C.carriedLightLevel(copyOf(r, a.id)) > 0, true, 'their lantern is lit');
  const before = b.s.cultivation.quality;
  for (let i = 0; i < 12; i++) {
    C.playFor(a.s, 0.5);
    a.sync();
    C.playFor(b.s, 0.5);
    b.sync();
  }
  b.sync(true);
  b.sync(); // what the last save brought in, written down
  const lit = r.heard.filter((h) => h.m.t === 'lit');
  assert.ok(lit.length >= 1, 'told of their light');
  assert.ok(lit.every((h) => h.id === b.id && h.m.by === a.id));
  assert.ok(b.s.cultivation.quality < before, 'cracked: ' + b.s.cultivation.quality);
  assert.equal(copyOf(r, b.id).cultivation.quality, b.s.cultivation.quality);
  for (const g of [a, b]) {
    const rep = r.shadowOf().report(g.id);
    assert.deepEqual({ off: rep.off, refused: rep.refused }, { off: 0, refused: 0 });
  }
});

test('light: in a carrier, or out of reach, someone’s light does nothing', async () => {
  const { r, a, b } = await lanternBeside();
  for (const s of [b.s, copyOf(r, b.id)]) s.cultivation.gear.carrier = true;
  const before = b.s.cultivation.quality;
  for (let i = 0; i < 8; i++) {
    C.playFor(a.s, 0.5);
    a.sync();
  }
  assert.equal(r.heard?.filter((h) => h.m.t === 'lit').length || 0, 0, 'nothing to tell');
  assert.equal(b.s.cultivation.quality, before);
  // litBy itself: no light reaches past its level.
  const src = {
    x: Math.floor(b.s.player.x) + 20,
    y: Math.floor(b.s.player.y),
    z: b.s.player.z,
    level: 4
  };
  b.s.cultivation.gear.carrier = false;
  C.litBy(b.s, src, 5);
  assert.equal(b.s.cultivation.quality, before);
});

test('light: a lit message’s parts are checked', () => {
  assert.deepEqual(C.cleanLit({ x: 1, y: 2, z: -2, lv: 4, s: 2 }), {
    src: { x: 1, y: 2, z: -2, level: 4 },
    secs: 2
  });
  for (const bad of [
    { x: 1, y: 2, z: -2, lv: 0, s: 2 },
    { x: 1, y: 2, z: -2, lv: 4, s: 0 },
    { x: 1, y: 2, z: -2, lv: 4, s: C.LIT_MAX + 1 },
    { x: 1.5, y: 2, z: -2, lv: 4, s: 2 },
    null
  ])
    assert.equal(C.cleanLit(bad), null);
  assert.equal(P.cleanActs([['l', 1, 0, 0, -2, 3]]).length, 1);
});

test('light: someone’s light cracks the heart you carry, not one in a carrier or resting', () => {
  const s = C.createState(9, { cultivation: true });
  s.player.z = -2;
  const here = { x: Math.floor(s.player.x), y: Math.floor(s.player.y), z: -2, level: 8 };
  const c = s.cultivation;
  c.heart = { where: 'carried', health: 100 };
  C.litBy(s, here, 10);
  assert.ok(c.heart.health < 100, 'cracked: ' + c.heart.health);
  const carried = c.heart.health;
  c.gear.carrier = true;
  C.litBy(s, here, 10);
  assert.equal(c.heart.health, carried, 'in a carrier');
  c.gear.carrier = false;
  c.heart = { where: 5, health: 70 };
  C.litBy(s, here, 10);
  assert.equal(c.heart.health, 70, 'resting in a shelter');
});
