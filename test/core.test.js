/* Node test harness for MORE THAN ENOUGH core simulation.
 * Exercises worldgen, gathering, upgrades, automation, movement,
 * persistence, and a scripted bot playthrough. */
'use strict';

var C = require('../core.js');

var failures = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.log('  FAIL: ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + a + ', expected ' + b + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var T = C.T, S = C.WORLD_SIZE;

/* ------------------------------------------------------------ worldgen */
section('World generation');
var w1 = C.generateWorld(12345);
var w2 = C.generateWorld(12345);
var w3 = C.generateWorld(54321);
var same = true;
for (var i = 0; i < w1.type.length; i++) if (w1.type[i] !== w2.type[i] || w1.rich[i] !== w2.rich[i]) { same = false; break; }
ok(same, 'same seed yields identical world');
var diff = false;
for (var j = 0; j < w1.type.length; j++) if (w1.type[j] !== w3.type[j]) { diff = true; break; }
ok(diff, 'different seeds yield different worlds');

var st = C.createState(12345);
var counts = {};
for (var k = 0; k < st.world.type.length; k++) counts[st.world.type[k]] = (counts[st.world.type[k]] || 0) + 1;
console.log('  tile counts: grass=' + (counts[T.GRASS] || 0) + ' forest=' + (counts[T.FOREST] || 0) +
  ' stone=' + (counts[T.STONE] || 0) + ' ore=' + (counts[T.ORE] || 0) +
  ' crystal=' + (counts[T.CRYSTAL] || 0) + ' water=' + (counts[T.WATER] || 0) + ' rock=' + (counts[T.ROCK] || 0));
ok((counts[T.FOREST] || 0) > 400, 'enough forest');
ok((counts[T.STONE] || 0) > 300, 'enough stone');
ok((counts[T.ORE] || 0) > 100, 'ore exists');
ok((counts[T.CRYSTAL] || 0) > 20, 'crystal exists (rare)');
ok((counts[T.CRYSTAL] || 0) < (counts[T.ORE] || 0), 'crystal rarer than ore');

var reach = C.floodFill(st.world.type, Math.floor(st.player.x), Math.floor(st.player.y));
var rc = 0;
for (var r = 0; r < reach.length; r++) if (reach[r]) rc++;
console.log('  reachable: ' + (100 * rc / (S * S)).toFixed(1) + '%');
ok(rc > S * S * 0.7, 'world broadly walkable from spawn');

var nearForest = 0, nearStone = 0;
for (var yy = 0; yy < S; yy++) for (var xx = 0; xx < S; xx++) {
  var d = Math.hypot(xx + 0.5 - st.player.x, yy + 0.5 - st.player.y);
  if (d <= 6) {
    var tp = st.world.type[C.idx(xx, yy)];
    if (tp === T.FOREST) nearForest++;
    if (tp === T.STONE) nearStone++;
  }
}
ok(nearForest >= 3, 'starter forest near spawn (' + nearForest + ')');
ok(nearStone >= 2, 'starter stone near spawn (' + nearStone + ')');

/* -------------------------------------------------------------- gather */
section('Gathering');
var g = C.createState(12345);
// find a forest tile adjacent to the player and place the player next to it
var tgt = null;
for (var gy = 0; gy < S && !tgt; gy++) for (var gx = 0; gx < S && !tgt; gx++) {
  if (g.world.type[C.idx(gx, gy)] === T.FOREST && g.world.rich[C.idx(gx, gy)] > 0) {
    var dd = Math.hypot(gx + 0.5 - g.player.x, gy + 0.5 - g.player.y);
    if (dd < 12) tgt = { x: gx, y: gy };
  }
}
ok(!!tgt, 'found a forest tile to gather');
g.player.x = tgt.x + 0.5; g.player.y = tgt.y + 0.5;
var rich0 = g.world.rich[C.idx(tgt.x, tgt.y)];
var res1 = C.gather(g);
eq(res1.res, 'wood', 'gather returns wood');
eq(res1.amount, 1, 'level-1 axe yields 1');
eq(g.inv.wood, 1, 'wood added to inventory');
eq(g.world.rich[C.idx(tgt.x, tgt.y)], rich0 - 1, 'deposit decremented');

// upgrade the axe and check yield scaling
g.inv.wood = 1000;
eq(C.buyUpgrade(g, 'axe').ok, true, 'buy axe level 2');
eq(g.tools.axe, 2, 'axe is level 2');
eq(C.gatherYield(g, 'wood'), 2, 'axe level 2 yields 2');
eq(C.gatherYield(g, 'stone'), 1, 'pickaxe unaffected by axe');

g.inv.ore = 100000; g.inv.stone = 100000; g.inv.wood = 100000;
for (var lv = 0; lv < 10; lv++) C.buyUpgrade(g, 'axe');
eq(g.tools.axe, 6, 'axe caps at level 6');
eq(C.buyUpgrade(g, 'axe').ok, false, 'cannot exceed max level');

// depleted tile yields nothing
var depleted = C.createState(12345);
var dt2 = null;
for (var dy = 0; dy < S && !dt2; dy++) for (var dx = 0; dx < S && !dt2; dx++) {
  if (depleted.world.type[C.idx(dx, dy)] === T.STONE) dt2 = { x: dx, y: dy };
}
depleted.player.x = dt2.x + 0.5; depleted.player.y = dt2.y + 0.5;
// scrub every resource tile within gather range so nothing else can be picked
for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) {
  if (!C.inBounds(dt2.x + ox, dt2.y + oy)) continue;
  var oi = C.idx(dt2.x + ox, dt2.y + oy);
  if (C.TILE_RESOURCE[depleted.world.type[oi]]) depleted.world.rich[oi] = 0;
}
eq(C.gather(depleted), null, 'depleted deposit yields nothing');

