/* Games in a crystal room for tests: each plays the way together.js does,
 * sending what it did, and hears what the room tells everyone (others'
 * crystal buildings, 'built'), as room-handlers.js takes it in. */

import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import { Room, Bucket } from '../../server/src/room.js';
import { createAutoplaySession } from '../../src/game/autoplay-session.js';
import { cleanWelcome } from '../../src/game/room-messages.js';

export const T0 = 1_700_000_000_000;
export const machine = (s) => s.cultivation.facilities.find((b) => b.kind === 'machine');

// Holds AUTO in `s` until `until(s)` (at most an hour of game time); the acts refused.
export function holdAuto(s, tick, until = (t) => !!machine(t)) {
  const refused = [];
  const auto = createAutoplaySession(0, (intent, ok) => ok || refused.push(intent), { state: s });
  auto.press();
  const end = s.time + 3600;
  while (!until(s) && s.time < end) {
    auto.advanceTicks(15);
    tick();
  }
  return refused;
}

export async function crystalRoom(seed) {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  const world = { seed, mods: [], props: [], ext: [] };
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world, eco: 'crystal' }), T0), null);
  r.games = [];
  return { r, key };
}

// What each game in the room hears of a message the room sends everyone.
function hear(r, from, out) {
  for (const m of [...(out.toAll || []), ...(out.toOthers || [])])
    for (const g of r.games)
      if (m.t === 'built' && g.id !== from) C.setTheirs(g.s, m.id, C.cleanBuilt(m.b, m.id) || []);
}

// A game in crystal room `r`; `seats`: a game that knows of seats (0.198.0).
export async function play(r, key, code, now, seats = true) {
  const j = await r.join(key, code, now, false, { crystal: true, seats });
  assert.ok(j.welcome, 'let in: ' + j.error);
  const w = cleanWelcome(j.welcome);
  const s = C.joinState(w, r.id, null, null);
  s.time = j.welcome.time;
  s.acts = [];
  const edits = new Bucket(now, 1e9, 1e9);
  const base = s.stats.playedMs;
  const send = (m) => {
    const at = now + Math.round(s.stats.playedMs - base);
    const out = r.message(j.id, JSON.stringify(m), at, edits);
    assert.ok(!out.drop, 'the room took ' + m.t);
    hear(r, j.id, out);
  };
  const sync = (save = false) => {
    r.players.get(j.id).p = P.cleanPos(s.player);
    const acts = C.takeActs(s);
    for (let i = 0; i < acts.length; i += P.LIMITS.actsPerMessage)
      send({ t: 'acts', ms: Math.round(s.stats.playedMs), a: acts.slice(i, i + 256) });
    const list = C.takeEdits(s);
    for (let i = 0; i < list.length; i += P.LIMITS.editsPerMessage)
      send({ t: 'edits', e: list.slice(i, i + P.LIMITS.editsPerMessage) });
    if (save) send({ t: 'save', s: C.progressOf(s) });
  };
  const g = {
    s,
    id: j.id,
    welcome: w,
    sync,
    invite: () => r.message(j.id, '{"t":"invite"}', now).toSelf[0].code
  };
  r.games = [...(r.games || []).filter((o) => o.id !== j.id), g];
  return g;
}
