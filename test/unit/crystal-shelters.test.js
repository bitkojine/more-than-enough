/* Heart shelters shared in a crystal room (0.203.0, Watch: "anyone's heart",
 * "any shelter"): your heart rests in someone else's shelter and is lifted
 * from it again, anyone's camp bench lines your carrier, and once your
 * machine is awake anyone's shelter is a teleport stop, each in your game
 * and the room's copy of you alike. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import { T0, crystalRoom, play, holdAuto } from './crystal-room.js';

const copyOf = (r, id) => r.shadowOf().of(id, r, T0 + 1e6).s;
const clean = (r, g) => {
  const rep = r.shadowOf().report(g.id);
  return { off: rep.off, refused: rep.refused };
};

// Open grass near (x, y) with grass all round it.
function openGrass(s, x, y) {
  for (let r = 2; r < 60; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const ok = [-1, 0, 1].every((oy) =>
          [-1, 0, 1].every((ox) => C.tileAt(s.world, x + dx + ox, y + dy + oy, 0) === C.T.GRASS)
        );
        if (ok) return { x: x + dx, y: y + dy };
      }
  throw Error('no open grass');
}

// Two players; the second has built `kind` on open grass by the first, in
// their game and the room's copy alike, and the first is told of it.
async function friendBuilt(kind) {
  const { r, key } = await crystalRoom(15);
  const a = await play(r, key, undefined, T0);
  const b = await play(r, P.randomHex(32), a.invite(), T0 + 1e6);
  const spot = openGrass(a.s, Math.floor(a.s.player.x), Math.floor(a.s.player.y));
  for (const s of [b.s, copyOf(r, b.id)])
    s.cultivation.facilities.push({
      kind,
      id: s.cultivation.nextId++,
      ...spot,
      z: 0,
      temperature: 18,
      buffer: 0,
      quality: 100
    });
  b.s.player.x += 1; // a step, so the room looks again
  C.noteWhere(b.s);
  b.sync();
  assert.equal(C.theirsAt(a.s, spot.x, spot.y, 0)?.kind, kind, 'the first is told of it');
  // The first stands beside it, the tile seen.
  Object.assign(a.s.player, { x: spot.x + 0.5, y: spot.y + 1.5, z: 0 });
  C.revealAround(a.s);
  C.playFor(a.s, 30); // the walk there
  C.noteWhere(a.s);
  a.sync();
  return { r, a, b, spot };
}

test('shelters: your heart rests in a friend’s shelter, mends there, and is lifted again', async () => {
  const { r, a, spot } = await friendBuilt('shelter');
  for (const s of [a.s, copyOf(r, a.id)]) {
    s.cultivation.gear.carrier = true;
    s.cultivation.heart = { where: 'carried', health: 60 };
  }
  const heart = { type: 'heart', x: spot.x, y: spot.y };
  assert.equal(C.cultivationCommand(a.s, heart), 'ok');
  assert.deepEqual(a.s.cultivation.heart, { where: 'theirs', health: 60, ...spot, z: 0 });
  C.playFor(a.s, 20);
  a.sync();
  assert.ok(a.s.cultivation.heart.health > 60, 'mended: ' + a.s.cultivation.heart.health);
  assert.equal(C.cultivationCommand(a.s, heart), 'lifted');
  assert.deepEqual(Object.keys(a.s.cultivation.heart).sort(), ['health', 'where']);
  a.sync(true);
  assert.deepEqual(copyOf(r, a.id).cultivation.heart, a.s.cultivation.heart, 'the room agrees');
  assert.deepEqual(clean(r, a), { off: 0, refused: 0 });
});

test('shelters: a heart left in a friend’s shelter is kept by saves and found by AUTO', async () => {
  const { r, a, spot } = await friendBuilt('shelter');
  a.s.cultivation.gear.carrier = true;
  a.s.cultivation.heart = { where: 'carried', health: 80 };
  assert.equal(C.cultivationCommand(a.s, { type: 'heart', x: spot.x, y: spot.y }), 'ok');
  const kept = JSON.parse(C.progressOf(a.s)).cultivation;
  assert.equal(C.validCultivation(kept), true, 'a valid save');
  assert.deepEqual(C.mendCultivation(kept).heart, a.s.cultivation.heart, 'loads as it was');
  // Wherever it was left, AUTO goes back for it when the machine wants it.
  const m = { kind: 'machine', id: 99, x: 3, y: 4, z: -2, temperature: 12, sections: 1 };
  a.s.cultivation.facilities.push({ ...m, health: 100, quality: 100, buffer: 0 });
  const refused = holdAuto(
    a.s,
    () => {},
    (s) => s.cultivation.heart.where === 'carried'
  );
  assert.deepEqual(refused, []);
  assert.equal(a.s.cultivation.heart.where, 'carried', 'lifted by AUTO');
  void r;
});

test('shelters: a friend’s bench lines your carrier, in your game and the room alike', async () => {
  const { r, a, spot } = await friendBuilt('bench');
  for (const s of [a.s, copyOf(r, a.id)]) {
    s.cultivation.gear.carrier = true;
    for (const [k, n] of Object.entries(C.CULTIVATION_RECIPES.lining)) C.earn(s, k, n);
  }
  assert.equal(C.cultivationCommand(a.s, { type: 'line', x: spot.x, y: spot.y }), 'ok');
  assert.equal(a.s.cultivation.gear.lining, true);
  a.sync(true);
  assert.equal(copyOf(r, a.id).cultivation.gear.lining, true);
  assert.deepEqual(clean(r, a), { off: 0, refused: 0 });
});

test('shelters: once your machine is awake, a friend’s shelter is a stop both ways', async () => {
  const { r, a, spot } = await friendBuilt('shelter');
  // A won game. Its machine stands on open grass some way off, so landing
  // beside it needs no digging (the room's land is the room's).
  const at = openGrass(a.s, spot.x + 12, spot.y);
  const m = { kind: 'machine', ...at, z: 0, temperature: 12, sections: 3, health: 100 };
  for (const s of [a.s, copyOf(r, a.id)]) {
    const c = s.cultivation;
    c.facilities.push({ ...m, id: c.nextId++, quality: 100, buffer: 0 });
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) C.markExplored(s.world, m.x + dx, m.y + dy, m.z);
    c.restored = c.completed = true;
    c.heart = { where: 'installed', health: 100 };
  }
  const stops = C.teleportStops(a.s);
  assert.deepEqual(
    stops.map((b) => [b.x, b.y, b.by]),
    [[spot.x, spot.y, C.theirsAt(a.s, spot.x, spot.y, 0).by]],
    'their shelter is a stop'
  );
  // From their shelter to your machine...
  assert.equal(C.cultivationCommand(a.s, { type: 'teleport', x: spot.x, y: spot.y }), 'teleported');
  assert.ok(C.atInteraction(a.s, m.x, m.y), 'beside the machine');
  // ...and back out to it, written down as its own act.
  const to = { type: 'teleport', x: m.x, y: m.y, at: { ...spot, z: 0 } };
  assert.equal(C.cultivationCommand(a.s, to), 'teleported');
  assert.equal(a.s.acts.at(-1)[0], 'j');
  assert.ok(C.atInteraction(a.s, spot.x, spot.y), 'beside their shelter');
  assert.equal(C.theirsAt(a.s, Math.floor(a.s.player.x), Math.floor(a.s.player.y), 0), null);
  a.sync(true);
  const copy = copyOf(r, a.id);
  assert.deepEqual(
    [copy.player.x, copy.player.y, copy.player.z],
    [a.s.player.x, a.s.player.y, a.s.player.z]
  );
  assert.deepEqual(clean(r, a), { off: 0, refused: 0 });
  // Nowhere that isn't a stop.
  C.cultivationCommand(a.s, { type: 'teleport', x: spot.x, y: spot.y });
  const bad = { type: 'teleport', x: m.x, y: m.y, at: { x: spot.x + 1, y: spot.y, z: 0 } };
  assert.equal(C.cultivationCommand(a.s, bad), 'invalid');
  assert.equal(P.cleanActs([['j', 1, 0, 0, -2, 3, 4, 5, 6, 0]]).length, 1);
  assert.equal(P.cleanActs([['j', 1, 0, 0, -2, 3, 4, 5, 6]]), null);
});
