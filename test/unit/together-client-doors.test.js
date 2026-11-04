/* The game's side of playing together (src/game/together.js): what each way
 * a connection can end means for the player, and the doors in and out of a
 * shared world (links, the Invite button, Settings' away choice). Each close
 * the room service can send has its own outcome: told why, sent home or
 * not, the world kept on the list or forgotten. Mutation sweep 1 found
 * almost none of these checked (together.js 38 %). */

import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { WORLD_FORMAT } from '../../src/core/format.js';
import { t } from '../../src/i18n/i18n.js';
import { knownRooms, worldName } from '../../src/game/worlds.js';
import {
  store,
  T0,
  open,
  tick,
  harness,
  makeRoom,
  serve,
  inWorld,
  reset
} from '../support/together-client.js';

// The game's own timers (reconnect waits, the format retry) are the test's
// to run, so none is left to hold the test process open.
beforeEach(() => {
  reset();
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
});
afterEach(() => mock.timers.reset());

const realFetch = globalThis.fetch;
test.after(() => {
  globalThis.fetch = realFetch;
  document.hidden = false;
});

// The game goes back into world `w` (Back to the shared world, or opening
// the game) and the room answers with `welcome` changed by `edit`.
async function resumeInto(w, edit = (x) => x, h = harness()) {
  store.set('mte.playing', w.id);
  h.together.resume();
  const socket = open()[0];
  socket.open();
  const hello = socket.sent.find((m) => m.t === 'hello');
  const j = await w.r.join(hello.key, hello.code ?? w.code, T0);
  socket.deliver(edit(structuredClone(j.welcome)));
  return { ...h, socket };
}

/* ------------------------------------------------ how a connection ends */

test('doors: another screen taking the world over sends you home, and it opens next time', async () => {
  const w = await makeRoom();
  const g = await inWorld(w);
  open()[0].lose(4001, 'replaced');
  assert.equal(g.together.active, false);
  assert.ok(g.toasts.includes(t('together.toast.elsewhere')));
  assert.equal(store.get('mte.playing'), w.id, 'still the world the game opens into');
  assert.ok(knownRooms().includes(w.id));
});

test('doors: removed from a world, it is forgotten', async () => {
  const w = await makeRoom();
  const g = await inWorld(w);
  open()[0].lose(4003, 'removed');
  assert.equal(g.together.active, false);
  assert.ok(g.toasts.includes(t('together.toast.removed')));
  assert.equal(store.get('mte.playing'), '');
  assert.ok(!knownRooms().includes(w.id));
});

test('doors: a frozen character shows the notice and goes to the bottom of the list', async () => {
  const a = await makeRoom(),
    w = await makeRoom();
  (await inWorld(a)).together.switchTo(null);
  const g = await inWorld(w);
  assert.deepEqual(knownRooms(), [w.id, a.id]);
  open()[0].lose(4005, 'frozen');
  assert.equal(g.seen.fbi, 1);
  assert.equal(g.together.active, false);
  assert.deepEqual(knownRooms(), [a.id, w.id], 'kept, but last');
  assert.equal(store.get('mte.playing'), '');
});

test("doors: a moderator's copy that ended is forgotten", async () => {
  const w = await makeRoom();
  const g = await inWorld(w);
  open()[0].lose(4006, 'ended');
  assert.ok(g.toasts.includes(t('copy.ended')));
  assert.ok(!knownRooms().includes(w.id));
});

test('doors: a link that no longer works says why, if the room said', async () => {
  for (const [why, key] of [
    ['expired', 'together.toast.inviteExpired'],
    ['usedUp', 'together.toast.inviteUsedUp'],
    ['stopped', 'together.toast.inviteStopped'],
    ['limit', 'together.toast.inviteLimit'],
    ['what', 'together.toast.inviteOld'],
    [undefined, 'together.toast.inviteOld']
  ]) {
    reset();
    const w = await makeRoom();
    const h = harness();
    location.hash = '#join=' + w.id + '.' + 'A'.repeat(22);
    h.together.joinFromLink();
    await tick();
    const s = open()[0];
    s.open();
    s.deliver({ t: 'invite', ...(why ? { why } : {}) });
    s.lose(1008, 'invite');
    const text = t(key, { n: P.LIMITS.invitesPerDay });
    assert.deepEqual(h.toasts.slice(-1), [text], String(why));
    assert.equal(h.together.active, false);
  }
});