/* ------------------------------------------------------------ upgrades */
section('Upgrades');
var up = C.createState(12345);
up.inv.wood = 5;
eq(C.buyUpgrade(up, 'axe').ok, false, 'cannot afford axe with 5 wood');
up.inv.wood = 6;
eq(C.buyUpgrade(up, 'axe').ok, true, 'can afford axe with 6 wood');
eq(up.inv.wood, 0, 'cost deducted');
up.inv.wood = 8;
C.buyUpgrade(up, 'boots');
eq(up.tools.boots, 2, 'boots level 2');
ok(C.moveMult(up) > 1, 'boots increase speed');

/* ----------------------------------------------------------- extractors */
section('Extractors');
var ex = C.createState(12345);
// stand on a forest tile
var ft = null;
for (var fy = 0; fy < S && !ft; fy++) for (var fx = 0; fx < S && !ft; fx++) {
  if (ex.world.type[C.idx(fx, fy)] === T.FOREST) ft = { x: fx, y: fy };
}
// wrong deposit should fail
var stoneTile = null;
for (var sy = 0; sy < S && !stoneTile; sy++) for (var sx = 0; sx < S && !stoneTile; sx++) {
  if (ex.world.type[C.idx(sx, sy)] === T.STONE) stoneTile = { x: sx, y: sy };
}
ex.player.x = stoneTile.x + 0.5; ex.player.y = stoneTile.y + 0.5;
eq(C.place(ex, 'lumber').ok, false, 'cannot place lumber camp on stone');
ex.player.x = ft.x + 0.5; ex.player.y = ft.y + 0.5;
ex.inv.wood = 14;
eq(C.place(ex, 'lumber').ok, false, 'cannot afford lumber camp with 14 wood');
ex.inv.wood = 15;
var placed = C.place(ex, 'lumber');
eq(placed.ok, true, 'placed lumber camp on forest');
eq(ex.inv.wood, 0, 'lumber camp cost deducted');
eq(ex.extractors.length, 1, 'one extractor exists');
eq(C.extractorCount(ex, 'lumber'), 1, 'lumber count is 1');

// repeated camps cost more (cost scaling)
var ex2 = C.createState(12345);
ex2.extractors.push({ key: 'lumber', res: 'wood', x: 0, y: 0, buffer: 0, t: 0 });
var c1 = C.extractorCost(ex2, 'lumber');
ex2.extractors.push({ key: 'lumber', res: 'wood', x: 1, y: 0, buffer: 0, t: 0 });
var c2 = C.extractorCost(ex2, 'lumber');
ok(c2.wood > c1.wood, 'second lumber camp costs more (' + c1.wood + ' -> ' + c2.wood + ')');

// production over time
var prod = C.createState(12345);
prod.extractors.push({ key: 'lumber', res: 'wood', x: 48, y: 50, buffer: 0, t: 0 });
prod.player.x = 100.5; prod.player.y = 100.5; // far away, no auto-collect
for (var s1 = 0; s1 < 600; s1++) C.step(prod, 0.1); // 60 s
console.log('  lumber buffer after 60s: ' + prod.extractors[0].buffer.toFixed(2) + ' (cap ' + C.EXTRACTORS.lumber.buffer + ')');
ok(prod.extractors[0].buffer > 30, 'extractor produced over time');
ok(prod.extractors[0].buffer <= C.EXTRACTORS.lumber.buffer + 0.001, 'buffer respects cap');
eq(prod.inv.wood, 0, 'far extractor does not auto-fill inventory');

// collect in range
prod.player.x = 48.5; prod.player.y = 50.5;
var collected = C.collect(prod);
ok(collected && collected.wood > 0, 'collect transfers buffer');
ok(prod.inv.wood > 0, 'inventory grew after collect');
ok(prod.extractors[0].buffer < 1, 'buffer emptied');

// out-of-range extractor is not collectable
var far = C.createState(12345);
far.extractors.push({ key: 'lumber', res: 'wood', x: 10, y: 10, buffer: 20, t: 0 });
far.player.x = 50.5; far.player.y = 50.5;
eq(C.collectTarget(far), null, 'cannot collect from far away');

