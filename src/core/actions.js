/* What the player does to the world: harvest tiles, collect from extractors,
 * and build. Every action works on the player's own layer. */

import {takeStarter,cultivationAt,DEEP,DEEP_KINDS} from './cultivation.js';
import { usesDepots, depotGain } from './logistics.js';
import { startEventEconomy } from './sim.js';
import { economyForState } from './economy-context.js';
import { SURFACE, tileDist2 } from './coords.js';
import { T, TILE_INFO } from './tiles.js';
import { tileAt, richness, setRichness, holeBelow, wayUp, isExplored } from './world.js';
import { EXTRACTORS, PROPS, UNLOCKS, REACH, COLLECT_RANGE, FINDS, GEAR, RARE_PAYS } from './content.js';
import { canAfford, pay, costText, gatherYield, extractorCost, supportGain, earn, ownBuilding } from './economy.js';
import { mushroomAt, MUSHROOMS } from './mushrooms.js';
import { noteAct } from './acts.js';
import { t } from '../i18n/i18n.js';

// Trail sweeps take tiles whose centre lies within this distance of the stroke.
export const SWEEP_RADIUS = 0.6;

const REACH2 = REACH * REACH;

/* ------------------------------------------------------------- harvest */

// A tile on the player's layer that has something to gather, near or far.
// A tile with a building on it is the building's: only it works the tile.
export function harvestable(s, x, y) {
  const z = s.player.z;
  return !!TILE_INFO[tileAt(s.world, x, y, z)].harvest &&
    richness(s.world, x, y, z) > 0 &&
    !holeBelow(s.world, x, y, z) &&
    !extractorAt(s, x, y, z);
}

/* ---------------------------------------------------------------- gear */

// Whether a mushroom of kind `k` is a rare one.
const rare = (k) => !!(k && MUSHROOMS[k].magic);

// The tool level working tile (x, y, z) takes ({ tool, level }), or null if
// any will do. See GEAR.
export function gearFor(s, x, y, z) {
  const type = tileAt(s.world, x, y, z);
  if (TILE_INFO[type].solid && s.tools.pickaxe === 0) return { tool: 'pickaxe', level: 2 };
  if (GEAR.rock[type]) return { tool: 'pickaxe', level: GEAR.rock[type] };
  if (type === T.SHAFT) {
    const layer = SURFACE - z;
    const deep = GEAR.shafts.filter((g) => layer >= g.from).pop();
    return deep ? { tool: 'pickaxe', level: deep.level } : null;
  }
  if (rare(mushroomAt(s.seed, type, x, y, z))) return { tool: 'basket', level: GEAR.rare };
  return null;
}

// The tool level tile (x, y) on your layer still needs, or null if you have it.
export function gearNeeded(s, x, y) {
  const g = gearFor(s, x, y, s.player.z);
  return g && s.tools[g.tool] < g.level ? g : null;
}

// What reaching level `level` of tool `tool` opens, as door ids for the
// sheet and the wiki: { id, layer? } (layer: the shafts out of it and below).
export function toolOpens(tool, level) {
  const out = [];
  if (tool === 'pickaxe') {
    const rocks = Object.keys(GEAR.rock).map(Number).filter((k) => GEAR.rock[k] === level);
    if (rocks.includes(T.ORE)) out.push({ id: 'ore' });
    if (rocks.includes(T.CRYSTAL)) out.push({ id: 'crystal' });
    for (const g of GEAR.shafts) if (g.level === level) out.push({ id: 'deep', layer: g.from });
  }
  if (tool === 'basket' && level === GEAR.rare) out.push({ id: 'rare' });
  if (tool === 'boots' && level === GEAR.water) out.push({ id: 'water' });
  return out;
}

// The tool level that's all that keeps you from working tile (x, y), right
// there in reach, or null.
export function gearBlocks(s, x, y) {
  return harvestable(s, x, y) && tileDist2(s.player, x, y, s.player.z) <= REACH2 ? gearNeeded(s, x, y) : null;
}

// A tile on the player's layer that Gather could work right now.
export function canHarvest(s, x, y) {
  return harvestable(s, x, y) && tileDist2(s.player, x, y, s.player.z) <= REACH2 && !gearNeeded(s, x, y);
}

