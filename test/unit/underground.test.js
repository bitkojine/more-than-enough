import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, findNear, standOn, run, mushroomGarden, away } from './helpers.js';

const { SURFACE } = C;

function neighbours(s) {
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: px + dx, y: py + dy, dx, dy }));
}

test('going down the cave mouth you stand in lands at the foot of a ladder back up', () => {
  const s = away(C.createState(31415));
  const fx = Math.floor(s.player.x), fy = Math.floor(s.player.y);
  assert.equal(C.goDown(s), true);
  assert.equal(s.player.z, -1);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y)], [fx, fy], 'directly beneath the cave mouth');
  assert.equal(typeAt(s, fx, fy), T.RISE);
  assert.ok(C.holeAbove(s.world, fx, fy, -1), 'with the opening above it');
  assert.equal(C.goDown(s), false, 'already underground');
  assert.equal(s.world.holes.size, 0, 'and nothing was dug');
});
test('tunnels must be dug before they can be walked', () => {
  const s = away(C.createState(31415));
  s.tools.pickaxe = 1; // explicit legacy basic pick for this digging fixture
  C.goDown(s);
  const n = neighbours(s).find((t) => typeAt(s, t.x, t.y) !== T.BEDROCK && typeAt(s, t.x, t.y) !== T.SHAFT);
  const start = { ...s.player };
  C.move(s, n.dx, n.dy, 0.3);
  assert.deepEqual([s.player.x, s.player.y], [start.x, start.y], 'solid rock blocks movement');
  const dug = C.harvestAt(s, n.x, n.y);
  assert.ok(dug, 'nearby rock can be dug');
  assert.equal(typeAt(s, n.x, n.y), T.TUNNEL);
  C.move(s, n.dx, n.dy, 0.3);
  assert.ok((s.player.x - start.x) * n.dx + (s.player.y - start.y) * n.dy > 0.1, 'the new tunnel is walkable');
});

test('digging a seam yields its resource; soil and bedrock behave', () => {
  const s = away(C.createState(5));
  C.goDown(s);
  const seam = findNear(s, (st, x, y) => typeAt(st, x, y) === T.ORE_SEAM, 30);
  C.setRichness(s.world, seam.x, seam.y - 1, -1, 0); // open a spot beside it
  standOn(s, { x: seam.x, y: seam.y - 1 });
  assert.equal(C.harvestAt(s, seam.x, seam.y), null, 'ore wants Pickaxe II');
  assert.deepEqual(C.gearNeeded(s, seam.x, seam.y), { tool: 'pickaxe', level: 2 });
  s.tools.pickaxe = 2;
  const got = C.harvestAt(s, seam.x, seam.y);
  assert.deepEqual([got.res, got.amount, got.now], ['ore', 2, T.TUNNEL]);
  assert.equal(s.inv.ore, 2);

  const bedrock = findNear(s, (st, x, y) => typeAt(st, x, y) === T.BEDROCK, 30);
  standOn(s, { x: bedrock.x, y: bedrock.y + 1 });
  assert.equal(C.harvestAt(s, bedrock.x, bedrock.y), null, 'bedrock cannot be dug');
});

test('holding Gather never auto-digs; digging is a deliberate choice', () => {
  const s = away(C.createState(31415));
  C.goDown(s);
  assert.equal(C.harvestTarget(s), null);
  assert.equal(C.harvest(s), null);
});

test('a Trail digs the rock it crosses but never opens a shaft', () => {
  const s = away(C.createState(2718));
  s.tools.pickaxe = 1; // explicit legacy basic pick for this digging fixture
  C.goDown(s);
  const p = s.player;
  const stroke = [{ x: p.x - 1.5, y: p.y }, { x: p.x + 1.5, y: p.y }];
  const targets = C.sweepTargets(s, stroke);
  for (const t of targets) assert.notEqual(typeAt(s, t.x, t.y), T.SHAFT);
  assert.ok(targets.length > 0);
});

