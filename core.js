/* DEEPER: deterministic, endless mine simulation. No DOM or rendering. */
(function (global) {
  'use strict';

  var TILE = { OPEN: 'open', SOFT: 'soft', HARD: 'hard', VEIN: 'vein', FUEL: 'fuel', GAS: 'gas', WATER: 'water', RUIN: 'ruin' };
  var RESOURCE = ['scrap', 'copper', 'sulfur', 'amber', 'crystal', 'fossil', 'fuel', 'relic'];
  var LAYERS = [
    { ground: 'Silt Garden', color: '#403e34', accent: '#cabd8e', hazard: 2 },
    { ground: 'Basalt Veins', color: '#30343c', accent: '#e28c61', hazard: 5 },
    { ground: 'Brine Orchard', color: '#24414a', accent: '#75d5c3', hazard: 8 },
    { ground: 'Glass Reef', color: '#2d3b4d', accent: '#a5d8ef', hazard: 11 },
    { ground: 'Fossil Mire', color: '#3d3b32', accent: '#d3b372', hazard: 14 },
    { ground: 'Cinder Choir', color: '#3d3035', accent: '#f08463', hazard: 18 },
    { ground: 'Lumen Chalk', color: '#353a3e', accent: '#d6ec9f', hazard: 21 },
    { ground: 'The Blue Below', color: '#243b4b', accent: '#78c5e6', hazard: 25 }
  ];
  var RESOURCES = {
    scrap: { name: 'Scrap', mark: '▧', color: '#c5b98e' },
    copper: { name: 'Copper', mark: 'Cu', color: '#e78e64' },
    sulfur: { name: 'Sulfur', mark: 'S', color: '#e6d36c' },
    amber: { name: 'Amber', mark: '◆', color: '#efae54' },
    crystal: { name: 'Crystal', mark: '✧', color: '#8de0eb' },
    fossil: { name: 'Fossil', mark: 'F', color: '#d6c4a4' },
    fuel: { name: 'Fuel', mark: 'F', color: '#ffd56f' },
    relic: { name: 'Relic', mark: '✦', color: '#d8a6ff' }
  };
  var MILESTONE_EVERY = 5;

  function hash(x, y, seed) {
    var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function key(x, y) { return x + ',' + y; }

  function nextLayer(run) {
    var i = run.layers.length;
    var start = i ? run.layers[i - 1].start + run.layers[i - 1].length : 0;
    var r = hash(i, 7, run.seed);
    var base = LAYERS[Math.floor(hash(i, 3, run.seed) * LAYERS.length)];
    var poolSize = Math.min(RESOURCE.length - 1, 2 + Math.floor(i / 2));
    var resource = RESOURCE[1 + Math.floor(hash(i, 11, run.seed) * poolSize)];
    var layer = {
      index: i, start: start, length: 8 + Math.floor(r * 11),
      name: base.ground, color: base.color, accent: base.accent,
      hazard: base.hazard + Math.floor(hash(i, 19, run.seed) * 9),
      resource: resource, veinX: Math.floor(hash(i, 23, run.seed) * 11) - 5,
      ruinX: Math.floor(hash(i, 29, run.seed) * 15) - 7,
      milestone: (i + 1) % MILESTONE_EVERY === 0
    };
    if (layer.milestone) layer.name = ['The Flood Basilica', 'The Listener', 'Buried Observatory'][Math.floor(i / MILESTONE_EVERY - 1) % 3];
    run.layers.push(layer);
    return layer;
  }

  function layerAt(run, depth) {
    depth = Math.max(0, Math.floor(depth));
    while (!run.layers.length || run.layers[run.layers.length - 1].start + run.layers[run.layers.length - 1].length <= depth) nextLayer(run);
    for (var i = 0; i < run.layers.length; i++) {
      var l = run.layers[i];
      if (depth >= l.start && depth < l.start + l.length) return l;
    }
    return run.layers[run.layers.length - 1];
  }

  function makeRun(seed) {
    var run = {
      seed: seed >>> 0, x: 0.5, y: 0.5, hull: 100, maxHull: 100,
      cargo: { scrap: 0, copper: 0, sulfur: 0, amber: 0, crystal: 0, fossil: 0, fuel: 0, relic: 0 },
      charges: 0, dug: {}, wet: {}, known: {}, layers: [],
      time: 0, pressureSpike: 0, pressure: 0, discoveries: {},
      status: 'diving', message: 'Hold any tile to carve a connected route.', digCount: 0,
      beaconUsed: false
    };
    // The airlock is the only guaranteed open terrain at the start of a dive.
    run.dug[key(0, 0)] = true;
    run.dug[key(1, 0)] = true;
    run.dug[key(0, 1)] = true;
    layerAt(run, 0);
    reveal(run, run.x, run.y, 5);
    return run;
  }

  function createState(seed) {
    var s = {
      hub: {
        bank: { scrap: 12, copper: 0, sulfur: 0, amber: 0, crystal: 0, fossil: 0, fuel: 0, relic: 0 },
        upgrades: { hull: 0, engine: 0, cargo: 0, salvage: 0 },
        rooms: { workshop: true, archive: false, habitat: false, quarters: false },
        records: {}, dives: 0, extractions: 0, failures: 0, lastOutcome: 'Your first dive is waiting.'
      },
      run: makeRun(seed === undefined ? ((Math.random() * 0xffffffff) >>> 0) : seed)
    };
    return s;
  }

  function reveal(run, x, y, radius) {
    var cx = Math.floor(x), cy = Math.floor(y);
    for (var dy = -radius; dy <= radius; dy++) for (var dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) run.known[key(cx + dx, cy + dy)] = true;
    }
  }

  function resourceAt(run, x, y, layer) {
    if (y === layer.start + layer.length - 2 && x === layer.veinX) return layer.resource;
    var v = hash(x, y, run.seed + layer.index * 977);
    if (v < 0.035) return 'fuel';
    if (v < 0.09) return 'copper';
    if (v < 0.125) return layer.resource;
    return null;
  }

  function tileAt(s, x, y) {
    var run = s.run;
    x = Math.floor(x); y = Math.floor(y);
    if (run.dug[key(x, y)]) return { kind: TILE.OPEN, wet: !!run.wet[key(x, y)], x: x, y: y };
    var layer = layerAt(run, y);
    if (layer.milestone && y === layer.start + Math.floor(layer.length / 2) && x === layer.ruinX) return { kind: TILE.RUIN, x: x, y: y, layer: layer };
    var resource = resourceAt(run, x, y, layer);
    if (resource) return { kind: TILE.VEIN, resource: resource, x: x, y: y, layer: layer };
    var n = hash(x, y, run.seed + layer.index * 101);
    if (n < 0.028) return { kind: TILE.GAS, x: x, y: y, layer: layer };
    if (n < 0.055) return { kind: TILE.WATER, x: x, y: y, layer: layer };
    if (n < 0.23 + Math.min(0.14, layer.index * 0.012)) return { kind: TILE.HARD, x: x, y: y, layer: layer };
    return { kind: TILE.SOFT, x: x, y: y, layer: layer };
  }

  function cargoWeight(run) {
    var total = 0;
    for (var i = 0; i < RESOURCE.length; i++) total += run.cargo[RESOURCE[i]] || 0;
    return total;
  }

  function cargoSpeed(s) {
    var weight = cargoWeight(s.run);
    var relief = s.hub.upgrades.cargo * 0.2;
    return clamp(1 / (1 + weight / (34 + relief * 70)), 0.35, 1);
  }

  function move(s, dx, dy, dt) {
    var run = s.run;
    if (run.status !== 'diving') return false;
    var mag = Math.sqrt(dx * dx + dy * dy);
    if (!mag) return false;
    dx /= mag; dy /= mag;
    var speed = (2.8 + s.hub.upgrades.engine * 0.25) * cargoSpeed(s) * dt;
    var nx = run.x + dx * speed, ny = run.y + dy * speed;
    if (isOpen(run, Math.floor(nx), Math.floor(run.y))) run.x = nx;
    if (isOpen(run, Math.floor(run.x), Math.floor(ny))) run.y = ny;
    reveal(run, run.x, run.y, 5);
    return true;
  }

  function isOpen(run, x, y) { return !!run.dug[key(x, y)]; }

  function routeTo(s, tx, ty) {
    var run = s.run, sx = Math.floor(run.x), sy = Math.floor(run.y);
    tx = Math.floor(tx); ty = Math.floor(ty);
    if (sx === tx && sy === ty) return [];
    var minX = Math.min(sx, tx) - 2, maxX = Math.max(sx, tx) + 2;
    var minY = Math.min(sy, ty) - 2, maxY = Math.max(sy, ty) + 2;
    var startKey = key(sx, sy), goalKey = key(tx, ty);
    var open = [{ x: sx, y: sy, g: 0, f: Math.abs(tx - sx) + Math.abs(ty - sy), parent: null }];
    var best = {}; best[startKey] = 0;
    var nodes = {};
    while (open.length) {
      open.sort(function (a, b) { return a.f - b.f; });
      var cur = open.shift(), ck = key(cur.x, cur.y);
      if (nodes[ck]) continue;
      nodes[ck] = cur;
      if (ck === goalKey) break;
      var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (var d = 0; d < dirs.length; d++) {
        var x = cur.x + dirs[d][0], y = cur.y + dirs[d][1];
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        var k = key(x, y), tile = tileAt(s, x, y);
        var cost = tile.kind === TILE.OPEN ? 0.08 : tile.kind === TILE.HARD ? 2.2 : tile.kind === TILE.GAS ? 1.6 : 1;
        var g = cur.g + cost;
        if (best[k] !== undefined && best[k] <= g) continue;
        best[k] = g;
        open.push({ x: x, y: y, g: g, f: g + Math.abs(tx - x) + Math.abs(ty - y), parent: ck });
      }
    }
    if (!nodes[goalKey]) return [];
    var path = [], step = nodes[goalKey];
    while (step && step.parent) { path.push({ x: step.x, y: step.y }); step = nodes[step.parent]; }
    path.reverse();
    return path;
  }

  function planDrill(s, tx, ty) {
    if (s.run.status !== 'diving') return null;
    var path = routeTo(s, tx, ty);
    if (!path.length) return null;
    return path.map(function (p) {
      var tile = tileAt(s, p.x, p.y);
      return { x: p.x, y: p.y, kind: tile.kind, resource: tile.resource || null, known: !!s.run.known[key(p.x, p.y)] };
    });
  }

  function addCargo(run, resource, amount) {
    if (!run.cargo[resource]) run.cargo[resource] = 0;
    run.cargo[resource] += amount;
  }

  function flowWater(run, sx, sy, limit) {
    var queue = [{ x: sx, y: sy, depth: 0 }], seen = {};
    while (queue.length && limit > 0) {
      var p = queue.shift(), k = key(p.x, p.y);
      if (seen[k] || !isOpen(run, p.x, p.y)) continue;
      seen[k] = true; run.wet[k] = true; limit--;
      var dirs = [[0,1],[1,0],[-1,0],[0,-1]];
      for (var i = 0; i < dirs.length; i++) {
        var nx = p.x + dirs[i][0], ny = p.y + dirs[i][1];
        if (!seen[key(nx, ny)] && isOpen(run, nx, ny)) queue.push({ x: nx, y: ny, depth: p.depth + 1 });
      }
    }
  }

  function openTile(s, x, y, viaBlast) {
    var run = s.run, k = key(x, y), tile = tileAt(s, x, y), msg = '';
    if (tile.kind === TILE.OPEN) return { ok: true, message: '' };
    if (tile.kind === TILE.RUIN) {
      run.discoveries['ruin-' + tile.layer.index] = true;
      addCargo(run, 'relic', 1);
      run.dug[k] = true;
      run.digCount++;
      run.known[k] = true;
      return { ok: true, message: 'A buried listener stirs. You recover a relic; the lower layers will remember.' };
    }
    if (tile.kind === TILE.HARD && !viaBlast) {
      if (run.cargo.fuel <= 0) return { ok: false, blocked: 'fuel', message: 'Hard stratum. Need fuel or a charge.' };
      run.cargo.fuel -= 1;
    }
    run.dug[k] = true;
    run.digCount++;
    if (tile.kind === TILE.VEIN) {
      var amount = tile.resource === 'fuel' ? 1 : 1 + Math.floor(s.hub.upgrades.salvage / 2) + (hash(x, y, run.seed + 303) > 0.74 ? 1 : 0);
      addCargo(run, tile.resource, amount);
      msg = '+' + amount + ' ' + (RESOURCES[tile.resource] ? RESOURCES[tile.resource].name : tile.resource);
    } else if (tile.kind === TILE.GAS) {
      run.pressureSpike = Math.min(60, run.pressureSpike + 26);
      run.hull = Math.max(0, run.hull - 8);
      msg = 'Pressure pocket ruptured! Shockwave hit the hull.';
      var nearby = [[1,0],[-1,0],[0,1],[0,-1]];
      for (var n = 0; n < nearby.length; n++) {
        var adjacent = tileAt(s, x + nearby[n][0], y + nearby[n][1]);
        if (adjacent.kind === TILE.GAS && hash(x + n, y, run.seed) > 0.45) {
          run.dug[key(adjacent.x, adjacent.y)] = true;
          run.pressureSpike += 14;
          msg = 'Pressure chain reaction! The hull buckles.';
        }
      }
    } else if (tile.kind === TILE.WATER) {
      flowWater(run, x, y, 24);
      if (hash(x, y, run.seed + 404) > 0.55) {
        run.discoveries.habitat = true;
        run.pressureSpike = Math.max(0, run.pressureSpike - 8);
        addCargo(run, 'amber', 2);
        msg = 'A lost creature surfaces. It reveals a nearby habitat and amber.';
      } else msg = 'A brine pocket floods your connected tunnels. You can swim it.';
    }
    layerAt(run, y);
    reveal(run, x, y, 5);
    return { ok: true, message: msg, tile: tile };
  }

  function drillStep(s, path, index) {
    var run = s.run;
    if (run.status !== 'diving' || !path || index >= path.length) return { done: true };
    var p = path[index];
    var result = openTile(s, p.x, p.y, false);
    if (!result.ok && result.blocked) return { blocked: true, message: result.message };
    if (!result.ok && result.message) return { done: true, message: result.message };
    run.x = p.x + 0.5; run.y = p.y + 0.5;
    reveal(run, run.x, run.y, 5);
    if (run.wet[key(p.x, p.y)]) run.hull = Math.min(run.maxHull, run.hull + 0.3);
    return { done: index + 1 >= path.length, message: result.message || '', x: p.x, y: p.y };
  }

  function blast(s, tx, ty) {
    var run = s.run;
    if (run.status !== 'diving') return { ok: false, message: 'You are back at the hub.' };
    if (run.charges <= 0) return { ok: false, message: 'No charges. Craft one at the Workshop.' };
    run.charges--;
    var opened = 0, found = 0, burst = false, flooded = false;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > 5) continue;
      var x = tx + dx, y = ty + dy, tile = tileAt(s, x, y);
      if (tile.kind === TILE.OPEN) continue;
      if (tile.kind === TILE.RUIN) {
        run.discoveries['ruin-' + tile.layer.index] = true;
        addCargo(run, 'relic', 1);
        burst = true; found++;
      } else {
        if (tile.kind === TILE.GAS) { run.pressureSpike += 32; run.hull -= 14; burst = true; }
        if (tile.kind === TILE.WATER) { run.dug[key(x, y)] = true; run.wet[key(x, y)] = true; flooded = true; }
        if (tile.kind === TILE.VEIN) { addCargo(run, tile.resource, 1); found++; }
        run.dug[key(x, y)] = true; opened++;
      }
    }
    if (flooded) flowWater(run, tx, ty, 42);
    if (burst && hash(tx, ty, run.seed + 505) > 0.62) {
      run.discoveries.habitat = true;
      addCargo(run, 'relic', 1);
    }
    reveal(run, tx, ty, 6);
    return { ok: true, message: burst ? 'The blast chains through a pressure pocket!' : flooded ? 'Water rushes into the channel you opened.' : found ? 'The blast uncovers resources and new tunnels.' : 'Charge detonated. The tunnel reshapes.' , opened: opened, found: found };
  }

  function step(s, dt) {
    var run = s.run;
    if (!run || run.status !== 'diving') return;
    dt = Math.min(0.25, Math.max(0, dt));
    run.time += dt;
    run.pressureSpike = Math.max(0, run.pressureSpike - dt * 2.8);
    var layer = layerAt(run, run.y);
    run.pressure = clamp(Math.floor(run.y * 0.58 + layer.hazard * 0.35 + run.pressureSpike), 0, 100);
    var tolerance = 66 + s.hub.upgrades.hull * 8;
    if (run.pressure > tolerance) run.hull -= (run.pressure - tolerance) * 0.022 * dt;
    if (run.hull <= 0) {
      run.hull = 0; run.status = 'destroyed';
      s.hub.failures++;
      s.hub.lastOutcome = 'Pressure crushed the ship. The haul is gone; permanent upgrades remain.';
    }
  }

  function extract(s) {
    var run = s.run;
    if (run.status !== 'diving') return { ok: false, message: 'No dive is active.' };
    if (run.cargo.fuel < 1) return { ok: false, message: 'The beacon is empty. Find fuel to extract.' };
    run.cargo.fuel -= 1;
    var saved = {};
    for (var i = 0; i < RESOURCE.length; i++) {
      var resource = RESOURCE[i];
      saved[resource] = Math.floor((run.cargo[resource] || 0) * 0.2);
      s.hub.bank[resource] = (s.hub.bank[resource] || 0) + saved[resource];
    }
    run.status = 'extracted'; run.beaconUsed = true;
    s.hub.extractions++;
    s.hub.lastOutcome = 'Extracted! 20% of loose cargo was banked. The rest was sacrificed to the beacon.';
    for (var d in run.discoveries) if (run.discoveries[d]) s.hub.records[d] = true;
    return { ok: true, saved: saved, message: s.hub.lastOutcome };
  }

  function failRun(s) {
    if (s.run.status !== 'diving') return false;
    s.run.status = 'destroyed'; s.run.hull = 0;
    s.hub.failures++;
    s.hub.lastOutcome = 'The ship was lost. Loose cargo and dive discoveries are gone.';
    return true;
  }

  function startDive(s, seed) {
    if (s.run && s.run.status === 'diving') return false;
    var n = seed === undefined ? ((Math.random() * 0xffffffff) >>> 0) : seed;
    s.run = makeRun(n);
    s.run.charges = s.hub.charges || 0;
    s.hub.charges = 0;
    s.hub.dives++;
    return true;
  }

  var UPGRADE = {
    hull: { name: 'Hull plating', cost: 14, max: 4 },
    engine: { name: 'Thruster', cost: 12, max: 4 },
    cargo: { name: 'Cargo winch', cost: 10, max: 4 },
    salvage: { name: 'Salvage rig', cost: 18, max: 4 }
  };
  function buyUpgrade(s, id) {
    var u = UPGRADE[id], lv = s.hub.upgrades[id];
    if (!u || lv >= u.max) return { ok: false, message: 'Upgrade is at maximum.' };
    var cost = u.cost * (lv + 1);
    if (s.hub.bank.scrap < cost) return { ok: false, message: 'Need ' + cost + ' banked scrap.' };
    s.hub.bank.scrap -= cost; s.hub.upgrades[id]++;
    if (id === 'hull' && s.run && s.run.status === 'diving') { s.run.maxHull += 20; s.run.hull += 20; }
    return { ok: true, message: u.name + ' upgraded to ' + s.hub.upgrades[id] + '.' };
  }

  function buildRoom(s, id) {
    var room = { archive: { cost: 24, name: 'Archive' }, habitat: { cost: 30, name: 'Habitat' }, quarters: { cost: 20, name: 'Crew quarters' } }[id];
    if (!room) return { ok: false, message: 'Unknown room.' };
    if (s.hub.rooms[id]) return { ok: false, message: 'Room already built.' };
    if (s.hub.bank.scrap < room.cost) return { ok: false, message: room.name + ' needs ' + room.cost + ' banked scrap.' };
    if (id === 'habitat' && !s.hub.records.habitat) return { ok: false, message: 'Find a lost creature before building the Habitat.' };
    s.hub.bank.scrap -= room.cost; s.hub.rooms[id] = true;
    return { ok: true, message: room.name + ' built. New stories are waiting.' };
  }

  function craftCharge(s) {
    if (s.run && s.run.status === 'diving') return { ok: false, message: 'Craft charges at the surface hub.' };
    if (s.hub.bank.scrap < 5 || s.hub.bank.copper < 2) return { ok: false, message: 'A charge costs 5 scrap and 2 copper.' };
    s.hub.bank.scrap -= 5; s.hub.bank.copper -= 2; s.hub.charges = (s.hub.charges || 0) + 1;
    return { ok: true, message: 'Basic charge packed for the next dive.' };
  }

  function stateSummary(s) {
    var r = s.run;
    return {
      status: r.status, depth: Math.floor(r.y), x: +r.x.toFixed(2), y: +r.y.toFixed(2),
      hull: +r.hull.toFixed(1), pressure: r.pressure, fuel: r.cargo.fuel,
      cargo: cargoWeight(r), cargoSpeed: +cargoSpeed(s).toFixed(2), charges: r.charges,
      bank: s.hub.bank, upgrades: s.hub.upgrades, rooms: s.hub.rooms,
      discoveries: r.discoveries, layers: r.layers.length, dug: Object.keys(r.dug).length
    };
  }

  function serialize(s) { return JSON.stringify(s); }
  function deserialize(text) {
    try {
      var s = JSON.parse(text);
      if (!s || !s.hub || !s.run || !s.hub.bank || !s.hub.upgrades) return null;
      return s;
    } catch (e) { return null; }
  }

  var Core = {
    TILE: TILE, RESOURCES: RESOURCES, LAYERS: LAYERS,
    createState: createState, startDive: startDive, tileAt: tileAt, layerAt: layerAt,
    reveal: reveal, isOpen: isOpen, move: move, cargoWeight: cargoWeight,
    cargoSpeed: cargoSpeed, routeTo: routeTo, planDrill: planDrill,
    drillStep: drillStep, blast: blast, step: step, extract: extract, failRun: failRun,
    buyUpgrade: buyUpgrade, buildRoom: buildRoom, craftCharge: craftCharge,
    stateSummary: stateSummary, serialize: serialize, deserialize: deserialize
  };
  global.DEEP = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof window !== 'undefined' ? window : globalThis);
