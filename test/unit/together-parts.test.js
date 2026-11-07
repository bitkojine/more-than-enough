/* The parts playing together is made of (src/game/together.js), each on its
 * own with stand-ins for the page, the socket and the clock: the friends
 * you see (friends.js), the connection (room-link.js), what is sent and when
 * (room-sender.js), the sign (invite-sign.js), who you are (identity.js),
 * coming into a world (arrival.js), what the room says (room-handlers.js) and
 * the pure decisions (together-rules.js). together-client.test.js drives the
 * whole module against the real room. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import {
  createFriends,
  glide,
  stateOf,
  friendColor,
  QUIET_IS_LOST
} from '../../src/game/friends.js';
import {
  createRoomLink,
  reconnectWait,
  socketUrl,
  RECONNECT_MAX,
  PING_EVERY,
  SILENT_IS_DEAD
} from '../../src/game/room-link.js';
import {
  createRoomSender,
  createAwayTeller,
  AWAY_EVERY,
  HEARTBEAT,
  MAX_PENDING_EDITS
} from '../../src/game/room-sender.js';
import { createInviteSign, inviteUrl } from '../../src/game/invite-sign.js';
import {
  read,
  write,
  myKey,
  playing,
  agreedToPolicy,
  askToPlayTogether,
  KEY_STORE,
  PLAYING_STORE
} from '../../src/game/identity.js';
import {
  closeReason,
  undoneText,
  arrivalSpot,
  positionOf,
  editBatches,
  renewedSince
} from '../../src/game/together-rules.js';
import { checkMaking } from '../../src/game/arrival.js';
import { createRoomHandlers, UNDONE_QUIET } from '../../src/game/room-handlers.js';
import { createOutbox } from '../../src/game/outbox.js';
import {
  roomGone,
  SAVE_PREFIX,
  FOG_PREFIX,
  GEN_PREFIX,
  ACTS_PREFIX
} from '../../src/game/worlds.js';
import { nameNumbers } from '../../src/net/naming.js';
import { t } from '../../src/i18n/i18n.js';

// A player id as the room makes them (16 hex digits), from one digit.
const pid = (d) => String(d).repeat(16);

// A stand-in for the page's storage.
function memoryStore() {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v))
  };
}

// A clock the test moves by hand.
function manualClock(at = 0) {
  const c = () => at;
  c.add = (s) => (at += s);
  return c;
}

// Timers the test fires by hand.
function manualTimers() {
  const due = [];
  return {
    due,
    set: (fn, ms) => due.push({ fn, ms }),
    clear: (id) => id && due[id - 1] && (due[id - 1].fn = null),
    fire() {
      const next = due.shift();
      next?.fn?.();
      return next;
    }
  };
}

// An actor that only records what it heard.
const quietActor = () => ({ heard() {}, view: () => ({ kind: null }) });

/* ------------------------------------------------------------- friends */

test('friends: a status brings someone in once, says when they come online, and names them', () => {
  const clock = manualClock(100);
  const f = createFriends({ clock, actor: quietActor });
  f.welcome(pid(0), 0, new Map(), []);
  assert.deepEqual(f.status(pid(1), 'away', 2), { isNew: true, arrived: false });
  assert.deepEqual(f.status(pid(1), 'online', 2), { isNew: false, arrived: true });
  assert.deepEqual(f.status(pid(1), 'online', 2), { isNew: false, arrived: false });
  assert.equal(f.status(pid(0), 'online', 0), null, 'yourself is not a friend');
  assert.equal(f.size, 1);
  assert.ok(f.nameOf(pid(1)).length > 0);
  assert.notEqual(f.nameOf(pid(1)), f.nameOf(pid(0)), 'two players never share a name');
  assert.equal(f.nameOf(pid(9)), '');
});

test('names: ids the room never makes still get names, and the search for a free one ends', () => {
  const names = nameNumbers([
    ['not hex', 1],
    ['also not', 2],
    [pid('a'), 3]
  ]);
  assert.equal(names.size, 3);
  assert.equal(new Set(names.values()).size, 3, 'no two share a name');
});

