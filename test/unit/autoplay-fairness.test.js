import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { createSimulation } from '../../src/engine/simulation.js';

function hiddenMine(hiddenType) {
  const s = C.createState(12345), w = s.world;
  s.player = { x: 0.5, y: 0.5, z: -1 };
  w.chunks.clear(); w.hotKey = -1; w.hotChunk = null;
  for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
    const type = new Uint8Array(C.CHUNK_SIZE ** 2).fill(hiddenType);
    for (let i = 0; i < type.length; i++) {
      const x = cx * C.CHUNK_SIZE + i % C.CHUNK_SIZE, y = cy * C.CHUNK_SIZE + Math.floor(i / C.CHUNK_SIZE);
      if (Math.abs(x) <= 1 && Math.abs(y) <= 1) { type[i] = C.T.TUNNEL; C.markExplored(w, x, y, -1); }
    }
    const guarded = new Proxy(type, { get(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key)) {
        const i = Number(key), x = cx * C.CHUNK_SIZE + i % C.CHUNK_SIZE, y = cy * C.CHUNK_SIZE + Math.floor(i / C.CHUNK_SIZE);
        assert.ok(C.isExplored(w, x, y, -1), `planner inspected hidden terrain at ${x},${y}`);
      }
      return target[key];
    } });
    w.chunks.set(C.packKey(cx, cy, -1), { type: guarded, rich: new Uint8Array(C.CHUNK_SIZE ** 2).fill(1) });
  }
  return s;
}

test('underground belief routes never inspect hidden rock, including during reconstruction', () => {
  const a = hiddenMine(C.T.BEDROCK), b = hiddenMine(C.T.SOIL);
  const opts = { pad: 2, known: true, dig: true, unknownDig: true };
  const route = C.findPath(a, 0, 0, 6, 0, opts);
  assert.ok(route);
  assert.deepEqual(C.findPath(b, 0, 0, 6, 0, opts), route,
    'identical observations produce identical plans despite different hidden geology');
  assert.ok(route.some(p => !C.isExplored(a.world, p.x, p.y, -1)), 'fixture actually plans into unknown terrain');
});

test('AUTO ignores an unseen shared-world charger', () => {
  const a = C.createState(12345), b = C.createState(12345);
  for (const s of [a, b]) {
    C.revealAround(s); s.shared = true; s.battery = 0.1; s.time = C.DAY_LENGTH / 2;
  }
  const x = Math.floor(a.player.x) + 40, y = Math.floor(a.player.y);
  assert.equal(C.isExplored(a.world, x, y, 0), false);
  b.world.props.set(C.packKey(x, y, 0), 'wheel');
  const ma = C.newMind(), mb = C.newMind();
  assert.deepEqual(C.nextIntent(b, mb), C.nextIntent(a, ma), 'hidden prop cannot change a decision');
  assert.equal(mb.charger, null);
});

test('unknown shore terrain cannot change AUTO solar placement', () => {
  const a = C.createState(12345);
  const water = C.nearestTile(0.5, 0.5, 40, (x, y) => x >= 20 && C.swimsAt(a.world, x, y, 0));
  assert.ok(water);
  a.player = { x: water.x + 0.5, y: water.y + 0.5, z: 0 };
  a.battery = 0.8; a.tools.boots = 2; a.inv.stone = 100; a.inv.ore = 100;
  a.world.explored.clear(); C.markExplored(a.world, water.x, water.y, 0);
  const b = C.deserialize(C.serialize(a));
  for (const [s, type] of [[a, C.T.GRASS], [b, C.T.ROCK]]) {
    const x = water.x + 1, y = water.y;
    C.tileAt(s.world, x, y, 0);
    s.world.chunks.get(C.packKey(C.chunkCoord(x), C.chunkCoord(y), 0)).type[C.chunkIndex(x, y)] = type;
    assert.equal(C.isExplored(s.world, x, y, 0), false);
  }
  assert.deepEqual(C.nextIntent(a, C.newMind()), C.nextIntent(b, C.newMind()));
});

test('AUTO cannot immediately climb a nearby ladder hidden by the current light radius', () => {
  const s = C.createState(12345);
  const ladder = C.waysIn(s.world, -1, -32, -32, 32, 32).find(p => C.wayUp(s.world, p.x, p.y, -1));
  assert.ok(ladder);
  s.player = { x: ladder.x - 0.5, y: ladder.y - 0.5, z: -1 };
  s.battery = 0;
  C.setRichness(s.world, Math.floor(s.player.x), Math.floor(s.player.y), -1, 0);
  C.revealAround(s);
  assert.equal(C.isExplored(s.world, ladder.x, ladder.y, -1), false);
  assert.equal(C.canClimbAt(s, ladder.x, ladder.y), true, 'fixture ladder is in action reach but unseen');
  const mind = C.newMind(); C.nextIntent(s, mind);
  for (const r of C.RESOURCES) s.inv[r] = 1e6;
  mind.goal = { kind: 'build', id: 'garden', level: 0, cost: C.extractorCost(s, 'garden') };
  mind.decided = s.time;
  const intent = C.nextIntent(s, mind);
  assert.notDeepEqual(intent, { type: 'climb', x: ladder.x, y: ladder.y, badge: 'ui.climb' });
});

test('normal reveal follows within-tile movement and legitimate sight upgrades', () => {
  const s = C.createState(12345);
  s.player = { x: 0.05, y: 0.5, z: -1 }; s.battery = 0;
  C.revealAround(s);
  assert.equal(C.isExplored(s.world, 1, 0, -1), false);
  let moving = true;
  const engine = createSimulation({ game: { state: s },
    controller: { steer() { if (moving) s.player.x += 0.2; return moving; }, tick() {}, checkGoals() {} },
    autoplay: { tick() {} }, input: { moveVector: () => ({ x: 0, y: 0 }), holdPoint: () => null } });
  engine.tick(); engine.tick(); moving = false;
  assert.equal(Math.floor(s.player.x), 0);
  assert.equal(C.isExplored(s.world, 1, 0, -1), true, 'nearby terrain is revealed before crossing the tile boundary');
  assert.equal(C.isExplored(s.world, 1, 1, -1), false);
  s.insight = 1e6;
  assert.equal(C.buy(s, 'cartographer').ok, true);
  engine.tick();
  assert.equal(C.isExplored(s.world, 1, 1, -1), true, 'increased sight reveals terrain without needing a walk');
});

test('an unseen underground prop cannot suppress AUTO lighting placement', () => {
  const a = C.createState(12345);
  a.player = { x: 0.5, y: 0.5, z: -1 }; a.inv.mycelium = 10;
  C.setRichness(a.world, 0, 0, -1, 0); C.revealAround(a);
  const b = C.deserialize(C.serialize(a));
  b.world.props.set(C.packKey(5, 0, -1), 'lamp');
  assert.equal(C.isExplored(b.world, 5, 0, -1), false);
  function intent(s) {
    const mind = C.newMind(); C.nextIntent(s, mind);
    const goal = { kind: 'buy', id: 'abundance', level: 0, cost: { crystal: 1e12 } };
    mind.goal = goal; mind.decided = s.time; mind.how = { goal, t: s.time, p: { layer: 1 } };
    return C.nextIntent(s, mind);
  }
  assert.deepEqual(intent(a), { type: 'prop', kind: 'glowcap', badge: 'mark.glowcap' });
  assert.deepEqual(intent(b), intent(a));
});