test('shafts open with one dig and take the player down one layer', () => {
  const s = away(C.createState(31415));
  s.tools.pickaxe = 1; // explicit legacy basic pick for this digging fixture
  C.goDown(s);
  const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 40);
  C.setRichness(s.world, shaft.x + 1, shaft.y, -1, 0);
  standOn(s, { x: shaft.x + 1, y: shaft.y });
  assert.equal(C.descendAt(s, shaft.x, shaft.y), false, 'a closed shaft cannot be used');
  assert.equal(C.harvestAt(s, shaft.x, shaft.y).now, T.SHAFT_OPEN);
  assert.equal(s.player.z, -1, 'opening the shaft does not descend');
  assert.equal(C.descendAt(s, shaft.x + 1, shaft.y), false, 'only the shaft tile works');
  assert.equal(C.descendAt(s, shaft.x, shaft.y), true);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y), s.player.z], [shaft.x, shaft.y, -2], 'arrives directly below the shaft');
  assert.equal(s.underground.deepest, -2);
  assert.ok(C.walkable(s.world, shaft.x, shaft.y, -2));
});

test('an open shaft must be within reach to use it', () => {
  const s = away(C.createState(31415));
  C.goDown(s);
  const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 40);
  C.setRichness(s.world, shaft.x, shaft.y, -1, 0);
  standOn(s, { x: shaft.x + 6, y: shaft.y });
  assert.equal(C.descendAt(s, shaft.x, shaft.y), false);
  assert.equal(s.player.z, -1);
});

test('there is no digging up: every way up is a ladder beneath a way down', () => {
  const s = away(C.createState(31415));
  const cave = { x: Math.floor(s.player.x), y: Math.floor(s.player.y) };
  C.goDown(s);
  const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 40);
  C.setRichness(s.world, shaft.x, shaft.y, -1, 0);
  standOn(s, { x: shaft.x + 1, y: shaft.y });
  C.descendAt(s, shaft.x, shaft.y);
  assert.equal(s.player.z, -2);
  assert.equal(C.canGoUp(s), true, 'the shaft you came down is a way back up');
  // Anywhere else on layer -2, rock overhead stays rock.
  const spot = { x: shaft.x + 3, y: shaft.y };
  C.setRichness(s.world, spot.x, spot.y, -2, 0);
  standOn(s, spot);
  assert.equal(C.canGoUp(s), false);
  assert.equal(C.goUp(s), false);
  assert.equal(s.player.z, -2, 'no way up here');
  standOn(s, shaft);
  assert.equal(C.goUp(s), true);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y), s.player.z], [shaft.x, shaft.y, -1], 'straight up the shaft');
  standOn(s, cave);
  assert.equal(C.goUp(s), true);
  assert.equal(s.player.z, SURFACE, 'and up the ladder to the cave mouth');
  assert.equal(C.goUp(s), false, 'nothing above the forest');
});

test('a shaft not yet opened is a way up from below, and climbing it opens it', () => {
  const s = away(C.createState(31415));
  C.goDown(s);
  const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 40);
  s.player.z = -2;
  standOn(s, shaft);
  assert.equal(typeAt(s, shaft.x, shaft.y), T.RISE, 'the foot of its ladder, on the layer below');
  assert.ok(C.canGoUp(s));
  assert.equal(C.goUp(s), true);
  assert.equal(typeAt(s, shaft.x, shaft.y), T.SHAFT_OPEN);
});