test('friends: a full world takes nobody more', () => {
  const f = createFriends({ clock: manualClock(), actor: quietActor, limit: 2 });
  f.status(pid('a'), 'online', 1);
  f.status(pid('b'), 'online', 2);
  assert.equal(f.status(pid('c'), 'online', 3), null);
  assert.equal(f.size, 2);
});

test('friends: unheard for a while reads as a lost connection, and a position brings them back', () => {
  const clock = manualClock(0);
  const f = createFriends({ clock, actor: quietActor });
  f.status(pid('a'), 'online', 1, { x: 1, y: 1, z: 0 });
  f.tick(0);
  assert.equal(f.chips()[0].st, 'online');
  clock.add(QUIET_IS_LOST + 1);
  f.tick(0);
  assert.equal(f.chips()[0].st, 'lost');
  assert.ok(f.moved(pid('a'), { x: 2, y: 1, z: 0, a: null, n: 0 }));
  f.tick(0);
  assert.equal(f.chips()[0].st, 'online');
  assert.equal(f.moved(pid('e'), { x: 0, y: 0, z: 0 }), false);
});

test('friends: a shown friend glides near, jumps far or between layers', () => {
  const near = glide({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1 / 24);
  assert.ok(near.x > 0 && near.x < 1, 'part of the way');
  assert.deepEqual(glide({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0.01), { x: 10, y: 0, z: 0 });
  assert.deepEqual(glide({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: -1 }, 0.01), { x: 1, y: 0, z: -1 });
  assert.deepEqual(glide(null, { x: 3, y: 4, z: 0 }, 0.01), { x: 3, y: 4, z: 0 });
});

test('friends: chips put those awake first; the Players screen puts you first, then by state and distance', () => {
  const f = createFriends({ clock: manualClock(), actor: quietActor });
  f.welcome(pid(0), 0, new Map(), []);
  f.status(pid(1), 'online', 3, { x: 50, y: 0, z: 0 });
  f.status(pid(2), 'offline', 1, { x: 1, y: 0, z: 0 });
  f.status(pid(3), 'online', 4, { x: 2, y: 0, z: -1 });
  f.status(pid(4), 'away', 2);
  assert.deepEqual(
    f.chips().map((c) => c.id),
    [pid(4), pid(1), pid(3), pid(2)]
  );
  const rows = f.rows({ x: 0, y: 0, z: 0 });
  assert.deepEqual(
    rows.map((r) => r.id),
    [pid(0), pid(3), pid(1), pid(4), pid(2)]
  );
  assert.equal(rows[1].dz, -1);
  assert.equal(rows[3].far, null, 'nowhere known');
  assert.equal(rows[0].color, friendColor(0));
});

test('friends: dropping a frozen friend keeps names until its tombstone comes', () => {
  const f = createFriends({ clock: manualClock(), actor: quietActor });
  f.welcome(pid(0), 0, new Map(), []);
  for (const id of [pid('a'), pid('b'), pid('c')]) f.status(id, 'online', 1);
  const before = f.nameOf(pid('c'));
  assert.ok(f.drop(pid('a'), false));
  assert.equal(f.nameOf(pid('c')), before);
  f.setGraves([{ id: pid('a'), c: 1, x: 0, y: 0, z: 0, k: 'frozen' }]);
  assert.equal(f.graves()[0].name.length > 0, true, 'the tombstone keeps its name');
  assert.equal(f.drop(pid(0)), false, 'never yourself');
  assert.equal(f.drop(pid('a')), false, 'already gone');
});

test('friends: only those with a place are drawn, where they are shown', () => {
  const f = createFriends({ clock: manualClock(), actor: quietActor });
  f.status(pid('a'), 'online', 1, { x: 1, y: 2, z: 0 });
  f.status(pid('b'), 'online', 2);
  assert.equal(f.view().length, 0, 'nothing shown before a tick');
  f.tick(0.1);
  const v = f.view();
  assert.equal(v.length, 1);
  assert.equal(v[0].id, pid('a'));
  assert.equal(v[0].x, 1);
  assert.equal(stateOf({ st: 'online', quiet: true }), 'lost');
  assert.equal(stateOf({ st: 'away', quiet: true }), 'away');
});

/* ---------------------------------------------------------- the line */

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closedWith = null;
  }
  send(text) {
    this.sent.push(text);
  }
  close(code, reason) {
    this.readyState = 3;
    this.closedWith = { code, reason };
  }
  opened() {
    this.readyState = 1;
    this.onopen();
  }
}

