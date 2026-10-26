/* The pieces a room is built from (server/src/room.js), each on its own:
 * where players may walk (moves.js), invite links (invites.js) and how a
 * world is laid out in storage (stored.js). together.test.js plays them
 * through a whole room; these try the edges directly. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, cleanInviteAsk } from '../../src/net/protocol.js';
import { newWatch, step, countCheat, MAX_SPEED, MOVE_BURST, CHEATS_TO_FREEZE, CHEAT_FORGIVE_MS } from '../../server/src/moves.js';
import * as Invites from '../../server/src/invites.js';
import { MOD_BUCKETS, bucketOf, clean, everything, isDirty, keysOf, markKeys, piecesOf, modsIn } from '../../server/src/stored.js';

const at = (x, y, z = 0) => ({ x, y, z });

/* ------------------------------------------------------------ moves */

test('moves: steps draw on a budget that refills at MAX_SPEED, up to MOVE_BURST', () => {
  const w = newWatch(0);
  assert.equal(step(w, null, at(5, 5), undefined, 0), 'ok', 'a new player stands anywhere');
  assert.equal(step(w, at(0, 0), at(MOVE_BURST, 0), undefined, 0), 'ok', 'the whole burst at once');
  assert.equal(step(w, at(0, 0), at(1, 0), undefined, 0), 'far', 'and not a tile more');
  assert.equal(step(w, at(0, 0), at(MAX_SPEED / 2, 0), undefined, 500), 'ok', 'half a second refills half a second of walking');
  assert.equal(step(w, at(0, 0), at(0.01, 0), undefined, 500), 'far');
  step(w, at(0, 0), at(0, 0), undefined, 1_000_000);
  assert.equal(w.budget, MOVE_BURST, 'never more than the burst');
  assert.equal(step(w, at(0, 0, 0), at(0, 0, 3), undefined, 1_000_000), 'ok', 'a climb is no distance');
});

test('moves: the first step after connecting may start elsewhere, and is placed, not a cheat', () => {
  const w = newWatch(0);
  w.fresh = true;
  // Gone 10 s: may have walked 10 s worth since.
  assert.equal(step(w, at(0, 0), at(MAX_SPEED * 10, 0), 0, 10_000), 'ok');
  const v = newWatch(0);
  assert.equal(step(v, at(0, 0), at(5000, 0), 0, 1000), 'place', 'further than that: told where they stand');
  assert.equal(v.placing, true);
  assert.equal(step(v, at(0, 0), at(4000, 0), 0, 1000), 'wait', 'steps from elsewhere wait, quietly');
  assert.equal(step(v, at(0, 0), at(3, 0), 0, 1000), 'ok', 'until one starts where the room has them');
  assert.equal(v.placing, false);
  assert.equal(step(v, at(0, 0), at(500, 0), 0, 1000), 'far', 'and from then on it counts');
});

test('moves: cheats count one a second, are forgiven slowly, and enough of them freeze', () => {
  const w = newWatch(0);
  let t = 1000;
  assert.equal(countCheat(w, t), true);
  assert.equal(countCheat(w, t + 999), false, 'one a second at most');
  for (let i = 1; i < CHEATS_TO_FREEZE; i++) countCheat(w, t += 1000);
  assert.equal(w.cheats, CHEATS_TO_FREEZE);
  const v = newWatch(0);
  countCheat(v, 1000); countCheat(v, 2000); countCheat(v, 3000);
  countCheat(v, 3000 + 2 * CHEAT_FORGIVE_MS);
  assert.equal(v.cheats, 2, 'two forgiven, one more counted');
});

/* ----------------------------------------------------------- invites */

const ask = cleanInviteAsk(null);

test('invites: a link works until it is stopped, runs out or is used up, and says which', () => {
  const inv = { by: 'a', made: 0, until: 100, uses: 0, max: 2, off: false };
  assert.equal(Invites.works(inv, 50), true);
  assert.equal(Invites.works(inv, 101), false);
  assert.equal(Invites.whyNot(inv, 101), 'expired');
  assert.equal(Invites.whyNot({ ...inv, uses: 2 }, 50), 'usedUp');
  assert.equal(Invites.whyNot({ ...inv, off: true, uses: 2 }, 101), 'stopped', 'stopped says so first');
  assert.equal(Invites.maxOf({}), ask.uses, 'a link from before the limit lets in the default');
});

