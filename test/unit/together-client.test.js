/* The game's side of playing together (src/game/together.js), driven
 * against the real room rules (server/src/room.js) with a fake network, so
 * each test can force one ordering of events: a second tap while the first
 * is still connecting, an answer that arrives after the player moved on, a
 * connection that dies in the middle. The browser is faked just enough for
 * the module to run under Node. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { Room } from '../../server/src/room.js';
import * as Core from '../../src/core/index.js';
import { createBot } from './helpers.js';

/* ------------------------------------------------------- a fake browser */

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); }
};
globalThis.location = { origin: 'https://play.test', pathname: '/', search: '', hash: '', hostname: 'play.test' };
globalThis.history = { replaceState() { location.hash = ''; } };

// An element that takes whatever the module does to it.
function fakeEl() {
  const listeners = {};
  return {
    hidden: false, textContent: '', style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, append() {}, appendChild() {}, replaceChildren() {},
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    click() { for (const fn of listeners.click || []) fn({}); },
    getContext: () => ({ fillRect() {} })
  };
}
globalThis.document = { hidden: false, body: fakeEl(), createElement: fakeEl };

// Sockets the game opens. The test plays the room service: it opens them,
// answers their hello with the real room, and closes them.
const sockets = [];
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.room = url.match(/\/rooms\/([^/]+)\/ws$/)[1];
    this.readyState = 0;
    this.sent = [];
    sockets.push(this);
  }
  send(text) {
    if (this.readyState !== 1) throw new Error('send on a socket that is not open');
    this.sent.push(JSON.parse(text));
  }
  // The game closed it: a browser tells it so a moment later.
  close(code = 1000, reason = '') {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    this.closedWith = { code, reason };
    queueMicrotask(() => this.onclose?.({ code, reason }));
  }
  open() { this.readyState = 1; this.onopen?.(); }
  deliver(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  // The far end closed it (or the network did).
  lose(code = 1006, reason = '') {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}
globalThis.WebSocket = FakeSocket;

// The room creation call (POST /rooms): the test answers it when it likes.
let fetches = [];
globalThis.fetch = (url, opts = {}) => new Promise((resolve) => fetches.push({ url, opts, resolve }));
const answer = (f, status, body) => f.resolve({ ok: status < 300, status, json: async () => body });

const { createTogether } = await import('../../src/game/together.js');

/* ------------------------------------------------------- the harness */

const T0 = 1_700_000_000_000;
const open = () => sockets.filter((s) => s.readyState < 2);
const tick = () => new Promise((r) => setTimeout(r, 0));

function harness({ yes = true } = {}) {
  const toasts = [];
  const game = {
    state: Core.createState(7),
    replace(next) { game.state = next; },
    arrived() {},
    changedMode() {}, worldChanged() {}, moveTo() {},
    facing: () => ({ x: 0, y: 1 }), moving: () => false, act: () => ({ a: null, n: 0 })
  };
  const asked = [];
  const el = new Proxy({}, { get: (o, k) => (o[k] ||= fakeEl()) });
  const together = createTogether({
    game,
    hud: { toast: (m) => toasts.push(m) },
    ask: (q) => { asked.push(q); return Promise.resolve(typeof yes === 'function' ? yes(q) : yes); },
    el,
    nukeScreen: { show() {}, hide() {} },
    fbi: { show() {} }
  });
  return { together, game, toasts, asked, el };
}

// A real room with an owner in it, and a link for friends.
async function makeRoom() {
  const id = P.randomRoomId();
  const r = new Room(id, T0);
  const owner = P.randomHex(32);
  assert.equal(await r.init(JSON.stringify({ t: 'create', key: owner, world: { seed: 42, mods: [], props: [], ext: [] }, pos: { x: 0.5, y: 0.5, z: 0 } }), T0), null);
  const ownerId = await P.playerId(id, owner);
  const code = r.message(ownerId, JSON.stringify({ t: 'invite' }), T0).toSelf[0].code;
  return { id, r, code };
}

// The room service answers a socket's hello as the real room would.
async function serve(room, socket) {
  socket.open();
  const hello = socket.sent.find((m) => m.t === 'hello');
  const j = await room.join(hello.key, hello.code, T0);
  if (j.error) { socket.deliver({ t: j.error, ...(j.why ? { why: j.why } : {}) }); socket.lose(1008, j.error); return null; }
  socket.deliver(j.welcome);
  return j.id;
}

beforeEach(() => {
  store.clear();
  sockets.length = 0;
  fetches = [];
  location.hash = '';
});

/* ------------------------------------------------------------- tests */

test('client: Back to the shared world tapped twice opens one connection, not two', async () => {
  const { id, r, code } = await makeRoom();
  store.set('mte.rooms', JSON.stringify([id]));
  // In the world once already, so the key is known there.
  const first = harness();
  location.hash = '#join=' + id + '.' + code;
  first.together.joinFromLink();
  await tick();
  await serve(r, sockets[0]);
  first.together.leave();
  sockets.length = 0;

  const { together, toasts } = harness();
  together.rejoin();
  together.rejoin(); // the button is still there while it connects
  assert.equal(open().length, 1, 'one socket into the world');
  assert.ok(toasts.includes('Not connected yet, try again in a moment'), 'the second tap says it is still connecting');
  await serve(r, open()[0]);
  assert.ok(together.active);
});

test('client: a new connection always closes the one before it', async () => {
  // A connection to one world was still opening when the game went to
  // another (a link while reconnecting): the old socket must not stay open
  // as you, nor take the new one's place ("open on another screen").
  const a = await makeRoom(), b = await makeRoom();
  store.set('mte.playing', a.id);
  const { together } = harness();
  together.resume();
  assert.equal(open().length, 1);
  location.hash = '#join=' + b.id + '.' + b.code;
  together.joinFromLink();
  await tick();
  assert.equal(open().length, 1, 'only the newest socket is open');
  assert.equal(open()[0].room, b.id);
  await serve(b.r, open()[0]);
  assert.equal(together.active, true);
});

test('client: going online while the room is being made, then taking a link, keeps the link', async () => {
  const b = await makeRoom();
  const { together, game } = harness();
  const solo = game.state;
  together.start();
  await tick();
  assert.equal(fetches.length, 1, 'asking for a room');
  // Meanwhile a friend's link opens and the player says yes.
  location.hash = '#join=' + b.id + '.' + b.code;
  together.joinFromLink();
  await tick();
  // Now the room arrives: it mustn't pull the game away from the link.
  answer(fetches[0], 201, { room: P.randomRoomId() });
  await tick(); await tick();
  assert.equal(open().length, 1);
  assert.equal(open()[0].room, b.id, 'still going into the friend\'s world');
  await serve(b.r, open()[0]);
  assert.equal(game.state.shared, b.id);
  assert.notEqual(game.state, solo);
});

test('client: a second Invite tap while the first is making the room makes no second room', async () => {
  const { together, toasts } = harness();
  together.start();
  await tick();
  together.start();
  await tick();
  assert.equal(fetches.length, 1, 'one room asked for');
  assert.ok(toasts.includes('Not connected yet, try again in a moment'));
});

test('client: going online starts a new world from nothing, and your world here stays as it was', async () => {
  const { together, game } = harness();
  game.state.inv.stone = 1234;
  const soloSeed = game.state.seed;
  store.set('more-than-enough-save', 'the solo save');
  together.start();
  await tick();
  const sent = JSON.parse(fetches[0].opts.body);
  assert.equal(sent.save, undefined, 'no progress is sent');
  assert.deepEqual([sent.world.mods, sent.world.props, sent.world.ext], [[], [], []], 'nor what was built or dug');
  assert.notEqual(sent.world.seed, soloSeed, 'a new world');
  const id = P.randomRoomId();
  const r = new Room(id, T0);
  assert.equal(await r.init(JSON.stringify(sent), T0), null);
  answer(fetches[0], 201, { room: id });
  await tick(); await tick();
  await serve(r, open()[0]);
  assert.equal(game.state.shared, id);
  assert.equal(game.state.inv.stone, 0, 'everyone starts from nothing, you too');
  assert.equal(store.get('more-than-enough-save'), 'the solo save', 'your world here is kept for playing alone');
});

test('client: a failed go-online does not hold up the sign in the next world you enter', async () => {
  const { together, el } = harness();
  let up = 0;
  el.invite.classList.toggle = (cls, on) => { if (cls === 'up' && on) up++; };
  together.start();
  await tick();
  const madeId = P.randomRoomId();
  answer(fetches[0], 201, { room: madeId });
  await tick(); await tick();
  open()[0].lose(1006); // never got in: the service is down
  await tick();
  assert.equal(together.active, false);
  // Later the player goes into a friend's world.
  const b = await makeRoom();
  location.hash = '#join=' + b.id + '.' + b.code;
  together.joinFromLink();
  await tick();
  await serve(b.r, open()[0]);
  assert.equal(together.active, true);
  assert.equal(open()[0].sent.filter((m) => m.t === 'invite').length, 0, 'no invite asked for');
  assert.equal(up, 0, 'the sign stays down');
});

test('client: opening the game through a link and saying no goes back into your shared world', async () => {
  const a = await makeRoom(), b = await makeRoom();
  store.set('mte.playing', a.id);
  location.hash = '#join=' + b.id + '.' + b.code;
  const { together } = harness({ yes: false });
  together.open();
  await tick();
  assert.equal(open().length, 1, 'back into the world you were in');
  assert.equal(open()[0].room, a.id);
});

test('client: opening the game through a dead link goes back into your shared world', async () => {
  const a = await makeRoom(), b = await makeRoom();
  // You were in world a (so it knows you).
  const keyHolder = harness();
  location.hash = '#join=' + a.id + '.' + a.code;
  keyHolder.together.joinFromLink();
  await tick();
  await serve(a.r, open()[0]);
  sockets.length = 0;
  store.set('mte.playing', a.id);
  b.r.message([...b.r.players.keys()][0], JSON.stringify({ t: 'revoke', code: b.code }), T0);
  location.hash = '#join=' + b.id + '.' + b.code;
  const { together, toasts, game } = harness();
  together.open();
  await tick();
  await serve(b.r, open()[0]);
  await tick();
  assert.ok(toasts.includes('That invite link was stopped: ask for a new one'));
  assert.equal(open().length, 1);
  assert.equal(open()[0].room, a.id, 'back to the world you were in, not alone');
  await serve(a.r, open()[0]);
  assert.equal(game.state.shared, a.id);
});

/* ------------------------------------------- dead connections and edits */

// Plays the room service for one connected player: everything the game
// sent since last time goes to the real room, and its answers come back.
function pump(room, id, socket, now = T0 + 1000) {
  socket.done ||= 1; // the hello
  for (; socket.done < socket.sent.length; socket.done++) {
    const m = socket.sent[socket.done];
    if (m === 'ping') { socket.onmessage?.({ data: 'pong' }); continue; }
    const r = room.message(id, JSON.stringify(m), now);
    for (const x of [...(r.toSelf || []), ...(r.toAll || [])]) socket.deliver(x);
  }
}
// The fake socket keeps what was sent as JSON; a ping is plain text.
const parseSent = FakeSocket.prototype.send;
FakeSocket.prototype.send = function (text) {
  if (text === 'ping') { if (this.readyState !== 1) throw new Error('closed'); this.sent.push('ping'); return; }
  parseSent.call(this, text);
};

// Into world `w` with a fresh game, standing where the room has you.
async function inWorld(w) {
  const h = harness();
  location.hash = '#join=' + w.id + '.' + w.code;
  h.together.joinFromLink();
  await tick();
  const id = await serve(w.r, open()[0]);
  Object.assign(h.game.state.player, { x: 0.5, y: 0.5, z: 0 });
  h.together.tick(0.2); // says where it stands
  pump(w.r, id, open()[0]);
  return { ...h, id };
}

// Mines the tile next to you: the game's own edit, as the controller makes it.
function mine(game, dx) {
  const key = Core.packKey(dx, 0, 0);
  game.state.world.edits.push(['m', key, 0]);
  return key;
}

test('client: a connection that dies without closing is noticed, and the game reconnects', async () => {
  const w = await makeRoom();
  const { together, toasts } = await inWorld(w);
  const socket = open()[0];
  // Pings go out and are answered: all is well.
  for (let i = 0; i < 100; i++) { together.tick(0.1); pump(w.r, null, socket); }
  assert.ok(socket.sent.includes('ping'), 'it asks the room now and then');
  assert.equal(open().length, 1);
  assert.equal(socket.readyState, 1, 'answered pings keep it');
  // Now the network swallows everything, and nothing closes.
  for (let i = 0; i < 200 && socket.readyState === 1; i++) together.tick(0.1);
  assert.equal(socket.readyState, 3, 'the silent connection is dropped');
  assert.ok(toasts.includes('Connection lost, reconnecting…'), 'the player is told');
  await new Promise((r) => setTimeout(r, 1100)); // the first retry
  assert.equal(open().length, 1, 'and it tries again');
});

test('client: edits a dead connection swallowed are sent again once back', async () => {
  const w = await makeRoom();
  const { together, game, id } = await inWorld(w);
  const first = open()[0];
  const kept = mine(game, 1);
  together.tick(0.3);
  pump(w.r, id, first); // that one arrives and is answered
  const swallowed = mine(game, 2);
  together.tick(0.3);   // sent into a connection that's already dead
  assert.ok(first.sent.some((m) => m.t === 'edits' && m.e[0][1] === swallowed));
  assert.ok(w.r.mods.has(kept) && !w.r.mods.has(swallowed), 'the room never got the second');
  first.lose(1006);
  await new Promise((r) => setTimeout(r, 1100));
  const again = open()[0];
  await serve(w.r, again);
  together.tick(0.3);
  pump(w.r, id, again);
  assert.ok(w.r.mods.has(swallowed), 'the swallowed edit reached the room after all');
  assert.equal(again.sent.filter((m) => m.t === 'edits').flatMap((m) => m.e).filter((e) => e[1] === kept).length, 0, 'the answered one is not sent twice');
});

test('client: a lost edit where someone has changed the tile since is not sent over theirs', async () => {
  const w = await makeRoom();
  const { together, game, id } = await inWorld(w);
  const first = open()[0];
  const key = mine(game, 3);
  together.tick(0.3); // sent, never arrives
  // The owner changes that tile meanwhile.
  const ownerId = [...w.r.players.keys()].find((p) => p !== id);
  w.r.players.get(ownerId).p = { x: 0.5, y: 0.5, z: 0 };
  w.r.message(ownerId, JSON.stringify({ t: 'edits', e: [['m', key, 7]] }), T0 + 500);
  first.lose(1006);
  await new Promise((r) => setTimeout(r, 1100));
  const again = open()[0];
  await serve(w.r, again);
  together.tick(0.3);
  pump(w.r, id, again);
  assert.equal(w.r.mods.get(key), 7, 'the room keeps what the owner did');
});

test('client: a room from before pings and acks is never pinged, and edits go out as before', async () => {
  const w = await makeRoom();
  const h = harness();
  location.hash = '#join=' + w.id + '.' + w.code;
  h.together.joinFromLink();
  await tick();
  const socket = open()[0];
  socket.open();
  const hello = socket.sent[0];
  const j = await w.r.join(hello.key, hello.code, T0);
  const { pong, ack, ...old } = j.welcome; // an older room says neither
  socket.deliver(old);
  for (let i = 0; i < 300; i++) h.together.tick(0.1);
  assert.equal(socket.sent.includes('ping'), false);
  assert.equal(socket.readyState, 1, 'and silence alone never drops it');
  mine(h.game, 1);
  h.together.tick(0.3);
  const edits = socket.sent.filter((m) => m.t === 'edits');
  assert.ok(edits.length && edits.every((m) => !('n' in m)));
});

test('client: what you did goes to the room before the edits it made, and before your progress', async () => {
  const w = await makeRoom();
  const { together, game, id } = await inWorld(w);
  const socket = open()[0];
  assert.ok(Array.isArray(game.state.acts), 'the room asked for acts');
  Core.noteAct(game.state, 'c');
  mine(game, 1);
  together.tick(0.3);
  const kinds = socket.sent.slice(socket.done).map((m) => m.t || m);
  assert.ok(kinds.indexOf('acts') >= 0 && kinds.indexOf('acts') < kinds.indexOf('edits'), kinds.join());
  Core.noteAct(game.state, 'c');
  together.save(game.state, true);
  const after = socket.sent.slice(socket.sent.length - 2).map((m) => m.t);
  assert.deepEqual(after, ['acts', 'save']);
  pump(w.r, id, socket);
});

test('client: a room from before acts gets none', async () => {
  const w = await makeRoom();
  const h = harness();
  location.hash = '#join=' + w.id + '.' + w.code;
  h.together.joinFromLink();
  await tick();
  const socket = open()[0];
  socket.open();
  const j = await w.r.join(socket.sent[0].key, socket.sent[0].code, T0);
  const { acts, ...old } = j.welcome;
  socket.deliver(old);
  assert.equal(h.game.state.acts, null);
});

test('client: progress the room can\'t account for is set straight, and stays straight', async () => {
  const w = await makeRoom();
  const { together, game, id } = await inWorld(w);
  const socket = open()[0];
  together.save(game.state, true); // an honest save first, at the same play time
  pump(w.r, id, socket, T0 + 1500);
  game.state.inv.stone = 5e8; // then an edited game
  game.state.tools.pickaxe = 4;
  together.save(game.state, true);
  pump(w.r, id, socket, T0 + 2000);
  assert.equal(game.state.inv.stone, 0, 'the room\'s numbers, answering the save they were sent for');
  assert.equal(game.state.tools.pickaxe, 1);
  const drifts = w.r.log.filter((e) => e.e === 'drift').length;
  together.save(game.state, true);
  pump(w.r, id, socket, T0 + 70_000);
  assert.equal(w.r.shadow.report(id).off, 1, 'and it stays straight: the next save agrees');
  assert.equal(w.r.log.filter((e) => e.e === 'drift').length, drifts);
});

test('client: the owner of a new world plays it, and the room counts what they do', async () => {
  const { together, game } = harness();
  together.start();
  await tick();
  const sent = JSON.parse(fetches[0].opts.body);
  const id = P.randomRoomId();
  const r = new Room(id, T0);
  assert.equal(await r.init(JSON.stringify(sent), T0), null);
  answer(fetches[0], 201, { room: id });
  await tick(); await tick();
  const socket = open()[0];
  const me = await serve(r, socket);
  let now = T0;
  const bot = createBot(sent.world.seed, game.state, () => { together.tick(0.1); pump(r, me, socket, now = T0 + Math.round(game.state.stats.playedMs) + 500); });
  bot.gather('stone', 8);
  bot.gather('mycelium', 6);
  together.save(game.state, true);
  pump(r, me, socket, now + 100);
  assert.deepEqual(r.log.filter((e) => e.e === 'drift'), [], 'the room agrees');
  assert.ok(game.state.inv.stone >= 8, 'and the stone stays');
});