function lineHarness() {
  const sockets = [],
    heard = [],
    closes = [];
  const timers = manualTimers();
  const link = createRoomLink({
    open: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    timers,
    hello: () => ({ t: 'hello' }),
    onMessage: (raw) => heard.push(raw),
    onClosed: (code, reason) => closes.push({ code, reason })
  });
  return { link, sockets, heard, closes, timers };
}

test('link: says hello on opening, and sends nothing until the room lets it in', () => {
  const { link, sockets } = lineHarness();
  link.connect('wss://rooms.test/rooms/x/ws');
  const s = sockets[0];
  s.opened();
  assert.deepEqual(JSON.parse(s.sent[0]), { t: 'hello' });
  link.send({ t: 'pos' });
  assert.equal(s.sent.length, 1, 'not in yet');
  assert.equal(link.ready, false);
  link.welcome();
  assert.equal(link.letIn, true);
  link.send({ t: 'pos' });
  assert.equal(s.sent.length, 2);
});

test('link: a newer connection replaces the old, whose late words are ignored', () => {
  const { link, sockets, heard, closes } = lineHarness();
  link.connect('wss://a');
  link.connect('wss://b');
  assert.deepEqual(sockets[0].closedWith, { code: 1000, reason: 'bye' });
  sockets[0].onmessage({ data: 'late' });
  sockets[0].onclose({ code: 1000, reason: 'bye' });
  assert.deepEqual(heard, []);
  assert.deepEqual(closes, []);
  sockets[1].onmessage({ data: 'hi' });
  assert.deepEqual(heard, ['hi']);
});

test('link: a room that goes silent is dropped as if it had closed; pings go out meanwhile', () => {
  const { link, sockets, closes } = lineHarness();
  link.connect('wss://a');
  sockets[0].opened();
  link.welcome();
  assert.ok(link.tick(PING_EVERY + 0.01));
  assert.ok(sockets[0].sent.includes(P.PING));
  sockets[0].onmessage({ data: '{}' }); // a word resets the silence
  assert.ok(link.tick(SILENT_IS_DEAD - 1));
  assert.equal(link.tick(2), false);
  assert.deepEqual(closes, [{ code: 1006, reason: 'silent' }]);
  assert.equal(link.open, false);
});

test('link: waits double between tries up to a cap, and the player is told only the first time', () => {
  const { link, timers } = lineHarness();
  assert.equal(reconnectWait(0), 1);
  assert.equal(reconnectWait(3), 8);
  assert.equal(reconnectWait(10), RECONNECT_MAX);
  assert.equal(
    link.retryLater(() => {}),
    true
  );
  assert.equal(
    link.retryLater(() => {}),
    false
  );
  assert.deepEqual(
    timers.due.map((d) => d.ms),
    [1000, 2000]
  );
  assert.equal(link.waiting, true);
  link.resetRetry();
  assert.equal(
    link.retryLater(() => {}),
    true
  );
  assert.equal(socketUrl('https://rooms.test', 'abc'), 'wss://rooms.test/rooms/abc/ws');
});

/* ------------------------------------------------------- what is sent */

function sharedState() {
  const s = Core.createState(7);
  s.shared = 'roomA';
  s.acts = [];
  s.world.edits = [];
  return s;
}

