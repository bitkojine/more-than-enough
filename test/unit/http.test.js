/* The room service's routes under Node, with stand-ins for the Durable
 * Objects: what's shared (http.js), the front door (routes.js) and the
 * moderator's routes (admin-routes.js). worker.js itself needs Cloudflare. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURITY_HEADERS,
  allowedOrigin,
  readCapped,
  readJson,
  isAdmin,
  respond,
  visitorTag
} from '../../server/src/http.js';
import { route } from '../../server/src/routes.js';
import { admin } from '../../server/src/admin-routes.js';
import * as P from '../../src/net/protocol.js';

const TOKEN = 'x'.repeat(40);
const GAME = 'https://play.example';
const ROOM = 'abcdefghijklmnopqrstuv'; // a room id as ROOM_ID_RE takes it (22 characters)

const post = (path, body, headers = {}) =>
  new Request('https://rooms.example' + path, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
const get = (path, headers = {}) => new Request('https://rooms.example' + path, { headers });
const bearer = { Authorization: 'Bearer ' + TOKEN };

// Namespaces that hand out one stand-in room and the registry.
function envWith(room = {}, registry = { list: async () => [], add: async () => {} }) {
  const ns = (obj) => ({ idFromName: (n) => n, get: () => obj });
  return {
    ALLOWED_ORIGINS: GAME + ', https://other.example',
    ADMIN_TOKEN: TOKEN,
    ROOMS: ns(room),
    REGISTRY: ns(registry)
  };
}

test('only the listed pages may call, and localhost only when the deployment says so', () => {
  const env = envWith();
  assert.equal(allowedOrigin(env, GAME), true);
  assert.equal(allowedOrigin(env, 'https://other.example'), true);
  assert.equal(allowedOrigin(env, 'https://evil.example'), false);
  assert.equal(allowedOrigin(env, null), false);
  assert.equal(allowedOrigin(env, 'http://localhost:8080'), false);
  assert.equal(allowedOrigin({ ALLOW_LOCALHOST: 'true' }, 'http://localhost:8080'), true);
  assert.equal(allowedOrigin({ ALLOW_LOCALHOST: 'true' }, 'http://localhost.evil:80'), false);
});

test('the moderator is whoever holds a long enough token', async () => {
  assert.equal(await isAdmin(get('/', bearer), envWith()), true);
  assert.equal(await isAdmin(get('/', { Authorization: 'Bearer nope' }), envWith()), false);
  assert.equal(await isAdmin(get('/'), envWith()), false);
  // A short secret means there is no moderator at all.
  const short = { ADMIN_TOKEN: 'short' };
  assert.equal(await isAdmin(get('/', { Authorization: 'Bearer short' }), short), false);
});

test('bodies are read up to their cap, and past it not at all', async () => {
  assert.equal(await readCapped(post('/', 'hello'), 10), 'hello');
  assert.equal(await readCapped(post('/', 'x'.repeat(11)), 10), null);
  assert.equal(await readCapped(get('/'), 10), '');
  assert.equal(await readCapped(post('/', new Uint8Array([0xff, 0xfe])), 10), null); // not UTF-8
  assert.deepEqual(await readJson(post('/', { a: 1 }), 100), { a: 1 });
  assert.equal(await readJson(post('/', '{nope'), 100), null);
  assert.equal(await readJson(post('/', 'x'.repeat(200)), 100), null);
});

test('answers carry the security headers, and CORS only for an allowed page', async () => {
  const r = respond({ ok: 1 }, 200, GAME);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers.get(k), v);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), GAME);
  assert.deepEqual(await r.json(), { ok: 1 });
  assert.equal(respond({}, 404, null).headers.get('Access-Control-Allow-Origin'), null);
});

test('a visitor tag is short, the same for the same visitor, and differs by room', async () => {
  const req = get('/', { 'CF-Connecting-IP': '203.0.113.7' });
  const a = await visitorTag('room1', req);
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.equal(await visitorTag('room1', req), a);
  assert.notEqual(await visitorTag('room2', req), a);
});

test('the front door: preflight, origin, closed creation, the admin gate', async () => {
  const env = envWith();
  const pre = await route(
    new Request('https://rooms.example/rooms', { method: 'OPTIONS', headers: { Origin: GAME } }),
    env
  );
  assert.equal(pre.status, 204);
  const bad = await route(
    new Request('https://rooms.example/rooms', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' }
    }),
    env
  );
  assert.equal(bad.status, 403);
  assert.equal((await route(get('/rooms/abc'), env)).status, 403); // no Origin: not the game
  // Nobody but the moderator makes worlds.
  const closed = await route(post('/rooms', {}, { Origin: GAME }), env);
  assert.equal(closed.status, 403);
  assert.deepEqual(await closed.json(), { error: 'closed' });
  // Without the token the moderator's routes don't exist.
  assert.equal((await route(get('/admin/rooms'), env)).status, 404);
  const root = await route(get('/'), { ...env, COMMIT: 'abc' });
  assert.deepEqual(await root.json(), { ok: true, commit: 'abc' });
  assert.equal((await route(get('/nowhere', { Origin: GAME }), env)).status, 404);
});

test('a moderator failure answers "internal" and keeps its cause in the log', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const env = envWith({}, { list: async () => Promise.reject(new Error('boom')) });
  const r = await route(get('/admin/rooms', bearer), env);
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: 'internal' }); // never the exception's text
  assert.equal(logged.mock.callCount(), 1);
});

test('moderator routes: freeze and thaw check the body, then ask the room', async () => {
  const asked = [];
  const room = {
    modFreeze: async (id, p, why) => (asked.push(['freeze', id, p, why]), null),
    modThaw: async (id, p) => (asked.push(['thaw', id, p]), 'not frozen')
  };
  const env = envWith(room);
  const at = (what) => new URL('https://rooms.example/admin/rooms/' + ROOM + '/' + what);
  const id = 'a'.repeat(16);
  let r = await admin(post('', { id, why: 'speed' }), env, at('freeze'));
  assert.equal(r.status, 200);
  r = await admin(post('', '{nope'), env, at('freeze'));
  assert.equal(r.status, 400);
  r = await admin(post('', { id }), env, at('thaw'));
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: 'not frozen' });
  // 'ban' is kept for old tools and freezes: nothing deletes a player.
  await admin(post('', { id }), env, at('ban'));
  assert.deepEqual(
    asked.map((a) => a[0]),
    ['freeze', 'thaw', 'freeze']
  );
  assert.equal((await admin(get(''), env, at('nothing'))).status, 404);
});

test('moderator routes: an invite link takes its uses and life, or the defaults', async () => {
  const asked = [];
  const room = {
    modInvite: async (id, ask) => (
      asked.push(ask),
      id === ROOM ? { code: 'C', until: 9 } : { error: 'room' }
    )
  };
  const env = envWith(room);
  const at = new URL('https://rooms.example/admin/rooms/' + ROOM + '/invite');
  let r = await admin(post('', { uses: 1, life: 60 }), env, at);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { code: 'C', until: 9 });
  r = await admin(post('', '{nope'), env, at);
  assert.equal(r.status, 200, 'a body it cannot read asks for the defaults');
  await admin(post('', { uses: 1e9, life: -1 }), env, at);
  assert.deepEqual(asked.slice(1), [P.cleanInviteAsk({}), P.cleanInviteAsk({})]);
  assert.deepEqual(asked[0], { uses: 1, life: 60 });
  assert.equal((await admin(get(''), env, at)).status, 404, 'only POST');
});

test('moderator routes: the room list drops rooms that are gone from the registry', async () => {
  const removed = [];
  const registry = {
    list: async () => ['one', 'two'],
    remove: async (id) => removed.push(id)
  };
  const rooms = { one: { id: 'one' }, two: null };
  const env = {
    ...envWith({}, registry),
    ROOMS: { idFromName: (n) => n, get: (n) => ({ summary: async () => rooms[n] }) }
  };
  const r = await admin(get(''), env, new URL('https://rooms.example/admin/rooms'));
  assert.deepEqual(await r.json(), { rooms: [{ id: 'one' }] });
  assert.deepEqual(removed, ['two']);
});