// overclock multiplier
var oc = C.createState(12345);
oc.extractors.push({ key: 'lumber', res: 'wood', x: 48, y: 50, buffer: 0, t: 0 });
oc.inv.stone = 1000; oc.inv.ore = 1000;
C.buyUpgrade(oc, 'overclock'); // x2
eq(C.overclockMult(oc), 2, 'overclock level 2 = 2x');
oc.player.x = 100.5; oc.player.y = 100.5;
for (var s2 = 0; s2 < 100; s2++) C.step(oc, 0.1); // 10 s
eq(Math.round(oc.extractors[0].buffer), Math.round(0.6 * 2 * 10), 'overclock doubles output');

// logistics auto-collect is range-limited
eq(C.AUTO_COLLECT_RANGE, 3, 'auto-collect radius is 3 tiles');
var log = C.createState(12345);
log.extractors.push({ key: 'lumber', res: 'wood', x: 48, y: 50, buffer: 12, t: 0 });
log.unlocks.logistics = true;
log.player.x = 100.5; log.player.y = 100.5; // far away: buffer piles up, nothing is taken
for (var s3 = 0; s3 < 40; s3++) C.step(log, 0.1);
eq(log.inv.wood, 0, 'far extractor does not auto-collect');
eq(log.events.length, 0, 'far extractor emits no events');
ok(log.extractors[0].buffer > 12, 'far extractor keeps filling its buffer (' + log.extractors[0].buffer.toFixed(1) + ')');
// walk next to it -> the buffered units funnel in on the next step
log.player.x = 48.5; log.player.y = 50.5;
C.step(log, 0.1);
ok(log.inv.wood >= 12, 'nearby extractor auto-collects what was buffered (' + log.inv.wood + ')');
ok(log.extractors[0].buffer < 1, 'buffer drained by auto-collect');
eq(log.events.length, 1, 'nearby auto-collect emits one event');
var evt = log.events[0];
eq(evt.res, 'wood', 'event carries the resource');
eq(evt.amt, log.inv.wood, 'event amount matches the inventory gain');
eq(evt.x, 48, 'event carries the extractor x');
eq(evt.y, 50, 'event carries the extractor y');
// walking away re-shields the camp immediately
var woodAt = log.inv.wood;
log.player.x = 100.5; log.player.y = 100.5;
for (var s3b = 0; s3b < 40; s3b++) C.step(log, 0.1);
eq(log.inv.wood, woodAt, 'walking away stops auto-collect at once');
ok(log.extractors[0].buffer > 1, 'buffer builds up again while far away (' + log.extractors[0].buffer.toFixed(1) + ')');

// abundance engine (level 1 = +1/s of everything, refineries ×1.5)
var ab = C.createState(12345);
ab.unlocks.abundance = true; ab.abundanceLv = 1;
for (var s4 = 0; s4 < 50; s4++) C.step(ab, 0.1); // 5 s
ok(Math.abs(ab.inv.wood - 5) < 0.5, 'abundance level 1 yields +1/s wood (' + ab.inv.wood.toFixed(2) + ')');
ok(Math.abs(ab.inv.crystal - 5) < 0.5, 'abundance level 1 yields +1/s crystal');

/* ------------------------------------------------------------- late game */
section('Late-game economy (converters, refinery chains, abundance levels)');

// converters require blueprints and synthesize on any land
var conv = C.createState(12345);
conv.player.x = 48.5; conv.player.y = 48.5;
eq(C.place(conv, 'foundry').ok, false, 'foundry needs its blueprint');
conv.unlocks.foundry = true;
conv.inv.wood = 10000; conv.inv.stone = 10000; conv.inv.ore = 10000;
var placedF = C.place(conv, 'foundry');
eq(placedF.ok, true, 'foundry places after unlock');
eq(conv.extractors.length, 1, 'foundry added');
conv.inv.ore = 0; // build spent 60 ore on the foundry cost
conv.player.x = 100.5; conv.player.y = 100.5; // far away (no logistics)
for (var cs = 0; cs < 100; cs++) C.step(conv, 0.1); // 10 s
ok(conv.extractors[0].buffer > 2.5, 'converter produces over time (' + conv.extractors[0].buffer.toFixed(1) + ')');
eq(conv.inv.ore, 0, 'far converter does not auto-collect');
for (var cs2 = 0; cs2 < 100; cs2++) C.step(conv, 0.1); // cap respected
ok(conv.extractors[0].buffer <= C.EXTRACTORS.foundry.buffer + 0.001, 'converter buffer respects cap');

// refinery chains multiply all production of a resource
var ref = C.createState(12345);
ref.inv.wood = 1000;
eq(C.resUpgradeInfo(ref, 'wood').level, 0, 'wood chain starts at 0');
eq(C.resProdMult(ref, 'wood'), 1, 'no multipliers at start');
eq(C.buyResUpgrade(ref, 'wood').ok, true, 'buy Silviculture I');
eq(ref.resUp.wood, 1, 'wood chain level 1');
eq(C.resProdMult(ref, 'wood'), 2, 'wood production doubled');
eq(C.buyResUpgrade(ref, 'wood').ok, false, 'cannot afford Silviculture II');
ref.inv.stone = 10000; ref.inv.wood = 100000; ref.inv.ore = 1000;
C.buyResUpgrade(ref, 'stone');
eq(C.resProdMult(ref, 'stone'), 2, 'stone chain applies to stone only');
eq(C.resUpgradeMul(ref, 'ore'), 1, 'ore chain untouched');