function senderHarness({ ready = true } = {}) {
  const sent = [],
    store = new Map();
  const outbox = createOutbox();
  const sender = createRoomSender({
    outbox,
    send: (m) => sent.push(m),
    ready: () => ready,
    write: (k, v) => store.set(k, v)
  });
  const you = { facing: { x: 0, y: 1 }, moving: false, sign: false, act: { a: null, n: 0 } };
  return { sender, sent, store, you, outbox };
}

test('sender: where you are goes when it changes, and as a heartbeat standing still', () => {
  const { sender, sent, you } = senderHarness();
  const s = sharedState();
  sender.tick(s, 0.2, you);
  const pos = () => sent.filter((m) => m.t === 'pos');
  assert.equal(pos().length, 1);
  sender.tick(s, 0.2, you);
  assert.equal(pos().length, 1, 'nothing new to say');
  s.player.x += 1;
  sender.tick(s, 0.2, you);
  assert.equal(pos().length, 2, 'moved');
  for (let i = 0; i < HEARTBEAT / 0.2 + 1; i++) sender.tick(s, 0.2, you);
  assert.equal(pos().length, 3, 'the heartbeat');
});

test('sender: a new layer is said at once, before the edits made there', () => {
  const { sender, sent, you } = senderHarness();
  const s = sharedState();
  sender.tick(s, 0.2, you);
  s.player.z = -1;
  s.world.edits.push(['m', 5, 3]);
  sender.tick(s, 0.01, you);
  const kinds = sent.map((m) => m.t);
  assert.equal(kinds.at(-1), 'pos', 'the layer goes before the next round of edits');
  sender.tick(s, 0.3, you);
  const edits = sent.find((m) => m.t === 'edits');
  assert.deepEqual(edits.e, [['m', 5, 3]]);
  assert.ok(sent.indexOf(edits) > sent.findLastIndex((m) => m.t === 'pos' && m.p.z === -1) - 1);
});

test('sender: a long backlog of edits goes a few messages at a time, oldest first', () => {
  const per = P.LIMITS.editsPerMessage;
  const edits = Array.from({ length: per * 5 }, (_, i) => ['m', i, 1]);
  const { batches, later } = editBatches(edits);
  assert.equal(batches.length, 3);
  assert.equal(batches[0][0][1], 0);
  assert.equal(later.length, per * 2);
  assert.equal(later[0][1], per * 3);
  assert.deepEqual(editBatches([]), { batches: [], later: [] });
});

test('sender: progress is kept on the phone and sent every so often, and at once when forced', () => {
  const { sender, sent, store } = senderHarness();
  const s = sharedState();
  sender.save(s, true);
  assert.ok(store.get(SAVE_PREFIX + 'roomA'));
  assert.ok(store.get(FOG_PREFIX + 'roomA'));
  assert.ok(store.has(ACTS_PREFIX + 'roomA'));
  assert.equal(sent.filter((m) => m.t === 'save').length, 1);
  sender.save(s);
  assert.equal(sent.filter((m) => m.t === 'save').length, 1, 'not again so soon, nor unchanged');
  s.inv.stone = (s.inv.stone || 0) + 1;
  sender.save(s, true);
  assert.equal(sent.filter((m) => m.t === 'save').length, 2);
  sender.save({ ...s, shared: null }, true);
  assert.equal(sent.filter((m) => m.t === 'save').length, 2, 'a solo world is never sent');
});

test('sender: edits kept while offline stop at the newest MAX_PENDING_EDITS', () => {
  const { sender } = senderHarness({ ready: false });
  const s = sharedState();
  s.world.edits = Array.from({ length: MAX_PENDING_EDITS + 10 }, (_, i) => ['m', i, 1]);
  sender.trim(s);
  assert.equal(s.world.edits.length, MAX_PENDING_EDITS);
  assert.equal(s.world.edits[0][1], 10, 'the oldest go');
});

