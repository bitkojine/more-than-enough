/* The room service's checks, written once against a small `service`
 * interface, so the same assertions run in two places:
 *
 *   - server/smoke.mjs, after a deploy, against the live service over the
 *     network (WebSocket + fetch);
 *   - test/unit/smoke.test.js, in npm test, against a real Room in this
 *     process (no network, no admin token).
 *
 * They are the same checks on purpose: a fact the live service must satisfy
 * is a fact the room's own code must satisfy, and keeping one copy means a
 * wrong assumption (a player id's shape, say) fails locally, not only in CI
 * after a deploy.
 *
 * A `service` is:
 *   create(body, { token })   -> { status, room }   a world is made
 *   connect(room, key, code)  -> session            a player's connection
 *   post(origin, body)        -> { status }         POST /rooms
 *   hidden(headers)           -> status             GET /admin/rooms
 *   log(room, token)          -> JSON lines         GET /admin/rooms/<id>/log
 *   players(tests, token)     -> room ids           GET /admin/players
 *
 * A session is { next(type, ms), send(msg), closed, close() }: `next` waits
 * for the next message of a type (or null if none comes), `closed` resolves
 * with the close code and reason. */

import { packKey } from '../src/core/coords.js';
import { ROOM_ID_RE, ID_RE } from '../src/net/protocol.js';

// Runs every check, reporting each with `check(ok, what)`. `rand` makes a
// fresh secret (hex bytes); `token` is the moderator's token (or undefined,
// when the checks that need it are skipped); `sleep` waits between tries.
export async function roomChecks(service, check, { rand, token, sleep }) {
  check((await service.post(null, '{}')).status === 403, 'no Origin: refused');
  check((await service.post('https://evil.example', '{}')).status === 403, 'another site: refused');

  // Right after a deploy the old version may still make and run rooms for a
  // few seconds: rooms are made until one welcomes with what this version
  // says (`ack`), for a while.
  let makerKey, made, room, maker, hi;
  for (let i = 0; i < 5; i++) {
    if (i) { maker.close(); await sleep(3000); }
    makerKey = rand(32);
    // Under the admin token the room is marked as a smoke test (so it ages out
    // unvisited, like every deploy's room ever since): the token is the only
    // door to a world now, and the mark is the only kind that ages out.
    made = await service.create({ t: 'create', key: makerKey, smoke: true, world: { seed: 12345, mods: [], props: [], ext: [] }, pos: { x: 0.5, y: 0.5, z: 0 } }, { token });
    room = made.room;
    maker = service.connect(room, makerKey);
    hi = await maker.next('welcome');
    if (!hi || hi.ack === true) break;
  }
  check(made.status === 201 && ROOM_ID_RE.test(room), 'a room is made');
  // `you` is the player's id in this room: hex, 16, not the room's base64 id.
  check(hi && ID_RE.test(hi.you) && hi.seed === 12345, 'the maker gets the world back');

  // Worlds are Watch's to make: a stranger is refused before the body is read.
  // (On the live service this waits out the rollout: for a few seconds after a
  // deploy the previous version may still answer; the loop above only ends on
  // a welcome from this version. Locally the first answer is already right.)
  check((await service.post('https://play.robertasrudys.com', '{"t":"create","key":"short"}')).status === 403,
    'a stranger cannot make a world');
  if (token) {
    // Under the token, a body that couldn't make a world is still a plain 400.
    const bad = await service.create({ t: 'create', key: 'short' }, { token });
    check(bad.status === 400, 'a malformed world: refused (' + bad.status + ')');
  }

  let stranger;
  if (service.sessions === 'live') {
    stranger = service.connect(room, rand(32));
    check(/1008 invite/.test(await stranger.closed), 'a stranger without an invite is turned away');
  } else {
    // In process there is no socket to close: the room refuses the join, and
    // that is the same fact the live close code carries.
    const turned = await service.join(room, rand(32));
    check(turned && turned.error === 'invite', 'a stranger without an invite is turned away');
  }

  maker.send({ t: 'invite' });
  const inv = await maker.next('invite');
  check(!!inv, 'the maker gets an invite');
  const friend = service.connect(room, rand(32), inv && inv.code);
  const fw = await friend.next('welcome');
  check(fw && fw.you !== hi.you && fw.players[hi.you], 'an invited friend joins and sees the maker');
  friend.send({ t: 'pos', p: { x: 2, y: 3, z: 0 } });
  const moved = await maker.next('pos');
  check(moved && moved.p.x === 2, 'the maker sees the friend move');
  check(hi && hi.pong === true && hi.ack === true, 'the welcome says the room answers pings and acknowledges edits');
  friend.send('ping');
  check(!!(await friend.next('pong')), 'the room answers a ping');
  friend.send({ t: 'edits', e: [['m', packKey(2, 3, 0), 1]], n: 1 });
  const ack = await friend.next('ack');
  check(ack && ack.n === 1, 'numbered edits are acknowledged');

  let st = await service.hidden({});
  check(st === 404, 'the moderator routes are hidden without the token (' + st + ')');
  st = await service.hidden({ Authorization: 'Bearer ' + rand(32) });
  check(st === 404, 'and with a wrong one (' + st + ')');

  if (token) {
    const lines = await service.log(room, token);
    check(lines[0]?.e === 'room' && lines.some((l) => l.e === 'join' && l.new), "the moderator reads the room's audit log");
    // The room was marked as a smoke test under the token, so the moderator's
    // world list hides it without "Test worlds" and shows it with them.
    check(!(await service.players(false, token)).includes(room), "the smoke room's world stays out of the moderator's plain list");
    check((await service.players(true, token)).includes(room), "and appears with 'Test worlds' ticked");
  }

  maker.close();
  friend.close();
}
