/* The moderator's routes (the list at the top of worker.js), once the
 * token is checked: every world and its players, a world's log, freezing
 * and thawing, invite links, copies, backups and restores. `env` holds the
 * Durable Object namespaces, so the unit tests pass stand-ins. */

import { ROOM_ID_RE, ID_RE, randomRoomId, randomHex, playerId } from '../../src/net/protocol.js';
import { VERSION } from '../../src/version.js';
import { copyEntries, COPY_MS } from './copy.js';
import { worldOf, isSmokeTest } from './admin.js';
import { backupOf, backupName, entriesOf, BACKUP_MAX } from './backup.js';
import { SECURITY_HEADERS, readCapped, readJson, respond } from './http.js';

// The moderator's routes (see the top of this file).
export async function admin(request, env, url) {
  if (url.pathname === '/admin/rooms' && request.method === 'GET') {
    const registry = env.REGISTRY.get(env.REGISTRY.idFromName('*'));
    const rooms = [];
    for (const id of await registry.list()) {
      const s = await env.ROOMS.get(env.ROOMS.idFromName(id)).summary();
      if (s) rooms.push(s);
      else await registry.remove(id);
    }
    return respond({ rooms }, 200, null);
  }
  if (url.pathname === '/admin/players' && request.method === 'GET') {
    const tests = url.searchParams.get('tests') === '1';
    const registry = env.REGISTRY.get(env.REGISTRY.idFromName('*'));
    const rooms = await Promise.all(
      (await registry.list()).map(async (id) => {
        const room = env.ROOMS.get(env.ROOMS.idFromName(id));
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
            return {
              id,
              error: String((e && e.message) || e).slice(0, 200),
              players: [],
              name: { en: id, lt: id },
              last: 0
            };
          }
        }
      })
    );
    return respond({ rooms: rooms.filter(Boolean) }, 200, null);
  }
  const m = url.pathname.match(
    /^\/admin\/rooms\/([^/]+)\/(players|log|ban|freeze|thaw|revoke|graves|copy|backup|restore|smoke)$/
  );
  if (!m || !ROOM_ID_RE.test(m[1])) return respond({ error: 'not found' }, 404, null);
  const room = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
  if (m[2] === 'players' && request.method === 'GET') {
    const players = await room.roster(m[1]);
    return players ? respond({ players }, 200, null) : respond({ error: 'room' }, 404, null);
  }
  if (m[2] === 'graves' && request.method === 'GET') {
    const graves = await room.graves(m[1]);
    return graves ? respond({ graves }, 200, null) : respond({ error: 'room' }, 404, null);
  }
  if (m[2] === 'log' && request.method === 'GET') {
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    const text = await room.exportLog(m[1], since);
    if (text === null) return respond({ error: 'room' }, 404, null);
    return new Response(text, {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8' }
    });
  }
  if (m[2] === 'backup' && request.method === 'GET') {
    const entries = await room.snapshot(m[1]);
    if (!entries) return respond({ error: 'room' }, 404, null);
    const now = Date.now();
    return new Response(backupOf(entries, m[1], now, VERSION), {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="' + backupName(m[1], now) + '"'
      }
    });
  }
  if (m[2] === 'restore' && request.method === 'POST') {
    const body = await readCapped(request, BACKUP_MAX);
    if (body === null) return respond({ error: 'size' }, 413, null);
    const entries = entriesOf(body, m[1]);
    if (!entries) return respond({ error: 'bad' }, 400, null);
    // adopt refuses a room that's there ('exists'): a live world is never written over.
    const err = await room.adopt(m[1], entries);
    if (err) return respond({ error: err }, 409, null);
    await env.REGISTRY.get(env.REGISTRY.idFromName('*')).add(m[1]);
    return respond({ room: m[1] }, 200, null);
  }
  if (m[2] === 'copy' && request.method === 'POST') {
    const d = await readJson(request, 1024);
    if (!d || typeof d.id !== 'string' || !ID_RE.test(d.id))
      return respond({ error: 'bad' }, 400, null);
    const entries = await room.snapshot(m[1]);
    if (!entries) return respond({ error: 'room' }, 404, null);
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
    return respond(
      { room: copy, key, until, link: game + '/#copy=' + copy + '.' + key + '&of=' + m[1] },
      200,
      null
    );
  }
  if ((m[2] === 'ban' || m[2] === 'freeze' || m[2] === 'thaw') && request.method === 'POST') {
    const d = await readJson(request, 1024);
    if (!d || typeof d.id !== 'string' || !ID_RE.test(d.id))
      return respond({ error: 'bad' }, 400, null);
    const why = typeof d.why === 'string' ? d.why : '';
    // 'ban' is kept for old tools and freezes: nothing deletes a player.
    const err =
      m[2] === 'thaw' ? await room.modThaw(m[1], d.id) : await room.modFreeze(m[1], d.id, why);
    return err ? respond({ error: err }, 409, null) : respond({ ok: true }, 200, null);
  }
  // Stopping any invite link (only its maker can in the game itself): for a
  // link that got out, without taking the person who made it along.
  if (m[2] === 'revoke' && request.method === 'POST') {
    const d = await readJson(request, 1024);
    if (!d || typeof d.code !== 'string' || !ROOM_ID_RE.test(d.code))
      return respond({ error: 'bad' }, 400, null);
    const err = await room.modRevoke(m[1], d.code);
    return err ? respond({ error: err }, 409, null) : respond({ ok: true }, 200, null);
  }
  // Marking a room as the deploy's smoke test (or unmarking one): the mark
  // only keeps it out of the moderator's lists; nothing deletes it.
  if (m[2] === 'smoke' && request.method === 'POST') {
    const d = await readJson(request, 1024);
    if (!d || typeof d.smoke !== 'boolean') return respond({ error: 'bad' }, 400, null);
    const err = await room.modSmoke(m[1], d.smoke);
    return err ? respond({ error: err }, 409, null) : respond({ ok: true }, 200, null);
  }
  return respond({ error: 'not found' }, 404, null);
}
