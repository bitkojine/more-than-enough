/* Node test harness for MORE THAN ENOUGH core simulation.
 * Exercises infinite worldgen, gathering, upgrades, automation, movement,
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

var T = C.T;

/* ------------------------------------------------------------- helpers */

function typeAt(s, x, y) { return C.tileType(s.world, x, y); }
function richAt(s, x, y) { return C.tileRich(s.world, x, y); }

// Nearest tile matching pred within maxR rings of the player, searching outward
// so the common case is cheap. Stops at the first ring that contains a match.
function findNear(s, pred, maxR) {
  maxR = maxR || 140;
  var px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  for (var r = 0; r <= maxR; r++) {
    var best = null, bd = Infinity;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        var x = px + dx, y = py + dy;
        if (!pred(s, x, y)) continue;
        var ddx = x + 0.5 - s.player.x, ddy = y + 0.5 - s.player.y;
        var d = ddx * ddx + ddy * ddy;
        if (d < bd) { bd = d; best = { x: x, y: y }; }
      }
    }
    if (best) return best;
  }
  return null;
}

// BFS over a bounded box around start+goal. The world is infinite, so we cap
// the search window; anything needing a bigger detour is treated unreachable.
function findPath(state, sx, sy, tx, ty, pad) {
  pad = pad || 10;
  var minX = Math.min(sx, tx) - pad, maxX = Math.max(sx, tx) + pad;
  var minY = Math.min(sy, ty) - pad, maxY = Math.max(sy, ty) + pad;
  var startK = sx + ',' + sy, goalK = tx + ',' + ty;
  var prev = {};
  prev[startK] = null;
  var q = [[sx, sy]], head = 0;
  while (head < q.length) {
    var cur = q[head++];
    var ck = cur[0] + ',' + cur[1];
    if (ck === goalK) break;
    var nb = [[cur[0] + 1, cur[1]], [cur[0] - 1, cur[1]], [cur[0], cur[1] + 1], [cur[0], cur[1] - 1]];
    for (var n = 0; n < 4; n++) {
      var nx = nb[n][0], ny = nb[n][1];
      if (nx < minX || ny < minY || nx > maxX || ny > maxY) continue;
      var nk = nx + ',' + ny;
      if (nk in prev) continue;
      if (!C.walkable(state.world, nx, ny)) continue;
      prev[nk] = ck;
      q.push([nx, ny]);
    }
  }
  if (!(goalK in prev)) return null;
  var path = [], node = goalK;
  while (node && node !== startK) {
    var parts = node.split(',');
    path.push({ x: +parts[0], y: +parts[1] });
    node = prev[node];
  }
  path.reverse();
  return path;
}

function walkPath(state, path, dt, budget) {
  var used = 0, i = 0;
  while (i < path.length && used < budget) {
    var wp = path[i];
    var dx = wp.x + 0.5 - state.player.x, dy = wp.y + 0.5 - state.player.y;
    if (Math.hypot(dx, dy) < 0.25) { i++; continue; }
    var bx = state.player.x, by = state.player.y;
    C.move(state, dx, dy, dt);
    C.updateExplored(state);
    used += dt;
    if (Math.abs(state.player.x - bx) + Math.abs(state.player.y - by) < 0.0003) break; // stuck
  }
  return used;
}

/* ------------------------------------------------------------ worldgen */
section('Infinite world generation');

var wA = C.createWorld(12345), wB = C.createWorld(12345);
var sA = C.snapshot(wA, -40, -40, 80, 80), sB = C.snapshot(wB, -40, -40, 80, 80);
var same = true;
for (var i = 0; i < sA.type.length; i++) if (sA.type[i] !== sB.type[i] || sA.rich[i] !== sB.rich[i]) { same = false; break; }
ok(same, 'same seed yields identical world');
var wC = C.createWorld(54321), sC = C.snapshot(wC, -40, -40, 80, 80);
var diff = false;
for (var j = 0; j < sA.type.length; j++) if (sA.type[j] !== sC.type[j]) { diff = true; break; }
ok(diff, 'different seeds yield different worlds');

// order independence: reading a chunk in any order gives the same result
var wD = C.createWorld(999);
var t0 = C.tileType(wD, 5, 7);
C.tileType(wD, 100, 100); C.tileType(wD, -50, -50); C.tileType(wD, 5, 7);
eq(C.tileType(wD, 5, 7), t0, 'generation is order-independent');

