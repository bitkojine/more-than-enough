/* The game and the room service go live minutes apart, so each must work
 * with the other one version behind (AGENTS.md). test/fixtures/wire/ holds
 * what past releases' own game and room said to each other in a shared
 * world (scripts/wire-fixtures.mjs): the game holding AUTO, saving, building,
 * and a friend joining by invite. Here today's room hears that old game, and
 * today's game hears that old room. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as Core from '../../src/core/index.js';
import { Room } from '../../server/src/room.js';
import { cleanWelcome } from '../../src/game/room-messages.js';
import { createRoomHandlers } from '../../src/game/room-handlers.js';
import { createFriends } from '../../src/game/friends.js';
import { createOutbox } from '../../src/game/outbox.js';

const DIR = new URL('../fixtures/wire/', import.meta.url);
const SESSIONS = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')));

const answer = (out) => ({
  keys: Object.keys(out || {}).sort(),
  self: (out?.toSelf || []).map((m) => m.t)
});

test('old wire: sessions are kept from at least two releases', () => {
  assert.ok(SESSIONS.length >= 2);
  for (const s of SESSIONS) {
    const kinds = new Set(s.client.map((c) => c.m.t));
    for (const t of ['pos', 'acts', 'edits', 'save', 'invite'])
      assert.ok(kinds.has(t), s.version + ' ' + t);
  }
});

for (const session of SESSIONS) {
  test(`old wire: today's room hears a ${session.version} game as that room did`, async () => {
    const { start, create, client } = session;
    const r = new Room('W'.repeat(22), start);
    assert.equal(await r.init(JSON.stringify(create), start), null);
    const me = await r.join(create.key, undefined, start);
    assert.ok(me.id, 'the maker is let in');
    const ids = { maker: me.id };
    const differ = [];
    for (const { at, who, m, room } of client) {
      const now = start + at;
      if (who === 'friend' && !ids.friend) {
        const pal = await r.join('b'.repeat(64), ids.code, now);
        assert.ok(pal.id, 'the friend is let in by the invite: ' + JSON.stringify(pal));
        ids.friend = pal.id;
      }
      const out = r.message(ids[who], JSON.stringify(m), now);
      if (m.t === 'invite') ids.code = out.toSelf?.find((x) => x.code)?.code;
      assert.ok(
        !out?.drop && !out?.kick,
        `${who} ${m.t} at ${at} ms is refused: ${JSON.stringify(out)}`
      );
      if (JSON.stringify(answer(out)) !== JSON.stringify(room))
        differ.push(
          `${who} ${m.t} at ${at}: then ${JSON.stringify(room)}, now ${JSON.stringify(answer(out))}`
        );
    }
    assert.deepEqual(differ, [], 'the room answers as it did');
    const pl = r.players.get(me.id);
    assert.ok(!pl.frozen && !(pl.strikes > 0), 'and nothing counts as cheating');
  });

  test(`old wire: today's game hears a ${session.version} room`, () => {
    const welcomes = session.room.filter((x) => x.m.t === 'welcome');
    for (const w of welcomes) assert.ok(cleanWelcome(w.m), 'the welcome is understood');
    const s = Core.createState(42);
    s.shared = 'W'.repeat(22);
    s.acts = [];
    s.world.edits = [];
    const game = { state: s, worldChanged() {}, moveTo: (p) => Object.assign(s.player, p) };
    let time = 0;
    const clock = () => time;
    const friends = createFriends({
      clock,
      actor: () => ({ heard() {}, view: () => ({ kind: null }) })
    });
    const welcome = cleanWelcome(welcomes[0].m);
    friends.welcome(welcome.you, welcome.c, new Map(), welcome.players);
    const h = createRoomHandlers({
      game,
      hud: { toast() {} },
      friends,
      outbox: createOutbox(),
      sign: { show() {} },
      here: () => s.shared,
      invites: () => ({ received() {} }),
      onAway() {},
      renderFriends() {},
      checkUpdate() {},
      clock
    });
    const unknown = new Set();
    for (const { at, to, m } of session.room) {
      if (m.t === 'welcome' || to === 'friend') continue;
      time = at / 1000;
      if (!h.handle(m)) unknown.add(m.t);
    }
    assert.deepEqual([...unknown], [], 'every kind of message is one the game knows');
    for (const [k, n] of Object.entries(s.inv))
      assert.ok(Number.isFinite(n) && n >= 0, k + ' ' + n);
  });
}
