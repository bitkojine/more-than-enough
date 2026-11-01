/* Living crystal extends the existing world, inventory and commands. No
 * separate map, movement system or renderer; no DOM or wall-time dependency.
 * Its parts: what it's made of (cultivation-model.js), the stolen heart
 * (cultivation-heart.js) and saves (cultivation-save.js). */
import { activeCarriedLight, normalizeCarriedLight } from './light.js';
import { focusedChapter, contentLocked, effectiveToolLevel } from './progression.js';
import { atInteraction } from './interaction.js';
import { tileAt, isExplored } from './world.js';
import { packKey } from './coords.js';
import { T, TILE_INFO } from './tiles.js';
import { PROPS } from './content.js';
import { teleportFrom } from './cultivation-travel.js';
import { illuminationAt, invalidateIllumination, LIGHT_MAX } from './illumination.js';
import { earn, spend as payInventory, canAfford } from './economy.js';
import {
  CULTIVATION_RECIPES,
  MACHINE_REPAIRS,
  machineSections,
  machineRepairCost
} from './cultivation-model.js';
import {
  HEART_MIN,
  HEART_SUN,
  HEART_MEND,
  newHeart,
  heartAt,
  heartLight,
  carrierSun,
  warmCarrier,
  carrierLoaded,
  waterCools,
  heatDamage,
  nearHidingPlace
} from './cultivation-heart.js';
export const CRYSTAL_GROWTH_RATE = 0.3;
export function crystalCapacity(s, b) {
  return b.reinforced && !contentLocked(s, 'reinforce') ? 40 : 20;
}
export function crystalGrowthRate(b) {
  return b.kind === 'chamber' && b.health > 0 && !b.needsTend && b.temperature <= 22
    ? CRYSTAL_GROWTH_RATE
    : 0;
}
const qualityMean = (a, an, b, bn) => Math.max(0, Math.min(100, a + (b - a) * (bn / (an + bn))));
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const nearby = (a, b, r) => a.z === b.z && distance(a, b) <= r;
const cell = (x, y, z) => `${x},${y},${z}`;
const indexCache = new WeakMap();
function index(s) {
  const c = s.cultivation;
  let v = indexCache.get(c);
  const propsVersion = s.world.props.revision ?? s.world.props.size;
  if (
    v &&
    v.n === c.facilities.length &&
    v.mines === s.extractors.length &&
    v.props === s.world.props &&
    v.version === propsVersion &&
    v.focused === focusedChapter(s)
  )
    return v;
  v = {
    focused: focusedChapter(s),
    n: c.facilities.length,
    mines: s.extractors.length,
    props: s.world.props,
    version: propsVersion,
    cells: new Map(),
    ids: new Map(),
    heat: new Map(),
    routes: []
  };
  const heat = (b, n, r) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (Math.abs(dx) + Math.abs(dy) <= r) {
          const k = cell(b.x + dx, b.y + dy, b.z);
          v.heat.set(k, (v.heat.get(k) || 0) + n);
        }
  };
  for (const b of c.facilities) {
    v.cells.set(cell(b.x, b.y, b.z), b);
    v.ids.set(b.id, b);
    if (b.kind === 'cooler') heat(b, -12, 3);
  }
  for (const b of s.extractors) if (b.key === 'mine' && !contentLocked(s, 'mine')) heat(b, 10, 3);
  for (const b of c.facilities)
    if (b.kind === 'conduit' && !contentLocked(s, 'conduit')) {
      const from = v.ids.get(b.from),
        to = v.ids.get(b.to);
      if (from && to) v.routes.push({ from, to });
    }
  indexCache.set(c, v);
  return v;
}
export function cultivationAt(s, x, y, z = s.player.z) {
  return s.cultivation ? index(s).cells.get(cell(x, y, z)) : null;
}
// Physical exposure uses the same propagated field as the world renderer.
export function cultivationExposure(s, p) {
  return illuminationAt(s, p.x, p.y, p.z).level / LIGHT_MAX;
}
export function cultivationLight(s, p) {
  return cultivationExposure(s, p) > 0;
}
export function cultivationTarget(s, b) {
  return Math.max(
    4,
    (b.z <= -2 ? 12 : 18) +
      (b.kind === 'chamber' || b.kind === 'machine' ? 18 : 0) +
      (index(s).heat.get(cell(b.x, b.y, b.z)) || 0)
  );
}
// What the loaded carrier feels where Mica stands, and why: its temperature
// (surroundings plus sun warmth) and the cause acting on it now. Explanations
// read this, so they name only causes the rules use.
export function carrierReading(s) {
  const c = s.cultivation;
  if (!c?.gear?.carrier) return null;
  const p = { x: Math.floor(s.player.x), y: Math.floor(s.player.y), z: s.player.z },
    warmth = c.carrierWarmth || 0,
    sun = carrierSun(s, p);
  return {
    loaded: carrierLoaded(s),
    warmth,
    temperature: cultivationTarget(s, p) + warmth,
    cause: sun > 0 ? 'sun' : waterCools(s, p.x, p.y, p.z) ? 'water' : 'shade'
  };
}
export function cultivationStatus(s, b) {
  if (['cooler', 'conduit', 'shelter', 'bench'].includes(b.kind)) return 'ready';
  if (b.health === 0) return 'dead';
  if (b.temperature > 22) return 'hot';
  if (b.needsTend) return 'injured';
  if (b.kind === 'chamber' && b.health === undefined) return 'empty';
  return 'growing';
}
const canPay = (s, cost) => canAfford(s.inv, cost);
function pay(s, cost, category = 'buildings') {
  payInventory(s, cost, category);
  if (!s.inv.crystal) s.cultivation.quality = 100;
}
function earned(s, res, n) {
  earn(s, res, n, 'buildings');
}
// Built facilities always protect their contents from light. Lighting changes
// still expose unprotected cargo; wild colonies use the physical light field.
export function lightCrystal(s) {
  exposeCargo(s);
}
function exposeCargo(s) {
  const c = s.cultivation,
    p = { x: Math.floor(s.player.x), y: Math.floor(s.player.y), z: s.player.z };
  const strength = c.gear.carrier ? 0 : cultivationExposure(s, p);
  if (strength) {
    if (c.starter) c.starter.health = Math.max(0, c.starter.health - strength);
    crackCarriedCrystal(s, strength);
  }
}
// Stored crystal cracks all the way too (Watch, 2026-11-01, "Yes, same
// rule as carried"): at 0% a building's whole store crumbles and is gone.
function crackStoredCrystal(c, b, amount) {
  if (!b.buffer || !(amount > 0)) return;
  b.quality = Math.max(0, b.quality - amount);
  if (b.quality > 0) return;
  b.buffer = 0;
  b.quality = 100;
  c.storeLost = (c.storeLost || 0) + 1;
}
// Carried crystal cracks all the way (Watch, 2026-11-01, "Quality falls to
// 0, then all is lost"): at 0% the whole load crumbles and is gone.
function crackCarriedCrystal(s, amount) {
  const c = s.cultivation;
  if (!s.inv.crystal || !(amount > 0)) return;
  c.quality = Math.max(0, c.quality - amount);
  if (c.quality > 0) return;
  payInventory(s, { crystal: s.inv.crystal }, 'other');
  c.quality = 100;
  c.crystalLost = (c.crystalLost || 0) + 1;
}