test('away: a change that comes too soon waits, and says the screen as it is then', () => {
  const sent = [];
  let now = 0,
    hidden = true;
  const timers = manualTimers();
  const tell = createAwayTeller({
    send: (m) => sent.push(m),
    hidden: () => hidden,
    now: () => now,
    timers
  });
  tell();
  assert.deepEqual(sent, [{ t: 'away', a: true }]);
  now = 500;
  hidden = false;
  tell();
  assert.equal(sent.length, 1, 'waits');
  assert.equal(timers.due[0].ms, AWAY_EVERY - 500);
  now = AWAY_EVERY;
  timers.fire();
  assert.deepEqual(sent[1], { t: 'away', a: false });
});

/* ------------------------------------------------------------ the sign */

function fakeEl() {
  const classes = new Set();
  return {
    hidden: false,
    textContent: '',
    attrs: {},
    classList: {
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      has: (c) => classes.has(c)
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    }
  };
}

test('sign: goes up with its link, comes down when the invite runs out, and copies its link', async () => {
  let now = 1000;
  const toasts = [],
    copied = [],
    drawn = [];
  const el = { invite: fakeEl(), inviteLabel: fakeEl() };
  const body = fakeEl();
  const sign = createInviteSign({
    el,
    body,
    qr: (url) => (drawn.push(url), { url }),
    copy: async (text) => copied.push(text),
    page: { origin: 'https://play.test', pathname: '/' },
    room: () => 'R',
    shown: () => true,
    toast: (m) => toasts.push(m),
    now: () => now
  });
  await sign.show('C', 5000);
  assert.deepEqual(drawn, ['https://play.test/#join=R.C']);
  assert.equal(body.classList.has('signing'), true);
  assert.equal(el.invite.attrs['aria-pressed'], 'true');
  sign.tick(0.2);
  assert.ok(sign.rise > 0.5 && sign.rise < 1);
  sign.tick(1);
  assert.equal(sign.rise, 1);
  await sign.copyLink();
  assert.deepEqual(copied, ['https://play.test/#join=R.C']);
  assert.deepEqual(toasts, [t('together.toast.copied')]);
  now = 6000;
  sign.tick(0.01);
  assert.equal(sign.invite, null, 'ran out');
  assert.ok(sign.face, 'the QR stays on while it comes down');
  sign.tick(1);
  assert.equal(sign.rise, 0);
  assert.equal(sign.face, null);
  assert.equal(inviteUrl({ origin: 'o', pathname: '/p/' }, 'r', 'c'), 'o/p/#join=r.c');
});

/* -------------------------------------------------------- who you are */

test('identity: your key is made once and kept; a broken store never stops the game', () => {
  const store = memoryStore();
  const key = myKey(store);
  assert.match(key, P.KEY_RE);
  assert.equal(myKey(store), key);
  assert.equal(store.getItem(KEY_STORE), key);
  const broken = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('full');
    }
  };
  assert.equal(read('x', broken), null);
  write('x', 'y', broken);
  assert.match(myKey(broken), P.KEY_RE, 'a key for this time, at least');
});

test('identity: only a real world id opens; the privacy question records a yes', async () => {
  const store = memoryStore();
  assert.equal(playing(store), null);
  store.setItem(PLAYING_STORE, 'not a room');
  assert.equal(playing(store), null);
  const id = P.randomRoomId();
  store.setItem(PLAYING_STORE, id);
  assert.equal(playing(store), id);
  assert.equal(agreedToPolicy(store), false);
  assert.equal(await askToPlayTogether(async () => false, 'join', 'W', store), false);
  assert.equal(agreedToPolicy(store), false);
  let asked = null;
  assert.equal(await askToPlayTogether(async (q) => ((asked = q), true), 'join', 'W', store), true);
  assert.equal(agreedToPolicy(store), true);
  assert.ok(asked.link.href.startsWith('privacy/#'));
});

