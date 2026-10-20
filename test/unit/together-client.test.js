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
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; }
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

const { createTogether } = await import('../../src/game/together.js');

/* ------------------------------------------------------- the harness */

const T0 = 1_700_000_000_000;
const open = () => sockets.filter((s) => s.readyState < 2);
const tick = () => new Promise((r) => setTimeout(r, 0));

function harness({ yes = true } = {}) {
  const toasts = [], aways = [];
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
    fbi: { show() {} },
    onAway: (secs, made) => aways.push({ secs, made })
  });
  return { together, game, toasts, asked, el, aways };
}

// A real room with its maker in it, and a link for friends.
async function makeRoom() {
  const id = P.randomRoomId();
  const r = new Room(id, T0);
  const maker = P.randomHex(32);
  assert.equal(await r.init(JSON.stringify({ t: 'create', key: maker, world: { seed: 42, mods: [], props: [], ext: [] }, pos: { x: 0.5, y: 0.5, z: 0 } }), T0), null);
  const makerId = await P.playerId(id, maker);
  const code = r.message(makerId, JSON.stringify({ t: 'invite' }), T0).toSelf[0].code;
  return { id, r, code };
}

// A world Watch made, gone into by its maker: the room was made with the
// same key the player holds (`mte.key` is who you are to every room).
async function madeWorld(seed = 42) {
  const key = P.randomHex(32);
  store.set('mte.key', key);
  const id = P.randomRoomId();
  const r = new Room(id, T0);
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world: { seed, mods: [], props: [], ext: [] }, pos: { x: 0.5, y: 0.5, z: 0 } }), T0), null);
  const makerId = await P.playerId(id, key);
  const code = r.message(makerId, JSON.stringify({ t: 'invite' }), T0).toSelf[0].code;
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
  location.hash = '';
});

/* ------------------------------------------------------------- tests */