// abundance levels compound
var abl = C.createState(12345);
abl.inv.wood = 100000; abl.inv.stone = 100000; abl.inv.ore = 100000; abl.inv.crystal = 1000;
eq(C.buyUpgrade(abl, 'abundance').ok, true, 'build Abundance Engine (L1)');
eq(abl.abundanceLv, 1, 'abundance level 1');
eq(abl.unlocks.abundance, true, 'unlock flag tracks level');
var c2 = C.abundanceCost(abl);
eq(c2.wood, Math.ceil(1500 * 2.4), 'abundance II costs 2.4× more');
eq(C.buyUpgrade(abl, 'abundance').ok, true, 'advance to level 2');
eq(abl.abundanceLv, 2, 'abundance level 2');
eq(C.abundanceMult(abl), 2.25, 'abundance L2 = ×2.25 refineries');
var before2 = abl.inv.wood;
for (var as2 = 0; as2 < 50; as2++) C.step(abl, 0.1); // 5 s
ok(Math.abs(abl.inv.wood - before2 - 10) < 0.5, 'abundance L2 = +2/s wood');
C.buyUpgrade(abl, 'logistics');
eq(C.buyUpgrade(abl, 'logistics').ok, false, 'cannot rebuy a one-shot unlock');

/* ------------------------------------------------------ prestige loop */
section('Prestige loop (insight, perks, embarking)');
var pg = C.createState(12345);
eq(C.canEmbark(pg), false, 'cannot embark at start');
eq(C.embarkGain(pg), 0, 'no insight at start');
pg.stats.wood = 20000;
eq(C.canEmbark(pg), true, '20k lifetime resources enables embark');
eq(C.embarkGain(pg), 3, 'gain = floor(sqrt(20000/2000)) = 3');
var em = C.embark(pg);
eq(em.ok, true, 'embark succeeds');
eq(em.gained, 3, 'gained 3 insight');
var fresh = em.state;
eq(fresh.inv.wood, 0, 'world reset');
eq(fresh.insight, em.gained, 'insight preserved');
eq(fresh.prestiges, 1, 'prestige count 1');
eq(fresh.totalEver, 20000, 'lifetime carried over');
eq(fresh.extractors.length, 0, 'extractors reset');
eq(C.perkCost(fresh, 'legacy'), 1, 'legacy costs 1 insight');
eq(C.buyPerk(fresh, 'legacy').ok, true, 'buy legacy I');
eq(C.perkCost(fresh, 'legacy'), 2, 'legacy II costs 2 insight');
eq(C.buyPerk(fresh, 'legacy').ok, true, 'buy legacy II');
eq(C.legacyMult(fresh), 1.5625, 'two legacies = ×1.5625');
eq(C.resProdMult(fresh, 'wood'), 1.5625, 'legacy multiplies refinery output');
eq(C.buyPerk(fresh, 'nomad').ok, false, 'not enough insight for nomad');
eq(C.nomadMult(fresh), 1, 'no nomad multiplier yet');

var pg2 = C.createState(1);
pg2.insight = 10;
pg2.stats.wood = 20000;
C.buyPerk(pg2, 'memory'); C.buyPerk(pg2, 'heirloom'); C.buyPerk(pg2, 'cartographer');
var em2 = C.embark(pg2);
var f2 = em2.state;
eq(f2.unlocks.logistics, true, 'Memory perk carries Logistics');
eq(f2.tools.axe, 2, 'Heirloom perk carries Axe II');
eq(C.exploreRadius(f2), C.EXPLORE_RADIUS + 2, 'Cartographer widens fog');

/* ------------------------------------------------- v1 save migration */
section('Save migration from v1');
var oldBlob = {
  v: 1, seed: 4242,
  rich: C.bytesToB64(C.createState(4242).world.rich),
  explored: C.bytesToB64(new Uint8Array(C.WORLD_SIZE * C.WORLD_SIZE)),
  player: { x: 48.5, y: 48.5 },
  inv: { wood: 10, stone: 20, ore: 0, crystal: 0 },
  tools: { axe: 2, pickaxe: 1, boots: 1, overclock: 1 },
  unlocks: { logistics: true, abundance: true },
  extractors: [],
  stats: { wood: 100, stone: 100, ore: 0, crystal: 0, gathers: 10, collected: 0, built: 0, playedMs: 0 },
  discovered: { ore: false, crystal: false },
  goalIndex: 13, time: 0
};
var mig = C.deserialize(JSON.stringify(oldBlob));
ok(!!mig, 'v1 save loads');
eq(mig.unlocks.abundance, true, 'v1 abundance flag kept');
eq(mig.abundanceLv, 1, 'v1 abundance becomes level 1');
eq(mig.inv.wood, 10, 'legacy inventory kept');
eq(mig.resUp.wood, 0, 'new fields default to 0');
eq(mig.perks.legacy, 0, 'new perks default to 0');
eq(mig.goalIndex, 13, 'goal index kept');