/* ------------------------------------------------------------- rules */

test('rules: each close the room sends means one thing for the game', () => {
  assert.equal(closeReason(4001, ''), 'elsewhere');
  assert.equal(closeReason(4003, ''), 'removed');
  assert.equal(closeReason(4005, ''), 'frozen');
  assert.equal(closeReason(1008, 'frozen'), 'frozen');
  assert.equal(closeReason(4006, ''), 'copyEnded');
  assert.equal(closeReason(1008, 'invite'), 'invite');
  assert.equal(closeReason(1008, 'full'), 'full');
  assert.equal(closeReason(1006, ''), 'lost');
  assert.equal(closeReason(1000, 'bye'), 'lost');
});

test('rules: the note for something taken back says what and the most telling why', () => {
  assert.equal(undoneText(null, ['cost']), null);
  assert.equal(
    undoneText({ buildings: 2 }, ['pace', 'cost']),
    t('together.undone.buildings', { count: 2 }) + '. ' + t('together.why.cost')
  );
  assert.equal(
    undoneText({ levels: 1 }, undefined),
    t('together.undone.levels', { count: 1 }) + '. ' + t('together.why.count')
  );
  assert.ok(undoneText({ res: ['stone'] }, ['spot']).endsWith(t('together.why.spot')));
});

test('rules: you arrive beside the nearest friend who is online', () => {
  const players = new Map([
    ['a', { st: 'online', p: { x: 30, y: 0, z: 0 } }],
    ['b', { st: 'offline', p: { x: 1, y: 0, z: 0 } }],
    ['c', { st: 'online', p: { x: 5, y: 0, z: 0 } }],
    ['d', { st: 'online', p: null }]
  ]);
  assert.deepEqual(arrivalSpot(players, { x: 0, y: 0, z: 0 }), { x: 5, y: 0, z: 0 });
  const mine = { x: 9, y: 9, z: 0 };
  assert.equal(arrivalSpot(new Map(), mine), mine);
});

test('rules: your position says what you carry, checked as the room checks it', () => {
  const s = Core.createState(7);
  s.tools.basket = 1;
  s.tools.pickaxe = 1;
  const p = positionOf(s, { x: 2, y: 0 }, true, true, { a: null, n: 0 });
  assert.equal(p.gear, 3);
  assert.equal(p.fx, 1, 'facing is clamped');
  assert.equal(p.m, true);
  assert.equal(p.sign, true);
  assert.deepEqual(P.cleanPos(p), p);
});

test('arrival: a world made again clears what this phone kept of the old one', () => {
  const kept = new Map([
    [GEN_PREFIX + 'R', '1'],
    [SAVE_PREFIX + 'R', 'old'],
    [FOG_PREFIX + 'R', 'old'],
    [ACTS_PREFIX + 'R', 'old']
  ]);
  const read = (k) => (kept.has(k) ? kept.get(k) : null);
  const write = (k, v) => kept.set(k, v);
  assert.equal(checkMaking('R', { gen: 1 }, read, write), false);
  assert.equal(kept.get(SAVE_PREFIX + 'R'), 'old');
  assert.equal(checkMaking('R', { gen: 2 }, read, write), true);
  assert.equal(kept.get(SAVE_PREFIX + 'R'), '');
  assert.equal(kept.get(ACTS_PREFIX + 'R'), '');
  assert.equal(kept.get(GEN_PREFIX + 'R'), '2');
  assert.equal(renewedSince(null, 5), false, 'never here before: nothing to clear');
});

test('worlds: only a room service that says so makes a world gone', async () => {
  const answer =
    (body, ok = true) =>
    async () => ({ ok, json: async () => body });
  assert.equal(await roomGone('https://r', 'id', answer({ exists: false })), true);
  assert.equal(await roomGone('https://r', 'id', answer({ exists: true })), false);
  assert.equal(await roomGone('https://r', 'id', answer(null, false)), false);
  const down = async () => {
    throw new Error('offline');
  };
  assert.equal(await roomGone('https://r', 'id', down), false);
  assert.equal(await roomGone(null, 'id', answer({ exists: false })), false);
});