test('tap a ladder up within reach to climb it', () => {
  const s = away(C.createState(31415));
  const cave = { x: Math.floor(s.player.x), y: Math.floor(s.player.y) };
  C.goDown(s);
  const n = neighbours(s).find((t) => typeAt(s, t.x, t.y) !== T.BEDROCK && typeAt(s, t.x, t.y) !== T.SHAFT);
  C.harvestAt(s, n.x, n.y);
  standOn(s, n);
  assert.equal(C.climbAt(s, n.x, n.y), false, 'no ladder on a plain tunnel');
  assert.equal(C.climbAt(s, cave.x, cave.y), true);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y), s.player.z], [cave.x, cave.y, SURFACE]);
  assert.equal(C.climbAt(s, cave.x, cave.y), false, 'nothing above the forest');
});
test('holes dug in older versions still work, and a column rides to the bottom', () => {
  const s = away(C.createState(31415));
  const fx = Math.floor(s.player.x), fy = Math.floor(s.player.y);
  s.world.holes.add(C.packKey(fx, fy, -1));
  s.world.holes.add(C.packKey(fx, fy, -2));
  C.goDown(s);
  assert.equal(s.player.z, -3, 'fell through -1 and -2');
  assert.equal(s.underground.deepest, -3);
  assert.equal(C.goUp(s), true, 'and the old hole is a way back up');
  assert.equal(s.player.z, -2);
});
test('a way up and a way down are never close together', () => {
  const seed = 31415, w = C.createWorld(seed);
  for (const z of [SURFACE, -1, -2, -5]) {
    const downs = [], ups = [];
    for (let cx = -4; cx < 4; cx++) {
      for (let cy = -4; cy < 4; cy++) {
        const d = C.wayDownInChunk(seed, cx, cy, z), u = C.wayUpInChunk(seed, cx, cy, z);
        if (d) downs.push(d);
        if (u) ups.push(u);
      }
    }
    assert.ok(downs.length > 30 && (z === SURFACE || ups.length > 30));
    for (const d of downs) {
      for (const u of ups) {
        const apart = Math.max(Math.abs(d.x - u.x), Math.abs(d.y - u.y));
        assert.ok(apart >= C.WAYS_APART, `layer ${z}: ${d.x},${d.y} and ${u.x},${u.y} are ${apart} apart`);
      }
    }
    for (const u of ups) assert.equal(C.tileAt(w, u.x, u.y, z), T.RISE);
  }
  assert.ok(C.WAYS_APART >= 5);
});
test('no way down or up where none was generated', () => {
  const s = away(C.createState(7));
  const grass = findNear(s, (st, x, y) => typeAt(st, x, y) === T.GRASS);
  standOn(s, grass);
  assert.equal(C.canGoDown(s), false, 'no digging down');
  assert.equal(C.takeWay(s), false);
  const water = findNear(s, (st, x, y) => typeAt(st, x, y) === T.WATER, 300);
  standOn(s, water);
  assert.equal(C.canGoDown(s), false, 'nor through a lake');
  s.player.z = -1;
  standOn(s, grass);
  C.setRichness(s.world, grass.x, grass.y, -1, 0);
  assert.equal(C.canGoUp(s), false, 'no digging up');
  assert.equal(C.takeWay(s), false);
  assert.equal(s.player.z, -1);
});

test('cave mouths: on open land in many forest chunks, never in water, mountains or home', () => {
  const seed = 31415, w = C.createWorld(seed);
  let caves = 0;
  for (let cx = -8; cx < 8; cx++) {
    for (let cy = -8; cy < 8; cy++) {
      const c = C.caveInChunk(seed, cx, cy);
      if (!c) continue;
      caves++;
      assert.equal(C.tileAt(w, c.x, c.y, SURFACE), T.CAVE);
      assert.ok(C.holeBelow(w, c.x, c.y, SURFACE), 'a way down');
      assert.ok([T.RISE, T.SHAFT].includes(C.tileAt(w, c.x, c.y, -1)), 'over the foot of a ladder up (or a shaft on down)');
    }
  }
  assert.ok(caves > 16 * 16 * 0.6, `most chunks have one (${caves} of 256)`);
  const near = C.nearestTile(0.5, 0.5, 24, (x, y) => C.tileAt(w, x, y, SURFACE) === T.CAVE);
  assert.ok(near, 'one is never far from home');
});
test('a hole is not gathered from or built on', () => {
  const s = away(C.createState(31415));
  const forest = findNear(s, (st, x, y) => typeAt(st, x, y) === T.FOREST);
  standOn(s, forest);
  assert.ok(C.canHarvest(s, forest.x, forest.y));
  s.world.holes.add(C.packKey(forest.x, forest.y, SURFACE)); // dug in an older version
  assert.equal(C.canHarvest(s, forest.x, forest.y), false);
});

test('tunnels persist per layer and never leak onto the surface', () => {
  const s = away(C.createState(31415));
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  const surfaceBefore = C.tileAt(s.world, px, py, SURFACE);
  C.goDown(s);
  assert.equal(C.tileAt(s.world, px, py, SURFACE), surfaceBefore);
  C.goUp(s);
  assert.equal(s.player.z, SURFACE);
  C.goDown(s);
  assert.ok(C.walkable(s.world, px, py, -1), 'the chamber is still there');
});