// the world extends forever, including negative coordinates
ok(typeof C.tileType(wA, -999999, 888888) === 'number', 'tiles exist arbitrarily far out');
var seam = C.snapshot(wA, 14, -2, 4, 1); // spans the x=16 chunk boundary
ok(seam.type.length === 4 && seam.type[1] !== undefined && seam.type[2] !== undefined, 'chunk seams generate cleanly');

var st = C.createState(12345);
var snap = C.snapshot(st.world, -60, -60, 120, 120);
var counts = {};
for (var k = 0; k < snap.type.length; k++) counts[snap.type[k]] = (counts[snap.type[k]] || 0) + 1;
console.log('  tile counts: grass=' + (counts[T.GRASS] || 0) + ' forest=' + (counts[T.FOREST] || 0) +
  ' stone=' + (counts[T.STONE] || 0) + ' ore=' + (counts[T.ORE] || 0) +
  ' crystal=' + (counts[T.CRYSTAL] || 0) + ' water=' + (counts[T.WATER] || 0) + ' rock=' + (counts[T.ROCK] || 0));
ok((counts[T.FOREST] || 0) > 400, 'enough forest');
ok((counts[T.STONE] || 0) > 300, 'enough stone');
ok((counts[T.ORE] || 0) > 100, 'ore exists');
ok((counts[T.CRYSTAL] || 0) > 20, 'crystal exists (rare)');
ok((counts[T.CRYSTAL] || 0) < (counts[T.ORE] || 0), 'crystal rarer than ore');
ok(C.walkable(st.world, Math.floor(st.player.x), Math.floor(st.player.y)), 'spawn is walkable');