/* -------------------------------------------------------------- movement */
section('Movement');
var mv = C.createState(12345);
// rock is impassable (mountains) but water is now swimmable
var blocked = null;
outer:
for (var by = 1; by < S - 1; by++) for (var bx = 1; bx < S - 1; bx++) {
  var bt = mv.world.type[C.idx(bx, by)];
  if (bt === T.ROCK) {
    if (C.walkable(mv.world, bx - 1, by)) { blocked = { x: bx, y: by }; break outer; }
  }
}
if (blocked) {
  mv.player.x = blocked.x - 0.5; mv.player.y = blocked.y + 0.5;
  var movedInto = C.move(mv, 1, 0, 0.5);
  ok(!movedInto || Math.floor(mv.player.x) < blocked.x, 'cannot walk into rock (mountains)');
} else {
  console.log('  (no adjacent rock obstacle found to test collision)');
}

// swimming: open water is enterable and the player can cross it
var swim = C.createState(12345);
var waterTile = null;
for (var wy = 1; wy < S - 1 && !waterTile; wy++) for (var wx = 1; wx < S - 1 && !waterTile; wx++) {
  if (swim.world.type[C.idx(wx, wy)] === T.WATER) {
    var open = C.walkable(swim.world, wx + 1, wy) && C.walkable(swim.world, wx - 1, wy) &&
      C.walkable(swim.world, wx, wy + 1) && C.walkable(swim.world, wx, wy - 1);
    if (open) waterTile = { x: wx, y: wy };
  }
}
ok(!!waterTile, 'found an open water tile');
ok(C.walkable(swim.world, waterTile.x, waterTile.y), 'water is walkable');
swim.player.x = waterTile.x + 0.5; swim.player.y = waterTile.y + 0.5;
eq(C.onWater(swim), true, 'onWater detects the player is in water');
var swimStart = swim.player.x;
C.move(swim, 1, 0, 0.2);
ok(swim.player.x > swimStart, 'player swims across water');
var mv2 = C.createState(12345);
var startX = mv2.player.x;
C.move(mv2, 1, 0, 0.2);
ok(mv2.player.x > startX || !C.canStand(mv2, mv2.player.x + 0.7, mv2.player.y), 'movement advances player on open ground');

/* --------------------------------------------------------- day/night */
section('Day/night cycle');
eq(C.daylight(0), 1, 'cycle starts at noon');
ok(Math.round(C.daylight(C.DAY_LENGTH / 2)) === 0, 'midnight is dark');
var dawn = C.daylight(C.DAY_LENGTH / 4);
ok(dawn > 0.4 && dawn < 0.6, 'dawn/dusk are half light (' + dawn.toFixed(2) + ')');
eq(C.daylight(C.DAY_LENGTH), 1, 'cycle repeats after a full day');
ok(C.daylight(C.DAY_LENGTH / 2 + 60) < C.daylight(C.DAY_LENGTH / 2 - 60), 'light falls into night and rises out of it');

/* ---------------------------------------------------------- persistence */
section('Persistence');
var ps = C.createState(4242);
ps.inv.wood = 123; ps.inv.ore = 7; ps.tools.axe = 3; ps.tools.overclock = 2;
ps.unlocks.logistics = true;
ps.extractors.push({ key: 'lumber', res: 'wood', x: 48, y: 50, buffer: 12.5, t: 0 });
ps.goalIndex = 5;
ps.player.x = 51.25; ps.player.y = 47.75;
ps.world.rich[C.idx(49, 49)] = 2;
var blob = C.serialize(ps);
ok(typeof blob === 'string' && blob.length > 100, 'serialize produces a string');
var ps2 = C.deserialize(blob);
ok(!!ps2, 'deserialize succeeds');
eq(ps2.seed, 4242, 'seed preserved');
eq(ps2.inv.wood, 123, 'wood preserved');
eq(ps2.tools.axe, 3, 'axe level preserved');
eq(ps2.tools.overclock, 2, 'overclock preserved');
eq(ps2.unlocks.logistics, true, 'unlock preserved');
eq(ps2.extractors.length, 1, 'extractor preserved');
eq(ps2.extractors[0].key, 'lumber', 'extractor type preserved');
eq(Math.round(ps2.extractors[0].buffer), 13, 'extractor buffer preserved');
eq(ps2.player.x, 51.25, 'player x preserved');
eq(ps2.world.rich[C.idx(49, 49)], 2, 'world depletion preserved');
eq(ps2.explored.length, ps.explored.length, 'explored map preserved');
var exSame = true;
for (var e2 = 0; e2 < ps.explored.length; e2++) if (ps.explored[e2] !== ps2.explored[e2]) { exSame = false; break; }
ok(exSame, 'explored bytes identical');
eq(C.deserialize('not json'), null, 'bad save returns null');

/* ----------------------------------------------------------- bot run */
section('Bot playthrough (real navigation + gathering)');

