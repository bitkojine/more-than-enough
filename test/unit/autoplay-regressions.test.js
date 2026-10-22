import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, findNear, standOn, holdPerfect } from './helpers.js';
import { createPerfect } from '../../src/game/perfect.js';
import { createController } from '../../src/game/controller.js';

test('an exhausted mining plan is abandoned instead of climbing out and immediately returning', () => {
  const s = C.createState(12345), mind = C.newMind({ mineEdge: 1.2 }), z = -12;
  for (const tool of Object.keys(s.tools)) s.tools[tool] = C.TOOLS[tool].levels.length;
  const exit = C.waysIn(s.world, z, -32, -32, 32, 32).find(p => C.wayUp(s.world, p.x, p.y, z));
  assert.ok(exit);
  s.player = { x: exit.x + 0.5, y: exit.y + 0.5, z };
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 0, y: 0, z: 0, buffer: 0 });
  C.revealAround(s); C.nextIntent(s, mind);
  const goal = { kind: 'buy', id: 'abundance', level: 0, cost: { mycelium: 1e12 } };
  assert.equal(C.plan(s, mind, goal.cost).layer, 12, 'the fixture initially prefers its current mine');
  for (let y = exit.y - 40; y <= exit.y + 40; y++) for (let x = exit.x - 40; x <= exit.x + 40; x++) mind.bad.add(C.packKey(x, y, z));
  mind.goal = goal; mind.decided = s.time; mind.how = { goal, t: s.time, p: { layer: 12 } };
  assert.equal(C.nextIntent(s, mind).type, 'climb');
  assert.equal(mind.how, null, 'a retreat discards the failed plan');
  assert.ok(mind.mineFailures.has(12));
  assert.notEqual(C.plan(s, mind, goal.cost).layer, 12, 'the unchanged mine is not selected again');
  const version = C.observationVersion(s.world, z), x = exit.x + 50;
  C.setRichness(s.world, x, exit.y, z, 0);
  assert.equal(C.observationVersion(s.world, z), version, 'an unseen edit is not new information');
  assert.notEqual(C.plan(s, mind, goal.cost).layer, 12);
  C.markExplored(s.world, x, exit.y, z);
  assert.equal(C.plan(s, mind, goal.cost).layer, 12, 'new observations allow a fresh attempt');
});

for (const fps of [10, 20, 30, 60]) test(`AUTO keeps its quarter-second cadence at ${fps} fps without losing tick remainders`, () => {
  const s = C.createState(12345);
  standOn(s, findNear(s, (st, x, y) => C.tileAt(st.world, x, y, 0) === C.T.FOREST && C.richness(st.world, x, y, 0) > 5));
  C.revealAround(s);
  const acts = [];
  const auto = createPerfect({ game: { state: s }, hud: { toast() {} },
    controller: { walking: false, perform(intent) { acts.push(intent); return true; } } });
  auto.press();
  assert.equal(acts[0].type, 'harvestAt');
  for (let i = 0; i < fps; i++) auto.tick(1 / fps, true);
  assert.equal(acts.length, 5, 'initial act plus four held repeats in one second');
  auto.release();
});

test('an AUTO walking step completes on the last moving frame, without a stationary arrival frame', () => {
  const s = C.createState(12345);
  const controller = createController({ game: { state: s } });
  controller.perform({ type: 'walk', x: Math.floor(s.player.x) + 1, y: Math.floor(s.player.y) });
  let frames = 0;
  while (controller.walking && frames++ < 60) {
    assert.equal(controller.steer(1 / 60, { x: 0, y: 0 }), true, 'each walking frame makes progress');
  }
  assert.equal(controller.walking, false);
  assert.ok(frames < 60);
});