// Tiles within reach of the player, nearest first.
function tilesInReach(s) {
  const p = s.player, out = [];
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let y = cy - 2; y <= cy + 2; y++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      const d2 = tileDist2(p, x, y, p.z);
      if (d2 <= REACH2) out.push({ x, y, d2 });
    }
  }
  return out.sort((a, b) => a.d2 - b.d2);
}

// What holding Gather works on: on the surface, the nearest deposit you can
// walk among. Underground it mines the rock around you (players asked for
// this, Watch 2026-10-24): a find first, then a seam, then plain rock, nearest
// first in each. A shaft still needs a deliberate tap, and a wild crystal
// colony is never taken by holding Gather.
export function harvestTarget(s) {
  const z = s.player.z;
  let best = null, rank = 0;
  for (const t of tilesInReach(s)) {
    const type = tileAt(s.world, t.x, t.y, z), info = TILE_INFO[type];
    if (!canHarvest(s, t.x, t.y)) continue;
    if (!info.solid) return { x: t.x, y: t.y, res: info.res };
    const r = z === SURFACE ? 0 : digRank(s, t.x, t.y);
    if (r > rank) { best = { x: t.x, y: t.y, res: info.res || null }; rank = r; }
  }
  return best;
}

// Whether holding Gather underground would dig tile (x, y), and how much it
// is worth to: 3 a find, 2 a seam, 1 plain rock, 0 not at all.
function digRank(s, x, y) {
  const type = tileAt(s.world, x, y, s.player.z), info = TILE_INFO[type];
  if (!info.solid || info.sweep === false || (s.cultivation && type === T.GEODE)) return 0;
  return info.find ? 3 : info.res ? 2 : 1;
}

// Whether the straight walk from the player to the middle of tile (x, y)
// crosses only floor (so walking there can't stall on a wall).
function clearWalk(s, x, y) {
  const p = s.player, tx = x + 0.5, ty = y + 0.5;
  const n = Math.ceil(Math.hypot(tx - p.x, ty - p.y) / 0.25);
  for (let i = 1; i <= n; i++) {
    const t = TILE_INFO[tileAt(s.world, Math.floor(p.x + (tx - p.x) * i / n), Math.floor(p.y + (ty - p.y) * i / n), p.z)];
    if (!t.walk || t.swim) return false;
  }
  return true;
}

// Underground, with nothing to dig in reach (in the middle of a cave): the
// rock you've seen within `radius` that Gather heads for and digs, the most
// worth digging first, then the nearest, with `stand`, open floor in reach of
// it that you can walk straight to. Only rock already seen counts.
export const DIG_SEEK_RADIUS = 6;
export function nearestDig(s, radius = DIG_SEEK_RADIUS) {
  const p = s.player, cx = Math.floor(p.x), cy = Math.floor(p.y);
  let best = null;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!isExplored(s.world, x, y, p.z) || !harvestable(s, x, y) || gearNeeded(s, x, y)) continue;
      const rank = digRank(s, x, y);
      if (!rank || (best && rank < best.rank)) continue;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const sx = x + dx, sy = y + dy;
        const d2 = tileDist2(p, sx, sy, p.z);
        if (best && rank === best.rank && d2 >= best.d2) continue;
        if (!isExplored(s.world, sx, sy, p.z) || !clearWalk(s, sx, sy)) continue;
        best = { x, y, stand: { x: sx, y: sy }, rank, d2 };
      }
    }
  }
  return best && { x: best.x, y: best.y, stand: best.stand };
}

// How far Explore looks for something to head to, in tiles: about what a
// phone shows around you, and from home always far enough to find some.
export const SEEK_RADIUS = 14;

// The nearest tile within `radius` holding a resource your tools can already
// work, or null: where Explore heads when nothing is in reach. Ring by ring,
// so the first found is about the nearest.
export function nearestWork(s, radius = SEEK_RADIUS) {
  const p = s.player, cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let r = 1; r <= radius; r++) {
    let best = null;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        if (!harvestable(s, x, y) || gearNeeded(s, x, y)) continue;
        if (!TILE_INFO[tileAt(s.world, x, y, p.z)].res) continue;
        const d2 = tileDist2(p, x, y, p.z);
        if (!best || d2 < best.d2) best = { x, y, d2 };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return null;
}