/* -------------------------------------------------- what the room says */

function handlerHarness() {
  const toasts = [],
    aways = [],
    shown = [];
  let changed = 0,
    updates = 0;
  const clock = manualClock(100);
  const game = {
    state: sharedState(),
    worldChanged: () => changed++,
    moveTo(p) {
      Object.assign(game.state.player, p);
    }
  };
  const friends = createFriends({ clock, actor: quietActor });
  friends.welcome(pid(0), 0, new Map(), []);
  const h = createRoomHandlers({
    game,
    hud: { toast: (m) => toasts.push(m) },
    friends,
    outbox: createOutbox(),
    sign: { show: (code, until) => shown.push({ code, until }) },
    here: () => 'roomA',
    invites: () => ({ received() {} }),
    onAway: (secs, made, fixed) => aways.push({ secs, made, fixed }),
    renderFriends() {},
    checkUpdate: () => updates++,
    clock
  });
  return {
    h,
    game,
    friends,
    toasts,
    aways,
    shown,
    clock,
    changed: () => changed,
    updates: () => updates
  };
}

test('handlers: unknown kinds are left alone; a malformed message changes nothing', () => {
  const { h, friends, shown } = handlerHarness();
  assert.equal(h.handle({ t: 'nonsense' }), false);
  assert.equal(h.handle({ t: 'status', id: 'not an id!', st: 'online', c: 1 }), true);
  assert.equal(friends.size, 0);
  h.handle({ t: 'invite', code: 'short', until: 5 });
  assert.deepEqual(shown, []);
});

test('handlers: a friend coming online is announced once and makes the game check for an update', () => {
  const { h, friends, toasts, updates } = handlerHarness();
  const id = pid('a');
  h.handle({ t: 'status', id, st: 'online', c: 2 });
  h.handle({ t: 'status', id, st: 'online', c: 2 });
  assert.equal(friends.size, 1);
  assert.equal(toasts.length, 1);
  assert.equal(updates(), 1);
});

test('handlers: someone’s crystal buildings replace theirs, only in this crystal world and only when they fit', () => {
  const x = handlerHarness();
  const s = Core.createState(7, { cultivation: true });
  Object.assign(s, { shared: 'roomA', acts: [], me: pid(0) });
  x.game.state = s;
  x.h.handle({ t: 'built', id: pid(1), b: [['chamber', 3, 4, -2, 1]] });
  assert.deepEqual(
    s.theirs.map((b) => [b.kind, b.x, b.by]),
    [['chamber', 3, pid(1)]]
  );
  assert.equal(x.changed(), 1);
  x.h.handle({ t: 'built', id: pid(1), b: [['vault', 5, 4, -2, 0]] });
  assert.deepEqual(
    s.theirs.map((b) => b.kind),
    ['vault']
  );
  for (const bad of [
    { t: 'built', id: 'nobody', b: [] },
    { t: 'built', id: pid(1), b: [['tower', 5, 4, -2, 0]] },
    { t: 'built', id: pid(1), b: 'vault' }
  ])
    x.h.handle(bad);
  assert.equal(s.theirs[0].kind, 'vault', 'a malformed one changes nothing');
  s.shared = 'roomB';
  x.h.handle({ t: 'built', id: pid(1), b: [] });
  assert.equal(s.theirs.length, 1, 'not for another world');
  assert.equal(x.changed(), 2);
});