/* Regressions: rules that must only apply on the player's own layer. */

test('logistics hauls from surface camps while you are underground', () => {
  const s = away(C.createState(31415));
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  s.extractors.push(mushroomGarden(px + 1, py, 20));
  C.goDown(s); // right beside the camp, a layer below (never under it)
  assert.equal(C.collectTarget(s), null, 'not by hand from below');
  s.unlocks.logistics = true;
  run(s, 2);
  assert.ok(s.inv.mycelium >= 20, 'Logistics hauls it down to you');
  assert.equal(s.events.length, 0, 'unseen: it flies on the surface');
});

test('each layer has its own fog, lifted only close by underground', () => {
  const s = away(C.createState(31415));
  const found = { ...s.discovered };
  C.goDown(s);
  const p = s.player, px = Math.floor(p.x), py = Math.floor(p.y);
  C.revealAround(s);
  assert.ok(C.isExplored(s.world, px + 2, py, -1), 'rock right beside you is revealed');
  assert.ok(!C.isExplored(s.world, px + 6, py, -1), 'but not as far as on the surface');
  assert.ok(!C.isExplored(s.world, px + 40, py, SURFACE), 'and nothing on the surface');
  assert.equal(C.tileHeight(s.world, px + 6, py, -1), 0, 'unexplored rock gives nothing away');
  assert.deepEqual(s.discovered, found, 'surface discoveries are untouched');
});

test('extractors cannot be built underground', () => {
  const s = away(C.createState(31415));
  Object.assign(s.inv, { mycelium: 1e4, stone: 1e4, ore: 1e4 });
  s.unlocks.compost = true;
  C.goDown(s);
  assert.equal(C.place(s, 'compost').ok, false);
});

test('surface movement still swims and blocks on rock', () => {
  const s = away(C.createState(12345));
  const rock = findNear(s, (st, x, y) => typeAt(st, x, y) === T.ROCK && C.walkable(st.world, x - 1, y, 0));
  s.player.x = rock.x - 0.5; s.player.y = rock.y + 0.5;
  for (let i = 0; i < 5; i++) C.move(s, 1, 0, 0.1);
  assert.ok(Math.floor(s.player.x) < rock.x, 'mountains block');
  const water = findNear(s, (st, x, y) => typeAt(st, x, y) === T.WATER &&
    [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => C.walkable(st.world, x + dx, y + dy, 0)));
  standOn(s, water);
  assert.equal(C.onWater(s), true);
  const x0 = s.player.x;
  C.move(s, 1, 0, 0.2);
  assert.ok(s.player.x > x0, 'water is swimmable');
});

test('underground, pushing into rock drills it after a moment; bedrock and shafts hold', () => {
  const s = away(C.createState(31415));
  s.tools.pickaxe = 1; // explicit legacy basic pick for this digging fixture
  C.goDown(s);
  const progress = { x: 0, y: 0, t: 0 };
  const n = neighbours(s).find((t) => [T.SOIL, T.STONE_SEAM, T.ORE_SEAM].includes(typeAt(s, t.x, t.y)));
  assert.ok(n, 'a diggable wall beside the chamber');
  const steps = Math.floor(C.DRILL_TIME / 0.05) - 1;
  for (let i = 0; i < steps; i++) assert.equal(C.drill(s, progress, n.dx, n.dy, 0.05), null, 'not yet');
  assert.equal(C.drill(s, progress, 0, 0, 0.05), null);
  assert.equal(progress.t, 0, 'letting go starts over');
  let dug = null;
  for (let i = 0; i < steps + 2 && !dug; i++) dug = C.drill(s, progress, n.dx, n.dy, 0.05);
  assert.ok(dug && dug.x === n.x && dug.y === n.y, 'pushing long enough digs the tile ahead');
  assert.equal(typeAt(s, n.x, n.y), T.TUNNEL);

  // Bedrock and closed shafts never drill.
  for (const hard of [T.BEDROCK, T.SHAFT]) {
    const wall = findNear(s, (st, x, y) => typeAt(st, x, y) === hard, 40);
    if (!wall) continue;
    standOn(s, { x: wall.x, y: wall.y + 1 });
    C.setRichness(s.world, wall.x, wall.y + 1, s.player.z, 0);
    for (let i = 0; i < 40; i++) assert.equal(C.drill(s, progress, 0, -1, 0.05), null, `${hard} holds`);
  }
  // Nothing drills on the surface.
  const top = away(C.createState(31415));
  assert.equal(C.drillTarget(top, 1, 0), null);
});