// What digging out a find of `type` on layer z pays right now (see FINDS).
export function findLoot(s, type, z) {
  const layer = SURFACE - z, out = {};
  const loot = FINDS[type].loot;
  for (const r of Object.keys(loot)) out[r] = loot[r] * layer * gatherYield(s, r);
  return out;
}

// Works tile (x, y) once: richness drops by one and its resource (if any) goes
// into the packs. Solid tiles clear into their `cleared` type at zero, which is
// how tunnels are dug and shafts are opened; a find pays out its loot as
// `found` ({res: amount}). Returns null if out of reach.
export function harvestAt(s, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (!canHarvest(s, x, y)) return null;
  if(s.cultivation&&tileAt(s.world,x,y,s.player.z)===T.GEODE){
    if(takeStarter(s,x,y)!=='ok')return null;
    return {x,y,z:s.player.z,type:T.GEODE,res:null,amount:0,found:{}};
  }
  noteAct(s, 'h', x, y);
  const z = s.player.z;
  const type = tileAt(s.world, x, y, z);
  setRichness(s.world, x, y, z, richness(s.world, x, y, z) - 1);
  const res = TILE_INFO[type].res || null;
  // Mycelium comes as one kind of mushroom or another: count which, and
  // whether it's a kind never found before, in any world.
  const mushroom = res ? mushroomAt(s.seed, type, x, y, z) : null;
  const amount = res ? gatherYield(s, res) * (rare(mushroom) ? RARE_PAYS : 1) : 0;
  if (res) earn(s, res, amount, 'hand');
  let newKind = false;
  if (mushroom) {
    newKind = !s.mushroomsEver.includes(mushroom);
    if (newKind) s.mushroomsEver.push(mushroom);
    s.mushrooms[mushroom] = (s.mushrooms[mushroom] || 0) + amount;
  }
  // Mycelium also grows in spore beds deep underground; the first milestone wants a forest.
  if (type === T.FOREST) s.stats.foraged += amount;
  s.stats.gathers += 1;
  let found = null;
  if (TILE_INFO[type].find) {
    found = findLoot(s, type, z);
    for (const r of Object.keys(found)) {
      earn(s, r, found[r], 'finds');
    }
    s.stats.finds += 1;
  }
  return { x, y, z, type, res, amount, found, mushroom, newKind, now: tileAt(s.world, x, y, z) };
}

export function harvest(s) {
  const t = harvestTarget(s);
  return t ? harvestAt(s, t.x, t.y) : null;
}

// Tiles a freehand Trail stroke (world-space points) would harvest: those in
// reach whose centre lies within SWEEP_RADIUS of the polyline.
export function sweepTargets(s, points) {
  if (!points.length) return [];
  const r2 = SWEEP_RADIUS * SWEEP_RADIUS;
  const crossed = (cx, cy) => {
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
      const sx = b.x - a.x, sy = b.y - a.y, len2 = sx * sx + sy * sy;
      const t = len2 ? Math.max(0, Math.min(1, ((cx - a.x) * sx + (cy - a.y) * sy) / len2)) : 0;
      const ox = cx - (a.x + t * sx), oy = cy - (a.y + t * sy);
      if (ox * ox + oy * oy <= r2) return true;
    }
    return false;
  };
  return tilesInReach(s)
    .filter((t) => canHarvest(s, t.x, t.y) && TILE_INFO[tileAt(s.world, t.x, t.y, s.player.z)].sweep !== false)
    .filter((t) => crossed(t.x + 0.5, t.y + 0.5))
    .map((t) => ({ x: t.x, y: t.y, res: TILE_INFO[tileAt(s.world, t.x, t.y, s.player.z)].res || null }));
}

/* ------------------------------------------------------------- collect */

