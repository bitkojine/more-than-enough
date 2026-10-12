/* MORE THAN ENOUGH — core simulation (no DOM).
 * Deterministic world generation + economy + entity stepping.
 * Loaded in the browser as window.MTE.Core, and in Node for tests. */
(function (global) {
  'use strict';

  var WORLD_SIZE = 96;
  var EXPLORE_RADIUS = 6;
  var GATHER_RANGE = 1.65;
  var COLLECT_RANGE = 1.7;
  var BASE_SPEED = 3.7;
  var WATER_SPEED = 0.75; // swimming is a bit slower than walking
  var PLAYER_R = 0.3;

  var T = { GRASS: 0, FOREST: 1, STONE: 2, ORE: 3, CRYSTAL: 4, WATER: 5, ROCK: 6 };

  var RESOURCES = ['wood', 'stone', 'ore', 'crystal'];
  var RESOURCE_LABEL = { wood: 'Wood', stone: 'Stone', ore: 'Ore', crystal: 'Crystal' };
  var RESOURCE_ICON = { wood: '\uD83E\uDEB5', stone: '\uD83E\uDEA8', ore: '\u26CF\uFE0F', crystal: '\uD83D\uDCA0' };
  var TILE_RESOURCE = {};
  TILE_RESOURCE[T.FOREST] = 'wood';
  TILE_RESOURCE[T.STONE] = 'stone';
  TILE_RESOURCE[T.ORE] = 'ore';
  TILE_RESOURCE[T.CRYSTAL] = 'crystal';

  /* ---------------------------------------------------------------- noise */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, seed) {
    var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function valueNoise(x, y, seed) {
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = smoothstep(x - x0), fy = smoothstep(y - y0);
    var v00 = hash2(x0, y0, seed), v10 = hash2(x0 + 1, y0, seed);
    var v01 = hash2(x0, y0 + 1, seed), v11 = hash2(x0 + 1, y0 + 1, seed);
    var a = v00 + (v10 - v00) * fx;
    var b = v01 + (v11 - v01) * fx;
    return a + (b - a) * fy;
  }

  function fbm(x, y, seed, octaves) {
    octaves = octaves || 4;
    var amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (var i = 0; i < octaves; i++) {
      sum += amp * valueNoise(x * freq, y * freq, seed + i * 1013);
      norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  }

  /* --------------------------------------------------------------- world */

  function idx(x, y) { return y * WORLD_SIZE + x; }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE; }
  function tileType(world, x, y) { return inBounds(x, y) ? world.type[idx(x, y)] : T.ROCK; }
  function isWalkableType(t) { return t !== T.ROCK; } // water is swimmable now
  function walkable(world, x, y) { return isWalkableType(tileType(world, x, y)); }

  function generateWorld(seed) {
    seed = (seed >>> 0) || 1;
    var S = WORLD_SIZE, N = S * S;
    var type = new Uint8Array(N);
    var rich = new Uint8Array(N);
    var max = new Uint8Array(N);
    var cx = Math.floor(S / 2), cy = Math.floor(S / 2);
    var rnd = mulberry32((seed ^ 0x9E3779B9) >>> 0);

    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var i = idx(x, y);
        var dx = x - cx, dy = y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var nElev = fbm(x * 0.06, y * 0.06, seed + 11, 4);
        var nMoist = fbm(x * 0.055, y * 0.055, seed + 23, 4);
        var nRock = fbm(x * 0.075 + 17, y * 0.075 + 31, seed + 37, 3);
        var nOre = fbm(x * 0.09 + 53, y * 0.09 + 71, seed + 53, 3);

        var t = T.GRASS;
        if (dist <= 3) {
          t = T.GRASS;
        } else if (nElev < 0.28) {
          t = T.WATER;
        } else if (nElev > 0.79) {
          t = T.ROCK;
        } else if (dist > 20 && nOre > 0.775) {
          t = T.CRYSTAL;
        } else if (dist > 11 && nOre > 0.675) {
          t = T.ORE;
        } else if (nRock > 0.605) {
          t = T.STONE;
        } else if (nMoist > 0.505) {
          t = T.FOREST;
        }
        type[i] = t;
      }
    }

    // Guaranteed starter resources in the clearing ring (near spawn).
    var starters = [
      [cx + 3, cy - 1, T.FOREST], [cx + 3, cy + 1, T.FOREST],
      [cx + 2, cy + 2, T.FOREST], [cx - 3, cy + 2, T.FOREST],
      [cx - 2, cy - 3, T.FOREST], [cx + 4, cy - 2, T.FOREST],
      [cx - 3, cy - 1, T.STONE], [cx - 3, cy + 1, T.STONE],
      [cx + 2, cy - 3, T.STONE], [cx - 4, cy + 3, T.STONE]
    ];
    for (var s = 0; s < starters.length; s++) {
      if (inBounds(starters[s][0], starters[s][1])) type[idx(starters[s][0], starters[s][1])] = starters[s][2];
    }

    // Richness scales with distance from spawn.
    for (var yy = 0; yy < S; yy++) {
      for (var xx = 0; xx < S; xx++) {
        var ii = idx(xx, yy);
        var tt = type[ii];
        var ddx = xx - cx, ddy = yy - cy;
        var dd = Math.sqrt(ddx * ddx + ddy * ddy);
        var dn = Math.min(1, dd / 38);
        var base = 0;
        if (tt === T.FOREST) base = 3 + dn * 13 + rnd() * 2;
        else if (tt === T.STONE) base = 3 + dn * 9 + rnd() * 1.5;
        else if (tt === T.ORE) base = 2 + dn * 8 + rnd() * 1.5;
        else if (tt === T.CRYSTAL) base = 1 + dn * 3 + rnd() * 1.2;
        else continue;
        var v = Math.max(1, Math.min(30, Math.round(base)));
        rich[ii] = v; max[ii] = v;
      }
    }

    // Guarantee the world is broadly reachable: if obstacles enclose the spawn,
    // carve a few wandering trails outward.
    var reach = floodFill(type, cx, cy);
    var reachCount = 0;
    for (var k = 0; k < reach.length; k++) if (reach[k]) reachCount++;
    if (reachCount < N * 0.6) {
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (var d = 0; d < dirs.length; d++) {
        var px = cx, py = cy;
        for (var step = 0; step < S; step++) {
          px += dirs[d][0]; py += dirs[d][1];
          if (!inBounds(px, py)) break;
          var pi = idx(px, py);
          if (type[pi] === T.WATER || type[pi] === T.ROCK) type[pi] = T.GRASS;
        }
      }
    }

    return { size: S, type: type, rich: rich, max: max };
  }

  function floodFill(type, sx, sy) {
    var N = WORLD_SIZE * WORLD_SIZE;
    var seen = new Uint8Array(N);
    var stack = [idx(sx, sy)];
    seen[stack[0]] = 1;
    while (stack.length) {
      var i = stack.pop();
      var x = i % WORLD_SIZE, y = (i - x) / WORLD_SIZE;
      var nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (var n = 0; n < 4; n++) {
        var nx = nb[n][0], ny = nb[n][1];
        if (!inBounds(nx, ny)) continue;
        var ni = idx(nx, ny);
        if (seen[ni]) continue;
        if (!isWalkableType(type[ni])) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    return seen;
  }

  /* ------------------------------------------------------------- economy */

  var TOOLS = {
    axe: {
      name: 'Axe', icon: '\uD83E\uDEB5', desc: 'Wood gathered per swing',
      levels: [
        { yield: 1 },
        { yield: 2, cost: { wood: 6 } },
        { yield: 4, cost: { wood: 22, stone: 8 } },
        { yield: 8, cost: { wood: 70, stone: 30 } },
        { yield: 16, cost: { wood: 220, stone: 110 } },
        { yield: 32, cost: { wood: 650, stone: 320 } }
      ]
    },
    pickaxe: {
      name: 'Pickaxe', icon: '\u26CF\uFE0F', desc: 'Stone / ore / crystal per swing',
      levels: [
        { yield: 1 },
        { yield: 2, cost: { wood: 10, stone: 6 } },
        { yield: 4, cost: { wood: 30, stone: 24 } },
        { yield: 8, cost: { wood: 80, stone: 90, ore: 6 } },
        { yield: 16, cost: { wood: 200, stone: 260, ore: 30 } },
        { yield: 32, cost: { wood: 520, stone: 700, ore: 110 } }
      ]
    },
    boots: {
      name: 'Boots', icon: '\uD83D\uDC5F', desc: 'Movement speed',
      levels: [
        { mult: 1.0 },
        { mult: 1.3, cost: { wood: 8 } },
        { mult: 1.6, cost: { wood: 26, stone: 12 } },
        { mult: 2.0, cost: { wood: 70, stone: 45 } },
        { mult: 2.5, cost: { wood: 180, stone: 140, ore: 12 } }
      ]
    },
    overclock: {
      name: 'Overclock', icon: '\u2699\uFE0F', desc: 'All extractor output',
      levels: [
        { mult: 1 },
        { mult: 2, cost: { stone: 30, ore: 4 } },
        { mult: 4, cost: { stone: 90, ore: 16 } },
        { mult: 8, cost: { stone: 260, ore: 60 } },
        { mult: 16, cost: { stone: 700, ore: 180 } },
        { mult: 32, cost: { stone: 1800, ore: 520, crystal: 10 } }
      ]
    }
  };

  var EXTRACTORS = {
    lumber: { name: 'Lumber Camp', icon: '\uD83E\uDEB5', tile: T.FOREST, res: 'wood', rate: 0.6, buffer: 60, baseCost: { wood: 15 } },
    quarry: { name: 'Quarry', icon: '\uD83E\uDEA8', tile: T.STONE, res: 'stone', rate: 0.45, buffer: 60, baseCost: { wood: 30, stone: 15 } },
    mine: { name: 'Mine', icon: '\u26CF\uFE0F', tile: T.ORE, res: 'ore', rate: 0.32, buffer: 50, baseCost: { stone: 45, ore: 12 } },
    resonator: { name: 'Resonator', icon: '\uD83D\uDCA0', tile: T.CRYSTAL, res: 'crystal', rate: 0.09, buffer: 30, baseCost: { stone: 140, ore: 70, crystal: 6 } },
    // Converters need a blueprint and synthesize a resource on ANY land tile.
    sapling: { name: 'Sapling Grove', icon: '\uD83C\uDF31', tile: null, res: 'wood', rate: 0.5, buffer: 60, baseCost: { wood: 120, stone: 25 }, unlock: 'sapling' },
    brickyard: { name: 'Brickyard', icon: '\uD83E\uDDF1', tile: null, res: 'stone', rate: 0.38, buffer: 60, baseCost: { wood: 150, stone: 90 }, unlock: 'brickyard' },
    foundry: { name: 'Foundry', icon: '\u2692\uFE0F', tile: null, res: 'ore', rate: 0.3, buffer: 50, baseCost: { wood: 220, stone: 170, ore: 60 }, unlock: 'foundry' },
    observatory: { name: 'Observatory', icon: '\uD83D\uDD0D', tile: null, res: 'crystal', rate: 0.11, buffer: 30, baseCost: { wood: 380, stone: 400, ore: 160, crystal: 22 }, unlock: 'observatory' }
  };

  var UNLOCKS = {
    logistics: { name: 'Logistics', icon: '\uD83D\uDE9A', desc: 'Extractors collect themselves', cost: { stone: 150, ore: 40 } },
    abundance: { name: 'Abundance Engine', icon: '\u2728', desc: '+1/s of everything per level; refineries +50% per level', cost: { wood: 1500, stone: 1500, ore: 750, crystal: 80 } },
    sapling: { name: 'Blueprint: Sapling Grove', icon: '\uD83D\uDCDC', desc: 'Grow wood anywhere (any land tile)', cost: { wood: 150, stone: 40 } },
    brickyard: { name: 'Blueprint: Brickyard', icon: '\uD83D\uDCDC', desc: 'Shape stone anywhere (any land tile)', cost: { wood: 220, stone: 120 } },
    foundry: { name: 'Blueprint: Foundry', icon: '\uD83D\uDCDC', desc: 'Smelt ore anywhere (any land tile)', cost: { stone: 180, ore: 60 } },
    observatory: { name: 'Blueprint: Observatory', icon: '\uD83D\uDCDC', desc: 'Focus the sky: crystal anywhere', cost: { stone: 340, ore: 150, crystal: 26 } }
  };

  // Resource production chains ("refinery upgrades"). Every level multiplies
  // ALL production of that resource — from deposit extractors and converters
  // alike. The <mult> values compound, so late levels are enormous.
  var RES_UPGRADES = {
    wood: [
      { mult: 2, cost: { wood: 60 } },
      { mult: 2, cost: { wood: 180, stone: 30 } },
      { mult: 2, cost: { wood: 480, stone: 120 } },
      { mult: 3, cost: { wood: 1200, stone: 400, ore: 20 } },
      { mult: 3, cost: { wood: 3200, stone: 1100, ore: 60 } },
      { mult: 3, cost: { wood: 9000, stone: 3000, ore: 160, crystal: 8 } },
      { mult: 4, cost: { wood: 26000, stone: 9000, ore: 420, crystal: 24 } },
      { mult: 4, cost: { wood: 90000, stone: 30000, ore: 1100, crystal: 70 } },
      { mult: 5, cost: { wood: 350000, stone: 120000, ore: 3200, crystal: 200 } },
      { mult: 6, cost: { wood: 1600000, stone: 500000, ore: 9500, crystal: 600 } }
    ],
    stone: [
      { mult: 2, cost: { wood: 60, stone: 40 } },
      { mult: 2, cost: { wood: 200, stone: 120 } },
      { mult: 2, cost: { wood: 600, stone: 300, ore: 12 } },
      { mult: 3, cost: { wood: 1800, stone: 800, ore: 40 } },
      { mult: 3, cost: { wood: 5500, stone: 2400, ore: 130 } },
      { mult: 3, cost: { wood: 17000, stone: 7500, ore: 420, crystal: 10 } },
      { mult: 4, cost: { wood: 60000, stone: 26000, ore: 1300, crystal: 35 } },
      { mult: 4, cost: { wood: 240000, stone: 100000, ore: 4000, crystal: 110 } },
      { mult: 5, cost: { wood: 1000000, stone: 450000, ore: 14000, crystal: 340 } },
      { mult: 6, cost: { wood: 5000000, stone: 2200000, ore: 50000, crystal: 1000 } }
    ],
    ore: [
      { mult: 2, cost: { wood: 80, stone: 60 } },
      { mult: 2, cost: { wood: 260, stone: 180, ore: 10 } },
      { mult: 2, cost: { wood: 800, stone: 550, ore: 30 } },
      { mult: 3, cost: { wood: 2400, stone: 1700, ore: 100 } },
      { mult: 3, cost: { wood: 7500, stone: 5500, ore: 320 } },
      { mult: 3, cost: { wood: 24000, stone: 18000, ore: 1000, crystal: 12 } },
      { mult: 4, cost: { wood: 90000, stone: 70000, ore: 3200, crystal: 45 } },
      { mult: 4, cost: { wood: 380000, stone: 300000, ore: 11000, crystal: 150 } },
      { mult: 5, cost: { wood: 1800000, stone: 1500000, ore: 50000, crystal: 480 } },
      { mult: 6, cost: { wood: 10000000, stone: 8000000, ore: 250000, crystal: 1500 } }
    ],
    crystal: [
      { mult: 2, cost: { stone: 120, ore: 40 } },
      { mult: 2, cost: { stone: 400, ore: 140, crystal: 5 } },
      { mult: 2, cost: { stone: 1300, ore: 450, crystal: 16 } },
      { mult: 3, cost: { stone: 4200, ore: 1500, crystal: 50 } },
      { mult: 3, cost: { stone: 14000, ore: 4800, crystal: 160 } },
      { mult: 3, cost: { wood: 20000, stone: 48000, ore: 16000, crystal: 500 } },
      { mult: 4, cost: { wood: 60000, stone: 170000, ore: 56000, crystal: 1600 } },
      { mult: 4, cost: { wood: 240000, stone: 650000, ore: 220000, crystal: 5200 } },
      { mult: 5, cost: { wood: 1000000, stone: 2800000, ore: 1000000, crystal: 20000 } },
      { mult: 6, cost: { wood: 5000000, stone: 14000000, ore: 5000000, crystal: 80000 } }
    ]
  };
  var RES_UPGRADE_NAMES = {
    wood: { name: 'Silviculture', icon: '\uD83E\uDE9A' },
    stone: { name: 'Masonry', icon: '\uD83E\uDDF1' },
    ore: { name: 'Metallurgy', icon: '\u2699\uFE0F' },
    crystal: { name: 'Crystallurgy', icon: '\uD83D\uDC8E' }
  };

  var ABUNDANCE_GROWTH = 2.4;
  var EMBARK_MIN_TOTAL = 20000;

  // Permanent perks bought with Insight after embarking to a new world.
  var PERKS = {
    legacy: { name: 'Legacy', icon: '\uD83D\uDD70\uFE0F', base: 1, repeat: true,
      desc: 'Every refinery +25% output per level' },
    memory: { name: 'Memory', icon: '\uD83D\uDDDD\uFE0F', base: 1, repeat: false,
      desc: 'Begin each new world with Logistics' },
    heirloom: { name: 'Heirloom', icon: '\uD83E\uDE93', base: 1, repeat: false,
      desc: 'Begin each new world with Axe & Pickaxe II' },
    cartographer: { name: 'Cartographer', icon: '\uD83D\uDDFA\uFE0F', base: 2, repeat: false,
      desc: 'Fog clears wider (+2 tile radius)' },
    nomad: { name: 'Nomad', icon: '\uD83E\uDD7E', base: 2, repeat: true,
      desc: '+20% movement speed per level' }
  };

  var EXTRACTOR_GROWTH = 1.65;

  function canAfford(inv, cost) {
    if (!cost) return false;
    for (var r in cost) if ((inv[r] || 0) < cost[r]) return false;
    return true;
  }

  function pay(s, cost) {
    if (!canAfford(s.inv, cost)) return false;
    for (var r in cost) s.inv[r] -= cost[r];
    return true;
  }

  function costText(cost) {
    if (!cost) return '';
    var parts = [];
    for (var r in cost) parts.push(cost[r] + ' ' + RESOURCE_LABEL[r]);
    return parts.join(', ');
  }

  function extractorCount(s, key) {
    var n = 0;
    for (var i = 0; i < s.extractors.length; i++) if (s.extractors[i].key === key) n++;
    return n;
  }

  function hasExtractor(s, key) { return extractorCount(s, key) > 0; }

  function extractorCost(s, key) {
    var def = EXTRACTORS[key];
    var n = extractorCount(s, key);
    var f = Math.pow(EXTRACTOR_GROWTH, n);
    var cost = {};
    for (var r in def.baseCost) cost[r] = Math.ceil(def.baseCost[r] * f);
    return cost;
  }

  function gatherYield(s, res) {
    var tool = res === 'wood' ? 'axe' : 'pickaxe';
    return TOOLS[tool].levels[s.tools[tool] - 1].yield;
  }

  function overclockMult(s) { return TOOLS.overclock.levels[s.tools.overclock - 1].mult; }
  function moveMult(s) { return TOOLS.boots.levels[s.tools.boots - 1].mult; }

  /* ----------------------------------------------------- late-game economy */

  function resUpgradeLevel(s, res) { return (s.resUp && s.resUp[res]) || 0; }

  function resUpgradeInfo(s, res) {
    var chain = RES_UPGRADES[res];
    var lv = resUpgradeLevel(s, res);
    if (lv >= chain.length) return { maxed: true, level: lv, max: chain.length };
    return { maxed: false, level: lv, max: chain.length, next: chain[lv], cost: chain[lv].cost };
  }

  function resUpgradeMul(s, res) {
    var chain = RES_UPGRADES[res];
    var m = 1;
    for (var i = 0; i < resUpgradeLevel(s, res); i++) m *= chain[i].mult;
    return m;
  }

  function buyResUpgrade(s, res) {
    var info = resUpgradeInfo(s, res);
    if (info.maxed) return { ok: false, reason: 'Maxed' };
    if (!canAfford(s.inv, info.cost)) return { ok: false, reason: 'Need ' + costText(info.cost) };
    pay(s, info.cost);
    s.resUp[res] = info.level + 1;
    return { ok: true, res: res, level: info.level + 1 };
  }

  function legacyMult(s) { return Math.pow(1.25, (s.perks && s.perks.legacy) || 0); }
  function nomadMult(s) { return 1 + 0.2 * ((s.perks && s.perks.nomad) || 0); }
  function exploreRadius(s) { return EXPLORE_RADIUS + ((s.perks && s.perks.cartographer) ? 2 : 0); }
  function abundanceMult(s) { return Math.pow(1.5, s.abundanceLv || 0); }

  function abundanceCost(s) {
    var lv = s.abundanceLv || 0;
    var f = Math.pow(ABUNDANCE_GROWTH, lv);
    var cost = {};
    for (var r in UNLOCKS.abundance.cost) cost[r] = Math.ceil(UNLOCKS.abundance.cost[r] * f);
    return cost;
  }

  // Multiplicative output for every refinery/converter of a resource.
  function resProdMult(s, res) {
    return resUpgradeMul(s, res) * overclockMult(s) * abundanceMult(s) * legacyMult(s);
  }

  // Passive per-second gain from the Abundance Engine (per level).
  function abundanceTrickle(s, res) { return (s.abundanceLv || 0) * legacyMult(s); }

  function onWater(s) { return tileType(s.world, Math.floor(s.player.x), Math.floor(s.player.y)) === T.WATER; }

  /* --------------------------------------------------------------- state */

  function createState(seed) {
    seed = (seed >>> 0) || 1;
    var world = generateWorld(seed);
    var s = {
      seed: seed,
      world: world,
      explored: new Uint8Array(WORLD_SIZE * WORLD_SIZE),
      player: { x: WORLD_SIZE / 2 + 0.5, y: WORLD_SIZE / 2 + 2.5 },
      inv: { wood: 0, stone: 0, ore: 0, crystal: 0 },
      tools: { axe: 1, pickaxe: 1, boots: 1, overclock: 1 },
      unlocks: { logistics: false, abundance: false, sapling: false, brickyard: false, foundry: false, observatory: false },
      resUp: { wood: 0, stone: 0, ore: 0, crystal: 0 },
      abundanceLv: 0,
      insight: 0,
      prestiges: 0,
      totalEver: 0,
      perks: { legacy: 0, memory: false, heirloom: false, cartographer: false, nomad: 0 },
      extractors: [],
      stats: { wood: 0, stone: 0, ore: 0, crystal: 0, gathers: 0, collected: 0, built: 0, playedMs: 0 },
      discovered: { ore: false, crystal: false },
      goalIndex: 0,
      time: 0,
      regrowAcc: 0
    };
    updateExplored(s);
    return s;
  }

  function updateExplored(s, radius) {
    if (!radius) radius = exploreRadius(s);
    var px = Math.floor(s.player.x), py = Math.floor(s.player.y);
    var r = Math.ceil(radius);
    var r2 = radius * radius;
    for (var y = py - r; y <= py + r; y++) {
      for (var x = px - r; x <= px + r; x++) {
        if (!inBounds(x, y)) continue;
        var dx = x + 0.5 - s.player.x, dy = y + 0.5 - s.player.y;
        if (dx * dx + dy * dy > r2) continue;
        var i = idx(x, y);
        if (s.explored[i]) continue;
        s.explored[i] = 1;
        var t = s.world.type[i];
        if (t === T.ORE) s.discovered.ore = true;
        if (t === T.CRYSTAL) s.discovered.crystal = true;
      }
    }
  }

  /* -------------------------------------------------------------- gather */

  function gatherTarget(s) {
    var px = s.player.x, py = s.player.y;
    var cx = Math.floor(px), cy = Math.floor(py);
    var best = null, bestD = Infinity;
    for (var y = cy - 2; y <= cy + 2; y++) {
      for (var x = cx - 2; x <= cx + 2; x++) {
        if (!inBounds(x, y)) continue;
        var i = idx(x, y);
        var res = TILE_RESOURCE[s.world.type[i]];
        if (!res || s.world.rich[i] <= 0) continue;
        var dx = x + 0.5 - px, dy = y + 0.5 - py;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > GATHER_RANGE) continue;
        if (d < bestD) { bestD = d; best = { x: x, y: y, i: i, res: res, type: s.world.type[i], dist: d }; }
      }
    }
    return best;
  }

  function gather(s) {
    var tgt = gatherTarget(s);
    if (!tgt) return null;
    var amount = gatherYield(s, tgt.res);
    s.world.rich[tgt.i] -= 1;
    if (s.world.rich[tgt.i] < 0) s.world.rich[tgt.i] = 0;
    s.inv[tgt.res] += amount;
    s.stats[tgt.res] += amount;
    s.stats.gathers += 1;
    return { res: tgt.res, amount: amount, x: tgt.x, y: tgt.y };
  }

  /* ------------------------------------------------------------ collect */

  function collectTarget(s) {
    var px = s.player.x, py = s.player.y;
    var total = 0, list = [];
    for (var i = 0; i < s.extractors.length; i++) {
      var e = s.extractors[i];
      if (e.buffer < 1) continue;
      var dx = e.x + 0.5 - px, dy = e.y + 0.5 - py;
      if (dx * dx + dy * dy > COLLECT_RANGE * COLLECT_RANGE) continue;
      total += e.buffer;
      list.push(e);
    }
    if (!list.length) return null;
    return { total: Math.floor(total), list: list };
  }

  function collect(s) {
    var t = collectTarget(s);
    if (!t) return null;
    var gained = {};
    for (var i = 0; i < t.list.length; i++) {
      var e = t.list[i];
      var amt = Math.floor(e.buffer);
      if (amt <= 0) { continue; }
      s.inv[e.res] += amt;
      s.stats[e.res] += amt;
      s.stats.collected += amt;
      gained[e.res] = (gained[e.res] || 0) + amt;
      e.buffer -= amt;
    }
    return gained;
  }

  /* --------------------------------------------------------------- build */

  function buildTarget(s, key) {
    var def = EXTRACTORS[key];
    if (!def) return null;
    var px = s.player.x, py = s.player.y;
    var cx = Math.floor(px), cy = Math.floor(py);
    var best = null, bestD = Infinity;
    for (var y = cy - 1; y <= cy + 1; y++) {
      for (var x = cx - 1; x <= cx + 1; x++) {
        if (!inBounds(x, y)) continue;
        var i = idx(x, y);
        if (def.tile === null) {
          var lt = s.world.type[i];
          if (lt === T.WATER || !isWalkableType(lt)) continue; // no building at sea
        } else if (s.world.type[i] !== def.tile) {
          continue;
        }
        if (occupied(s, x, y)) continue;
        var dx = x + 0.5 - px, dy = y + 0.5 - py;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1.65) continue;
        if (d < bestD) { bestD = d; best = { x: x, y: y, i: i }; }
      }
    }
    return best;
  }

  function occupied(s, x, y) {
    for (var i = 0; i < s.extractors.length; i++) {
      if (s.extractors[i].x === x && s.extractors[i].y === y) return true;
    }
    return false;
  }

  function place(s, key) {
    var def = EXTRACTORS[key];
    if (!def) return { ok: false, reason: 'Unknown' };
    if (def.unlock && !s.unlocks[def.unlock]) {
      return { ok: false, reason: 'Find the ' + (UNLOCKS[def.unlock] ? UNLOCKS[def.unlock].name : 'blueprint') };
    }
    var tgt = buildTarget(s, key);
    if (!tgt) return { ok: false, reason: 'Stand next to a suitable deposit' };
    var cost = extractorCost(s, key);
    if (!canAfford(s.inv, cost)) return { ok: false, reason: 'Need ' + costText(cost) };
    pay(s, cost);
    s.extractors.push({ key: key, res: def.res, x: tgt.x, y: tgt.y, buffer: 0, t: 0 });
    s.stats.built += 1;
    return { ok: true, x: tgt.x, y: tgt.y, cost: cost };
  }

  /* ------------------------------------------------------------- upgrades */

  function upgradeInfo(s, id) {
    if (TOOLS[id]) {
      var lv = s.tools[id];
      var levels = TOOLS[id].levels;
      if (lv >= levels.length) return { maxed: true, level: lv, max: levels.length };
      return { maxed: false, level: lv, max: levels.length, next: levels[lv], cost: levels[lv].cost };
    }
    if (UNLOCKS[id]) {
      if (id === 'abundance') {
        return { unlock: true, level: s.abundanceLv || 0, cost: abundanceCost(s), maxed: false };
      }
      return { unlocked: !!s.unlocks[id], cost: UNLOCKS[id].cost, maxed: !!s.unlocks[id] };
    }
    return null;
  }

  function buyUpgrade(s, id) {
    if (TOOLS[id]) {
      var lv = s.tools[id];
      var levels = TOOLS[id].levels;
      if (lv >= levels.length) return { ok: false, reason: 'Maxed' };
      var cost = levels[lv].cost;
      if (!canAfford(s.inv, cost)) return { ok: false, reason: 'Need ' + costText(cost) };
      pay(s, cost);
      s.tools[id] = lv + 1;
      return { ok: true, level: lv + 1 };
    }
    if (UNLOCKS[id]) {
      if (id === 'abundance') {
        var acost = abundanceCost(s);
        if (!canAfford(s.inv, acost)) return { ok: false, reason: 'Need ' + costText(acost) };
        pay(s, acost);
        s.abundanceLv = (s.abundanceLv || 0) + 1;
        s.unlocks.abundance = true;
        return { ok: true, level: s.abundanceLv };
      }
      if (s.unlocks[id]) return { ok: false, reason: 'Already owned' };
      if (!canAfford(s.inv, UNLOCKS[id].cost)) return { ok: false, reason: 'Need ' + costText(UNLOCKS[id].cost) };
      pay(s, UNLOCKS[id].cost);
      s.unlocks[id] = true;
      return { ok: true, unlocked: true };
    }
    return { ok: false, reason: 'Unknown upgrade' };
  }

  /* ------- Insight / perks / embarking to a new world (prestige loop) ------ */

  function sumStats(s) {
    var n = 0;
    for (var r = 0; r < RESOURCES.length; r++) n += s.stats[RESOURCES[r]] || 0;
    return n;
  }

  function embarkGain(s) {
    return Math.floor(Math.sqrt((s.totalEver + sumStats(s)) / 2000));
  }

  function canEmbark(s) { return embarkGain(s) >= 1; }

  function embark(s) {
    var gain = embarkGain(s);
    if (gain < 1) return { ok: false, reason: 'Reach ' + EMBARK_MIN_TOTAL + ' lifetime resources first' };
    var seed = ((Math.random() * 0xFFFFFF) | 0) + 1;
    var fresh = createState(seed);
    var p = s.perks || {};
    var freshPerks = { legacy: p.legacy || 0, memory: !!p.memory, heirloom: !!p.heirloom, cartographer: !!p.cartographer, nomad: p.nomad || 0 };
    if (freshPerks.memory) fresh.unlocks.logistics = true;
    if (freshPerks.heirloom) { fresh.tools.axe = 2; fresh.tools.pickaxe = 2; }
    fresh.perks = freshPerks;
    fresh.insight = (s.insight || 0) + gain;
    fresh.prestiges = (s.prestiges || 0) + 1;
    fresh.totalEver = (s.totalEver || 0) + sumStats(s);
    return { ok: true, state: fresh, gained: gain, totalLifetime: fresh.totalEver };
  }

  function perkOwned(s, key) {
    var d = PERKS[key];
    if (!s.perks) return 0;
    return d && !d.repeat ? (s.perks[key] ? 1 : 0) : (s.perks[key] || 0);
  }

  function perkCost(s, key) {
    var d = PERKS[key];
    var lv = perkOwned(s, key);
    return d.base + (d.repeat ? lv : 0);
  }

  function buyPerk(s, key) {
    var d = PERKS[key];
    if (!d) return { ok: false, reason: 'Unknown' };
    if (!d.repeat && s.perks[key]) return { ok: false, reason: 'Already owned' };
    var cost = perkCost(s, key);
    if ((s.insight || 0) < cost) return { ok: false, reason: 'Need ' + cost + ' Insight' };
    s.insight -= cost;
    if (d.repeat) s.perks[key] = (s.perks[key] || 0) + 1;
    else s.perks[key] = true;
    return { ok: true, key: key, level: perkOwned(s, key) };
  }

  /* --------------------------------------------------------------- step */

  var REGROW_INTERVAL = 0.5;
  var REGROW_CHANCE = 0.02;

  function step(s, dt) {
    if (dt > 0.25) dt = 0.25;
    s.time += dt;
    s.stats.playedMs += dt * 1000;

    for (var i = 0; i < s.extractors.length; i++) {
      var e = s.extractors[i];
      var def = EXTRACTORS[e.key];
      e.t += dt;
      if (e.buffer < def.buffer) {
        e.buffer = Math.min(def.buffer, e.buffer + def.rate * resProdMult(s, e.res) * dt);
      }
      if (s.unlocks.logistics && e.buffer > 0) {
        var amt = Math.floor(e.buffer);
        if (amt > 0) {
          s.inv[e.res] += amt; s.stats[e.res] += amt; e.buffer -= amt;
        }
      }
    }

    var alv = s.abundanceLv || 0;
    if (alv > 0) {
      var lm = legacyMult(s);
      for (var r = 0; r < RESOURCES.length; r++) {
        s.inv[RESOURCES[r]] += alv * lm * dt;
        s.stats[RESOURCES[r]] += alv * lm * dt;
      }
    }

    s.regrowAcc += dt;
    if (s.regrowAcc >= REGROW_INTERVAL) {
      s.regrowAcc -= REGROW_INTERVAL;
      regrow(s);
    }
  }

  function regrow(s) {
    var w = s.world;
    for (var i = 0; i < w.type.length; i++) {
      var t = w.type[i];
      if ((t === T.FOREST || t === T.STONE) && w.rich[i] < w.max[i]) {
        if (Math.random() < REGROW_CHANCE) w.rich[i]++;
      }
    }
  }

  /* --------------------------------------------------------------- move */

  function pointWalkable(s, x, y) {
    return walkable(s.world, Math.floor(x), Math.floor(y));
  }

  function canStand(s, x, y) {
    var R = PLAYER_R;
    return pointWalkable(s, x - R, y - R) && pointWalkable(s, x + R, y - R) &&
      pointWalkable(s, x - R, y + R) && pointWalkable(s, x + R, y + R) &&
      pointWalkable(s, x, y);
  }

  function move(s, dx, dy, dt) {
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.0001) return false;
    dx /= len; dy /= len;
    var speed = BASE_SPEED * moveMult(s) * nomadMult(s);
    if (tileType(s.world, Math.floor(s.player.x), Math.floor(s.player.y)) === T.WATER) speed *= WATER_SPEED;
    var moved = false;
    var nx = s.player.x + dx * speed * dt;
    if (canStand(s, nx, s.player.y)) { s.player.x = nx; moved = true; }
    var ny = s.player.y + dy * speed * dt;
    if (canStand(s, s.player.x, ny)) { s.player.y = ny; moved = true; }
    if (s.player.x < 0.5) s.player.x = 0.5;
    if (s.player.y < 0.5) s.player.y = 0.5;
    if (s.player.x > WORLD_SIZE - 0.5) s.player.x = WORLD_SIZE - 0.5;
    if (s.player.y > WORLD_SIZE - 0.5) s.player.y = WORLD_SIZE - 0.5;
    return moved;
  }

  /* ---------------------------------------------------------------- goals */

  var GOALS = [
    { text: '\uD83E\uDEB5 Gather wood from the forest', test: function (s) { return s.stats.wood > 0; } },
    { text: '\uD83E\uDEB5 Craft an Axe upgrade (6 wood)', test: function (s) { return s.tools.axe >= 2; } },
    { text: '\uD83E\uDEA8 Gather stone from a stone deposit', test: function (s) { return s.stats.stone > 0; } },
    { text: '\u26CF\uFE0F Craft a Pickaxe upgrade (10 wood, 6 stone)', test: function (s) { return s.tools.pickaxe >= 2; } },
    { text: '\uD83C\uDFD5\uFE0F Build a Lumber Camp on a forest tile (15 wood)', test: function (s) { return hasExtractor(s, 'lumber'); } },
    { text: '\uD83D\uDCE6 Collect your camp\u2019s output (stand next to it)', test: function (s) { return s.stats.collected > 0 || s.unlocks.logistics; } },
    { text: '\uD83E\uDDED Explore outward to find ore', test: function (s) { return s.discovered.ore; } },
    { text: '\u26CF\uFE0F Build a Mine on an ore deposit', test: function (s) { return hasExtractor(s, 'mine'); } },
    { text: '\u2699\uFE0F Research Overclock II (30 stone, 4 ore)', test: function (s) { return s.tools.overclock >= 2; } },
    { text: '\uD83D\uDE9A Unlock Logistics for hands-free collection', test: function (s) { return s.unlocks.logistics; } },
    { text: '\uD83D\uDCA0 Discover crystal in the far wilds', test: function (s) { return s.discovered.crystal; } },
    { text: '\uD83D\uDCA0 Build a Resonator on a crystal deposit', test: function (s) { return hasExtractor(s, 'resonator'); } },
    { text: '\u2728 Build the Abundance Engine', test: function (s) { return s.unlocks.abundance; } },
    { text: '\u2699\uFE0F Push the Abundance Engine to II', test: function (s) { return (s.abundanceLv || 0) >= 2; } },
    { text: '\uD83E\uDE9A Sharpen wood production (Silviculture I)', test: function (s) { return s.resUp.wood >= 1; } },
    { text: '\uD83E\uDDF1 Sharpen stone production (Masonry I)', test: function (s) { return s.resUp.stone >= 1; } },
    { text: '\u2692\uFE0F Unlock the Foundry blueprint', test: function (s) { return !!s.unlocks.foundry; } },
    { text: '\u2692\uFE0F Build a Foundry (ore, anywhere)', test: function (s) { return hasExtractor(s, 'foundry'); } },
    { text: '\uD83D\uDC8E Sharpen crystal production (Crystallurgy I)', test: function (s) { return s.resUp.crystal >= 1; } },
    { text: '\uD83D\uDD0D Unlock the Observatory blueprint', test: function (s) { return !!s.unlocks.observatory; } },
    { text: '\uD83D\uDD0D Build an Observatory (crystal, anywhere)', test: function (s) { return hasExtractor(s, 'observatory'); } },
    { text: '\uD83C\uDF31 Automate a Sapling Grove (wood, anywhere)', test: function (s) { return hasExtractor(s, 'sapling'); } },
    { text: '\uD83E\uDEA8 Automate a Brickyard (stone, anywhere)', test: function (s) { return hasExtractor(s, 'brickyard'); } },
    { text: '\u2699\uFE0F Sharpen ore production (Metallurgy I)', test: function (s) { return s.resUp.ore >= 1; } },
    { text: '\u2764\uFE0F\u200D\uD83D\uDD25 Push the Abundance Engine to IV', test: function (s) { return (s.abundanceLv || 0) >= 4; } },
    { text: '\uD83C\uDFD4\uFE0F Own 25 automated structures', test: function (s) { return s.extractors.length >= 25; } },
    { text: '\uD83C\uDF05 The Long Road \u2014 ' + EMBARK_MIN_TOTAL.toLocaleString() + ' lifetime resources', test: function (s) { return s.totalEver + sumStats(s) >= EMBARK_MIN_TOTAL; } },
    { text: '\u267E\uFE0F MORE THAN ENOUGH \u2014 expand forever', test: function () { return false; } }
  ];

  /* ---------------------------------------------------------- persistence */

  function bytesToB64(u8) {
    var out = '', chunk = 0x8000;
    for (var i = 0; i < u8.length; i += chunk) {
      out += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(out);
  }

  function b64ToBytes(b64) {
    var str = atob(b64);
    var u8 = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
    return u8;
  }

  function serialize(s) {
    return JSON.stringify({
      v: 2,
      seed: s.seed,
      rich: bytesToB64(s.world.rich),
      explored: bytesToB64(s.explored),
      player: { x: +s.player.x.toFixed(3), y: +s.player.y.toFixed(3) },
      inv: s.inv, tools: s.tools, unlocks: s.unlocks,
      resUp: s.resUp, abundanceLv: s.abundanceLv,
      insight: s.insight, prestiges: s.prestiges, totalEver: s.totalEver,
      perks: s.perks,
      extractors: s.extractors.map(function (e) { return { k: e.key, x: e.x, y: e.y, b: +e.buffer.toFixed(2) }; }),
      stats: s.stats, discovered: s.discovered,
      goalIndex: s.goalIndex, time: s.time
    });
  }

  function deserialize(str) {
    try {
      var d = JSON.parse(str);
      if (!d || (d.v !== 1 && d.v !== 2)) return null;
      var s = createState(d.seed);
      var rich = b64ToBytes(d.rich);
      if (rich.length === s.world.rich.length) s.world.rich.set(rich);
      var ex = b64ToBytes(d.explored);
      if (ex.length === s.explored.length) s.explored.set(ex);
      if (d.player) { s.player.x = d.player.x; s.player.y = d.player.y; }
      if (d.inv) for (var r in s.inv) if (typeof d.inv[r] === 'number') s.inv[r] = d.inv[r];
      if (d.tools) for (var t in s.tools) if (typeof d.tools[t] === 'number') s.tools[t] = d.tools[t];
      if (d.unlocks) for (var u in s.unlocks) s.unlocks[u] = !!d.unlocks[u];
      if (d.resUp) for (var rp in s.resUp) if (typeof d.resUp[rp] === 'number') s.resUp[rp] = d.resUp[rp];
      if (typeof d.abundanceLv === 'number') s.abundanceLv = d.abundanceLv;
      else if (s.unlocks.abundance) s.abundanceLv = 1; // v1 migration: owning it = level 1
      if (typeof d.insight === 'number') s.insight = d.insight;
      if (typeof d.prestiges === 'number') s.prestiges = d.prestiges;
      if (typeof d.totalEver === 'number') s.totalEver = d.totalEver;
      if (d.perks) {
        s.perks.legacy = typeof d.perks.legacy === 'number' ? d.perks.legacy : 0;
        s.perks.memory = !!d.perks.memory;
        s.perks.heirloom = !!d.perks.heirloom;
        s.perks.cartographer = !!d.perks.cartographer;
        s.perks.nomad = typeof d.perks.nomad === 'number' ? d.perks.nomad : 0;
      }
      if (Array.isArray(d.extractors)) {
        s.extractors = [];
        for (var i = 0; i < d.extractors.length; i++) {
          var e = d.extractors[i];
          if (!EXTRACTORS[e.k]) continue;
          s.extractors.push({ key: e.k, res: EXTRACTORS[e.k].res, x: e.x, y: e.y, buffer: e.b || 0, t: 0 });
        }
      }
      if (d.stats) for (var st in s.stats) if (typeof d.stats[st] === 'number') s.stats[st] = d.stats[st];
      if (d.discovered) { s.discovered.ore = !!d.discovered.ore; s.discovered.crystal = !!d.discovered.crystal; }
      if (typeof d.goalIndex === 'number') s.goalIndex = d.goalIndex;
      if (typeof d.time === 'number') s.time = d.time;
      return s;
    } catch (err) {
      return null;
    }
  }

  /* ---------------------------------------------------------------- export */

  var Core = {
    WORLD_SIZE: WORLD_SIZE, T: T, RESOURCES: RESOURCES,
    RESOURCE_LABEL: RESOURCE_LABEL, RESOURCE_ICON: RESOURCE_ICON, TILE_RESOURCE: TILE_RESOURCE,
    TOOLS: TOOLS, EXTRACTORS: EXTRACTORS, UNLOCKS: UNLOCKS, GOALS: GOALS,
    GATHER_RANGE: GATHER_RANGE, COLLECT_RANGE: COLLECT_RANGE, BASE_SPEED: BASE_SPEED, WATER_SPEED: WATER_SPEED,
    EXPLORE_RADIUS: EXPLORE_RADIUS,
    EXTRACTOR_GROWTH: EXTRACTOR_GROWTH,
    idx: idx, inBounds: inBounds, tileType: tileType, walkable: walkable,
    generateWorld: generateWorld, floodFill: floodFill,
    createState: createState, updateExplored: updateExplored,
    gatherTarget: gatherTarget, gather: gather, gatherYield: gatherYield,
    collectTarget: collectTarget, collect: collect,
    buildTarget: buildTarget, place: place, occupied: occupied,
    upgradeInfo: upgradeInfo, buyUpgrade: buyUpgrade, canAfford: canAfford, pay: pay, costText: costText,
    extractorCost: extractorCost, extractorCount: extractorCount, hasExtractor: hasExtractor,
    overclockMult: overclockMult, moveMult: moveMult, onWater: onWater,
    RES_UPGRADES: RES_UPGRADES, RES_UPGRADE_NAMES: RES_UPGRADE_NAMES, PERKS: PERKS,
    ABUNDANCE_GROWTH: ABUNDANCE_GROWTH, EMBARK_MIN_TOTAL: EMBARK_MIN_TOTAL,
    resUpgradeLevel: resUpgradeLevel, resUpgradeInfo: resUpgradeInfo,
    resUpgradeMul: resUpgradeMul, buyResUpgrade: buyResUpgrade,
    legacyMult: legacyMult, nomadMult: nomadMult, exploreRadius: exploreRadius,
    abundanceMult: abundanceMult, abundanceCost: abundanceCost,
    resProdMult: resProdMult, abundanceTrickle: abundanceTrickle,
    sumStats: sumStats, embarkGain: embarkGain, canEmbark: canEmbark, embark: embark,
    perkOwned: perkOwned, perkCost: perkCost, buyPerk: buyPerk,
    step: step, move: move,
    serialize: serialize, deserialize: deserialize,
    bytesToB64: bytesToB64, b64ToBytes: b64ToBytes
  };

  global.MTE = { Core: Core };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