export function wildColony(s, x, y, z = s.player.z) {
  if (
    !s.cultivation ||
    z > -2 ||
    !isExplored(s.world, x, y, z) ||
    tileAt(s.world, x, y, z) !== T.GEODE
  )
    return null;
  const k = packKey(x, y, z);
  return (s.cultivation.wild[k] ??= { x, y, z, health: 100, regrow: 0 });
}
export function takeStarter(s, x, y) {
  const c = s.cultivation;
  if (!c || !atInteraction(s, x, y)) return 'reach';
  if (effectiveToolLevel(s, 'pickaxe') < 3) return 'equipment';
  const w = wildColony(s, x, y);
  if (!w) return 'site';
  if (c.starter) return 'carrying';
  if (w.regrow || w.health <= 0) return 'regrow';
  c.starter = { health: 100 };
  w.health = 0;
  w.regrow = 45;
  exposeCargo(s);
  return 'ok';
}
// Crystal rooms are dug in from this layer down; a heart shelter goes anywhere.
export const DEEP = -2,
  DEEP_KINDS = ['chamber', 'cooler', 'vault', 'conduit'];
export const BUILT_FACILITIES = Object.freeze([
  'chamber',
  'cooler',
  'vault',
  'conduit',
  'shelter',
  'bench'
]);
export const CONDUIT_REACH = 4; // tiles, along the grid, from a conduit to its chamber and vault
// The chamber and vault a conduit at `at` would join, or null.
function conduitRoute(s, at, moving = null) {
  const c = s.cultivation,
    from = c.facilities.find(
      (a) => a !== moving && a.kind === 'chamber' && nearby(a, at, CONDUIT_REACH)
    ),
    to = c.facilities.find(
      (a) => a !== moving && a.kind === 'vault' && nearby(a, at, CONDUIT_REACH)
    );
  return from && to ? { from, to } : null;
}
// Why facility `kind` can't go on tile (x, y) of your layer, or null if it
// can (reach and price aside). `moving`: one being moved, whose own tile
// counts as free and whose conduits must still reach it.
export function facilitySite(s, kind, x, y, moving = null) {
  const c = s.cultivation,
    z = s.player.z;
  if (!c || !BUILT_FACILITIES.includes(kind)) return 'invalid';
  if (!isExplored(s.world, x, y, z)) return 'unseen';
  if (kind === 'bench') {
    if (!nearHidingPlace(s, x, y, z)) return 'camp';
  } else if (z > DEEP && kind !== 'shelter') return 'deep';
  if (heartAt(s, x, y, z)) return 'occupied';
  const type = tileAt(s.world, x, y, z),
    b = cultivationAt(s, x, y, z);
  if (
    !TILE_INFO[type].walk ||
    TILE_INFO[type].rise ||
    TILE_INFO[type].descend ||
    (b && b !== moving) ||
    s.extractors.some((e) => e.x === x && e.y === y && e.z === z) ||
    s.world.props.has(packKey(x, y, z))
  )
    return 'occupied';
  const at = { x, y, z };
  if (kind === 'conduit' && !conduitRoute(s, at, moving)) return 'route';
  // A chamber or vault moved out of a conduit's reach would leave it joining nothing.
  if (moving)
    for (const d of c.facilities)
      if (
        d.kind === 'conduit' &&
        (d.from === moving.id || d.to === moving.id) &&
        !nearby(d, at, CONDUIT_REACH)
      )
        return 'route';
  return null;
}
// Moves facility `b` to tile (x, y) of its layer, in reach: free, and all it
// holds goes with it (Watch, 2026-10-26). A conduit joins what is near it there.
export function moveFacility(s, b, x, y) {
  if (contentLocked(s, b?.kind)) return 'locked';
  const c = s.cultivation;
  if (
    !c ||
    s.shared ||
    !c.facilities.includes(b) ||
    !BUILT_FACILITIES.includes(b.kind) ||
    b.z !== s.player.z
  )
    return 'invalid';
  if (!atInteraction(s, x, y)) return 'reach';
  const why = facilitySite(s, b.kind, x, y, b);
  if (why) return why;
  if (b.kind === 'conduit') {
    const r = conduitRoute(s, { x, y, z: b.z }, b);
    b.from = r.from.id;
    b.to = r.to.id;
  }
  b.x = x;
  b.y = y;
  indexCache.delete(c);
  return 'ok';
}
export function cultivationCommand(s, cmd) {
  const c = s.cultivation;
  if (!c || s.shared) return 'invalid';
  if (contentLocked(s, cmd.type) || (cmd.type === 'build' && contentLocked(s, cmd.kind)))
    return 'locked';
  const x = cmd.x ?? Math.floor(s.player.x),
    y = cmd.y ?? Math.floor(s.player.y),
    z = s.player.z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !isExplored(s.world, x, y, z))
    return 'unseen';
  if (cmd.type === 'build') {
    const why = facilitySite(s, cmd.kind, x, y);
    if (why) return why;
  }
  if (!atInteraction(s, x, y)) return 'reach';
  const b = cultivationAt(s, x, y, z),
    cost = CULTIVATION_RECIPES[cmd.kind || cmd.type];
  if (cmd.type === 'shade') {
    const k = packKey(x, y, z);
    if (!PROPS[s.world.props.get(k)]?.light) return 'site';
    c.shaded ??= {};
    if (!(k in c.shaded)) {
      if (!canPay(s, CULTIVATION_RECIPES.shade)) return 'materials';
      pay(s, CULTIVATION_RECIPES.shade);
    }
    c.shaded[k] = !c.shaded[k];
    indexCache.delete(c);
    invalidateIllumination(s, x, y, z);
    return 'ok';
  }
  if (cmd.type === 'starter') return takeStarter(s, x, y);
  if (cmd.type === 'teleport') return b ? teleportFrom(s, b, cmd.to) : 'site';
  if (cmd.type === 'heart') return moveHeart(s, x, y, z);
  if (cmd.type === 'lantern') {
    if (!c.gear.lantern) return 'equipment';
    c.lantern = activeCarriedLight(s) !== 'lantern';
    if (c.lantern) {
      if (!contentLocked(s, 'flare')) s.flare = 0;
      lightCrystal(s);
    } else exposeCargo(s);
    return 'ok';
  }
  if (cmd.type === 'craft') {
    if (!['carrier', 'lantern'].includes(cmd.kind) || c.gear[cmd.kind]) return 'invalid';
    if (!canPay(s, cost)) return 'materials';
    pay(s, cost, 'tools');
    c.gear[cmd.kind] = true;
    return 'ok';
  }
  if (cmd.type === 'build') {
    const why = facilitySite(s, cmd.kind, x, y);
    if (why) return why;
    if (!canPay(s, cost)) return 'materials';
    const next = {
      kind: cmd.kind,
      id: c.nextId,
      x,
      y,
      z,
      temperature: 12,
      buffer: 0,
      quality: 100
    };
    if (cmd.kind === 'conduit') {
      const r = conduitRoute(s, next);
      next.from = r.from.id;
      next.to = r.to.id;
    }
    pay(s, cost);
    c.nextId++;
    c.facilities.push(next);
    return 'ok';
  }
  if (!b) return 'building';
  if (contentLocked(s, b.kind)) return 'locked';
  // The carrier bench weaves a mycelium lining into the carrier, once.
  if (cmd.type === 'line' && b.kind === 'bench') {
    if (!c.gear.carrier) return 'equipment';
    if (c.gear.lining) return 'invalid';
    if (!canPay(s, CULTIVATION_RECIPES.lining)) return 'materials';
    pay(s, CULTIVATION_RECIPES.lining, 'tools');
    c.gear.lining = true;
    return 'ok';
  }
  if (cmd.type === 'plant' && b.kind === 'chamber') {
    if (!c.starter) return 'starter';
    if (b.health > 0) return 'occupied';
    b.health = c.starter.health;
    b.needsTend = b.health < 100;
    b.temperature = cultivationTarget(s, b);
    c.starter = null;
    return 'ok';
  }
  if (cmd.type === 'tend' && b.kind === 'chamber') {
    if (!b.health) return 'dead';
    if (b.temperature > 22) return 'unsafe';
    if (!canPay(s, CULTIVATION_RECIPES.tend)) return 'materials';
    pay(s, CULTIVATION_RECIPES.tend, 'care');
    b.needsTend = false;
    return 'ok';
  }
  if (cmd.type === 'collect' && ['chamber', 'vault'].includes(b.kind)) {
    if (b.buffer < 1) return 'empty';
    c.quality = s.inv.crystal
      ? qualityMean(c.quality, s.inv.crystal, b.quality, b.buffer)
      : b.quality;
    earned(s, 'crystal', b.buffer);
    b.buffer = 0;
    exposeCargo(s);
    return 'ok';
  }
  if (cmd.type === 'store' && b.kind === 'vault') {
    const n = Math.min(s.inv.crystal, (b.reinforced ? 40 : 20) - b.buffer);
    if (n <= 0) return 'empty';
    b.quality = b.buffer ? qualityMean(b.quality, b.buffer, c.quality, n) : c.quality;
    b.buffer += n;
    pay(s, { crystal: n }, null);
    return 'ok';
  }
  if (cmd.type === 'reinforce' && ['chamber', 'vault'].includes(b.kind)) {
    if (b.reinforced) return 'occupied';
    if (!canPay(s, CULTIVATION_RECIPES.reinforce)) return 'materials';
    pay(s, CULTIVATION_RECIPES.reinforce);
    b.reinforced = true;
    return 'ok';
  }
  if (cmd.type === 'repair' && b.kind === 'machine') {
    const recipe = machineRepairCost(b);
    if (!recipe) return 'repaired';
    if (c.quality < 60) return 'quality';
    if (cultivationTarget(s, b) > 22) return 'cooling';

    const heart = machineSections(b) === 1;
    if (heart && c.heart?.where !== 'carried') return 'heart';
    if (heart && c.heart.health < HEART_MIN) return 'cracked';
    if (!canPay(s, recipe)) return 'materials';
    const quality = c.quality;
    pay(s, recipe, 'restoration');
    if (heart) c.heart = { where: 'installed', health: c.heart.health };
    b.sections = Math.min(MACHINE_REPAIRS.length, machineSections(b) + 1);
    b.health = 100;
    b.quality = quality;
    b.temperature = cultivationTarget(s, b);
    c.restored = true;
    return 'discovery';
  }
  if (cmd.type === 'activate' && b.kind === 'machine') {
    if (c.completed) return 'completed';
    if (machineSections(b) < MACHINE_REPAIRS.length) return 'sections';
    if (b.health <= 0 || b.quality < 60) return 'quality';
    if (cultivationTarget(s, b) > 22 || b.temperature > 22) return 'cooling';
    c.completed = true;
    normalizeCarriedLight(s);
    c.completedAt = s.time;
    return 'activated';
  }
  return 'invalid';
}
// Takes the heart from the hiding place or a shelter, or rests it in a shelter.
function moveHeart(s, x, y, z) {
  const c = s.cultivation,
    h = (c.heart ??= newHeart()),
    b = cultivationAt(s, x, y, z);
  if (heartAt(s, x, y, z)) {
    if (h.where !== 'station') return 'gone';
    if (!c.gear.carrier) return 'equipment';
    h.where = 'carried';
    return 'lifted';
  }
  if (b?.kind !== 'shelter') return 'site';
  if (h.where === b.id) {
    h.where = 'carried';
    return 'lifted';
  }
  if (contentLocked(s, 'shelter')) return 'locked';
  if (h.where !== 'carried') return 'gone';
  h.where = b.id;
  return 'ok';
}
// Which clue the machine shows: one per restored section, 0 before any.
export function machineClue(s) {
  const b = s.cultivation?.facilities.find((f) => f.kind === 'machine');
  return b ? Math.min(MACHINE_REPAIRS.length, machineSections(b)) : 0;
}
function discoverMachine(s) {
  const c = s.cultivation;
  if (s.player.z > -2 || c.facilities.some((b) => b.kind === 'machine')) return;
  const x = Math.floor(s.player.x),
    y = Math.floor(s.player.y),
    z = s.player.z;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const px = x + dx,
        py = y + dy;
      if (
        !isExplored(s.world, px, py, z) ||
        tileAt(s.world, px, py, z) !== T.TUNNEL ||
        cultivationAt(s, px, py, z)
      )
        continue;
      c.facilities.push({
        kind: 'machine',
        sections: 0,
        id: c.nextId++,
        x: px,
        y: py,
        z,
        temperature: 30,
        health: 0,
        quality: 100,
        buffer: 0
      });
      return;
    }
}
// The heart: carried, it takes `damage` % a second (heat and any light);
// resting in a shelter, it mends or cracks with the shelter's temperature.
function stepHeart(s, damage, seconds) {
  const c = s.cultivation,
    h = c.heart;
  if (h?.where === 'carried') h.health -= damage * seconds;
  else if (typeof h?.where === 'number' && !contentLocked(s, 'shelter')) {
    // A shelter feels its spot like any building (Watch, 2026-11-01): cool, it
    // mends the heart; over CRACK_ABOVE (beside a working mine, say) it cracks it.
    const hot = heatDamage(index(s).ids.get(h.where)?.temperature ?? 0);
    h.health = Math.min(100, h.health + (hot ? -hot : HEART_MEND) * seconds);
  } else return;
  // A heart that cracks right through falls apart and its light returns to the hiding place.
  if (h.health <= 0) {
    c.heart = newHeart();
    c.heartLost = (c.heartLost || 0) + 1;
  }
}
export function stepCultivation(s, dt) {
  const c = s.cultivation;
  if (!c) return;
  discoverMachine(s);
  c.phase += dt;
  if (c.phase < 0.25 - 1e-9) return;
  const seconds = Math.floor((c.phase + 1e-9) * 4) / 4;
  c.phase = Math.max(0, c.phase - seconds);
  c.clock += seconds;
  // Calls normally arrive at 60 Hz; only facility deadlines run at 4 Hz.
  // The host may batch a quiet interval without touching any terrain cells.
  const p = { x: Math.floor(s.player.x), y: Math.floor(s.player.y), z: s.player.z };
  // What Mica carries feels the surroundings, plus the carrier's sun warmth.
  const warmth = c.gear.carrier ? warmCarrier(c, carrierSun(s, p), seconds, carrierLoaded(s)) : 0;
  const heat = heatDamage(cultivationTarget(s, p) + warmth);
  const carriedDamage = heat + (c.gear.carrier ? 0 : 9 * cultivationExposure(s, p));
  if (c.starter) {
    c.starter.health -= carriedDamage * seconds;
    if (c.starter.health <= 0) c.starter = null;
  }
  crackCarriedCrystal(s, carriedDamage * seconds);
  stepHeart(s, heat + HEART_SUN * heartLight(s, p), seconds);
  for (const w of Object.values(c.wild)) {
    if (w.regrow > 0) {
      w.regrow = Math.max(0, w.regrow - seconds);
      if (!w.regrow) w.health = 100;
    } else {
      w.health = Math.max(
        0,
        w.health - (9 * cultivationExposure(s, w) + heatDamage(cultivationTarget(s, w))) * seconds
      );
      if (!w.health) w.regrow = 45;
    }
  }
  for (const b of c.facilities) {
    if (contentLocked(s, b.kind)) continue;
    const target = cultivationTarget(s, b);
    b.temperature = target + (b.temperature - target) * Math.exp(-seconds / 6);
    const damage = heatDamage(b.temperature);
    crackStoredCrystal(c, b, damage * seconds);
    if (b.health > 0) {
      if (damage) {
        b.health = Math.max(0, b.health - damage * seconds);
        if (b.kind === 'chamber') b.needsTend = true;
      } else if (!b.needsTend) b.health = Math.min(100, b.health + 4 * seconds);
      if (crystalGrowthRate(b)) {
        if (!b.buffer) b.quality = 100;
        const cap = crystalCapacity(s, b);
        if (b.buffer < cap) b.buffer = Math.min(cap, b.buffer + crystalGrowthRate(b) * seconds);
      }
    }
  }
  for (const { from, to } of index(s).routes) {
    const n = Math.max(
      0,
      Math.min(from.buffer, 0.8 * seconds, (to.reinforced ? 40 : 20) - to.buffer)
    );
    if (n) {
      to.quality = to.buffer ? qualityMean(to.quality, to.buffer, from.quality, n) : from.quality;
      to.buffer += n;
      from.buffer -= n;
    }
  }
}