export function collectTarget(s) {
  const p = s.player, range2 = COLLECT_RANGE * COLLECT_RANGE;
  const index = tileIndex(s), found = [];
  // Collection has a fixed spatial radius. Query those tile buckets instead
  // of filtering every building in the world on each AUTO decision.
  for (let y = Math.ceil(p.y - COLLECT_RANGE - 0.5); y <= Math.floor(p.y + COLLECT_RANGE - 0.5); y++) {
    for (let x = Math.ceil(p.x - COLLECT_RANGE - 0.5); x <= Math.floor(p.x + COLLECT_RANGE - 0.5); x++) {
      if (tileDist2(p, x, y, p.z) > range2) continue;
      const entries = index.entries.get(x + ',' + y + ',' + p.z);
      if (entries) for (const entry of entries) if (ownBuilding(s, entry.e) && entry.e.buffer >= 1) found.push(entry);
    }
  }
  if (!found.length) return null;
  // Preserve the original building order, including kept saves with duplicate
  // coordinates. That also preserves collection and floating-point order.
  found.sort((a, b) => a.i - b.i);
  const list = found.map(entry => entry.e);
  return { total: Math.floor(list.reduce((n, e) => n + e.buffer, 0)), list };
}

// Empties whole units from every extractor in range. Returns
// { gained: {res: amount}, sources: [{x, y, res, amt}] } or null.
export function collect(s) {
  const t = collectTarget(s);
  if (!t) return null;
  noteAct(s, 'c');
  const gained = {}, sources = [];
  for (const e of t.list) {
    const amt = Math.floor(e.buffer);
    e.buffer -= amt;
    earn(s, e.res, amt, 'buildings');
    s.stats.collected += amt;
    gained[e.res] = (gained[e.res] || 0) + amt;
    sources.push({ x: e.x, y: e.y, res: e.res, amt });
  }
  return { gained, sources };
}

/* --------------------------------------------------------------- build */

// The buildings by tile ('x,y,z'), made again whenever the list is replaced
// or grows (buildings are only ever added to it, or the list swapped).
const byTile = new WeakMap();

function tileIndex(s) {
  const list = s.extractors;
  let c = byTile.get(list);
  if (!c || c.n !== list.length) {
    c = { n: list.length, at: new Map(), entries: new Map() };
    for (let i = 0; i < list.length; i++) {
      const e = list[i], key = e.x + ',' + e.y + ',' + e.z;
      c.at.set(key, e);
      let entries = c.entries.get(key);
      if (!entries) { entries = []; c.entries.set(key, entries); }
      entries.push({ e, i });
    }
    byTile.set(list, c);
  }
  return c;
}

export function extractorAt(s, x, y, z) {
  return tileIndex(s).at.get(x + ',' + y + ',' + z) || null;
}

// A building never shares a tile with a way between layers: not on a way
// down, nor on a way up. One that works a deposit needs some of it left:
// nothing grows back, so an emptied deposit is spent for good (Watch,
// 2026-10-19).
// `moving`: a building being moved, whose own tile counts as free.
function buildableTile(s, def, x, y, moving = null) {
  const z = s.player.z;
  const type = tileAt(s.world, x, y, z);
  if(s.cultivation){
    if(!['garden','quarry','mine','stoneworks','depot'].includes(Object.keys(EXTRACTORS).find(k=>EXTRACTORS[k]===def)))return false;
    if(cultivationAt(s,x,y,z))return false;
  }
  const fits = s.cultivation&&def===EXTRACTORS.mine?z<0&&type===T.ORE_SEAM&&richness(s.world,x,y,z)>0: s.cultivation&&def.tile===null?!!TILE_INFO[type].walk&&!TILE_INFO[type].rise&&!TILE_INFO[type].descend: def.tile === null ? !!TILE_INFO[type].land : type === def.tile && richness(s.world, x, y, z) > 0;
  const there = extractorAt(s, x, y, z);
  return fits && (!there || there === moving) && !holeBelow(s.world, x, y, z) && !wayUp(s.world, x, y, z);
}

// Whether building `key` could stand on explored tile (x, y) of your layer,
// wherever you are (walking there is up to you). `moving`: as above.
export function extractorFits(s, key, x, y, moving = null) {
  const def = EXTRACTORS[key];
  return !!def && isExplored(s.world, x, y, s.player.z) && buildableTile(s, def, x, y, moving);
}

// Whether tile (x, y) of your layer is close enough to build on or work.
export function inReach(s, x, y) {
  return tileDist2(s.player, x, y, s.player.z) <= REACH2;
}

