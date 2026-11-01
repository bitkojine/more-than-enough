/* The room service's front door (worker.js hands it every request): which
 * pages may call it, making a room, your own world kept for your devices,
 * whether a room exists, joining one, and the moderator's routes behind the
 * token (admin-routes.js). `env` holds the Durable Object namespaces and
 * settings, so the unit tests pass stand-ins. */

import {
  LIMITS,
  ROOM_ID_RE,
  randomRoomId,
  parse,
  cleanCreate,
  SOLO,
  cleanSoloAsk
} from '../../src/net/protocol.js';
import { adminPage } from './admin.js';
import { vaultName } from './vault.js';
import { admin } from './admin-routes.js';
import {
  SECURITY_HEADERS,
  allowedOrigin,
  visitorTag,
  readCapped,
  isAdmin,
  respond
} from './http.js';

// Every request: the routes listed at the top of worker.js.
export async function route(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const okOrigin = allowedOrigin(env, origin) ? origin : null;

  if (request.method === 'OPTIONS') {
    if (!okOrigin) return new Response(null, { status: 403, headers: SECURITY_HEADERS });
    return new Response(null, {
      status: 204,
      headers: {
        ...SECURITY_HEADERS,
        'Access-Control-Allow-Origin': okOrigin,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin'
      }
    });
  }

  // The commit it was deployed from (rooms.yml), for scripts/live-check.mjs.
  if (url.pathname === '/') return respond({ ok: true, commit: env.COMMIT || null }, 200, okOrigin);
  // The moderator's page holds nothing until the token is typed in it.
  if (url.pathname === '/admin' && request.method === 'GET') {
    const { html, headers } = await adminPage();
    return new Response(html, { status: 200, headers: { ...SECURITY_HEADERS, ...headers } });
  }
  // The moderator's routes take a token, from the page or a script, and
  // never an Origin's word. Anyone without the token sees nothing there at all.
  if (url.pathname.startsWith('/admin/')) {
    if (!(await isAdmin(request, env))) return respond({ error: 'not found' }, 404, null);
    // A failure says what went wrong, to the moderator only.
    try {
      return await admin(request, env, url);
    } catch (e) {
      return respond({ error: String((e && e.message) || e).slice(0, 300) }, 500, null);
    }
  }
  // Browsers always send Origin on these; anything else isn't the game.
  if (!okOrigin) return respond({ error: 'origin' }, 403, null);

  if (url.pathname === '/rooms' && request.method === 'POST') {
    // Worlds are made by Watch, by hand, as many as players need
    // (2026-10-20): the door is shut for everyone else before the body is
    // even read, so there is no creation left to flood. The deploy's
    // smoke test creates under the admin token and marks its own room
    // (kept out of the moderator's lists, room.js); worlds Watch makes stay unmarked.
    const trusted = await isAdmin(request, env);
    if (!trusted) return respond({ error: 'closed' }, 403, okOrigin);
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > LIMITS.createBytes) return respond({ error: 'size' }, 413, okOrigin);
    const body = await readCapped(request, LIMITS.createBytes);
    if (body === null) return respond({ error: 'size' }, 413, okOrigin);
    // A body must be a create a room can actually be made from, or it is
    // refused here without a room ever being touched.
    if (!cleanCreate(parse(body, LIMITS.createBytes)))
      return respond({ error: 'bad' }, 400, okOrigin);
    const id = randomRoomId();
    const room = env.ROOMS.get(env.ROOMS.idFromName(id));
    const err = await room.create(id, body, trusted);
    if (err) return respond({ error: err }, err === 'bad' ? 400 : 409, okOrigin);
    await env.REGISTRY.get(env.REGISTRY.idFromName('*')).add(id);
    return respond({ room: id }, 201, okOrigin);
  }

  // Your own world, for every device you link (vault.js). The key comes
  // in the body, never the address, so no log along the way holds it.
  if (url.pathname === '/solo' && request.method === 'POST') {
    const body = await readCapped(request, SOLO.bytes + 1024);
    if (body === null) return respond({ error: 'size' }, 413, okOrigin);
    const ask = cleanSoloAsk(parse(body, SOLO.bytes + 1024));
    if (!ask) return respond({ error: 'bad' }, 400, okOrigin);
    const vault = env.VAULT.get(env.VAULT.idFromName(await vaultName(ask.key)));
    const out =
      ask.t === 'pull'
        ? await vault.pull(ask.have)
        : ask.t === 'get'
          ? await vault.get(ask.seed)
          : ask.t === 'me'
            ? await vault.me(ask.key, ask.me)
            : await vault.push(ask);
    return respond(out, out.error ? 409 : 200, okOrigin);
  }

  // Whether a shared world still exists (a game that couldn't get in asks,
  // so it stops offering a world that's gone), and how many play there now
  // (the Worlds list). Only a count: never who.
  const there = url.pathname.match(/^\/rooms\/([^/]+)$/);
  if (there && request.method === 'GET') {
    if (!ROOM_ID_RE.test(there[1])) return respond({ exists: false }, 200, okOrigin);
    return respond(
      await env.ROOMS.get(env.ROOMS.idFromName(there[1])).brief(there[1]),
      200,
      okOrigin
    );
  }

  const m = url.pathname.match(/^\/rooms\/([^/]+)\/ws$/);
  if (m && request.method === 'GET') {
    if (!ROOM_ID_RE.test(m[1])) return respond({ error: 'room' }, 404, okOrigin);
    if (request.headers.get('Upgrade') !== 'websocket')
      return respond({ error: 'upgrade' }, 426, okOrigin);
    const room = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    // The room learns its own id only from here, never from a player.
    const headers = new Headers(request.headers);
    headers.set('X-Room-Id', m[1]);
    headers.set('X-Visitor', await visitorTag(m[1], request));
    return room.fetch(new Request(request.url, { headers, method: 'GET' }));
  }

  return respond({ error: 'not found' }, 404, okOrigin);
}