test('client: Play on a world tapped twice opens one connection, not two', async () => {
  const { id, r, code } = await makeRoom();
  // In the world once already, so the key is known there.
  const first = harness();
  location.hash = '#join=' + id + '.' + code;
  first.together.joinFromLink();
  await tick();
  await serve(r, sockets[0]);
  first.together.switchTo(null);
  sockets.length = 0;

  const { together } = harness();
  together.switchTo(id);
  together.switchTo(id); // the list is still there while it connects
  assert.equal(open().length, 1, 'one socket into the world');
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

test('client: a failed entry does not hold up the sign in the next world you enter', async () => {
  const { together, el } = harness();
  let up = 0;
  el.invite.classList.toggle = (cls, on) => { if (cls === 'up' && on) up++; };
  const a = await makeRoom();
  location.hash = '#join=' + a.id + '.' + a.code;
  together.joinFromLink();
  await tick();
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

test('client: when the network comes back, the game reconnects at once, not after its wait', async () => {
  const w = await makeRoom();
  const { together } = await inWorld(w);
  open()[0].lose();
  await tick();
  assert.equal(open().length, 0, 'waiting to try again');
  together.online();
  assert.equal(open().length, 1, 'tries now');
  together.online();
  assert.equal(open().length, 1, 'and only once');
  // Coming back on screen does the same.
  open()[0].lose();
  await tick();
  together.away(false);
  assert.equal(open().length, 1, 'back on screen, it tries now');
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
  // The friend changes that tile meanwhile.
  const friendId = [...w.r.players.keys()].find((p) => p !== id);
  // (Straight into the room: a made-up richness the tile never had, which
  // an edit from a game couldn't raise it to.)
  w.r.apply(['m', key, 7], friendId);
  first.lose(1006);
  await new Promise((r) => setTimeout(r, 1100));
  const again = open()[0];
  await serve(w.r, again);
  together.tick(0.3);
  pump(w.r, id, again);
  assert.equal(w.r.mods.get(key), 7, 'the room keeps what the friend did');
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

test('client: the maker of a new world plays it, and the room counts what they do', async () => {
  const w = await madeWorld();
  const { together, game } = harness();
  location.hash = '#join=' + w.id + '.' + w.code;
  together.joinFromLink();
  await tick();
  const socket = open()[0];
  const me = await serve(w.r, socket);
  let now = T0;
  const bot = createBot(42, game.state, () => { together.tick(0.1); pump(w.r, me, socket, now = T0 + Math.round(game.state.stats.playedMs) + 500); });
  bot.gather('stone', 8);
  bot.gather('mycelium', 6);
  together.save(game.state, true);
  pump(w.r, me, socket, now + 100);
  assert.deepEqual(w.r.log.filter((e) => e.e === 'drift'), [], 'the room agrees');
  assert.ok(game.state.inv.stone >= 8, 'and the stone stays');
});

// A new world's maker playing it: the game, the room and the clock between
// them. What the room writes goes to `stored` as the room service's storage
// keeps it, so the room can restart from it.
async function playing() {
  const w = await madeWorld();
  const h = harness();
  const g = { ...h, r: w.r, stored: new Map([['id', w.id]]) };
  location.hash = '#join=' + w.id + '.' + w.code;
  h.together.joinFromLink();
  await tick();
  g.me = await serve(g.r, open()[0]);
  g.clock = () => T0 + Math.round(h.game.state.stats.playedMs) + 500;
  g.pump = (now = g.clock()) => {
    const socket = open()[0];
    if (socket && !g.swallowing) pump(g.r, g.me, socket, now);
    for (const [k, v] of g.r.takeWrites()) if (v === null) g.stored.delete(k); else g.stored.set(k, structuredClone(v));
  };
  g.bot = createBot(42, h.game.state, () => { h.together.tick(0.1); g.pump(); });
  return g;
}

// The connection drops and the game comes back on a new one.
async function reconnect(g) {
  open()[0].lose(1006);
  await new Promise((res) => setTimeout(res, 1100));
  await serve(g.r, open()[0]);
  g.together.tick(0.3);
  g.pump();
  g.together.save(g.game.state, true);
  g.pump(g.clock() + 100);
}

const driftsIn = (r) => r.log.filter((e) => e.e === 'drift');

test('client: what you did on a connection that was already dead is sent again once back', async () => {
  const g = await playing();
  g.bot.gather('mycelium', 4);
  g.together.save(g.game.state, true);
  g.pump();
  g.swallowing = true;        // sent, never arrives
  g.bot.gather('mycelium', 9);
  g.swallowing = false;
  await reconnect(g);
  assert.deepEqual(driftsIn(g.r), [], 'the room got all of it: no drift');
  assert.ok(g.game.state.inv.mycelium >= 9, 'and nothing gathered is taken back (' + g.game.state.inv.mycelium + ')');
  assert.equal(g.r.shadow.report(g.me).refused, 0, 'nothing done twice');
});

test('client: a room that restarts (a deploy) between your saves loses nothing you did', async () => {
  const g = await playing();
  g.bot.gather('mycelium', 4);
  g.together.save(g.game.state, true);
  g.pump();
  g.bot.gather('mycelium', 9); // the room does these and keeps the world's edits...
  g.bot.gather('stone', 3);
  g.r = Room.restore(g.r.id, new Map(g.stored), g.clock()); // ...then restarts from what it kept
  await reconnect(g);
  assert.deepEqual(driftsIn(g.r), [], 'the room\'s copy is where the game is: no drift');
  assert.ok(g.game.state.inv.mycelium >= 9 && g.game.state.inv.stone >= 3, 'and nothing gathered is taken back');
});

// What your game shows as yours: buildings by place.
const mineIn = (s) => s.extractors.filter((e) => e.owner === s.me).map((e) => e.x + ',' + e.y);

test('client: a correction from the room keeps your buildings, and says what it took back and why', async () => {
  const g = await playing();
  const { s } = g.bot;
  assert.ok(g.bot.buildNow('garden').ok);
  g.together.tick(0.3); g.pump();
  g.together.save(s, true); g.pump();
  const built = mineIn(s);
  assert.equal(built.length, 1);
  s.inv.stone += 5000; // the game counts more than the room
  g.together.save(s, true); g.pump();
  assert.ok(s.inv.stone < 5000, 'the room\'s numbers');
  assert.deepEqual(mineIn(s), built, 'your building still stands');
  assert.ok(g.toasts.includes('Taken back: some of your stone. The world keeps count of what everyone has, and its count differed from your game\'s'), g.toasts.at(-1));
  const off = g.r.shadow.report(g.me).off;
  g.together.save(s, true); g.pump(g.clock() + 70_000);
  assert.equal(g.r.shadow.report(g.me).off, off, 'and the next progress agrees');
});

test('client: a building put up while the room was answering stays, and goes up once', async () => {
  const g = await playing();
  const { s } = g.bot;
  g.bot.gather('mycelium', 40);
  g.together.tick(0.3); g.pump();
  s.inv.ore += 50;                 // a difference the room corrects...
  g.together.save(s, true);
  assert.ok(g.bot.standBy(g.bot.free(Core.T.FOREST)));
  assert.ok(Core.place(s, 'garden').ok); // ...and a building put up before its answer
  g.pump();
  assert.equal(mineIn(s).length, 1, 'the answer doesn\'t take it down');
  g.together.tick(0.3); g.pump();
  assert.equal(mineIn(s).length, 1, 'and the room\'s word of it adds no second one');
  assert.equal(g.r.ext.length, 1);
});

test('client: a building the room couldn\'t pay for comes down, and the player is told why', async () => {
  const g = await playing();
  const { s } = g.bot;
  g.together.tick(0.3); g.pump();
  g.together.save(s, true); g.pump();
  s.inv.mycelium += 200;           // more than the room counts
  assert.ok(g.bot.standBy(g.bot.free(Core.T.FOREST)));
  assert.ok(Core.place(s, 'garden').ok);
  g.together.tick(0.3); g.pump();
  g.together.save(s, true); g.pump();
  assert.deepEqual(mineIn(s), [], 'not in the world, so not in your game');
  assert.equal(g.r.ext.length, 0);
  assert.ok(g.toasts.includes('A building of yours was taken down. The world counted fewer resources for you than your game showed, so it couldn\'t be paid for'), g.toasts.at(-1));
});

/* ---------------------------------------------------- the Worlds list */

test('client: every world has a two-word name, the same each time, and the join question says it', async () => {
  const { worldName } = await import('../../src/game/worlds.js');
  const { id, code } = await makeRoom();
  const name = worldName(id);
  assert.match(name, /^\S+ \S+$/, 'two words');
  assert.equal(worldName(id), name, 'the same id, the same name');
  const names = new Set(Array.from({ length: 200 }, () => worldName(P.randomRoomId())));
  assert.ok(names.size > 100, 'worlds rarely share a name (' + names.size + ' of 200)');
  const { together, asked } = harness({ yes: false });
  location.hash = '#join=' + id + '.' + code;
  together.joinFromLink();
  await tick();
  assert.equal(asked[0].title, 'Join ' + name + '?');
});

test('client: a link to a world you are in already takes you there without asking, and you can switch back', async () => {
  const a = await makeRoom(), b = await makeRoom();
  const { together, asked, toasts } = harness();
  // Into a, then b, through their links: one question each, each named.
  for (const w of [a, b]) {
    location.hash = '#join=' + w.id + '.' + w.code;
    together.joinFromLink();
    await tick();
    await serve(w.r, open()[0]);
  }
  assert.equal(asked.length, 2);
  const { worldName } = await import('../../src/game/worlds.js');
  assert.ok(toasts.includes("You're in " + worldName(b.id)));
  assert.equal(together.worldName, worldName(b.id));
  // a's old link again: straight back to a, no question.
  location.hash = '#join=' + a.id + '.' + a.code;
  together.joinFromLink();
  await tick();
  assert.equal(asked.length, 2, 'no question for a world you are in');
  assert.equal(open().length, 1);
  assert.equal(open()[0].room, a.id);
  await serve(a.r, open()[0]);
  assert.equal(together.worldName, worldName(a.id));
  // The same link while there: just says so.
  location.hash = '#join=' + a.id + '.' + a.code;
  together.joinFromLink();
  await tick();
  assert.ok(toasts.includes("You're already in " + worldName(a.id)));
  assert.equal(open().length, 1, 'the connection stays');
  // Back to your own world from the list.
  together.switchTo(null);
  assert.equal(together.active, false);
  assert.equal(together.worldName, 'Your own world');
});

test('client: what the room says your buildings made while away lands in your packs, once, and is said', async () => {
  const w = await makeRoom();
  const { game, aways } = await inWorld(w);
  const socket = open()[0];
  const before = game.state.inv.mycelium;
  socket.deliver({ t: 'away', secs: 3600, made: { mycelium: 50 } });
  assert.equal(game.state.inv.mycelium, before + 50);
  assert.deepEqual(aways, [{ secs: 3600, made: { ...Object.fromEntries(Core.RESOURCES.map((r) => [r, 0])), mycelium: 50 } }]);
  socket.deliver({ t: 'away', secs: 3600, made: { mycelium: -5 } }); // nonsense: ignored
  socket.deliver({ t: 'away', secs: 'soon', made: { mycelium: 5 } });
  assert.equal(game.state.inv.mycelium, before + 50);
  assert.equal(aways.length, 1);
});