// Whether `kind` (a building, a prop or a crystal room) can ever be built on
// layer z, so Build offers only what fits where you are (Watch, 2026-10-26).
// Deposits and open land are on the surface; a crystal world's mine works
// ore seams below it, and its stoneworks, depot and shelter stand anywhere.
export function buildsOnLayer(s, kind, z = s.player.z) {
  const under = z < SURFACE;
  if (Object.hasOwn(PROPS, kind)) return (PROPS[kind].on === 'tunnel') === under;
  if (s.cultivation) {
    if (DEEP_KINDS.includes(kind)) return z <= DEEP;
    if (kind === 'shelter') return true;
    if (kind === 'mine') return under;
    return Object.hasOwn(EXTRACTORS, kind) && (EXTRACTORS[kind].tile === null || !under);
  }
  return Object.hasOwn(EXTRACTORS, kind) && !under;
}

// The nearest free tile in reach where extractor `key` could stand.
export function buildTarget(s, key) {
  const def = EXTRACTORS[key];
  if (!def) return null;
  const spots = tilesInReach(s).filter((c) => buildableTile(s, def, c.x, c.y));
  if (def.depot) spots.sort((a,b)=>depotGain(s,b)-depotGain(s,a));
  if (def.support) spots.sort((a, b) => supportGain(s, b) - supportGain(s, a));
  const t = spots[0];
  return t ? { x: t.x, y: t.y } : null;
}

// Whether extractor `key` could stand on tile (x, y) now (in reach and free).
function canBuildAt(s, key, x, y) {
  const def = EXTRACTORS[key];
  return !!def && tilesInReach(s).some((c) => c.x === x && c.y === y) && buildableTile(s, def, x, y);
}

// Moves your building `e` to tile (x, y) of its layer, in reach and where it
// fits: free, and what it holds goes with it (Watch, 2026-10-26). Not yet in
// a shared world, whose room doesn't know moves.
export function moveExtractor(s, e, x, y) {
  if (s.shared || !s.extractors.includes(e) || e.z !== s.player.z || (e.owner && e.owner !== s.me)) return { ok: false, reason: t('reason.cantMove') };
  if (e.x === x && e.y === y) return { ok: true, x, y };
  if (!inReach(s, x, y) || !extractorFits(s, e.key, x, y, e)) return { ok: false, reason: t('reason.noSpot') };
  e.x = x; e.y = y;
  if (s.cultivation && e.key === 'mine') setRichness(s.world, x, y, e.z, 0);
  // A new list: every index of the buildings by tile is made again.
  s.extractors = s.extractors.slice();
  economyForState(s)?.reconfigure();
  return { ok: true, x, y };
}

// Puts up extractor `key` on the nearest free tile, or on `at` ({x, y}) if
// given (the room doing what a player did: on the same tile, or not at all).
export function place(s, key, at = null) {
  const def = EXTRACTORS[key];
  if (!def) return { ok: false, reason: t('reason.unknownBuilding') };
  if (def.depot && (!usesDepots(s) || s.shared || (!s.cultivation&&s.player.z!==SURFACE))) return {ok:false,reason:t('reason.depotUnavailable')};
  if (def.unlock && !s.unlocks[def.unlock]) return { ok: false, reason: t('reason.needUnlock', { name: UNLOCKS[def.unlock].name }) };
  if (at && !canBuildAt(s, key, at.x, at.y)) return { ok: false, reason: t('reason.noSpot') };
  at = at || buildTarget(s, key);
  if (!at) return { ok: false, reason: t('reason.noSpot') };
  const cost = extractorCost(s, key);
  if (!canAfford(s.inv, cost)) return { ok: false, reason: t('reason.need', { cost: costText(cost) }) };
  noteAct(s, 'b', key, at.x, at.y);
  if (usesDepots(s)) startEventEconomy(s);
  pay(s.inv, cost);
  const e = { key, res: def.res, x: at.x, y: at.y, z: s.player.z, buffer: 0 };
  if (s.me) e.owner = s.me;
  s.extractors.push(e);
  if(s.cultivation&&key==='mine')setRichness(s.world,e.x,e.y,e.z,0);
  economyForState(s)?.reconfigure();
  if (s.world.edits) s.world.edits.push(['x', key, e.x, e.y, e.z]);
  s.stats.built += 1;
  return { ok: true, x: at.x, y: at.y, cost };
}