test('a cached plan stops gathering a resource once its share of the price is met', () => {
  const s = C.createState(12345);
  standOn(s, findNear(s, (st, x, y) => C.tileAt(st.world, x, y, 0) === C.T.STONE && !C.gearNeeded(st, x, y)));
  C.revealAround(s);
  const mind = C.newMind();
  C.nextIntent(s, mind);
  s.inv.mycelium = 100;
  const goal = { kind: 'buy', id: 'pickaxe', cost: C.upgradeCost(s, 'pickaxe'), level: C.upgradeLevel(s, 'pickaxe') };
  mind.goal = goal;
  mind.decided = s.time;
  mind.how = { goal, t: s.time, p: { how: { mycelium: 'hand', stone: 'hand' } } };
  const intent = C.nextIntent(s, mind);
  assert.equal(intent.type, 'harvestAt');
  assert.equal(intent.badge, 'resource.stone', 'work on the missing stone instead of surplus mycelium');
});

test('better travel and digging gear lets AUTO reconsider previously unreachable targets', () => {
  const s = C.createState(12345), mind = C.newMind();
  C.nextIntent(s, mind);
  const target = C.packKey(300, 300, 0);
  mind.bad.add(target);
  s.tools.boots++;
  C.nextIntent(s, mind);
  assert.equal(mind.bad.has(target), false, 'old route failures are not permanent after an access upgrade');
});

test('seeing only rare mushrooms does not stop AUTO exploring for ordinary forage', () => {
  const s = C.createState(12345), mind = C.newMind();
  C.nextIntent(s, mind);
  const goal = { kind: 'buy', id: 'basket', cost: C.upgradeCost(s, 'basket'), level: C.upgradeLevel(s, 'basket') };
  mind.goal = goal;
  mind.decided = s.time;
  mind.how = { goal, t: s.time, p: { how: { mycelium: 'hand' } } };
  mind.near.mycelium = { tile: null, gated: true, t: s.time, gear: [s.tools.pickaxe,s.tools.basket,s.tools.boots].join(',') };
  const intent = C.nextIntent(s, mind);
  assert.equal(intent.type, 'walk');
  assert.equal(intent.badge, 'ui.explore');
});

test('AUTO does not plan to hand-gather globally locked ore before upgrading the pickaxe', () => {
  const s = C.createState(12345), mind = C.newMind();
  C.nextIntent(s, mind);
  assert.equal(C.plan(s, mind, { ore: 1 }).eta, Infinity);
});

test('searching for a new building deposit can continue beyond exhausted land near home', () => {
  const s = C.createState(12345), mind = C.newMind();
  C.nextIntent(s, mind);
  s.player.x += 250;
  const land = C.nearestTile(s.player.x, s.player.y, 10, (x, y) => C.walkable(s.world, x, y, 0) && !C.swimsAt(s.world, x, y, 0));
  standOn(s, land);
  C.revealAround(s);
  const goal = { kind: 'find', id: 'mine', cost: {}, level: 0 };
  mind.goal = goal;
  mind.decided = s.time;
  mind.spots['tile' + C.T.ORE] = { tile: null, t: s.time };
  const intent = C.nextIntent(s, mind);
  assert.equal(intent.type, 'walk', 'continue looking locally instead of waiting outside the old home radius');
  assert.equal(intent.badge, 'ui.explore');
});

test('returning from deeper mines preserves the real exit and finds it beyond 60 tiles', () => {
  const s = C.createState(12345), mind = C.newMind();
  s.tools.pickaxe = 6;
  s.tools.basket = 6;
  s.tools.boots = 5;
  const cave = C.nearestTile(s.player.x, s.player.y, 100, (x, y) => C.tileAt(s.world, x, y, 0) === C.T.CAVE);
  standOn(s, cave);
  assert.equal(C.descendAt(s, cave.x, cave.y), true);
  C.revealAround(s);
  C.nextIntent(s, mind);
  const exit = { ...mind.arrived[-1] };
  let distant;
  for (let x = exit.x + 100; x < exit.x + 300 && !distant; x += 16) {
    const y = exit.y;
    if (C.wayUp(s.world, x, y, -1)) continue;
    const t = C.tileAt(s.world, x, y, -1);
    if (C.TILE_INFO[t].cleared === C.T.TUNNEL) distant = { x, y };
  }
  assert.ok(distant, 'fixture has a remote tunnel with no local exit');
  C.setRichness(s.world, distant.x, distant.y, -1, 0);
  standOn(s, distant);
  C.markExplored(s.world, distant.x, distant.y, -1);
  mind.z = -2; // simulate returning through a shaft from the deeper layer
  mind.goal = { kind: 'build', id: 'garden', cost: C.extractorCost(s, 'garden'), level: 0 };
  mind.decided = s.time;
  s.inv.mycelium = 100;
  const intent = C.nextIntent(s, mind);
  assert.deepEqual(mind.arrived[-1], exit, 'the downward shaft did not replace the real exit');
  assert.ok(mind.upWay.way, 'the known exit is found without the old radius limit');
  assert.equal(C.wayUp(s.world, mind.upWay.way.x, mind.upWay.way.y, -1), true);
  assert.notEqual(intent.type, 'wait');
});