test('handlers: a job asked at your crystal is done and written down; what came of yours is taken in', () => {
  const x = handlerHarness();
  const s = Core.createState(7, { cultivation: true });
  Object.assign(s, { shared: 'roomA', acts: [], me: pid(0) });
  s.cultivation.facilities.push({
    kind: 'chamber',
    id: 1,
    x: 3,
    y: 4,
    z: -2,
    buffer: 4,
    quality: 80
  });
  x.game.state = s;
  x.h.handle({ t: 'take', n: 7, k: 'collect', x: 3, y: 4, z: -2, by: pid(1) });
  assert.equal(s.cultivation.facilities[0].buffer, 0);
  assert.deepEqual(s.acts.at(-1).slice(0, 1).concat(s.acts.at(-1).slice(5)), ['t', 7]);
  assert.equal(x.toasts.length, 1, 'said who took it');
  x.h.handle({
    t: 'given',
    n: 8,
    k: 'collect',
    x: 9,
    y: 9,
    z: -2,
    by: pid(1),
    ok: true,
    c: 3,
    q: 90
  });
  assert.equal(s.inv.crystal, 3);
  assert.deepEqual(s.acts.at(-1).slice(0, 1).concat(s.acts.at(-1).slice(5)), ['g', 8]);
  for (const bad of [
    { t: 'take', n: 9, k: 'repair', x: 3, y: 4, z: -2, by: pid(1) },
    { t: 'given', n: 9, k: 'collect', x: 3, y: 4, z: -2, by: pid(1), ok: true, c: -3, q: 90 },
    { t: 'given', n: 'x', k: 'collect', x: 3, y: 4, z: -2, by: pid(1), ok: true, c: 3, q: 90 }
  ])
    x.h.handle(bad);
  assert.equal(s.inv.crystal, 3, 'a malformed one changes nothing');
  assert.equal(s.acts.length, 2);
});

test('handlers: a removed player takes their buildings; a frozen one leaves them', () => {
  const { h, game, friends, changed } = handlerHarness();
  const a = pid('a'),
    b = pid('b');
  h.handle({ t: 'status', id: a, st: 'online', c: 1 });
  h.handle({ t: 'status', id: b, st: 'online', c: 2 });
  game.state.extractors = [{ owner: a }, { owner: b }, { owner: pid(0) }];
  h.handle({ t: 'removed', id: a });
  assert.equal(friends.has(a), false);
  assert.deepEqual(
    game.state.extractors.map((e) => e.owner),
    [b, pid(0)]
  );
  assert.equal(changed(), 1);
  h.handle({ t: 'frozen', id: b });
  assert.equal(friends.has(b), false);
  assert.equal(game.state.extractors.length, 2, 'a frozen player keeps theirs');
});

test('handlers: time away lands in your packs, and only in the world it is for', () => {
  const { h, game, aways } = handlerHarness();
  const before = game.state.inv.stone || 0;
  h.handle({ t: 'away', secs: 60, made: { stone: 5 } });
  assert.equal(aways.length, 1);
  assert.ok(game.state.inv.stone > before);
  game.state.shared = 'otherRoom';
  h.handle({ t: 'away', secs: 60, made: { stone: 5 } });
  assert.equal(aways.length, 1, 'not for this world');
});

test('handlers: the room moving you is said, and notes of things taken back are spaced out', () => {
  const { h, game, toasts } = handlerHarness();
  h.handle({ t: 'place', p: { x: 3, y: 4, z: 0 } });
  assert.equal(game.state.player.x, 3);
  assert.deepEqual(toasts, [t('together.toast.placed')]);
  assert.ok(UNDONE_QUIET > 0);
});

// Some private modes throw on the very mention of localStorage. Since 0.194.0
// the game asks for the shared world it was in from a crystal world too, at
// boot: that must give "none", not stop the game (test/browser.e2e.js, storage off).
test('identity: storage that throws when reached gives nothing and keeps nothing, quietly', (t) => {
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('denied', 'SecurityError');
    }
  });
  t.after(() =>
    was ? Object.defineProperty(globalThis, 'localStorage', was) : delete globalThis.localStorage
  );
  assert.equal(playing(), null);
  assert.equal(read(PLAYING_STORE), null);
  assert.doesNotThrow(() => write(PLAYING_STORE, 'x'));
});
