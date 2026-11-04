/* A fake browser and network for the game's side of playing together
 * (src/game/together.js), shared by the together-client*.test.js files:
 * just enough page for the module to run under Node, sockets the test opens
 * and closes itself, and the real room rules (server/src/room.js) behind
 * them, so each test can force one ordering of events. */

import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { Room } from '../../server/src/room.js';
import * as Core from '../../src/core/index.js';

/* ------------------------------------------------------- a fake browser */

export const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    store.set(k, String(v));
  },
  removeItem: (k) => {
    store.delete(k);
  },
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  }
};
globalThis.location = {
  origin: 'https://play.test',
  pathname: '/',
  search: '',
  hash: '',
  hostname: 'play.test'
};
globalThis.history = {
  replaceState() {
    location.hash = '';
  }
};

// An element that takes whatever the module does to it.
function fakeEl() {
  const listeners = {};
  return {
    hidden: false,
    textContent: '',
    style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    append() {},
    appendChild() {},
    replaceChildren() {},
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    click() {
      for (const fn of listeners.click || []) fn({});
    },
    getContext: () => ({ fillRect() {} })
  };
}
globalThis.document = { hidden: false, body: fakeEl(), createElement: fakeEl };

// Sockets the game opens. The test plays the room service: it opens them,
// answers their hello with the real room, and closes them.
export const sockets = [];
export class FakeSocket {
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
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  deliver(msg) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  // The far end closed it (or the network did).
  lose(code = 1006, reason = '') {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}
globalThis.WebSocket = FakeSocket;

export const { createTogether } = await import('../../src/game/together.js');

/* ------------------------------------------------------- the harness */

export const T0 = 1_700_000_000_000;
export const open = () => sockets.filter((s) => s.readyState < 2);
export const tick = () => new Promise((r) => setImmediate(r));

export function harness({ yes = true } = {}) {
  const toasts = [],
    aways = [],
    seen = { fbi: 0, updates: 0 };
  const game = {
    state: Core.createState(7),
    replace(next) {
      game.state = next;
    },
    arrived() {},
    changedMode() {},
    worldChanged() {},
    moveTo() {},
    facing: () => ({ x: 0, y: 1 }),
    moving: () => false,
    act: () => ({ a: null, n: 0 })
  };
  const asked = [];
  const el = new Proxy({}, { get: (o, k) => (o[k] ||= fakeEl()) });
  const together = createTogether({
    game,
    hud: { toast: (m) => toasts.push(m) },
    ask: (q) => {
      asked.push(q);
      return Promise.resolve(typeof yes === 'function' ? yes(q) : yes);
    },
    el,
    fbi: {
      show() {
        seen.fbi++;
      }
    },
    checkUpdate: () => {
      seen.updates++;
    },
    onAway: (secs, made) => aways.push({ secs, made })
  });
  return { together, game, toasts, asked, el, aways, seen };
}

// A real room with its maker in it, and a link for friends.
export async function makeRoom() {
  const id = P.randomRoomId();
  const r = new Room(id, T0);
  const maker = P.randomHex(32);
  assert.equal(
    await r.init(
      JSON.stringify({
        t: 'create',
        key: maker,
        world: { seed: 42, mods: [], props: [], ext: [] },
        pos: { x: 0.5, y: 0.5, z: 0 }
      }),
      T0
    ),
    null
  );
  const makerId = await P.playerId(id, maker);
  const code = r.message(makerId, JSON.stringify({ t: 'invite' }), T0).toSelf[0].code;
  return { id, r, code };
}

// A world Watch made, gone into by its maker: the room was made with the
// same key the player holds (`mte.key` is who you are to every room).
export async function madeWorld(seed = 42) {
  const key = P.randomHex(32);
  store.set('mte.key', key);
  const id = P.randomRoomId();
  const r = new Room(id, T0);
  assert.equal(
    await r.init(
      JSON.stringify({
        t: 'create',
        key,
        world: { seed, mods: [], props: [], ext: [] },
        pos: { x: 0.5, y: 0.5, z: 0 }
      }),
      T0
    ),
    null
  );
  const makerId = await P.playerId(id, key);
  const code = r.message(makerId, JSON.stringify({ t: 'invite' }), T0).toSelf[0].code;
  return { id, r, code };
}

// The room service answers a socket's hello as the real room would.
export async function serve(room, socket) {
  socket.open();
  const hello = socket.sent.find((m) => m.t === 'hello');
  const j = await room.join(hello.key, hello.code, T0);
  if (j.error) {
    socket.deliver({ t: j.error, ...(j.why ? { why: j.why } : {}) });
    socket.lose(1008, j.error);
    return null;
  }
  socket.deliver(j.welcome);
  return j.id;
}

// Plays the room service for one connected player: everything the game
// sent since last time goes to the real room, and its answers come back.
export function pump(room, id, socket, now = T0 + 1000) {
  socket.done ||= 1; // the hello
  for (; socket.done < socket.sent.length; socket.done++) {
    const m = socket.sent[socket.done];
    if (m === 'ping') {
      socket.onmessage?.({ data: 'pong' });
      continue;
    }
    const r = room.message(id, JSON.stringify(m), now);
    for (const x of [...(r.toSelf || []), ...(r.toAll || [])]) socket.deliver(x);
  }
}
// The fake socket keeps what was sent as JSON; a ping is plain text.
const parseSent = FakeSocket.prototype.send;
FakeSocket.prototype.send = function (text) {
  if (text === 'ping') {
    if (this.readyState !== 1) throw new Error('closed');
    this.sent.push('ping');
    return;
  }
  parseSent.call(this, text);
};

// Into world `w` with a fresh game, standing where the room has you.
export async function inWorld(w) {
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
export function mine(game, dx) {
  const key = Core.packKey(dx, 0, 0);
  game.state.world.edits.push(['m', key, 0]);
  return key;
}
// Each test starts with an empty page and no sockets.
export function reset() {
  store.clear();
  sockets.length = 0;
  location.hash = '';
}