test('doors: a full world says so', async () => {
  const w = await makeRoom();
  const h = harness();
  location.hash = '#join=' + w.id + '.' + w.code;
  h.together.joinFromLink();
  await tick();
  open()[0].open();
  open()[0].lose(1008, 'full');
  assert.ok(h.toasts.includes(t('together.toast.full')));
});

test('doors: a world out of reach is tried again next time; one that is gone is forgotten', async () => {
  for (const exists of [true, false]) {
    reset();
    const w = await makeRoom();
    await inWorld(w);
    reset();
    store.set('mte.rooms', JSON.stringify([w.id]));
    const asked = [];
    globalThis.fetch = async (url) => {
      asked.push(url);
      return { ok: true, json: async () => ({ exists }) };
    };
    store.set('mte.playing', w.id);
    const h = harness();
    h.together.resume();
    open()[0].lose(1006, '');
    for (let i = 0; i < 5; i++) await tick();
    assert.ok(h.toasts.includes(t('together.toast.unreachable')));
    assert.match(asked[0], new RegExp('/rooms/' + w.id + '$'));
    assert.equal(h.together.active, false);
    if (exists) {
      assert.equal(store.get('mte.playing'), w.id, 'the game opens into it next time');
      assert.ok(knownRooms().includes(w.id));
      assert.ok(!h.toasts.includes(t('together.toast.gone')));
    } else {
      assert.equal(store.get('mte.playing'), '');
      assert.ok(!knownRooms().includes(w.id));
      assert.ok(h.toasts.includes(t('together.toast.gone')));
    }
  }
});

test('doors: a dropped line while playing keeps you in and reconnects', async () => {
  const w = await makeRoom();
  const g = await inWorld(w);
  open()[0].lose(1006, '');
  assert.equal(g.together.active, true);
  assert.deepEqual(g.toasts.slice(-1), [t('together.toast.reconnecting')]);
});

/* ------------------------------------------------- what the welcome says */

test('doors: a world made by a newer game asks for the update; an older one waits for the room', async () => {
  for (const [fmt, toast, updates] of [
    [WORLD_FORMAT + 1, 'together.toast.oldGame', 1],
    [WORLD_FORMAT - 1, 'together.toast.worldUpdating', 0]
  ]) {
    reset();
    const w = await makeRoom();
    const g = await resumeInto(w, (x) => ({ ...x, fmt }));
    assert.equal(g.together.active, false);
    assert.deepEqual(g.toasts, [t(toast)]);
    assert.equal(g.seen.updates, updates);
    assert.equal(store.get('mte.playing'), w.id, 'kept, to try again');
  }
});

test('doors: a world whose room is updating is tried again a minute later, unless you moved on', async () => {
  {
    const w = await makeRoom();
    await resumeInto(w, (x) => ({ ...x, fmt: WORLD_FORMAT - 1 }));
    const before = open().length;
    mock.timers.tick(59_999);
    assert.equal(open().length, before);
    mock.timers.tick(1);
    assert.equal(open().length, before + 1);
    assert.equal(open().at(-1).room, w.id);

    reset();
    const a = await makeRoom(),
      b = await makeRoom();
    const g = await resumeInto(a, (x) => ({ ...x, fmt: WORLD_FORMAT - 1 }));
    store.set('mte.rooms', JSON.stringify([b.id]));
    g.together.switchTo(b.id);
    const sockets = open().length;
    mock.timers.tick(60_000);
    assert.equal(open().length, sockets, 'not back to the first');
    assert.equal(open().at(-1).room, b.id);
  }
});

test("doors: a welcome that isn't one sends you home", async () => {
  const w = await makeRoom();
  const g = await resumeInto(w, () => ({ t: 'welcome', you: 5 }));
  assert.equal(g.together.active, false);
  assert.ok(g.toasts.includes(t('together.toast.broken')));
});

