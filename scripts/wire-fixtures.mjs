// What a past release's game and room said to each other, for
// test/unit/old-wire.test.js ("one version behind", AGENTS.md).
//
//   node scripts/wire-fixtures.mjs <commit> <version>
//
// Checks <commit> out into a temporary worktree and plays a shared world with
// THAT release's code: its room (server/src/room.js) and its game's sender
// (src/game/room-sender.js, from 0.182.1 on), one player holding AUTO for a
// minute and a half while a friend joins by invite and walks about. Every message
// either side sent is written to test/fixtures/wire/<version>.json, with the
// room's answer to each of the game's messages.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const T0 = 1_700_000_000_000;
const OUT = new URL('../test/fixtures/wire/', import.meta.url).pathname;
const [commit, version] = process.argv.slice(2);
if (!commit || !/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('usage: node scripts/wire-fixtures.mjs <commit> <version>');
  process.exit(1);
}

// What the room did with a message, without its changing details.
const answer = (out) => ({
  keys: Object.keys(out || {}).sort(),
  self: (out?.toSelf || []).map((m) => m.t)
});

const wt = mkdtempSync(join(tmpdir(), 'mte-wire-'));
execFileSync('git', ['worktree', 'add', '--detach', wt, commit], { stdio: 'inherit' });
try {
  const at = (p) => pathToFileURL(join(wt, p)).href;
  if (!existsSync(join(wt, 'src/game/room-sender.js')))
    throw Error('no room-sender.js before 0.182.1');
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const C = await import(at('src/core/index.js'));
  const P = await import(at('src/net/protocol.js'));
  const { Room } = await import(at('server/src/room.js'));
  const { createRoomSender } = await import(at('src/game/room-sender.js'));
  const { createOutbox } = await import(at('src/game/outbox.js'));
  const { holdPerfect } = await import(at('test/unit/helpers.js'));

  const client = [],
    room = [];
  const roomSays = (now, to, list) => {
    for (const m of list || []) room.push({ at: now - T0, to, m });
  };
  const r = new Room('W'.repeat(22), T0);
  const maker = 'a'.repeat(64),
    friend = 'b'.repeat(64);
  const create = { t: 'create', key: maker, world: { seed: 42, mods: [], props: [], ext: [] } };
  if ((await r.init(JSON.stringify(create), T0)) !== null) throw Error('room refused create');
  const me = await r.join(maker, undefined, T0);
  if (!me.id) throw Error('join refused: ' + JSON.stringify(me));
  roomSays(T0, 'maker', [{ t: 'welcome', ...me.welcome }]);

  // The game's messages go through the room as its socket handler would.
  const tell = (who, id, now, m) => {
    const raw = JSON.stringify(m);
    const out = r.message(id, raw, now);
    client.push({ at: now - T0, who, m, room: answer(out) });
    roomSays(now, who, out?.toSelf);
    roomSays(now, 'others', out?.toOthers || out?.toAll);
    return out;
  };

  const s = C.createState(42);
  s.shared = r.id;
  s.acts = [];
  s.world.edits = [];
  const you = { facing: { x: 0, y: 1 }, moving: false, sign: false, act: { a: null, n: 0 } };
  const now = () => T0 + Math.round(s.stats.playedMs);
  const sender = createRoomSender({
    outbox: createOutbox(),
    send: (m) => tell('maker', me.id, now(), m),
    ready: () => true,
    write() {}
  });
  let last = s.stats.playedMs;
  const tick = () => {
    sender.tick(s, (s.stats.playedMs - last) / 1000, you);
    last = s.stats.playedMs;
  };

  holdPerfect(s, 30, { tick });
  const inv = tell('maker', me.id, now(), { t: 'invite', ...P.INVITE_DEFAULT });
  const code = inv.toSelf?.find((m) => m.code)?.code;
  const pal = code && (await r.join(friend, code, now()));
  if (!pal?.id) throw Error('friend could not join: ' + JSON.stringify(pal));
  roomSays(now(), 'friend', [{ t: 'welcome', ...pal.welcome }]);
  for (let i = 1; i <= 8; i++)
    tell('friend', pal.id, now() + i * 250, { t: 'pos', p: { x: 0.5 + i * 0.2, y: 0.5, z: 0 } });
  holdPerfect(s, 60, { tick });
  sender.save(s, true);
  tick();

  writeFileSync(
    join(OUT, version + '.json'),
    JSON.stringify({ version, commit, start: T0, create, client, room }) + '\n'
  );
  console.log(version, client.length, 'game messages,', room.length, 'room messages');
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', wt], { stdio: 'inherit' });
  rmSync(wt, { recursive: true, force: true });
}
