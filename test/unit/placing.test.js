/* Placing and moving buildings (Watch, 2026-10-26): where a building fits,
 * whoever stands where, and moving one for free with all it holds. The
 * game's placement view (src/game/placing.js) only shows these rules. */
import { test } from 'node:test';
import * as P from '../../src/net/protocol.js';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { reachOf } from '../../src/game/reach.js';

// An old-economy world standing beside a patch of stone, with plenty to spend.
function stoneWorld(seed = 7) {
  const s = C.createState(seed);
  for (const r of C.RESOURCES) s.inv[r] = 1e9;
  for (let r = 1; r < 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    let n = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (C.tileAt(s.world, dx + a, dy + b, 0) === C.T.STONE && C.richness(s.world, dx + a, dy + b, 0) > 0) n++;
    if (n === 9) {
      s.player.x = dx + 0.5; s.player.y = dy + 0.5;
      for (let y = dy - 6; y <= dy + 6; y++) for (let x = dx - 6; x <= dx + 6; x++) C.markExplored(s.world, x, y, 0);
      return { s, x: dx, y: dy };
    }
  }
  throw new Error('no stone patch');
}

test('a building fits on a matching explored tile anywhere, and never on another building', () => {
  const { s, x, y } = stoneWorld();
  assert.ok(C.extractorFits(s, 'quarry', x + 1, y));
  assert.ok(C.place(s, 'quarry', { x: x + 1, y }).ok);
  assert.equal(C.extractorFits(s, 'quarry', x + 1, y), false, 'taken');
  const e = C.extractorAt(s, x + 1, y, 0);
  assert.ok(C.extractorFits(s, 'quarry', x + 1, y, e), 'its own tile is free while it moves');
  assert.equal(C.extractorFits(s, 'quarry', x + 40, y + 40), false, 'unexplored land fits nothing');
});

test('moving a building is free, keeps what it holds and updates every index', () => {
  const { s, x, y } = stoneWorld();
  assert.ok(C.place(s, 'quarry', { x, y: y - 1 }).ok);
  const e = C.extractorAt(s, x, y - 1, 0);
  e.buffer = 7.5;
  const inv = { ...s.inv };
  assert.equal(C.moveExtractor(s,e,x+1,y+1).ok,false,'diagonal distance is not contact');
  s.player.x=x+1.5;
  assert.ok(C.moveExtractor(s, e, x + 1, y + 1).ok);
  assert.deepEqual(s.inv, inv, 'free');
  assert.equal(e.x, x + 1); assert.equal(e.y, y + 1);
  assert.equal(e.buffer, 7.5, 'its goods go with it');
  assert.equal(C.extractorAt(s, x, y - 1, 0), null);
  assert.equal(C.extractorAt(s, x + 1, y + 1, 0), e);
  assert.deepEqual(C.deserialize(C.serialize(s)).extractors.map((b) => [b.x, b.y]), [[x + 1, y + 1]]);
});

test('a move needs the new tile in reach, free and fitting, and in a shared world a room that checks moves', () => {
  const { s, x, y } = stoneWorld();
  assert.ok(C.place(s, 'quarry', { x, y: y - 1 }).ok);
  s.player.x=x+1.5;
  assert.ok(C.place(s, 'quarry', { x: x + 1, y: y - 1 }).ok);
  s.player.x=x+.5;
  const e = C.extractorAt(s, x, y - 1, 0);
  assert.equal(C.moveExtractor(s, e, x + 1, y - 1).ok, false, 'onto another building');
  assert.equal(C.moveExtractor(s, e, x + 4, y).ok, false, 'out of reach');
  s.shared = 'room';
  assert.equal(C.moveExtractor(s, e, x, y + 1).ok, false, 'an older room does not know moves');
  assert.equal(e.x, x); assert.equal(e.y, y - 1);
  s.roomMoves = true;
  assert.ok(C.moveExtractor(s, e, x, y + 1).ok, 'this room checks them');
});

