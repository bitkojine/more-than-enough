/* A Durable Object's world, in Node: enough of Cloudflare's runtime for the
 * room service's real code (server/src/worker.js) to run in a test, and to
 * fail the way storage can.
 *
 * - `cloudflare:workers` resolves to a stub (register() below, before
 *   worker.js is imported).
 * - Storage keeps structured copies, as the real one does. Writes issued
 *   with no await between them commit together or not at all (write
 *   coalescing), and `failNext()` makes the next such commit fail. (No limit
 *   on keys per put: a room's first write puts every piece of its land,
 *   500-odd keys, and the live service takes it.)
 * - Its SQL is node:sqlite, behind the few calls worker.js makes.
 * - A restart is a new object on the same storage (`restart`), with the
 *   sockets the runtime kept (hibernation) or none (a deploy). */

import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

// Call once, before importing worker.js.
export function registerCloudflare() {
  const stub = 'data:text/javascript,' + encodeURIComponent('export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
  const hooks = `export async function resolve(spec, ctx, next) { return spec === 'cloudflare:workers' ? { url: ${JSON.stringify(stub)}, shortCircuit: true } : next(spec, ctx); }`;
  register('data:text/javascript,' + encodeURIComponent(hooks));
  globalThis.WebSocketRequestResponsePair ??= class { constructor(request, response) { this.request = request; this.response = response; } };
}

export class Storage {
  constructor() {
    this.data = new Map();
    this.alarm = null;
    this.db = new DatabaseSync(':memory:');
    this.batch = null;    // writes waiting to commit together
    this.failing = 0;     // commits still to fail
    this.commits = 0;
    this.sql = {
      exec: (query, ...params) => {
        const st = this.db.prepare(query);
        const rows = /^\s*select/i.test(query) ? st.all(...params) : (st.run(...params), []);
        return { toArray: () => rows, one: () => rows[0] };
      }
    };
  }

  // The next `n` commits fail, and write nothing.
  failNext(n = 1) { this.failing += n; }

  // Queues a write; writes queued in the same turn commit together.
  write(apply) {
    if (!this.batch) {
      const batch = this.batch = { ops: [], done: null };
      batch.done = new Promise((resolve, reject) => queueMicrotask(() => {
        this.batch = null;
        if (this.failing > 0) { this.failing--; return reject(new Error('storage: the write failed')); }
        for (const op of batch.ops) op();
        this.commits++;
        resolve();
      }));
    }
    this.batch.ops.push(apply);
    return this.batch.done;
  }

  async get(key) {
    if (Array.isArray(key)) return new Map(key.filter((k) => this.data.has(k)).map((k) => [k, structuredClone(this.data.get(k))]));
    return structuredClone(this.data.get(key));
  }

  put(key, value) {
    const entries = typeof key === 'string' ? [[key, value]] : Object.entries(key);
    const copies = entries.map(([k, v]) => [k, structuredClone(v)]);
    return this.write(() => { for (const [k, v] of copies) this.data.set(k, v); });
  }

  delete(key) {
    const keys = Array.isArray(key) ? key : [key];
    return this.write(() => { for (const k of keys) this.data.delete(k); });
  }

  async list({ prefix = '' } = {}) {
    const keys = [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
    return new Map(keys.map((k) => [k, structuredClone(this.data.get(k))]));
  }

  deleteAll() {
    return this.write(() => { this.data.clear(); this.db.exec('DROP TABLE IF EXISTS audit'); });
  }

  async getAlarm() { return this.alarm; }
  async setAlarm(at) { this.alarm = at; }
  async deleteAlarm() { this.alarm = null; }
}

// A hibernatable WebSocket, as the Durable Object sees its end.
export class Socket {
  constructor(ctx) { this.ctx = ctx; this.sent = []; this.att = null; this.closed = null; }
  serializeAttachment(a) { this.att = structuredClone(a); }
  deserializeAttachment() { return structuredClone(this.att); }
  send(text) { if (this.closed) throw new Error('closed'); this.sent.push(JSON.parse(text)); }
  close(code, reason) { this.closed ??= { code, reason }; this.ctx.sockets.delete(this); }
  // Messages it was sent of type `t`.
  got(t) { return this.sent.filter((m) => m.t === t); }
}

export function makeCtx(storage, sockets = new Set()) {
  const ctx = {
    storage, sockets, ready: null,
    getWebSockets: () => [...ctx.sockets],
    acceptWebSocket: (ws) => { ctx.sockets.add(ws); },
    setWebSocketAutoResponse: () => {},
    blockConcurrencyWhile: (fn) => (ctx.ready = fn())
  };
  return ctx;
}

// The registry every room tells it's there (worker.js Registry), as a Set.
export function makeEnv() {
  const rooms = new Set();
  const registry = { add: async (id) => { rooms.add(id); }, remove: async (id) => { rooms.delete(id); }, list: async () => [...rooms] };
  return { rooms, REGISTRY: { idFromName: (n) => n, get: () => registry } };
}

// A Durable Object of class `Klass` on `storage`, once it has loaded.
export async function start(Klass, storage, env, sockets = new Set()) {
  const ctx = makeCtx(storage, sockets);
  const obj = new Klass(ctx, env);
  await ctx.ready;
  return obj;
}