/* -------------------------------------------------------------- gather */
section('Gathering');
var g = C.createState(12345);
var tgt = findNear(g, function (s, x, y) { return typeAt(s, x, y) === T.FOREST && richAt(s, x, y) > 0; });
ok(!!tgt, 'found a forest tile to gather');
g.player.x = tgt.x + 0.5; g.player.y = tgt.y + 0.5;
var rich0 = richAt(g, tgt.x, tgt.y);
var res1 = C.gather(g);
eq(res1.res, 'wood', 'gather returns wood');
eq(res1.amount, 1, 'level-1 axe yields 1');
eq(g.inv.wood, 1, 'wood added to inventory');
eq(richAt(g, tgt.x, tgt.y), rich0 - 1, 'deposit decremented');
var directGather = C.gatherAt(g, tgt.x, tgt.y);
eq(directGather.x, tgt.x, 'sweep gathers the traced resource tile directly');
eq(richAt(g, tgt.x, tgt.y), rich0 - 2, 'direct sweep decrements its selected deposit');
eq(C.gatherAt(g, tgt.x + 10, tgt.y), null, 'direct sweep cannot gather outside reach');

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
var dt2 = findNear(depleted, function (s, x, y) { return typeAt(s, x, y) === T.STONE; });
ok(!!dt2, 'found a stone tile');
depleted.player.x = dt2.x + 0.5; depleted.player.y = dt2.y + 0.5;
// scrub every resource tile within gather range so nothing else can be picked
for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) {
  var ot = typeAt(depleted, dt2.x + ox, dt2.y + oy);
  if (C.TILE_RESOURCE[ot]) C.setTileRich(depleted.world, dt2.x + ox, dt2.y + oy, 0);
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
var ft = findNear(ex, function (s, x, y) { return typeAt(s, x, y) === T.FOREST; });
var stoneTile = findNear(ex, function (s, x, y) { return typeAt(s, x, y) === T.STONE; });
ok(!!ft && !!stoneTile, 'found forest and stone tiles');
// wrong deposit should fail
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
far.player.x = 200.5; far.player.y = 200.5;
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
var land = findNear(conv, function (s, x, y) { return C.walkable(s.world, x, y) && typeAt(s, x, y) !== T.WATER; });
ok(!!land, 'found open land for a converter');
conv.player.x = land.x + 0.5; conv.player.y = land.y + 0.5;
eq(C.place(conv, 'foundry').ok, false, 'foundry needs its blueprint');
conv.unlocks.foundry = true;
conv.inv.wood = 10000; conv.inv.stone = 10000; conv.inv.ore = 10000;
var placedF = C.place(conv, 'foundry');
eq(placedF.ok, true, 'foundry places after unlock');
eq(conv.extractors.length, 1, 'foundry added');
conv.inv.ore = 0; // build spent 60 ore on the foundry cost
conv.player.x = 500.5; conv.player.y = 500.5; // far away (no logistics)
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
eq(C.lifetimeTotal(pg), 0, 'lifetime total starts at 0');
var lt = C.createState(7);
lt.stats.wood = 150; lt.totalEver = 100;
eq(C.lifetimeTotal(lt), 250, 'lifetime total = carried total + current-world tallies');
pg.stats.wood = 20000;
eq(C.canEmbark(pg), true, '20k gathered this world enables embark');
eq(C.embarkGain(pg), 3, 'gain = floor(sqrt(20000/2000)) = 3');
var em = C.embark(pg);
eq(em.ok, true, 'embark succeeds');
eq(em.gained, 3, 'gained 3 insight');
var fresh = em.state;
eq(fresh.inv.wood, 0, 'world reset');
eq(fresh.insight, em.gained, 'insight preserved');
eq(fresh.prestiges, 1, 'prestige count 1');
eq(fresh.totalEver, 20000, 'lifetime carried over');
eq(C.sumStats(fresh), 0, 'new world gather tally starts at zero');
eq(C.canEmbark(fresh), false, 'cannot re-embark on carried lifetime progress alone');
eq(C.embark(fresh).ok, false, 'embark rejects a fresh world with no new progress');
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

/* ------------------------------------------------ progression map */
section('Progression map (families, node states, progress)');
var pm = C.createState(12345);
eq(C.PATH_FAMILIES.length, 5, 'five families in the registry');
eq(C.pathNodes(pm, 'nope').length, 0, 'an unknown family resolves to no nodes');
// The registry's declared refs must match what the resolver returns, so the
// map's rails and its rows can never drift apart.
for (var fi = 0; fi < C.PATH_FAMILIES.length; fi++) {
  var fam = C.PATH_FAMILIES[fi];
  var famNodes = C.pathNodes(pm, fam.id);
  eq(famNodes.length, fam.nodes.length, fam.id + ': one resolved node per declared ref');
  var keysOk = true;
  for (var ni = 0; ni < fam.nodes.length; ni++) if (famNodes[ni].key !== fam.nodes[ni]) keysOk = false;
  eq(keysOk, true, fam.id + ': resolved node keys match the registry order');
}
eq(C.PATH_FAMILIES[1].nodes.join(','), C.RESOURCES.join(','), 'refining refs mirror RESOURCES');
eq(C.PATH_FAMILIES[4].nodes.join(','), Object.keys(C.PERKS).join(','), 'perk refs mirror PERKS order');
var toolNodes = C.pathNodes(pm, 'tools');
eq(toolNodes.length, 4, 'tools family has four nodes');
eq(toolNodes[0].state, 'saving', 'a fresh, unaffordable tool reads saving');
pm.inv.wood = 100;
eq(C.pathNode(pm, 'tools', 'axe').state, 'ready', 'affordable tool upgrade reads ready');
eq(C.pathNode(pm, 'tools', 'axe').canBuy, true, 'affordable tool flags canBuy');
eq(C.pathProgress(pm, 'tools').total, 4, 'four tool nodes tracked');
eq(C.pathProgress(pm, 'tools').canBuy, true, 'tools family flags a ready node');
pm.tools.axe = C.TOOLS.axe.levels.length;
eq(C.pathNode(pm, 'tools', 'axe').state, 'owned', 'a maxed tool reads owned');
eq(C.pathProgress(pm, 'tools').owned, 1, 'one tool now owned');
eq(C.pathNodes(pm, 'refining').length, 4, 'refining tracks four resource chains');
eq(C.pathNode(pm, 'refining', 'wood').max, C.RES_UPGRADES.wood.length, 'refinery node max = chain length');
pm.resUp.wood = 2;
eq(C.pathNode(pm, 'refining', 'wood').state, 'partial', 'part-progress, unaffordable refinery reads partial');
eq(C.pathNode(pm, 'unlocks', 'logistics').state, 'saving', 'locked, unaffordable unlock reads saving');
pm.unlocks.logistics = true;
eq(C.pathNode(pm, 'unlocks', 'logistics').state, 'owned', 'owned unlock reads owned');
var abNode = C.pathNode(pm, 'abundance', 'abundance');
eq(abNode.max, Infinity, 'the Abundance Engine is repeatable');
eq(abNode.state, 'saving', 'unaffordable abundance reads saving');
var pkNodes = C.pathNodes(pm, 'perks');
eq(pkNodes.length, 5, 'perks family has five nodes');
eq(pkNodes[0].max, Infinity, 'Legacy is repeatable (Infinity max)');
pm.insight = 1;
eq(C.pathNode(pm, 'perks', 'legacy').state, 'ready', 'affordable perk reads ready');
C.buyPerk(pm, 'legacy');
eq(C.pathNode(pm, 'perks', 'legacy').state, 'partial', 'bought-but-unaffordable repeatable perk reads partial');
eq(C.pathProgress(pm, 'perks').total, 5, 'five perks tracked');

/* ------------------------------------------------------ save wipe */
section('Save wipe (old formats discarded)');
eq(C.deserialize(JSON.stringify({ v: 1, seed: 4242 })), null, 'v1 save is discarded');
eq(C.deserialize(JSON.stringify({ v: 2, seed: 4242 })), null, 'v2 save is discarded');

/* -------------------------------------------------------------- movement */
section('Movement');
var mv = C.createState(12345);
var blocked = findNear(mv, function (s, x, y) {
  return typeAt(s, x, y) === T.ROCK && C.walkable(s.world, x - 1, y);
});
if (blocked) {
  mv.player.x = blocked.x - 0.5; mv.player.y = blocked.y + 0.5;
  var movedInto = C.move(mv, 1, 0, 0.5);
  ok(!movedInto || Math.floor(mv.player.x) < blocked.x, 'cannot walk into rock (mountains)');
} else {
  console.log('  (no adjacent rock obstacle found to test collision)');
}

// swimming: open water is enterable and the player can cross it
var swim = C.createState(12345);
var waterTile = findNear(swim, function (s, x, y) {
  if (typeAt(s, x, y) !== T.WATER) return false;
  return C.walkable(s.world, x + 1, y) && C.walkable(s.world, x - 1, y) &&
    C.walkable(s.world, x, y + 1) && C.walkable(s.world, x, y - 1);
});
ok(!!waterTile, 'found an open water tile');
if (waterTile) {
  ok(C.walkable(swim.world, waterTile.x, waterTile.y), 'water is walkable');
  swim.player.x = waterTile.x + 0.5; swim.player.y = waterTile.y + 0.5;
  eq(C.onWater(swim), true, 'onWater detects the player is in water');
  var swimStart = swim.player.x;
  C.move(swim, 1, 0, 0.2);
  ok(swim.player.x > swimStart, 'player swims across water');
}
var mv2 = C.createState(12345);
var startX = mv2.player.x;
C.move(mv2, 1, 0, 0.2);
ok(mv2.player.x > startX || !C.canStand(mv2, mv2.player.x + 0.7, mv2.player.y), 'movement advances player on open ground');

// endless: walking far never hits a wall of bounds
var walk = C.createState(777);
walk.player.x = 9000.5; walk.player.y = -9000.5;
C.updateExplored(walk);
ok(typeof typeAt(walk, 9000, -9000) === 'number', 'coordinates far from origin are valid');

/* --------------------------------------------------------- day/night */
section('Forest mine expedition');
var mineRun = C.createState(31415);
var forestX = mineRun.player.x, forestY = mineRun.player.y;
eq(C.enterMine(mineRun), true, 'enter mine from the forest');
eq(C.mineTile(mineRun, 0, 0), C.MINE_T.TUNNEL, 'mine entrance starts open');
var shaft = C.mineShaft(mineRun);
eq(C.mineTile(mineRun, shaft.x, shaft.y), C.MINE_T.SHAFT, 'each layer has a marked downward shaft');
eq(C.descendMine(mineRun, shaft.x, shaft.y), false, 'a closed shaft cannot be used');
var digTarget = null;
for (var my = -1; my <= 1 && !digTarget; my++) for (var mx = -1; mx <= 1 && !digTarget; mx++) {
  if ((mx || my) && C.mineTile(mineRun, mx, my) !== C.MINE_T.BEDROCK && C.mineTile(mineRun, mx, my) !== C.MINE_T.SHAFT) digTarget = { x: mx, y: my };
}
ok(!!C.digMine(mineRun, digTarget.x, digTarget.y), 'nearby geology can be dug');
eq(mineRun.mine.depth, 0, 'ordinary digging never drops to the next layer');
mineRun.player.x = shaft.x + 0.5; mineRun.player.y = shaft.y + 0.5;
ok(C.digMine(mineRun, shaft.x, shaft.y).shaftOpened, 'the marked shaft takes a deliberate dig to uncover');
eq(C.mineTile(mineRun, shaft.x, shaft.y), C.MINE_T.SHAFT_OPEN, 'the opened shaft is visibly distinct');
eq(C.descendMine(mineRun, shaft.x + 1, shaft.y), false, 'only the opened shaft tile can be used');
eq(C.descendMine(mineRun, shaft.x, shaft.y), true, 'the player can deliberately use the open shaft');
eq(mineRun.mine.depth, 1, 'using the shaft opens the next layer');
eq(C.exitMine(mineRun), true, 'return to the forest');
eq(mineRun.player.x, forestX, 'return restores forest position');

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
C.setTileRich(ps.world, 49, 49, 2);
C.setTileRich(ps.world, -5000, 4000, 1); // far-from-origin edit
C.updateExplored(ps);
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
eq(C.tileRich(ps2.world, 49, 49), 2, 'world depletion preserved');
eq(C.tileRich(ps2.world, -5000, 4000), 1, 'far-from-origin edit preserved');
ok(C.isExplored(ps2.world, 51, 47), 'explored fog preserved');
ok(!C.isExplored(ps2.world, 5000, 5000), 'unexplored distance still fogged');
var savedMine = C.createState(4242);
C.enterMine(savedMine); savedMine.mine.depth = 4; savedMine.mine.carved['1,0'] = true; savedMine.mine.shaftOpen = true;
var restoredMine = C.deserialize(C.serialize(savedMine));
eq(restoredMine.mine.active, true, 'active mine expedition persists');
eq(restoredMine.mine.depth, 4, 'mine depth persists');
eq(restoredMine.mine.surface.x, savedMine.mine.surface.x, 'mine return point persists');
eq(restoredMine.mine.shaftOpen, true, 'opened shaft persists across saves');
eq(C.deserialize('not json'), null, 'bad save returns null');

/* ----------------------------------------------------------- bot run */
section('Bot playthrough (real navigation + gathering)');

function goGather(s, res, need, tRef, budget) {
  var guard = 0;
  var tt, path;
  while (s.inv[res] < need && guard < 6000) {
    guard++;
    tt = findNear(s, function (st, x, y) {
      return C.TILE_RESOURCE[typeAt(st, x, y)] === res && richAt(st, x, y) > 0;
    });
    if (!tt) return false;
    if (Math.hypot(tt.x + 0.5 - s.player.x, tt.y + 0.5 - s.player.y) > C.GATHER_RANGE) {
      path = findPath(s, Math.floor(s.player.x), Math.floor(s.player.y), tt.x, tt.y);
      if (!path) { C.setTileRich(s.world, tt.x, tt.y, 0); continue; } // unreachable: ignore it
      var used = walkPath(s, path, 0.1, 30);
      if (tRef) tRef.t += used;
      continue;
    }
    if (!C.gather(s)) continue;
    C.step(s, 0.25);
    if (tRef) tRef.t += 0.25;
  }
  return s.inv[res] >= need;
}

function goStandOn(s, pred, tRef, tight) {
  // tight mode walks all the way onto a matching tile (needed to sit inside the
  // 3-tile auto-collect radius of a camp); otherwise "close enough" is fine.
  var stop = tight ? 0.25 : 1.2;
  for (var attempt = 0; attempt < 30; attempt++) {
    var tt = findNear(s, pred);
    if (!tt) return false;
    var dx = tt.x + 0.5 - s.player.x, dy = tt.y + 0.5 - s.player.y;
    if (Math.hypot(dx, dy) <= stop) return true;
    var path = findPath(s, Math.floor(s.player.x), Math.floor(s.player.y), tt.x, tt.y, 24);
    if (!path) return false;
    var used = walkPath(s, path, 0.1, 12);
    if (tRef) tRef.t += used;
    if (used < 0.1) return false; // no progress
  }
  return false;
}

function runBot(seed) {
  var s = C.createState(seed);
  var tRef = { t: 0 }, timeline = {};
  function mark(name) { if (timeline[name] === undefined) timeline[name] = +tRef.t.toFixed(1); }

  goGather(s, 'wood', 6, tRef); C.buyUpgrade(s, 'axe'); mark('axe2');
  goGather(s, 'wood', 10, tRef); goGather(s, 'stone', 6, tRef); C.buyUpgrade(s, 'pickaxe'); mark('pick2');
  goGather(s, 'wood', 15, tRef);
  goStandOn(s, function (st, x, y) { return typeAt(st, x, y) === T.FOREST && !C.occupied(st, x, y); }, tRef);
  C.place(s, 'lumber'); mark('lumber');
  goGather(s, 'wood', 30, tRef); goGather(s, 'stone', 15, tRef);
  goStandOn(s, function (st, x, y) { return typeAt(st, x, y) === T.STONE && !C.occupied(st, x, y); }, tRef);
  C.place(s, 'quarry'); mark('quarry');
  goGather(s, 'stone', 45, tRef); goGather(s, 'ore', 12, tRef); mark('firstOre');
  goStandOn(s, function (st, x, y) { return typeAt(st, x, y) === T.ORE && !C.occupied(st, x, y); }, tRef);
  C.place(s, 'mine'); mark('mine');
  goGather(s, 'stone', 30, tRef); goGather(s, 'ore', 4, tRef);
  C.buyUpgrade(s, 'overclock'); mark('overclock2');

  var autoStart = tRef.t, budget = 600;
  while (tRef.t - autoStart < 180 && tRef.t < 1400) {
    C.step(s, 0.1); tRef.t += 0.1;
    if (C.collectTarget(s)) C.collect(s);
    if (!s.unlocks.logistics) {
      if (C.canAfford(s.inv, C.UNLOCKS.logistics.cost)) { C.buyUpgrade(s, 'logistics'); mark('logistics'); }
      else if (s.extractors.length < 3) break;
    }
    if (tRef.t - autoStart > budget) break;
  }
  return { state: s, timeline: timeline, time: tRef.t, extractors: s.extractors.length, inv: s.inv };
}

for (var seedIdx = 0; seedIdx < 3; seedIdx++) {
  var seed = [12345, 777, 20260101][seedIdx];
  var res = runBot(seed);
  console.log('  seed ' + seed + ': ' + JSON.stringify(res.timeline) + ' extractors=' + res.extractors);
  console.log('    final inv: wood=' + Math.floor(res.inv.wood) + ' stone=' + Math.floor(res.inv.stone) +
    ' ore=' + Math.floor(res.inv.ore) + ' crystal=' + Math.floor(res.inv.crystal));
  if (seedIdx === 0) {
    ok(res.timeline.axe2 !== undefined, 'bot crafted Axe II');
    ok(res.timeline.lumber !== undefined, 'bot built a Lumber Camp');
    ok(res.timeline.quarry !== undefined, 'bot built a Quarry');
    ok(res.extractors >= 2, 'bot established automated operation (' + res.extractors + ' extractors)');
    ok(res.timeline.mine !== undefined, 'bot established a Mine');
  }
  ok(res.extractors >= 2, 'seed ' + seed + ' achieves automation');
}

/* ------------------------------------------------- full progression */
section('Full progression to the end (bot)');

function runFullBot(seed) {
  var s = C.createState(seed);
  var tRef = { t: 0 }, timeline = {};
  function mark(n) { if (timeline[n] === undefined) timeline[n] = +tRef.t.toFixed(1); }
  function isForest(st, x, y) { return typeAt(st, x, y) === T.FOREST && !C.occupied(st, x, y); }
  function isStone(st, x, y) { return typeAt(st, x, y) === T.STONE && !C.occupied(st, x, y); }
  function isOre(st, x, y) { return typeAt(st, x, y) === T.ORE && !C.occupied(st, x, y); }

  goGather(s, 'wood', 6, tRef); C.buyUpgrade(s, 'axe'); mark('axe2');
  goGather(s, 'wood', 10, tRef); goGather(s, 'stone', 6, tRef); C.buyUpgrade(s, 'pickaxe'); mark('pick2');
  goGather(s, 'wood', 15, tRef); goStandOn(s, isForest, tRef); C.place(s, 'lumber'); mark('lumber');
  goGather(s, 'wood', 30, tRef); goGather(s, 'stone', 15, tRef); goStandOn(s, isStone, tRef); C.place(s, 'quarry'); mark('quarry');
  goGather(s, 'stone', 45, tRef); goGather(s, 'ore', 12, tRef); goStandOn(s, isOre, tRef); C.place(s, 'mine'); mark('mine');

  goGather(s, 'stone', 150, tRef); goGather(s, 'ore', 40, tRef); C.buyUpgrade(s, 'logistics'); mark('logistics');

  var targetOc = 4;
  while (s.tools.overclock < targetOc && tRef.t < 2000) {
    var cost = C.TOOLS.overclock.levels[s.tools.overclock].cost;
    goGather(s, 'stone', cost.stone, tRef); goGather(s, 'ore', cost.ore, tRef);
    if (!C.buyUpgrade(s, 'overclock').ok) break;
    mark('overclock' + s.tools.overclock);
  }

  goGather(s, 'stone', 140, tRef); goGather(s, 'ore', 70, tRef);
  if (findNear(s, function (st, x, y) { return typeAt(st, x, y) === T.CRYSTAL; })) {
    goStandOn(s, function (st, x, y) { return typeAt(st, x, y) === T.CRYSTAL; }, tRef);
    mark('crystal');
    goGather(s, 'crystal', 6, tRef);
    goStandOn(s, function (st, x, y) { return typeAt(st, x, y) === T.CRYSTAL && !C.occupied(st, x, y); }, tRef);
    C.place(s, 'resonator'); mark('resonator');
  }

  var quota = { wood: 1500, stone: 1500, ore: 750, crystal: 80 };
  function findExt(res) {
    for (var i = 0; i < s.extractors.length; i++) if (s.extractors[i].res === res) return s.extractors[i];
    return null;
  }
  function campNear(e) {
    return goStandOn(s, function (st, x, y) {
      if (C.occupied(st, x, y)) return false;
      if (!C.walkable(st.world, x, y)) return false;
      var dx = x + 0.5 - (e.x + 0.5), dy = y + 0.5 - (e.y + 0.5);
      return dx * dx + dy * dy <= 2.4 * 2.4;
    }, tRef, true);
  }
  while (tRef.t < 3000 && !s.unlocks.abundance) {
    var want = null;
    for (var rk in quota) { if (s.inv[rk] < quota[rk]) { want = rk; break; } }
    var camped = false;
    if (want) {
      var wx = findExt(want);
      if (wx) {
        var wdx = wx.x + 0.5 - s.player.x, wdy = wx.y + 0.5 - s.player.y;
        if (wdx * wdx + wdy * wdy <= 2.9 * 2.9) camped = true;
        else camped = campNear(wx);
      }
      if (!camped) {
        // No reachable camp for this resource: hand-gather a small batch instead.
        goGather(s, want, Math.min(quota[want], s.inv[want] + 25), tRef);
        if (tRef.t > 3000) break;
      }
    }
    C.step(s, 0.1); tRef.t += 0.1;
    if (C.canAfford(s.inv, C.UNLOCKS.abundance.cost)) { C.buyUpgrade(s, 'abundance'); mark('abundance'); break; }
  }
  return { t: tRef.t, timeline: timeline, inv: s.inv, unlocks: s.unlocks, extractors: s.extractors.length };
}

var full = runFullBot(12345);
console.log('  timeline: ' + JSON.stringify(full.timeline));
console.log('  extractors=' + full.extractors + '  final inv: wood=' + Math.floor(full.inv.wood) +
  ' stone=' + Math.floor(full.inv.stone) + ' ore=' + Math.floor(full.inv.ore) + ' crystal=' + Math.floor(full.inv.crystal));
ok(full.timeline.crystal !== undefined, 'bot discovered crystal');
ok(full.timeline.resonator !== undefined, 'bot built a Resonator');
ok(full.timeline.abundance !== undefined, 'bot reached the Abundance Engine (' + full.timeline.abundance + 's)');
ok(full.unlocks.abundance === true, 'abundance engine is active');

/* ------------------------------------------------------- save mid-game */
section('Mid-game save/load continuity');
var mid = C.createState(12345);
mid.inv.wood = 400; mid.inv.stone = 400; mid.inv.ore = 120;
mid.tools.axe = 3; mid.tools.pickaxe = 3;
// put a camp next to the player so range-limited auto-collect feeds it
var mx = Math.floor(mid.player.x) - 2, my = Math.floor(mid.player.y);
mid.extractors.push({ key: 'lumber', res: 'wood', x: mx, y: my, buffer: 0, t: 0 });
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