function nearestTile(state, pred) {
  var px = state.player.x, py = state.player.y, best = null, bd = Infinity;
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    if (!pred(state, x, y)) continue;
    var dx = x + 0.5 - px, dy = y + 0.5 - py;
    var d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = { x: x, y: y }; }
  }
  return best;
}

function findPath(state, sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];
  var N = S * S;
  var prev = new Int32Array(N).fill(-1);
  var seen = new Uint8Array(N);
  var start = C.idx(sx, sy), goal = C.idx(tx, ty);
  seen[start] = 1;
  var q = [start], head = 0;
  while (head < q.length) {
    var cur = q[head++];
    if (cur === goal) break;
    var cx = cur % S, cy = (cur - cx) / S;
    var nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    for (var n = 0; n < 4; n++) {
      var nx = nb[n][0], ny = nb[n][1];
      if (!C.inBounds(nx, ny)) continue;
      var ni = C.idx(nx, ny);
      if (seen[ni] || !C.walkable(state.world, nx, ny)) continue;
      seen[ni] = 1; prev[ni] = cur; q.push(ni);
    }
  }
  if (!seen[goal]) return null;
  var path = [], node = goal;
  while (node !== start) { path.push({ x: node % S, y: (node - (node % S)) / S }); node = prev[node]; }
  path.reverse();
  return path;
}

function walkPath(state, path, dt, budget) {
  var used = 0, idx = 0;
  while (idx < path.length && used < budget) {
    var wp = path[idx];
    var dx = wp.x + 0.5 - state.player.x, dy = wp.y + 0.5 - state.player.y;
    if (Math.hypot(dx, dy) < 0.25) { idx++; continue; }
    var bx = state.player.x, by = state.player.y;
    C.move(state, dx, dy, dt);
    C.updateExplored(state);
    used += dt;
    if (Math.abs(state.player.x - bx) + Math.abs(state.player.y - by) < 0.0003) break; // stuck
  }
  return used;
}

function goGather(state, res, need, log) {
  var guard = 0;
  while (state.inv[res] < need && guard < 4000) {
    guard++;
    var tt = nearestTile(state, function (s, x, y) {
      return C.TILE_RESOURCE[s.world.type[C.idx(x, y)]] === res && s.world.rich[C.idx(x, y)] > 0;
    });
    if (!tt) return false;
    // walk adjacent then gather
    if (Math.hypot(tt.x + 0.5 - state.player.x, tt.y + 0.5 - state.player.y) > C.GATHER_RANGE) {
      var path = findPath(state, Math.floor(state.player.x), Math.floor(state.player.y), tt.x, tt.y);
      if (!path) { // unreachable: blacklist by pretending depleted
        state.world.rich[C.idx(tt.x, tt.y)] = 0;
        continue;
      }
      walkPath(state, path, 0.1, 20);
      continue;
    }
    if (!C.gather(state)) {
      // tile emptied between checks
      continue;
    }
    C.step(state, 0.25);
  }
  return state.inv[res] >= need;
}

function runBot(seed) {
  var s = C.createState(seed);
  var t = 0, timeline = {};
  function mark(name) { if (timeline[name] === undefined) timeline[name] = +t.toFixed(1); }

  function goGather(res, need) {
    var guard = 0;
    var startT = t;
    while (s.inv[res] < need && guard < 4000 && t - startT < 240) {
      guard++;
      var tt = nearestTile(s, function (st, x, y) {
        return C.TILE_RESOURCE[st.world.type[C.idx(x, y)]] === res && st.world.rich[C.idx(x, y)] > 0;
      });
      if (!tt) return false;
      if (Math.hypot(tt.x + 0.5 - s.player.x, tt.y + 0.5 - s.player.y) > C.GATHER_RANGE) {
        var path = findPath(s, Math.floor(s.player.x), Math.floor(s.player.y), tt.x, tt.y);
        if (!path) { s.world.rich[C.idx(tt.x, tt.y)] = 0; continue; }
        t += walkPath(s, path, 0.1, 30);
        continue;
      }
      if (!C.gather(s)) continue;
      C.step(s, 0.25); t += 0.25;
    }
    return s.inv[res] >= need;
  }

  function goStandOn(pred, match) {
    var tt = nearestTile(s, pred);
    if (!tt) return false;
    if (Math.hypot(tt.x + 0.5 - s.player.x, tt.y + 0.5 - s.player.y) > 1.2) {
      var path = findPath(s, Math.floor(s.player.x), Math.floor(s.player.y), tt.x, tt.y);
      if (!path) return false;
      t += walkPath(s, path, 0.1, 40);
    }
    return true;
  }

  // 1) first upgrade: axe II (6 wood)
  goGather('wood', 6);
  C.buyUpgrade(s, 'axe');
  mark('axe2');

  // 2) pickaxe II (10 wood, 6 stone)
  goGather('wood', 10); goGather('stone', 6);
  C.buyUpgrade(s, 'pickaxe');
  mark('pick2');

  // 3) lumber camp: 15 wood, then stand on a forest tile
  goGather('wood', 15);
  goStandOn(function (st, x, y) { return st.world.type[C.idx(x, y)] === T.FOREST && !C.occupied(st, x, y); });
  C.place(s, 'lumber');
  mark('lumber');

  // 4) quarry: 30 wood + 15 stone
  goGather('wood', 30); goGather('stone', 15);
  goStandOn(function (st, x, y) { return st.world.type[C.idx(x, y)] === T.STONE && !C.occupied(st, x, y); });
  C.place(s, 'quarry');
  mark('quarry');

  // 5) mine: 45 stone + 12 ore (requires exploring to ore)
  goGather('stone', 45);
  goGather('ore', 12);
  mark('firstOre');
  goStandOn(function (st, x, y) { return st.world.type[C.idx(x, y)] === T.ORE && !C.occupied(st, x, y); });
  C.place(s, 'mine');
  mark('mine');

  // 6) overclock II (30 stone, 4 ore)
  goGather('stone', 30); goGather('ore', 4);
  C.buyUpgrade(s, 'overclock');
  mark('overclock2');

  // let automation run; collect buffers, then automate collection
  var autoStart = t;
  while (t - autoStart < 180 && t < 900) {
    C.step(s, 0.1); t += 0.1;
    if (C.collectTarget(s)) C.collect(s);
    if (!s.unlocks.logistics) {
      if (C.canAfford(s.inv, C.UNLOCKS.logistics.cost)) { C.buyUpgrade(s, 'logistics'); mark('logistics'); }
      else {
        // bank a little more stone/ore automatically without manual gathering
        if (s.extractors.length < 3) break;
      }
    }
  }

  return { state: s, timeline: timeline, time: t, extractors: s.extractors.length, inv: s.inv };
}