test('a move goes on the wire as an act and an edit, and nothing else does', () => {
  assert.deepEqual(P.cleanAct(['v', 10, 1.5, 2.5, 0, 1, 2, 2, 3]), ['v', 10, 1.5, 2.5, 0, 1, 2, 2, 3]);
  assert.equal(P.cleanAct(['v', 10, 1.5, 2.5, 0, 1, 2, 2]), null);
  assert.equal(P.cleanAct(['v', 10, 1.5, 2.5, 0, 1, 2, 2, 0.5]), null);
  assert.deepEqual(P.cleanEdit(['v', 1, 2, 0, 2, 3]), ['v', 1, 2, 0, 2, 3]);
  assert.equal(P.cleanEdit(['v', 1, 2, 0, 2]), null);
  assert.equal(P.cleanEdit(['v', 1, 2, 0, 2, 'x']), null);
});

test('a Stoneworks moved away stops doubling the quarries it left', () => {
  const { s, x, y } = stoneWorld();
  s.unlocks.stoneworks = true;
  assert.ok(C.place(s, 'quarry', { x: x - 1, y }).ok);
  const q = C.extractorAt(s, x - 1, y, 0);
  assert.ok(C.place(s, 'stoneworks', { x, y }).ok);
  const w = C.extractorAt(s, x, y, 0);
  assert.equal(C.supportingBuilding(s, q), w);
  assert.equal(reachOf(s, { key: 'stoneworks', x, y, z: 0, building: w }).targets.length, 1);
  // Walk over and move it three tiles off: out of the quarry's two.
  s.player.x = x + 2.5;
  assert.ok(C.moveExtractor(s, w, x + 2, y + 1).ok);
  assert.equal(C.supportingBuilding(s, q), null);
  assert.equal(reachOf(s, { key: 'stoneworks', x: w.x, y: w.y, z: 0, building: w }).targets.length, 0);
});

// A crystal world's deep site, opened up (as test/unit/cultivation.test.js).
function deep() {
  const s = C.createState(7, { cultivation: true });
  for (const r of C.RESOURCES) C.earn(s, r, 300, 'hand');
  for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
    const t = C.tileAt(s.world, x, y, -2);
    if (!C.TILE_INFO[t].rise && !C.TILE_INFO[t].descend) { C.setRichness(s.world, x, y, -2, 0); C.markExplored(s.world, x, y, -2); }
  }
  s.player = { x: 0.5, y: 0.5, z: -2 };
  return s;
}
const build = (s, kind, x, y) => { s.player.x = x + 0.5; s.player.y = y + 0.5; assert.equal(C.cultivationCommand(s, { type: 'build', kind, x, y }), 'ok'); return C.cultivationAt(s, x, y); };

test('a crystal-world facility moves with what it holds, and a conduit keeps its chamber and vault', () => {
  const s = deep();
  const room = build(s, 'chamber', 0, 0), vault = build(s, 'vault', 2, 0), pipe = build(s, 'conduit', 1, 0);
  room.buffer = 4;
  s.player.x = 0.5; s.player.y = 0.5;
  assert.equal(C.moveFacility(s, room, 0, 1), 'ok');
  assert.equal(C.cultivationAt(s, 0, 1), room);
  assert.equal(C.cultivationAt(s, 0, 0), undefined);
  assert.equal(room.buffer, 4);
  // A chamber moved out of its conduit's reach would leave it joining nothing.
  s.player.x = -2.5; s.player.y = 1.5;
  assert.equal(C.facilitySite(s, 'chamber', -4, 1, room), 'route');
  assert.equal(C.moveFacility(s, room, -3, 1), 'route');
  assert.equal(pipe.from, room.id); assert.equal(pipe.to, vault.id);
  // A conduit moved joins what is near it there.
  s.player.x = 1.5; s.player.y = 1.5;
  assert.equal(C.moveFacility(s, pipe, 1, 1), 'ok');
  assert.deepEqual(reachOf(s, { kind: 'conduit', x: 1, y: 1, z: -2, building: pipe }).targets.map((b) => b.kind).sort(), ['chamber', 'vault']);
});

test('building a facility checks its site the same way before and after moves', () => {
  const s = deep();
  build(s, 'chamber', 0, 0);
  assert.equal(C.facilitySite(s, 'chamber', 0, 0), 'occupied');
  assert.equal(C.facilitySite(s, 'conduit', 5, 5), 'route');
  assert.equal(C.facilitySite(s, 'cooler', 1, 0), null);
  assert.equal(C.facilitySite(s, 'shelter', 200, 200), 'unseen');
  s.player.z = 0;
  assert.equal(C.facilitySite(s, 'cooler', 1, 0), 'deep', 'only a heart shelter goes up near the surface');
});