test("doors: the world's time of day is the room's", async () => {
  const w = await makeRoom();
  const g = await resumeInto(w, (x) => ({ ...x, time: 4321 }));
  assert.equal(g.together.active, true);
  assert.ok(Math.abs(g.game.state.time - 4321) < 1, String(g.game.state.time));
  g.together.tick(0.1);
  assert.ok(g.game.state.time >= 4321 && g.game.state.time < 4322);
});

test('doors: going back in without the question says once that it accepts the policy', async () => {
  const w = await makeRoom();
  (await inWorld(w)).together.switchTo(null); // the join question accepted it
  store.delete('mte.privacy'); // someone from before the policy
  const g = await resumeInto(w);
  assert.equal(g.toasts.filter((x) => x === t('privacy.toast')).length, 1);
  assert.equal(store.get('mte.privacy'), '2');
  open()[0].lose(4001, 'replaced');
  const again = await resumeInto(w);
  assert.ok(!again.toasts.includes(t('privacy.toast')));
  assert.ok(again.toasts.includes(t('together.toast.in', { world: worldName(w.id) })));
});

test('doors: a welcome while hidden tells the room you are away', async () => {
  const w = await makeRoom();
  document.hidden = true;
  try {
    const g = await resumeInto(w);
    assert.deepEqual(
      g.socket.sent.filter((m) => m.t === 'away'),
      [{ t: 'away', a: true }]
    );
  } finally {
    document.hidden = false;
  }
});

/* ------------------------------------------------------ the doors */

test('doors: the Invite button asks the room for a link, only once you are in', async () => {
  const h = harness();
  h.together.showInvite();
  assert.deepEqual(h.toasts, [t('together.toast.offline')]);
  const w = await makeRoom();
  const g = await inWorld(w);
  g.el.invite.click();
  const asked = open()[0].sent.filter((m) => m.t === 'invite');
  assert.equal(asked.length, 1);
  assert.ok(P.INVITE_USES.includes(asked[0].uses));
  assert.ok(P.INVITE_LIVES.includes(asked[0].life));
});

test('doors: the away choice is sent at once, and on every hello', async () => {
  const w = await makeRoom();
  const g = await inWorld(w);
  g.together.setAwayProduce(true);
  g.together.setAwayProduce('yes');
  assert.deepEqual(
    open()[0].sent.filter((m) => m.t === 'awayProduce'),
    [
      { t: 'awayProduce', a: true },
      { t: 'awayProduce', a: false }
    ]
  );
  g.together.setAwayProduce(true);
  open()[0].lose(4001, 'replaced');
  g.together.resume();
  assert.equal(open().at(-1).sent.length, 0);
  open().at(-1).open();
  assert.equal(
    open()
      .at(-1)
      .sent.find((m) => m.t === 'hello').away,
    true
  );
});

test('doors: a bad join link is said and taken out of the address; no link does nothing', async () => {
  const h = harness();
  assert.equal(h.together.joinFromLink(), false);
  assert.deepEqual(h.toasts, []);
  location.hash = '#join=not-a-room';
  assert.equal(h.together.joinFromLink(), false);
  assert.deepEqual(h.toasts, [t('together.toast.badLink')]);
  assert.equal(location.hash, '');
  assert.equal(open().length, 0);
});

test('doors: inside a world you have a name and colour; alone, none', async () => {
  const h = harness();
  assert.equal(h.together.me, null);
  assert.equal(h.together.active, false);
  assert.equal(h.together.available, true);
  const w = await makeRoom();
  const g = await inWorld(w);
  assert.equal(g.together.active, true);
  assert.equal(typeof g.together.me.name, 'string');
  assert.ok(g.together.me.name.length > 0);
  assert.equal(g.together.worldName, worldName(w.id));
  assert.notEqual(g.together.color, undefined);
});

test('doors: hiding the game keeps your progress on the phone; coming back reconnects at once', async () => {
  const w = await makeRoom();
  const g = await inWorld(w);
  store.delete('mte.room.' + w.id);
  g.together.away(true);
  assert.ok(store.get('mte.room.' + w.id), 'kept, in case the game is closed now');
  open()[0].lose(1006, '');
  assert.equal(open().length, 0);
  g.together.away(false);
  assert.equal(open().length, 1, 'not after the wait');
  assert.equal(open()[0].room, w.id);
});
