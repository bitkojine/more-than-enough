/* The moderator's routes, once the token is checked: every world and its
 * players, a world's log, freezing and thawing, bot marks, invite links,
 * copies, backups and restores. `env` holds the Durable Object namespaces,
 * so the unit tests pass stand-ins.
 *
 *   GET  /admin                        the moderator's page (admin.js): holds nothing, asks for the token
 *   GET  /admin/players?tests=         every world with everyone in it, named (not the smoke test's)
 *   GET  /admin/rooms                  every world, in brief
 *   GET  /admin/rooms/<id>/players     who is in one, and how far along
 *   GET  /admin/rooms/<id>/log?since=  its audit log as JSON lines (audit.js)
 *   POST /admin/rooms/<id>/ban         the same as freeze (no ban deletes anyone since v0.155.0)
 *   POST /admin/rooms/<id>/freeze      freeze a hacked character: {"id", "why"}
 *   POST /admin/rooms/<id>/thaw        undo that: {"id"}
 *   POST /admin/rooms/<id>/bots        mark (or unmark) a company bot: {"id", "bot": bool}
 *   POST /admin/rooms/<id>/invite      an invite link into it: {"uses", "life"} (both optional)
 *   POST /admin/rooms/<id>/revoke      stop an invite link: {"code"}
 *   GET  /admin/rooms/<id>/graves      its tombstones, as players receive them
 *   POST /admin/rooms/<id>/copy        a copy to play as one player: {"id"} (copy.js)
 *   GET  /admin/rooms/<id>/backup      the whole world as one file, to keep on disk (backup.js)
 *   POST /admin/rooms/<id>/restore     put a world that's gone back from that file (never over one that's there)
 *   POST /admin/rooms/<id>/smoke       mark (or unmark) a deploy smoke-test room: {"smoke": bool} (kept out of the lists)
 */

import {
  ROOM_ID_RE,
  ID_RE,
  randomRoomId,
  randomHex,
  playerId,
  cleanInviteAsk
} from '../../src/net/protocol.js';
import { VERSION } from '../../src/version.js';
import { copyEntries, COPY_MS } from './copy.js';
import { worldOf, isSmokeTest } from './admin.js';
import { backupOf, backupName, entriesOf, BACKUP_MAX } from './backup.js';
import { SECURITY_HEADERS, readCapped, readJson, respond } from './http.js';

const registryOf = (env) => env.REGISTRY.get(env.REGISTRY.idFromName('*'));
const ok = () => respond({ ok: true }, 200, null);
const done = (err) => (err ? respond({ error: err }, 409, null) : ok());
const notFound = () => respond({ error: 'not found' }, 404, null);
const bad = () => respond({ error: 'bad' }, 400, null);
const noRoom = () => respond({ error: 'room' }, 404, null);

// A small JSON body naming a player by id, or null.
async function playerBody(request) {
  const d = await readJson(request, 1024);
  return d && typeof d.id === 'string' && ID_RE.test(d.id) ? d : null;
}

// The moderator's routes (see the top of this file): the two lists of every
// world, then the routes about one world (ROOM_ROUTES, by "METHOD name").
export async function admin(request, env, url) {
  const list = request.method === 'GET' && LISTS[url.pathname];
  if (list) return list(env, url);
  const m = url.pathname.match(/^\/admin\/rooms\/([^/]+)\/([a-z]+)$/);
  const route = m && Object.hasOwn(ROOM_ROUTES, request.method + ' ' + m[2]);
  if (!route || !ROOM_ID_RE.test(m[1])) return notFound();
  const id = m[1];
  const room = env.ROOMS.get(env.ROOMS.idFromName(id));
  return ROOM_ROUTES[request.method + ' ' + m[2]]({ request, env, url, id, room });
}

const LISTS = {
  async '/admin/rooms'(env) {
    const registry = registryOf(env);
    const rooms = [];
    for (const id of await registry.list()) {
      const s = await env.ROOMS.get(env.ROOMS.idFromName(id)).summary();
      if (s) rooms.push(s);
      else await registry.remove(id);
    }
    return respond({ rooms }, 200, null);
  },
  async '/admin/players'(env, url) {
    const tests = url.searchParams.get('tests') === '1';
    const ids = await registryOf(env).list();
    const rooms = await Promise.all(
      ids.map((id) => worldFrom(env.ROOMS.get(env.ROOMS.idFromName(id)), id, tests))
    );
    return respond({ rooms: rooms.filter(Boolean) }, 200, null);
  }
};