test('no way between layers shares a tile with a building', () => {
  // Never on a cave mouth...
  const s = away(C.createState(31415));
  const fx = Math.floor(s.player.x), fy = Math.floor(s.player.y);
  Object.assign(s.inv, { mycelium: 1e6, stone: 1e6, ore: 1e6 });
  s.unlocks.compost = true;
  const spot = C.buildTarget(s, 'compost');
  assert.ok(spot && (spot.x !== fx || spot.y !== fy), 'not on the cave mouth you stand in');
  // ...nor under one, at the foot of its ladder.
  C.goDown(s);
  assert.ok(C.wayUp(s.world, fx, fy, -1));
  const under = C.buildTarget(s, 'compost');
  assert.ok(!under || under.x !== fx || under.y !== fy, 'not under the way you came down');
});
test('the layer button shows beside a way and says which way it goes', () => {
  const s = away(C.createState(31415));
  const cave = { x: Math.floor(s.player.x), y: Math.floor(s.player.y) };
  assert.deepEqual(C.layerWay(s), { up: false, ...cave }, 'climb down');
  assert.equal(C.takeWay(s), true);
  assert.equal(s.player.z, -1);
  assert.deepEqual(C.layerWay(s), { up: true, ...cave }, 'climb up the way you came down');
  // A step off the ladder: still within reach, the button stays.
  const n = neighbours(s).find((t) => typeAt(s, t.x, t.y) !== T.BEDROCK && typeAt(s, t.x, t.y) !== T.SHAFT);
  C.harvestAt(s, n.x, n.y);
  standOn(s, n);
  assert.deepEqual(C.layerWay(s), { up: true, ...cave }, 'beside the ladder');
  // Far from any way: no button.
  standOn(s, { x: n.x + n.dx * 4, y: n.y + n.dy * 4 });
  assert.equal(C.layerWay(s), null);
  assert.equal(C.takeWay(s), false);
  // Beside an open shaft underground, it says down (not up).
  const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 40);
  C.setRichness(s.world, shaft.x, shaft.y, -1, 0);
  C.setRichness(s.world, shaft.x + 1, shaft.y, -1, 0);
  standOn(s, { x: shaft.x + 1, y: shaft.y });
  assert.deepEqual(C.layerWay(s), { up: false, x: shaft.x, y: shaft.y });
  assert.equal(C.takeWay(s), true);
  assert.equal(s.player.z, -2);
});
test('props: placed underground on open floor, one per tile, paid for, and saved', () => {
  const s = away(C.createState(31415));
  s.tools.pickaxe = 1; // explicit legacy basic pick for this digging fixture
  assert.equal(C.canPlaceProp(s, 'glowcap'), false, 'not on the surface');
  assert.equal(C.isDark(s), false, 'not dark at noon in the forest');
  C.goDown(s);
  assert.equal(C.isDark(s), true, 'always dark underground');
  s.inv.mycelium = 10;
  assert.equal(C.canPlaceProp(s, 'glowcap'), false, 'not on a way between layers');
  s.inv.mycelium = 0;
  const n = neighbours(s).find((t) => typeAt(s, t.x, t.y) !== T.BEDROCK && typeAt(s, t.x, t.y) !== T.SHAFT);
  C.harvestAt(s, n.x, n.y);
  standOn(s, n);
  assert.equal(C.placeProp(s, 'glowcap').ok, false, 'needs mycelium');
  assert.equal(C.canPlaceProp(s, 'nonsense'), false);
  s.inv.mycelium = 10;
  assert.equal(C.placeProp(s, 'glowcap').ok, true);
  assert.equal(s.inv.mycelium, 10 - C.PROPS.glowcap.cost.mycelium);
  assert.equal(C.canPlaceProp(s, 'flag'), false, 'one per tile, of any kind');
  C.setRichness(s.world, n.x + n.dx, n.y + n.dy, s.player.z, 0);
  standOn(s, { x: n.x + n.dx, y: n.y + n.dy });
  Object.assign(s.inv, { stone: 8, crystal: 1 });
  assert.equal(C.placeProp(s, 'lamp').ok, true, 'a lamp next door');
  assert.deepEqual([...s.world.props.values()].sort(), ['glowcap', 'lamp']);
  const back = C.deserialize(C.serialize(s));
  assert.deepEqual([...back.world.props], [...s.world.props], 'props are saved');
  const night = away(C.createState(1));
  night.time = C.DAY_LENGTH / 2;
  assert.equal(C.isDark(night), true, 'and at night');
});

