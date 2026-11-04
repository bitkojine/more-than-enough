/* A room's Durable Object (server/src/worker.js Rooms) on test storage
 * (durable.js), with the few runtime pieces a socket's arrival needs that
 * Node lacks: a WebSocketPair, and a Response that may carry a socket
 * (Node's refuses status 101). Shared by the worker-*.test.js files. */

import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { registerCloudflare, Storage, Socket, makeEnv, start } from './durable.js';

registerCloudflare();
const { Rooms } = await import('../../server/src/worker.js');
export { Rooms, Storage, Socket, makeEnv, start };

// One clock for the room and the test: `now.t`.
export const now = { t: 1_700_000_000_000 };
const realNow = Date.now;
const RealResponse = globalThis.Response;
let pairCtx = null; // the room whose fetch makes the next socket

export function install(after) {
  Date.now = () => now.t;
  globalThis.Response = class {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.webSocket = init.webSocket ?? null;
    }
  };
  globalThis.WebSocketPair = class {
    constructor() {
      this[0] = { client: true };
      this[1] = new Socket(pairCtx);
    }
  };
  after(() => {
    Date.now = realNow;
    globalThis.Response = RealResponse;
    delete globalThis.WebSocketPair;
  });
}

// A fresh shared world in a room, nobody in it yet.
export async function makeRoom() {
  now.t = 1_700_000_000_000;
  const storage = new Storage(),
    env = makeEnv();
  const room = await start(Rooms, storage, env);
  const id = P.randomRoomId(),
    key = P.randomHex(32);
  const world = { seed: 12345, mods: [], props: [], ext: [] };
  assert.equal(await room.create(id, JSON.stringify({ t: 'create', key, world }), true), null);
  await env.REGISTRY.get().add(id);
  return { storage, env, room, id, key, r: room.room };
}

// A socket the runtime accepted, that has said nothing yet.
export function stranger(g, v = 'test', at = now.t) {
  const ws = new Socket(g.room.ctx);
  g.room.ctx.acceptWebSocket(ws);
  ws.serializeAttachment({ id: null, at, v });
  return ws;
}

// A socket that said hello with `key` (and an invite `code`).
export async function join(g, key = g.key, code, also = {}) {
  const ws = stranger(g);
  await say(g, ws, { t: 'hello', key, code, ...also });
  return ws;
}

export const say = (g, ws, msg) =>
  g.room.webSocketMessage(ws, typeof msg === 'string' ? msg : JSON.stringify(msg));

export const idOf = (ws) => ws.deserializeAttachment()?.id ?? null;

// The creator and a friend they brought in with an invite link.
export async function twoPlayers() {
  const g = await makeRoom();
  const a = await join(g);
  await say(g, a, { t: 'invite', uses: 3, life: 1440 });
  const [{ code }] = a.got('invite');
  const b = await join(g, P.randomHex(32), code);
  assert.ok(idOf(a) && idOf(b) && idOf(a) !== idOf(b));
  return { ...g, a, b };
}

// What the room's fetch answers a socket asking to join `id`.
export function knock(g, { id = g.id, visitor = 'v1' } = {}) {
  pairCtx = g.room.ctx;
  const headers = new Headers({ 'X-Room-Id': id });
  if (visitor !== null) headers.set('X-Visitor', visitor);
  return g.room.fetch({ headers });
}
