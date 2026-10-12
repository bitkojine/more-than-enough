/* MORE THAN ENOUGH — core simulation (no DOM).
 * Deterministic world generation + economy + entity stepping.
 * Loaded in the browser as window.MTE.Core, and in Node for tests. */
(function (global) {
  'use strict';

  // The world is infinite: terrain is generated lazily in fixed-size chunks and
  // cached. Only edits (gathered/regrown richness) and revealed fog are saved.
  var CHUNK_SIZE = 16;
  var CHUNK_TILES = CHUNK_SIZE * CHUNK_SIZE;
  var MASK_BYTES = CHUNK_TILES >> 3;   // fog bitmask, one bit per tile
  var MAX_CACHED_CHUNKS = 512;
  var REGROW_RADIUS = 20;              // only tiles near the player regrow
  var SPAWN_SEARCH_RADIUS = 200;       // how far we look for a walkable spawn

  var EXPLORE_RADIUS = 6;
  var GATHER_RANGE = 1.65;
  var COLLECT_RANGE = 1.7;
  // Logistics auto-collects whole units from any extractor within this many
  // tiles of the player. Wider than manual collection so a few camps packed in
  // your base all feed you at once — but walk away and they just buffer up.
  var AUTO_COLLECT_RANGE = 3.0;
  var BASE_SPEED = 3.7;
  var WATER_SPEED = 0.75; // swimming is a bit slower than walking
  var PLAYER_R = 0.3;
  var DAY_LENGTH = 240; // seconds of game time for one full day-night cycle

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

  // Numeric packers for tile/chunk coordinates. Valid for |coord| < 2^20,
  // which is astronomically more world than anyone will walk.
  var PACK_OFF = 1 << 20;
  var PACK_SPAN = 1 << 21;
  function packKey(a, b) { return (a + PACK_OFF) * PACK_SPAN + (b + PACK_OFF); }
  function tileKey(x, y) { return packKey(x, y); }
  function chunkKey(cx, cy) { return packKey(cx, cy); }
  function chunkCoord(v) { return Math.floor(v / CHUNK_SIZE); }

  function createWorld(seed) {
    seed = (seed >>> 0) || 1;
    return {
      seed: seed,
      chunkSize: CHUNK_SIZE,
      chunks: new Map(),   // chunkKey -> { cx, cy, type, rich, max }
      mods: new Map(),     // tileKey  -> absolute richness (only when != baseline)
      explored: new Map()  // chunkKey -> Uint8Array fog bitmask (+1 bit per tile)
    };
  }

  // Pure, order-independent generation of one chunk. Every per-tile value is a
  // function of (x, y, seed) only — no shared RNG stream — so chunks can be
  // generated in any order and always match.
  function generateChunk(w, cx, cy) {
    var type = new Uint8Array(CHUNK_TILES);
    var rich = new Uint8Array(CHUNK_TILES);
    var max = new Uint8Array(CHUNK_TILES);
    var ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE;
    for (var ly = 0; ly < CHUNK_SIZE; ly++) {
      for (var lx = 0; lx < CHUNK_SIZE; lx++) {
        var x = ox + lx, y = oy + ly, i = ly * CHUNK_SIZE + lx;
        var nElev = fbm(x * 0.06, y * 0.06, w.seed + 11, 4);
        var nMoist = fbm(x * 0.055, y * 0.055, w.seed + 23, 4);
        var nRock = fbm(x * 0.075 + 17, y * 0.075 + 31, w.seed + 37, 3);
        var nOre = fbm(x * 0.09 + 53, y * 0.09 + 71, w.seed + 53, 3);

        // No distance-from-spawn logic: the whole plane is equally random.
        var t = T.GRASS;
        if (nElev < 0.28) t = T.WATER;
        else if (nElev > 0.79) t = T.ROCK;
        else if (nOre > 0.775) t = T.CRYSTAL;
        else if (nOre > 0.675) t = T.ORE;
        else if (nRock > 0.605) t = T.STONE;
        else if (nMoist > 0.505) t = T.FOREST;
        type[i] = t;

        var base = 0;
        if (t === T.FOREST) base = 5 + hash2(x, y, w.seed + 101) * 9;
        else if (t === T.STONE) base = 4 + hash2(x, y, w.seed + 102) * 6;
        else if (t === T.ORE) base = 3 + hash2(x, y, w.seed + 103) * 6;
        else if (t === T.CRYSTAL) base = 1 + hash2(x, y, w.seed + 104) * 3;
        if (base > 0) {
          var v = Math.max(1, Math.min(30, Math.round(base)));
          rich[i] = v; max[i] = v;
        }
      }
    }
    return { cx: cx, cy: cy, type: type, rich: rich, max: max };
  }

  function getChunk(w, cx, cy) {
    var k = chunkKey(cx, cy);
    var c = w.chunks.get(k);
    if (c) return c;
    if (w.chunks.size >= MAX_CACHED_CHUNKS) {
      var oldest = w.chunks.keys().next().value;
      w.chunks.delete(oldest);
    }
    c = generateChunk(w, cx, cy);
    w.chunks.set(k, c);
    return c;
  }

  function localIndex(x, cx, y, cy) {
    return (y - cy * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE);
  }

  function tileType(w, x, y) {
    var cx = chunkCoord(x), cy = chunkCoord(y);
    return getChunk(w, cx, cy).type[localIndex(x, cx, y, cy)];
  }
  function isWalkableType(t) { return t !== T.ROCK; } // water is swimmable
  function walkable(w, x, y) { return isWalkableType(tileType(w, x, y)); }

  function baselineRich(w, x, y) {
    var cx = chunkCoord(x), cy = chunkCoord(y);
    return getChunk(w, cx, cy).rich[localIndex(x, cx, y, cy)];
  }
  function baselineMax(w, x, y) {
    var cx = chunkCoord(x), cy = chunkCoord(y);
    return getChunk(w, cx, cy).max[localIndex(x, cx, y, cy)];
  }
  function tileRich(w, x, y) {
    var m = w.mods.get(tileKey(x, y));
    return m === undefined ? baselineRich(w, x, y) : m;
  }
  function tileMax(w, x, y) { return baselineMax(w, x, y); }
  function setTileRich(w, x, y, v) {
    // Keep the delta map minimal: drop entries that match the generated baseline.
    if (v === baselineRich(w, x, y)) w.mods.delete(tileKey(x, y));
    else w.mods.set(tileKey(x, y), v);
  }

  function isExplored(w, x, y) {
    var cx = chunkCoord(x), cy = chunkCoord(y);
    var m = w.explored.get(chunkKey(cx, cy));
    if (!m) return false;
    var li = localIndex(x, cx, y, cy);
    return (m[li >> 3] & (1 << (li & 7))) !== 0;
  }
  function markExplored(w, x, y) {
    var cx = chunkCoord(x), cy = chunkCoord(y);
    var k = chunkKey(cx, cy);
    var m = w.explored.get(k);
    if (!m) { m = new Uint8Array(MASK_BYTES); w.explored.set(k, m); }
    var li = localIndex(x, cx, y, cy);
    m[li >> 3] |= (1 << (li & 7));
  }

  // Fully random birth: pick the nearest non-rock tile (prefer dry land). No
  // terrain is sculpted and no resources are guaranteed.
  function findSpawn(w) {
    for (var r = 0; r <= SPAWN_SEARCH_RADIUS; r++) {
      var water = null;
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var t = tileType(w, dx, dy);
          if (t === T.ROCK) continue;
          if (t === T.WATER) { if (!water) water = { x: dx, y: dy }; continue; }
          return { x: dx, y: dy };
        }
      }
      if (water) return water;
    }
    return { x: 0, y: 0 };
  }

  // Materialise a finite rectangle — handy for tests and tooling.
  function snapshot(w, x0, y0, width, height) {
    var type = new Uint8Array(width * height);
    var rich = new Uint8Array(width * height);
    var max = new Uint8Array(width * height);
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var i = y * width + x, wx = x0 + x, wy = y0 + y;
        type[i] = tileType(w, wx, wy);
        rich[i] = tileRich(w, wx, wy);
        max[i] = tileMax(w, wx, wy);
      }
    }
    return { x0: x0, y0: y0, width: width, height: height, type: type, rich: rich, max: max };
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
    logistics: { name: 'Logistics', icon: '\uD83D\uDE9A', desc: 'Camps near you auto-collect into your packs', cost: { stone: 150, ore: 40 } },
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

  /* Day/night cycle: a pure function of game time so it persists with saves
   * and the renderer just asks how bright it is right now.
   *   daylight(t) = 1 at time 0 (noon) ... 0 at DAY_LENGTH/2 (midnight). */
  function daylight(t) {
    return 0.5 + 0.5 * Math.cos((t / DAY_LENGTH) * Math.PI * 2);
  }

  /* --------------------------------------------------------------- state */

  function createState(seed) {
    seed = (seed >>> 0) || 1;
    var world = createWorld(seed);
    var spawn = findSpawn(world);
    var s = {
      seed: seed,
      world: world,
      player: { x: spawn.x + 0.5, y: spawn.y + 0.5 },
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
      regrowAcc: 0,
      events: [] // transient (never saved): {res, amt, x, y} from auto-collect
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
        var dx = x + 0.5 - s.player.x, dy = y + 0.5 - s.player.y;
        if (dx * dx + dy * dy > r2) continue;
        markExplored(s.world, x, y);
        var t = tileType(s.world, x, y);
        if (t === T.ORE) s.discovered.ore = true;
        if (t === T.CRYSTAL) s.discovered.crystal = true;
      }
    }
  }

  /* -------------------------------------------------------------- gather */

  function gatherTarget(s) {
    var w = s.world;
    var px = s.player.x, py = s.player.y;
    var cx = Math.floor(px), cy = Math.floor(py);
    var best = null, bestD = Infinity;
    for (var y = cy - 2; y <= cy + 2; y++) {
      for (var x = cx - 2; x <= cx + 2; x++) {
        var t = tileType(w, x, y);
        var res = TILE_RESOURCE[t];
        if (!res || tileRich(w, x, y) <= 0) continue;
        var dx = x + 0.5 - px, dy = y + 0.5 - py;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > GATHER_RANGE) continue;
        if (d < bestD) { bestD = d; best = { x: x, y: y, res: res, type: t, dist: d }; }
      }
    }
    return best;
  }

  function gather(s) {
    var tgt = gatherTarget(s);
    if (!tgt) return null;
    var amount = gatherYield(s, tgt.res);
    var cur = tileRich(s.world, tgt.x, tgt.y) - 1;
    setTileRich(s.world, tgt.x, tgt.y, cur < 0 ? 0 : cur);
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
    var w = s.world;
    var px = s.player.x, py = s.player.y;
    var cx = Math.floor(px), cy = Math.floor(py);
    var best = null, bestD = Infinity;
    for (var y = cy - 1; y <= cy + 1; y++) {
      for (var x = cx - 1; x <= cx + 1; x++) {
        var t = tileType(w, x, y);
        if (def.tile === null) {
          if (t === T.WATER || !isWalkableType(t)) continue; // no building at sea
        } else if (t !== def.tile) {
          continue;
        }
        if (occupied(s, x, y)) continue;
        var dx = x + 0.5 - px, dy = y + 0.5 - py;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1.65) continue;
        if (d < bestD) { bestD = d; best = { x: x, y: y }; }
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

  /* ------------------------------------------------------- progression map */
  // A declarative view of everything there is to unlock, for the Progression
  // screen. Purely derived from existing state, so it never changes the save
  // format: the map is a lens over data the game already keeps.
  var PATH_FAMILIES = [
    { id: 'tools',     layer: 'world',  name: 'Tools',                icon: '\uD83E\uDDF0' },
    { id: 'refining',  layer: 'world',  name: 'Refineries',           icon: '\u26CF\uFE0F' },
    { id: 'abundance', layer: 'world',  name: 'Abundance Engine',     icon: '\u2728' },
    { id: 'unlocks',   layer: 'world',  name: 'Unlocks & Blueprints', icon: '\uD83D\uDCDC' },
    { id: 'perks',     layer: 'legacy', name: 'Perks',                icon: '\uD83D\uDD70\uFE0F' }
  ];

  // owned = fully bought; ready = a next level exists and is affordable now;
  // partial = some progress but the next level is not affordable yet;
  // saving = nothing bought yet and the first level is not affordable.
  function nodeStateOf(level, max, canBuy) {
    if (level >= max) return 'owned';
    if (canBuy) return 'ready';
    return level > 0 ? 'partial' : 'saving';
  }

  function mkNode(key, kind, name, icon, level, max, canBuy, cost, state) {
    return { key: key, kind: kind, name: name, icon: icon, level: level, max: max,
             canBuy: !!canBuy, cost: cost || null, state: state };
  }

  // One node per system: a tool, a resource's refinery chain, the Abundance
  // Engine, an unlock/blueprint, or a perk. `level`/`max` describe the current
  // and final step (max may be Infinity for repeatables).
  function pathNode(s, familyId, ref) {
    if (familyId === 'tools') {
      var t = TOOLS[ref], lv = s.tools[ref], max = t.levels.length;
      var cost = lv < max ? t.levels[lv].cost : null;
      var buy = !!cost && canAfford(s.inv, cost);
      return mkNode(ref, 'tool', t.name, t.icon, lv, max, buy, cost, nodeStateOf(lv - 1, max - 1, buy));
    }
    if (familyId === 'refining') {
      var chain = RES_UPGRADES[ref], lvl = resUpgradeLevel(s, ref), mx = chain.length;
      var c2 = lvl < mx ? chain[lvl].cost : null;
      var b2 = !!c2 && canAfford(s.inv, c2);
      var nm = RES_UPGRADE_NAMES[ref];
      return mkNode(ref, 'resup', nm.name, nm.icon, lvl, mx, b2, c2, nodeStateOf(lvl, mx, b2));
    }
    if (familyId === 'abundance') {
      var alv = s.abundanceLv || 0, ac = abundanceCost(s), ab = canAfford(s.inv, ac);
      return mkNode('abundance', 'abundance', UNLOCKS.abundance.name, UNLOCKS.abundance.icon,
        alv, Infinity, ab, ac, alv > 0 && !ab ? 'partial' : (ab ? 'ready' : 'saving'));
    }
    if (familyId === 'unlocks') {
      var owned = !!s.unlocks[ref], uc = UNLOCKS[ref].cost, ub = !owned && canAfford(s.inv, uc);
      return mkNode(ref, 'unlock', UNLOCKS[ref].name, UNLOCKS[ref].icon, owned ? 1 : 0, 1, ub, uc,
        nodeStateOf(owned ? 1 : 0, 1, ub));
    }
    if (familyId === 'perks') {
      var d = PERKS[ref], lvp = perkOwned(s, ref), maxp = d.repeat ? Infinity : 1;
      var pc = perkCost(s, ref);
      var pb = !(!d.repeat && lvp) && (s.insight || 0) >= pc;
      return mkNode(ref, 'perk', d.name, d.icon, lvp, maxp, pb, pc,
        (!d.repeat && lvp) ? 'owned' : (pb ? 'ready' : (lvp > 0 ? 'partial' : 'saving')));
    }
    return null;
  }

  function pathNodes(s, familyId) {
    var out = [], i;
    if (familyId === 'tools') {
      var tids = ['axe', 'pickaxe', 'boots', 'overclock'];
      for (i = 0; i < tids.length; i++) out.push(pathNode(s, familyId, tids[i]));
    } else if (familyId === 'refining') {
      for (i = 0; i < RESOURCES.length; i++) out.push(pathNode(s, familyId, RESOURCES[i]));
    } else if (familyId === 'abundance') {
      out.push(pathNode(s, familyId, 'abundance'));
    } else if (familyId === 'unlocks') {
      var uids = ['logistics', 'sapling', 'brickyard', 'foundry', 'observatory'];
      for (i = 0; i < uids.length; i++) out.push(pathNode(s, familyId, uids[i]));
    } else if (familyId === 'perks') {
      for (var k in PERKS) if (PERKS.hasOwnProperty(k)) out.push(pathNode(s, familyId, k));
    }
    return out;
  }

  function pathProgress(s, familyId) {
    var nodes = pathNodes(s, familyId);
    var owned = 0, canBuy = false, allOwned = true;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].state === 'owned') owned++;
      else allOwned = false;
      if (nodes[i].canBuy) canBuy = true;
    }
    return { owned: owned, total: nodes.length, canBuy: canBuy, allOwned: allOwned, nodes: nodes };
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
      // Logistics: whole units funnel into your inventory — but only from
      // extractors close enough to physically haul. Far away they keep
      // producing and capping their buffers, ready for when you walk back.
      if (s.unlocks.logistics && e.buffer >= 1) {
        var ax = e.x + 0.5 - s.player.x, ay = e.y + 0.5 - s.player.y;
        if (ax * ax + ay * ay <= AUTO_COLLECT_RANGE * AUTO_COLLECT_RANGE) {
          var amt = Math.floor(e.buffer);
          if (amt > 0) {
            s.inv[e.res] += amt; s.stats[e.res] += amt; e.buffer -= amt;
            s.events.push({ res: e.res, amt: amt, x: e.x, y: e.y });
          }
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
    var px = Math.floor(s.player.x), py = Math.floor(s.player.y);
    for (var y = py - REGROW_RADIUS; y <= py + REGROW_RADIUS; y++) {
      for (var x = px - REGROW_RADIUS; x <= px + REGROW_RADIUS; x++) {
        var t = tileType(w, x, y);
        if (t !== T.FOREST && t !== T.STONE) continue;
        var cur = tileRich(w, x, y);
        if (cur < baselineMax(w, x, y) && Math.random() < REGROW_CHANCE) {
          setTileRich(w, x, y, cur + 1);
        }
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
    { text: '\uD83D\uDE9A Unlock Logistics (camps near you auto-collect)', test: function (s) { return s.unlocks.logistics; } },
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
    var mods = [];
    s.world.mods.forEach(function (v, k) { mods.push([k, v]); });
    var explored = [];
    s.world.explored.forEach(function (m, k) { explored.push([k, bytesToB64(m)]); });
    return JSON.stringify({
      v: 3,
      seed: s.seed,
      mods: mods,
      explored: explored,
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
      if (!d || d.v !== 3) return null; // older formats are intentionally discarded
      var s = createState(d.seed);
      s.world.mods = new Map();
      if (Array.isArray(d.mods)) {
        for (var i = 0; i < d.mods.length; i++) s.world.mods.set(d.mods[i][0], d.mods[i][1]);
      }
      s.world.explored = new Map();
      if (Array.isArray(d.explored)) {
        for (var j = 0; j < d.explored.length; j++) {
          var mask = b64ToBytes(d.explored[j][1]);
          if (mask.length === MASK_BYTES) s.world.explored.set(d.explored[j][0], mask);
        }
      }
      if (d.player) { s.player.x = d.player.x; s.player.y = d.player.y; }
      if (d.inv) for (var r in s.inv) if (typeof d.inv[r] === 'number') s.inv[r] = d.inv[r];
      if (d.tools) for (var t in s.tools) if (typeof d.tools[t] === 'number') s.tools[t] = d.tools[t];
      if (d.unlocks) for (var u in s.unlocks) s.unlocks[u] = !!d.unlocks[u];
      if (d.resUp) for (var rp in s.resUp) if (typeof d.resUp[rp] === 'number') s.resUp[rp] = d.resUp[rp];
      if (typeof d.abundanceLv === 'number') s.abundanceLv = d.abundanceLv;
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
        for (var k = 0; k < d.extractors.length; k++) {
          var e = d.extractors[k];
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
    T: T, RESOURCES: RESOURCES,
    RESOURCE_LABEL: RESOURCE_LABEL, RESOURCE_ICON: RESOURCE_ICON, TILE_RESOURCE: TILE_RESOURCE,
    TOOLS: TOOLS, EXTRACTORS: EXTRACTORS, UNLOCKS: UNLOCKS, GOALS: GOALS,
    GATHER_RANGE: GATHER_RANGE, COLLECT_RANGE: COLLECT_RANGE, AUTO_COLLECT_RANGE: AUTO_COLLECT_RANGE,
    BASE_SPEED: BASE_SPEED, WATER_SPEED: WATER_SPEED,
    EXPLORE_RADIUS: EXPLORE_RADIUS, DAY_LENGTH: DAY_LENGTH, daylight: daylight,
    EXTRACTOR_GROWTH: EXTRACTOR_GROWTH,
    CHUNK_SIZE: CHUNK_SIZE,
    createWorld: createWorld, getChunk: getChunk, findSpawn: findSpawn, snapshot: snapshot,
    tileType: tileType, walkable: walkable,
    tileRich: tileRich, tileMax: tileMax, setTileRich: setTileRich,
    isExplored: isExplored, markExplored: markExplored,
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
    PATH_FAMILIES: PATH_FAMILIES, pathNode: pathNode, pathNodes: pathNodes, pathProgress: pathProgress,
    step: step, move: move,
    serialize: serialize, deserialize: deserialize,
    bytesToB64: bytesToB64, b64ToBytes: b64ToBytes
  };

  global.MTE = { Core: Core };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