for (var seedIdx = 0; seedIdx < 3; seedIdx++) {
  var seed = [12345, 777, 20260101][seedIdx];
  var res = runBot(seed);
  console.log('  seed ' + seed + ': ' + JSON.stringify(res.timeline) + ' extractors=' + res.extractors);
  console.log('    final inv: wood=' + Math.floor(res.inv.wood) + ' stone=' + Math.floor(res.inv.stone) +
    ' ore=' + Math.floor(res.inv.ore) + ' crystal=' + Math.floor(res.inv.crystal));
  if (seedIdx === 0) {
    ok(res.timeline.axe2 !== undefined && res.timeline.axe2 < 60, 'first upgrade within 60s (' + res.timeline.axe2 + 's)');
    ok(res.timeline.lumber !== undefined && res.timeline.lumber < 300, 'lumber camp within 5 min (' + res.timeline.lumber + 's)');
    ok(res.timeline.quarry !== undefined && res.timeline.quarry < 300, 'quarry within 5 min (' + res.timeline.quarry + 's)');
    ok(res.extractors >= 2, 'bot established automated operation (' + res.extractors + ' extractors)');
    ok(res.timeline.mine !== undefined && res.timeline.mine < 420, 'mine established (' + res.timeline.mine + 's)');
  }
  ok(res.extractors >= 2, 'seed ' + seed + ' achieves automation');
}

/* ------------------------------------------------- full progression */
section('Full progression to the end (bot)');