test('AUTO remembers a seen mine find when its route temporarily leaves glint range', () => {
  const s = C.createState(1468894669), mind = C.newMind();
  for (const k in s.tools) s.tools[k] = C.TOOLS[k].levels.length;
  s.player = { x: -15.5, y: 200.34366666666668, z: -12 };
  s.battery = 0;
  // Reconstruct the small corridor and exhausted nearby finds from the
  // archived loop; evaluation runs still start fresh without fixture edits.
  for (const [x, y] of [[-16, 199], [-16, 200], [-18, 201], [-10, 200]]) {
    C.setRichness(s.world, x, y, -12, 0);
    C.markExplored(s.world, x, y, -12);
  }
  C.revealAround(s); // the nearby bedrock is visible, not an unseen routing oracle
  C.nextIntent(s, mind);
  const goal = { kind: 'buy', id: 'abundance', level: C.upgradeLevel(s, 'abundance'), cost: { stone: 1e12 } };
  mind.goal = goal;
  mind.decided = s.time;
  mind.how = { goal, t: s.time, p: { layer: 12 } };
  mind.find = null;
  assert.deepEqual(C.findsNear(s).map(({ x, y }) => ({ x, y })), [{ x: -13, y: 208 }]);
  assert.deepEqual(C.nextIntent(s, mind), { type: 'walk', x: -16, y: 199, badge: 'tool.pickaxe' });
  s.player.y = 199.57283333333334;
  C.revealAround(s);
  assert.equal(C.findsNear(s).length, 0, 'the necessary first step loses sight of the find');
  const intent = C.nextIntent(s, mind);
  assert.equal(intent.type, 'harvestAt', 'continue tunnelling instead of exploring back to the glint');
  assert.equal(intent.badge, 'tool.pickaxe');
  assert.deepEqual({ x: mind.find.x, y: mind.find.y }, { x: -13, y: 208 });
  C.setRichness(s.world, -13, 208, -12, 0);
  C.nextIntent(s, mind);
  assert.ok(mind.find, 'a distant unseen edit cannot erase a remembered observation');
  C.markExplored(s.world, -13, 208, -12);
  C.nextIntent(s, mind);
  assert.equal(mind.find, null, 'a collected find is forgotten when its absence is observed');
});

test('AUTO keeps a discovered shaft when a detour moves outside its search radius', () => {
  const s = C.createState(4274303474), mind = C.newMind();
  for (const k in s.tools) s.tools[k] = C.TOOLS[k].levels.length;
  s.player = { x: 36.65, y: 26.5, z: -5 };
  s.battery = 0;
  for (const [x, y] of [[36, 26], [37, 26]]) C.setRichness(s.world, x, y, -5, 0);
  C.markExplored(s.world, -4, 19, -5);
  C.nextIntent(s, mind);
  const goal = { kind: 'buy', id: 'abundance', level: C.upgradeLevel(s, 'abundance'), cost: { stone: 1e12 } };
  mind.goal = goal;
  mind.decided = s.time;
  mind.how = { goal, t: s.time, p: { layer: 6 } };
  mind.shaft = null;
  C.nextIntent(s, mind);
  assert.deepEqual(mind.shaft, { x: -4, y: 19, z: -5 });
  // A route around rock can step east before going west toward this shaft.
  s.player.x = 37.35;
  assert.equal(C.nearestExploredTile(s.world, s.player.x, s.player.y, -5, 40,
    (x, y) => x === -4 && y === 19), null);
  const intent = C.nextIntent(s, mind);
  assert.equal(intent.badge, 'ui.climbDown', 'continue toward the known shaft instead of exploring back');
  assert.equal(intent.type, 'walk');
  assert.deepEqual(mind.shaft, { x: -4, y: 19, z: -5 });
});