test('home ground is sealed: no way down from it, none up into it; deeper is like anywhere', () => {
  const s = C.createState(31415);
  const h = { x: Math.floor(s.player.x), y: Math.floor(s.player.y) };
  assert.equal(typeAt(s, h.x, h.y), T.HOME, 'every world starts on home ground');
  assert.equal(C.canGoDown(s), false, 'no way down from home ground');
  assert.equal(C.takeWay(s), false);
  // Underground, under home: no surfacing into it...
  s.player.z = -1;
  C.setRichness(s.world, h.x, h.y, -1, 0);
  assert.equal(C.canGoUp(s), false, 'no coming up onto home ground');
  // ...but between deeper layers, ways are generated as anywhere else.
  const shaft = C.shaftInChunk(s.world.seed, C.chunkCoord(h.x), C.chunkCoord(h.y), -1);
  s.player.z = -2;
  standOn(s, shaft);
  assert.equal(C.canGoUp(s), true, 'under home, deeper layers connect as usual');
});
test('finds: a few in every underground chunk, never on the shaft; geodes only from layer 2', () => {
  const seed = 31415;
  let geodesOn1 = 0, geodesDeeper = 0;
  for (let cx = -3; cx <= 3; cx++) {
    for (let cy = -3; cy <= 3; cy++) {
      for (const z of [-1, -2, -4]) {
        const finds = C.findsInChunk(seed, cx, cy, z);
        assert.ok(finds.length >= 1 && finds.length <= C.FINDS_PER_CHUNK);
        const shaft = C.shaftInChunk(seed, cx, cy, z);
        const w = C.createWorld(seed);
        for (const f of finds) {
          assert.ok(!(f.x === shaft.x && f.y === shaft.y), 'never on the shaft');
          assert.equal(C.chunkCoord(f.x), cx);
          assert.equal(C.chunkCoord(f.y), cy);
          assert.equal(C.tileAt(w, f.x, f.y, z), f.type, 'generated into the rock');
          if (f.type === T.GEODE) { if (z === -1) geodesOn1++; else geodesDeeper++; }
        }
      }
    }
  }
  assert.equal(geodesOn1, 0);
  assert.ok(geodesDeeper > 0);
});

test('digging out a find pays its loot at once, scaled by layer and tool, and it glints until then', () => {
  const s = away(C.createState(31415));
  C.goDown(s);
  const near = C.findsNear(s, 40);
  assert.ok(near.length > 0, 'something to head toward');
  const f = near[0];
  C.setRichness(s.world, f.x + 1, f.y, s.player.z, 0); // a spot to stand beside it
  s.player.x = f.x + 1.5; s.player.y = f.y + 0.5;
  s.tools.pickaxe = 2; s.tools.basket = 3;
  const before = { ...s.inv };
  const r = C.harvestAt(s, f.x, f.y);
  assert.ok(r && r.found, 'a find pays out');
  const layer = C.SURFACE - s.player.z;
  for (const res of Object.keys(C.FINDS[f.type].loot)) {
    const want = C.FINDS[f.type].loot[res] * layer * C.gatherYield(s, res);
    assert.equal(r.found[res], want);
    assert.equal(s.inv[res] - before[res], want);
  }
  assert.equal(s.stats.finds, 1);
  assert.equal(C.tileAt(s.world, f.x, f.y, s.player.z), T.TUNNEL, 'leaves open tunnel');
  assert.ok(!C.findsNear(s, 40).some((g) => g.x === f.x && g.y === f.y), 'and stops glinting');
  assert.deepEqual(C.findsNear(away(C.createState(1))), [], 'nothing glints on the surface');
});