function runFullBot(seed) {
  var s = C.createState(seed);
  var t = 0, timeline = {};
  function mark(n) { if (timeline[n] === undefined) timeline[n] = +t.toFixed(1); }
  function goGather(res, need) {
    var guard = 0, start = t;
    while (s.inv[res] < need && guard < 30000 && t - start < 500) {
      guard++;
      var tt = nearestTile(s, function (st, x, y) {
        return C.TILE_RESOURCE[st.world.type[C.idx(x, y)]] === res && st.world.rich[C.idx(x, y)] > 0;
      });
      if (!tt) return false;
      if (Math.hypot(tt.x + 0.5 - s.player.x, tt.y + 0.5 - s.player.y) > C.GATHER_RANGE) {
        var p = findPath(s, Math.floor(s.player.x), Math.floor(s.player.y), tt.x, tt.y);
        if (!p) { s.world.rich[C.idx(tt.x, tt.y)] = 0; continue; }
        t += walkPath(s, p, 0.1, 60); continue;
      }
      if (!C.gather(s)) continue;
      C.step(s, 0.25); t += 0.25;
    }
    return s.inv[res] >= need;
  }
  function goStandOn(pred) {
    var tt = nearestTile(s, pred); if (!tt) return false;
    if (Math.hypot(tt.x + 0.5 - s.player.x, tt.y + 0.5 - s.player.y) > 1.2) {
      var p = findPath(s, Math.floor(s.player.x), Math.floor(s.player.y), tt.x, tt.y);
      if (!p) return false;
      t += walkPath(s, p, 0.1, 80);
    }
    return true;
  }
  function isForest(st, x, y) { return st.world.type[C.idx(x, y)] === T.FOREST && !C.occupied(st, x, y); }
  function isStone(st, x, y) { return st.world.type[C.idx(x, y)] === T.STONE && !C.occupied(st, x, y); }
  function isOre(st, x, y) { return st.world.type[C.idx(x, y)] === T.ORE && !C.occupied(st, x, y); }

  goGather('wood', 6); C.buyUpgrade(s, 'axe'); mark('axe2');
  goGather('wood', 10); goGather('stone', 6); C.buyUpgrade(s, 'pickaxe'); mark('pick2');
  goGather('wood', 15); goStandOn(isForest); C.place(s, 'lumber'); mark('lumber');
  goGather('wood', 30); goGather('stone', 15); goStandOn(isStone); C.place(s, 'quarry'); mark('quarry');
  goGather('stone', 45); goGather('ore', 12); goStandOn(isOre); C.place(s, 'mine'); mark('mine');

  goGather('stone', 150); goGather('ore', 40); C.buyUpgrade(s, 'logistics'); mark('logistics');

  var targetOc = 4;
  while (s.tools.overclock < targetOc && t < 1000) {
    var cost = C.TOOLS.overclock.levels[s.tools.overclock].cost;
    goGather('stone', cost.stone); goGather('ore', cost.ore);
    if (!C.buyUpgrade(s, 'overclock').ok) break;
    mark('overclock' + s.tools.overclock);
  }

  goGather('stone', 140); goGather('ore', 70);
  if (nearestTile(s, function (st, x, y) { return st.world.type[C.idx(x, y)] === T.CRYSTAL; })) {
    goStandOn(function (st, x, y) { return st.world.type[C.idx(x, y)] === T.CRYSTAL; });
    mark('crystal');
    goGather('crystal', 6);
    goStandOn(function (st, x, y) { return st.world.type[C.idx(x, y)] === T.CRYSTAL && !C.occupied(st, x, y); });
    C.place(s, 'resonator'); mark('resonator');
  }

  // Abundance costs a mountain of resources, and logistics now only reaches
  // extractors near the player — so the bot camps each camp in turn: walk
  // beside it, let auto-collect funnel its whole buffer into the packs, and
  // only move on once that resource's quota is banked.
  var quota = { wood: 1500, stone: 1500, ore: 750, crystal: 80 };
  function findExt(res) {
    for (var i = 0; i < s.extractors.length; i++) if (s.extractors[i].res === res) return s.extractors[i];
    return null;
  }
  function campNear(e) {
    return goStandOn(function (st, x, y) {
      if (C.occupied(st, x, y)) return false;
      if (!C.walkable(st.world, x, y)) return false;
      var dx = x + 0.5 - (e.x + 0.5), dy = y + 0.5 - (e.y + 0.5);
      return dx * dx + dy * dy <= 2.4 * 2.4;
    });
  }
  while (t < 2350 && !s.unlocks.abundance) {
    var want = null;
    for (var rk in quota) { if (s.inv[rk] < quota[rk]) { want = rk; break; } }
    if (want) {
      var wx = findExt(want);
      if (wx) {
        var wdx = wx.x + 0.5 - s.player.x, wdy = wx.y + 0.5 - s.player.y;
        if (wdx * wdx + wdy * wdy > 3.2 * 3.2) campNear(wx);
      }
    }
    C.step(s, 0.1); t += 0.1;
    if (C.canAfford(s.inv, C.UNLOCKS.abundance.cost)) { C.buyUpgrade(s, 'abundance'); mark('abundance'); break; }
  }
  return { t: t, timeline: timeline, inv: s.inv, unlocks: s.unlocks, extractors: s.extractors.length };
}

var full = runFullBot(12345);
console.log('  timeline: ' + JSON.stringify(full.timeline));
console.log('  extractors=' + full.extractors + '  final inv: wood=' + Math.floor(full.inv.wood) +
  ' stone=' + Math.floor(full.inv.stone) + ' ore=' + Math.floor(full.inv.ore) + ' crystal=' + Math.floor(full.inv.crystal));
ok(full.timeline.crystal !== undefined, 'bot discovered crystal');
ok(full.timeline.resonator !== undefined, 'bot built a Resonator');
ok(full.timeline.abundance !== undefined && full.timeline.abundance < 2400, 'bot reached the Abundance Engine (' + full.timeline.abundance + 's)');
ok(full.unlocks.abundance === true, 'abundance engine is active');

/* ------------------------------------------------------- save mid-game */
section('Mid-game save/load continuity');
var mid = C.createState(12345);
mid.inv.wood = 400; mid.inv.stone = 400; mid.inv.ore = 120;
mid.tools.axe = 3; mid.tools.pickaxe = 3;
mid.extractors.push({ key: 'lumber', res: 'wood', x: 48, y: 50, buffer: 0, t: 0 });
C.buyUpgrade(mid, 'logistics');
var before = mid.inv.wood;
for (var ms = 0; ms < 100; ms++) C.step(mid, 0.1); // 10 s with logistics
var reloaded = C.deserialize(C.serialize(mid));
for (var ms2 = 0; ms2 < 100; ms2++) C.step(reloaded, 0.1);
ok(reloaded.inv.wood > before, 'reloaded save keeps producing resources');
ok(reloaded.unlocks.logistics, 'logistics survives reload');

/* ------------------------------------------------------------- summary */
console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURE(S)') + ' — ' + checks + ' checks');
process.exit(failures === 0 ? 0 : 1);