test('AUTO buys affordable required progress rather than an immediately affordable building', () => {
  const s = C.createState(91827), mind = C.newMind();
  C.revealAround(s);
  for (const r of C.RESOURCES) s.inv[r] = 1e8;
  const intent = C.nextIntent(s, mind);
  assert.equal(intent.type, 'buy');
  assert.equal(mind.goal.kind, 'buy');
  assert.ok(C.candidates(s, mind).some(c => c.kind === 'build'), 'a real building competes with the upgrade');
});

test('building investment score prices cross-resource inputs and rising repeated costs without mutation', () => {
  const s = C.createState(91827), mind = C.newMind();
  const rates = { mycelium: 10, stone: 10, ore: 10, crystal: 10 };
  const before = C.serialize(s);
  const first = C.investmentPayback(s, mind, 'garden', rates);
  assert.ok(first > 0 && Number.isFinite(first));
  assert.deepEqual(C.serialize(s), before);
  for (let i = 0; i < 20; i++) s.extractors.push({ key: 'garden', res: 'mycelium', x: i, y: 0, z: 0, buffer: 0 });
  assert.ok(C.investmentPayback(s, mind, 'garden', rates) > first * 10);
  assert.ok(C.investmentPayback(s, mind, 'quarry', { ...rates, mycelium: 0 }) > 0);
});


test('default AUTO stays on the surface even when an elective mining estimate is faster', () => {
  const s = C.createState(12345), mind = C.newMind();
  for (const tool of Object.keys(s.tools)) s.tools[tool] = C.TOOLS[tool].levels.length;
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 0, y: 0, z: 0, buffer: 0 });
  const exit = C.waysIn(s.world, -12, -32, -32, 32, 32).find(p => C.wayUp(s.world, p.x, p.y, -12));
  s.player = { x: exit.x + 0.5, y: exit.y + 0.5, z: -12 };
  C.revealAround(s); C.nextIntent(s, mind);
  assert.ok(Number.isFinite(C.plan(s, mind, { mycelium: 1e12 }).eta));
  assert.equal(C.plan(s, mind, { mycelium: 1e12 }).layer, undefined);
  const elective = C.newMind({ mineEdge: 1.2 });
  C.nextIntent(s, elective);
  assert.equal(C.plan(s, elective, { mycelium: 1e12 }).layer, 12, 'fixture previously selected deep mining');
});

test('minimum-mining AUTO can still use observed caves when a needed resource has no surface route', () => {
  const s = C.createState(12345), mind = C.newMind();
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 0, y: 0, z: 0, buffer: 0 });
  const cave = C.nearestTile(s.player.x, s.player.y, 120, (x, y) => C.tileAt(s.world, x, y, 0) === C.T.CAVE);
  assert.ok(cave); C.markExplored(s.world, cave.x, cave.y, 0);
  C.nextIntent(s, mind);
  const p = C.plan(s, mind, { ore: 10000 });
  assert.ok(Number.isFinite(p.eta));
  assert.ok(p.layer > 0, 'unavailable surface ore permits fallback mining');
});


test('AUTO makes surface progress instead of taking a mining fallback for an optional early goal', () => {
  const s = C.createState(777);
  let descents = 0;
  holdPerfect(s, 20 * 60, { seen(intent) { if (intent.type === 'descend') descents++; } });
  assert.equal(descents, 0);
  assert.ok(s.extractors.length > 0 && s.tools.pickaxe > 1, 'surface investments and access upgrades still progress');
});
