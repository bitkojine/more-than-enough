/* A shared world's backup file (server/src/backup.js): it reads back into
 * the same world, every player's progress included, and holds no way in. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { Room } from '../../server/src/room.js';
import { snapshot } from '../../server/src/copy.js';
import { backupOf, entriesOf, backupName } from '../../server/src/backup.js';

const T0 = 1_700_000_000_000;

async function world() {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world: { seed: 777, mods: [[5, 1], [9, 2]], props: [], ext: [] } }), T0), null);
  const j = await r.join(key, undefined, T0);
  const code = r.message(j.id, JSON.stringify({ t: 'invite' }), T0 + 1000).toSelf[0].code;
  const friendKey = P.randomHex(32);
  const friend = await r.join(friendKey, code, T0 + 2000);
  return { r, key, id: j.id, friendKey, friendId: friend.id, code };
}

test('backup: reads back into the same world, everyone in it', async () => {
  const { r, key, id, friendKey, friendId } = await world();
  const text = backupOf(snapshot(r), r.id, T0 + 5000, '9.9.9');
  const d = JSON.parse(text);
  assert.equal(d.room, r.id);
  assert.equal(d.version, '9.9.9');
  const back = Room.restore(r.id, entriesOf(text), T0 + 6000);
  assert.ok(back.ready);
  assert.equal(back.seed, r.seed);
  assert.deepEqual([...back.mods], [...r.mods], 'every edit');
  assert.deepEqual([...back.players.keys()].sort(), [id, friendId].sort());
  for (const [pid, pl] of r.players) assert.equal(back.players.get(pid).save, pl.save, 'progress as the room has it');
  // Both players' own keys still play their own characters in it.
  assert.equal((await back.join(key, undefined, T0 + 7000)).id, id);
  assert.equal((await back.join(friendKey, undefined, T0 + 7000)).id, friendId);
});

test('backup: the invite links are left out, and the room is left as it was', async () => {
  const { r, code } = await world();
  const before = JSON.stringify([...r.entries()]);
  const text = backupOf(snapshot(r), r.id, T0, '1.0.0');
  assert.deepEqual(entriesOf(text).get('meta').inv, [], 'no links in the file');
  assert.equal(JSON.stringify([...r.entries()]), before);
  assert.ok(r.invites.size > 0, 'the real links still work');
  const stranger = await Room.restore(r.id, entriesOf(text), T0).join(P.randomHex(32), code, T0);
  assert.equal(stranger.error, 'invite', 'a code from before lets nobody into a restored world');
});

test('backup: anything else is not a backup', () => {
  for (const text of ['', 'null', '{}', '[]', '{"kind":"mte-shared-world"}', '{"kind":"mte-shared-world","entries":[]}', JSON.stringify({ kind: 'x', entries: [['meta', {}]] })]) {
    assert.equal(entriesOf(text), null, text);
  }
  assert.match(backupName('ZixSTX1BMH-ibklLzCMCqA', Date.UTC(2026, 9, 18, 21, 5)), /^mte-world-ZixSTX1BMH-ibklLzCMCqA-2026-10-18-21-05\.json$/);
});

test('backup: a restore takes only a backup of that same world, and brings back a world, not a copy', async () => {
  const { r } = await world();
  const text = backupOf(snapshot(r), r.id, T0, '1.0.0');
  assert.ok(entriesOf(text, r.id));
  assert.equal(entriesOf(text, P.randomRoomId()), null, 'not at another address: nobody could get back in');
  const d = JSON.parse(text);
  d.entries.find(([k]) => k === 'meta')[1].copy = { as: 'a', key: 'b', until: 1 };
  d.entries.push(['id', 'someone-else']);
  const e = entriesOf(JSON.stringify(d), r.id);
  assert.equal(e.get('meta').copy, undefined);
  assert.equal(e.has('id'), false, 'the room says its own id when it takes the file');
  assert.equal(Room.restore(r.id, e, T0).copy, null);
});