test('invites: your sign shows your newest link made the same way while it has a while to go', () => {
  const inv = new Map();
  let n = 0;
  const code = () => 'c' + ++n;
  const a = Invites.linkFor(inv, 'me', ask, 0, code);
  assert.deepEqual(a, { code: 'c1', made: true });
  assert.deepEqual(Invites.linkFor(inv, 'me', ask, 1000, code), { code: 'c1', made: false }, 'the same link again');
  assert.equal(Invites.linkFor(inv, 'you', ask, 1000, code).code, 'c2', 'someone else gets their own');
  assert.equal(Invites.linkFor(inv, 'me', { ...ask, uses: ask.uses + 1 }, 1000, code).code, 'c3', 'one asked another way is another link');
  const life = ask.life * 60_000;
  assert.equal(Invites.linkFor(inv, 'me', ask, life - Math.min(Invites.REUSE_MS, life / 2) + 1, code).code, 'c4', 'too near its end: a new one');
  inv.get('c4').off = true;
  assert.equal(Invites.linkFor(inv, 'me', ask, 1000, code).code, 'c1', 'never a stopped one');
});

test('invites: a full world forgets its oldest dead link to make one, and never a working one', () => {
  const inv = new Map();
  for (let i = 0; i < Invites.MAX_INVITES; i++) inv.set('w' + i, { by: 'x' + i, made: i, until: 1e12, uses: 0, max: 5, life: 1, off: false });
  assert.deepEqual(Invites.linkFor(inv, 'me', ask, 10, () => 'new'), { full: true });
  assert.equal(inv.size, Invites.MAX_INVITES);
  inv.get('w7').off = true;
  inv.get('w3').off = true;
  assert.equal(Invites.linkFor(inv, 'me', ask, 10, () => 'new').code, 'new');
  assert.equal(inv.has('w3'), false, 'the oldest dead one went');
  assert.equal(inv.has('w7'), true);
  assert.equal(inv.size, Invites.MAX_INVITES);
});

test('invites: the links you see are your own, newest first, and a list fits a message', () => {
  const inv = new Map();
  for (let i = 0; i < Invites.INVITE_LIST + 5; i++) inv.set('m' + i, { by: 'me', made: i, until: 9, uses: 0, off: false });
  inv.set('other', { by: 'you', made: 999, until: 9, uses: 0, off: false });
  const { list } = Invites.listFor(inv, 'me');
  assert.equal(list.length, Invites.INVITE_LIST);
  assert.equal(list[0][0], 'm' + (Invites.INVITE_LIST + 4));
  assert.ok(list.every((l) => l[1] === 'me'));
});

test('invites: one player brings at most LIMITS.invitesPerDay people in a day', () => {
  const full = Array.from({ length: LIMITS.invitesPerDay }, (_, i) => i * 1000);
  assert.equal(Invites.broughtToday({ brought: full }, 10_000), null);
  assert.equal(Invites.broughtToday({ brought: full }, Invites.DAY_MS + 500).length, LIMITS.invitesPerDay - 1, 'a day later the first no longer counts');
  assert.deepEqual(Invites.broughtToday({}, 0), [], 'nobody yet');
  assert.deepEqual(Invites.broughtToday({ brought: 'junk' }, 0), []);
});

/* ------------------------------------------------------------ stored */

test('stored: edits split into pieces and read back the same, wherever they were stored', () => {
  const mods = new Map([[1, 3], [MOD_BUCKETS + 1, 2], [7, 0], [MOD_BUCKETS * 3 + 7, 5]]);
  const all = piecesOf(mods, everything([]).buckets);
  assert.equal(all.size, MOD_BUCKETS, 'every piece, empty ones too, so none keeps an old edit');
  assert.deepEqual(all.get('mods:1'), [[1, 3], [MOD_BUCKETS + 1, 2]]);
  const back = modsIn(all);
  assert.deepEqual(back.mods, mods);
  assert.equal(back.moved, false);
  // As a world from before v0.126.0 stored them: fewer pieces.
  const old = modsIn(new Map([['mods:0', [...mods]], ['meta', {}]]));
  assert.deepEqual(old.mods, mods);
  assert.equal(old.moved, true);
  assert.deepEqual([...piecesOf(mods, new Set([7]))], [['mods:7', [[7, 0], [MOD_BUCKETS * 3 + 7, 5]]]], 'only the pieces asked for');
  assert.equal(bucketOf(MOD_BUCKETS + 9), 9);
});

test('stored: a write that did not land is marked again, key by key', () => {
  const d = clean();
  assert.equal(isDirty(d), false);
  const keys = keysOf(['a', 'b']);
  assert.equal(keys.length, 3 + MOD_BUCKETS + 2);
  markKeys(d, keys);
  assert.deepEqual(d, everything(['a', 'b']));
  const e = clean();
  markKeys(e, ['mods:9', 'p:a', 'nonsense']);
  assert.equal(isDirty(e), true);
  assert.deepEqual([...e.buckets], [9]);
  assert.deepEqual([...e.players], ['a']);
  assert.equal(e.meta || e.props || e.ext, false);
});
