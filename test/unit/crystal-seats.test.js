/* Machines side by side (0.198.0): in a crystal room every player's machine
 * lies buried at their own seat in a row in the deep under spawn
 * (src/core/cultivation-seats.js). AUTO digs each out where it should be,
 * the room agrees, nobody builds on a seat, and a game from before seats
 * still finds its machine where it always did, with the room agreeing. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import { T0, machine, holdAuto as untilMachine, crystalRoom, play } from './crystal-room.js';

test('seats: one place a player, in plain rock in the deep, the same for every copy of the land', () => {
  const w = C.createWorld(15, true),
    again = C.createWorld(15, true);
  const seats = Array.from({ length: 12 }, (_, i) => C.machineSeat(w, i));
  assert.equal(new Set(seats.map((p) => p.x + ',' + p.y)).size, 12, 'no two share a place');
  for (const [i, p] of seats.entries()) {
    assert.equal(p.z, C.SEAT_LAYER);
    assert.deepEqual(C.machineSeat(again, i), p, 'the same in another copy of the land');
    assert.ok(C.TILE_INFO[C.tileAt(w, p.x, p.y, p.z)].solid, 'buried until dug out');
    assert.ok(C.seatAt(w, p.x, p.y, p.z));
  }
  assert.equal(C.machineSeat(w, -1), null);
  assert.equal(C.machineSeat(w, 1.5), null);
  assert.equal(C.seatAt(w, seats[0].x, seats[0].y, C.SEAT_LAYER + 1), false);
});

test('seats: two players dig their machines out side by side, and the room agrees', async () => {
  const { r, key } = await crystalRoom(15);
  const a = await play(r, key, undefined, T0, true);
  assert.equal(untilMachine(a.s, a.sync).length, 0, 'nothing refused');
  a.sync(true);
  // The friend comes in later, onto the land as the first one left it.
  const b = await play(r, P.randomHex(32), a.invite(), T0 + 1e6, true);
  assert.equal(untilMachine(b.s, b.sync).length, 0, 'nothing refused');
  b.sync(true);
  const at = (g) => {
    const m = machine(g.s);
    return { x: m.x, y: m.y, z: m.z };
  };
  assert.deepEqual(at(a), C.machineSeat(a.s.world, a.s.seat));
  assert.deepEqual(at(b), C.machineSeat(b.s.world, b.s.seat));
  assert.notEqual(a.s.seat, b.s.seat);
  assert.ok(Math.abs(at(a).x - at(b).x) <= 3 * C.SEAT_GAP, 'side by side');
  for (const g of [a, b]) {
    const rep = r.shadowOf().report(g.id);
    assert.deepEqual({ off: rep.off, refused: rep.refused }, { off: 0, refused: 0 });
    const copy = JSON.parse(r.saveFor(g.id, r.players.get(g.id)));
    const m = copy.cultivation.facilities.find((f) => f.kind === 'machine');
    assert.deepEqual({ x: m.x, y: m.y, z: m.z }, at(g), "the room's copy has it there too");
  }
});

test('seats: nobody builds on a seat in a shared world; alone there are none', async () => {
  const { r, key } = await crystalRoom(15);
  const g = await play(r, key, undefined, T0, true);
  const p = C.machineSeat(g.s.world, 4);
  g.s.player.z = p.z;
  C.markExplored(g.s.world, p.x, p.y, p.z);
  C.setRichness(g.s.world, p.x, p.y, p.z, 0); // dug out, by someone not seated there
  assert.equal(C.facilitySite(g.s, 'chamber', p.x, p.y, p.z), 'occupied');
  const solo = C.createState(15, { cultivation: true });
  solo.player.z = p.z;
  C.markExplored(solo.world, p.x, p.y, p.z);
  C.setRichness(solo.world, p.x, p.y, p.z, 0);
  assert.equal(C.tileAt(solo.world, p.x, p.y, p.z), C.T.TUNNEL);
  assert.equal(C.facilitySite(solo, 'chamber', p.x, p.y, p.z), null);
});

test('seats: a game from before seats finds its machine in a tunnel, and the room looks there too', async () => {
  const { r, key } = await crystalRoom(15);
  const g = await play(r, key, undefined, T0, false);
  assert.equal(g.s.seat, undefined, 'the room told it of no seat');
  assert.equal(untilMachine(g.s, g.sync).length, 0);
  g.sync(true);
  assert.ok(machine(g.s), 'found');
  const rep = r.shadowOf().report(g.id);
  assert.deepEqual({ off: rep.off, refused: rep.refused }, { off: 0, refused: 0 });
  // Back with a game that knows of seats: it has been down there, so it
  // is given no seat, and finds its machine the way it always did.
  const back = await play(r, key, undefined, T0 + 1e7, true);
  assert.equal(back.s.seat, undefined);
  assert.equal(r.players.get(back.id).seats, false);
  assert.equal(untilMachine(back.s, back.sync).length, 0);
  back.sync(true);
  assert.ok(machine(back.s));
  const again = r.shadowOf().report(back.id);
  assert.deepEqual({ off: again.off, refused: again.refused }, { off: 0, refused: 0 });
});