// One world's row on the players page, or null to leave it out.
async function worldFrom(room, id, tests) {
  try {
    const o = await room.overview(id, tests);
    return o && (o.players ? worldOf(o.summary, o.players, o.graves) : null);
  } catch (e) {
    // A busy room can run the code from before a deploy for a while:
    // asked the older way; failing that, it says so and the rest still shows.
    try {
      const summary = await room.summary();
      if (!summary || (isSmokeTest(summary) && !tests)) return null;
      return worldOf(summary, (await room.roster(id)) || [], (await room.graves(id)) || []);
    } catch {
      console.error('room overview failed', id, e); // cause in wrangler tail only
      return { id, error: 'unreachable', players: [], name: { en: id, lt: id }, last: 0 };
    }
  }
}

const ROOM_ROUTES = {
  async 'GET players'({ id, room }) {
    const players = await room.roster(id);
    return players ? respond({ players }, 200, null) : noRoom();
  },
  async 'GET graves'({ id, room }) {
    const graves = await room.graves(id);
    return graves ? respond({ graves }, 200, null) : noRoom();
  },
  async 'GET log'({ url, id, room }) {
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    const text = await room.exportLog(id, since);
    if (text === null) return noRoom();
    return new Response(text, {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8' }
    });
  },
  async 'GET backup'({ id, room }) {
    const entries = await room.snapshot(id);
    if (!entries) return noRoom();
    const now = Date.now();
    return new Response(backupOf(entries, id, now, VERSION), {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="' + backupName(id, now) + '"'
      }
    });
  },
  async 'POST restore'({ request, env, id, room }) {
    const body = await readCapped(request, BACKUP_MAX);
    if (body === null) return respond({ error: 'size' }, 413, null);
    const entries = entriesOf(body, id);
    if (!entries) return bad();
    // adopt refuses a room that's there ('exists'): a live world is never written over.
    const err = await room.adopt(id, entries);
    if (err) return respond({ error: err }, 409, null);
    await registryOf(env).add(id);
    return respond({ room: id }, 200, null);
  },
  async 'POST copy'({ request, env, id, room }) {
    const d = await playerBody(request);
    if (!d) return bad();
    const entries = await room.snapshot(id);
    if (!entries) return noRoom();
    // A key of its own for the copy, handed to the moderator only: the
    // player's own never leaves their phone (the room has its hash).
    const copy = randomRoomId(),
      key = randomHex(32),
      until = Date.now() + COPY_MS;
    const made = copyEntries(entries, d.id, await playerId(copy, key), until);
    if (!made) return respond({ error: 'player' }, 409, null);
    const err = await env.ROOMS.get(env.ROOMS.idFromName(copy)).adopt(copy, made);
    if (err) return respond({ error: err }, 409, null);
    const game = String(env.ALLOWED_ORIGINS || '')
      .split(',')[0]
      .trim();
    const link = game + '/#copy=' + copy + '.' + key + '&of=' + id;
    return respond({ room: copy, key, until, link }, 200, null);
  },
  // 'ban' is kept for old tools and freezes: nothing deletes a player.
  'POST ban': (at) => freeze(at),
  'POST freeze': (at) => freeze(at),
  async 'POST thaw'({ request, id, room }) {
    const d = await playerBody(request);
    return d ? done(await room.modThaw(id, d.id)) : bad();
  },
  // Marking a character as one of the room's company bots (0.206.0), or not.
  async 'POST bots'({ request, id, room }) {
    const d = await playerBody(request);
    return d && typeof d.bot === 'boolean' ? done(await room.modBot(id, d.id, d.bot)) : bad();
  },
  // An invite link into a world (0.194.0): how Watch gets into a world made
  // by hand. The link is <game>#join=<room>.<code>, as a sign's QR.
  async 'POST invite'({ request, id, room }) {
    const d = (await readJson(request, 1024)) ?? {};
    const r = await room.modInvite(id, cleanInviteAsk(d));
    return r.error ? done(r.error) : respond({ code: r.code, until: r.until }, 200, null);
  },
  // Stopping any invite link (only its maker can in the game itself): for a
  // link that got out, without taking the person who made it along.
  async 'POST revoke'({ request, id, room }) {
    const d = await readJson(request, 1024);
    if (!d || typeof d.code !== 'string' || !ROOM_ID_RE.test(d.code)) return bad();
    return done(await room.modRevoke(id, d.code));
  },
  // Marking a room as the deploy's smoke test (or unmarking one): the mark
  // only keeps it out of the moderator's lists; nothing deletes it.
  async 'POST smoke'({ request, id, room }) {
    const d = await readJson(request, 1024);
    if (!d || typeof d.smoke !== 'boolean') return bad();
    return done(await room.modSmoke(id, d.smoke));
  }
};

async function freeze({ request, id, room }) {
  const d = await playerBody(request);
  if (!d) return bad();
  const why = typeof d.why === 'string' ? d.why : '';
  return done(await room.modFreeze(id, d.id, why));
}
