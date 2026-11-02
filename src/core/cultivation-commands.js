/* What Mica does in a crystal world, one handler per command. The checks
 * every command shares come first (cultivationCommand); then a command that
 * can be done anywhere (FREE) runs, or one done at a building (AT_BUILDING)
 * runs if the building there is of a kind it takes. Each returns why it
 * couldn't, or what happened ('ok', 'lifted', 'discovery', 'activated'). */
import { activeCarriedLight, normalizeCarriedLight } from './light.js';
import { contentLocked } from './progression.js';
import { atInteraction } from './interaction.js';
import { isExplored } from './world.js';
import { packKey } from './coords.js';
import { PROPS } from './content.js';
import { teleportFrom } from './cultivation-travel.js';
import { invalidateIllumination } from './illumination.js';
import { canAfford } from './economy.js';
import {
  CULTIVATION_RECIPES,
  MACHINE_REPAIRS,
  machineSections,
  machineRepairCost
} from './cultivation-model.js';
import { HEART_MIN, newHeart, heartAt } from './cultivation-heart.js';
import {
  cultivationAt,
  cultivationTarget,
  crystalCapacity,
  facilitySite,
  takeStarter,
  lightCrystal,
  exposeCargo,
  conduitRoute,
  qualityMean,
  payCultivation as pay,
  earnCultivation as earned,
  forgetCultivationIndex
} from './cultivation.js';

const canPay = (s, cost) => canAfford(s.inv, cost);
const COOL = 22; // °C: warmer than this and crystal work is unsafe
const MIN_QUALITY = 60; // % crystal quality the machine needs

export function cultivationCommand(s, cmd) {
  const c = s.cultivation;
  if (!c || s.shared) return 'invalid';
  const x = cmd.x ?? Math.floor(s.player.x),
    y = cmd.y ?? Math.floor(s.player.y),
    z = s.player.z;
  const why = cantDoThere(s, cmd, x, y, z);
  if (why) return why;
  const at = { s, c, cmd, x, y, z, b: cultivationAt(s, x, y, z) };
  if (Object.hasOwn(FREE, cmd.type)) return FREE[cmd.type](at);
  const { b } = at;
  if (!b) return 'building';
  if (contentLocked(s, b.kind)) return 'locked';
  const job = Object.hasOwn(AT_BUILDING, cmd.type) && AT_BUILDING[cmd.type];
  return job && job.kinds.includes(b.kind) ? job.run(at) : 'invalid';
}

// What every command checks first: locked, unseen, a bad site, out of reach.
function cantDoThere(s, cmd, x, y, z) {
  if (contentLocked(s, cmd.type) || (cmd.type === 'build' && contentLocked(s, cmd.kind)))
    return 'locked';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !isExplored(s.world, x, y, z))
    return 'unseen';
  // A site that can't take the building says so before reach does.
  const site = cmd.type === 'build' && facilitySite(s, cmd.kind, x, y);
  if (site) return site;
  return atInteraction(s, x, y) ? null : 'reach';
}

// Commands that need no building where they're done.
const FREE = {
  // Shades a light-giving prop (paid once), or uncovers it again.
  shade({ s, c, x, y, z }) {
    const k = packKey(x, y, z);
    if (!PROPS[s.world.props.get(k)]?.light) return 'site';
    c.shaded ??= {};
    if (!(k in c.shaded)) {
      if (!canPay(s, CULTIVATION_RECIPES.shade)) return 'materials';
      pay(s, CULTIVATION_RECIPES.shade);
    }
    c.shaded[k] = !c.shaded[k];
    forgetCultivationIndex(c);
    invalidateIllumination(s, x, y, z);
    return 'ok';
  },
  starter: ({ s, x, y }) => takeStarter(s, x, y),
  teleport: ({ s, b, cmd }) => (b ? teleportFrom(s, b, cmd.to) : 'site'),
  heart: ({ s, x, y, z }) => moveHeart(s, x, y, z),
  lantern({ s, c }) {
    if (!c.gear.lantern) return 'equipment';
    c.lantern = activeCarriedLight(s) !== 'lantern';
    if (c.lantern) {
      if (!contentLocked(s, 'flare')) s.flare = 0;
      lightCrystal(s);
    } else exposeCargo(s);
    return 'ok';
  },
  craft({ s, c, cmd }) {
    if (!['carrier', 'lantern'].includes(cmd.kind) || c.gear[cmd.kind]) return 'invalid';
    const cost = CULTIVATION_RECIPES[cmd.kind];
    if (!canPay(s, cost)) return 'materials';
    pay(s, cost, 'tools');
    c.gear[cmd.kind] = true;
    return 'ok';
  },
  build({ s, c, cmd, x, y, z }) {
    const cost = CULTIVATION_RECIPES[cmd.kind];
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
};

// Commands done at a building, and the kinds of building each takes.
const AT_BUILDING = {
  // The carrier bench weaves a mycelium lining into the carrier, once.
  line: {
    kinds: ['bench'],
    run({ s, c }) {
      if (!c.gear.carrier) return 'equipment';
      if (c.gear.lining) return 'invalid';
      if (!canPay(s, CULTIVATION_RECIPES.lining)) return 'materials';
      pay(s, CULTIVATION_RECIPES.lining, 'tools');
      c.gear.lining = true;
      return 'ok';
    }
  },
  plant: {
    kinds: ['chamber'],
    run({ s, c, b }) {
      if (!c.starter) return 'starter';
      if (b.health > 0) return 'occupied';
      b.health = c.starter.health;
      b.needsTend = b.health < 100;
      b.temperature = cultivationTarget(s, b);
      c.starter = null;
      return 'ok';
    }
  },
  tend: {
    kinds: ['chamber'],
    run({ s, b }) {
      if (!b.health) return 'dead';
      if (b.temperature > COOL) return 'unsafe';
      if (!canPay(s, CULTIVATION_RECIPES.tend)) return 'materials';
      pay(s, CULTIVATION_RECIPES.tend, 'care');
      b.needsTend = false;
      return 'ok';
    }
  },
  collect: {
    kinds: ['chamber', 'vault'],
    run({ s, c, b }) {
      if (b.buffer < 1) return 'empty';
      c.quality = s.inv.crystal
        ? qualityMean(c.quality, s.inv.crystal, b.quality, b.buffer)
        : b.quality;
      earned(s, 'crystal', b.buffer);
      b.buffer = 0;
      exposeCargo(s);
      return 'ok';
    }
  },
  store: {
    kinds: ['vault'],
    run({ s, c, b }) {
      const n = Math.min(s.inv.crystal, crystalCapacity(s, b) - b.buffer);
      if (n <= 0) return 'empty';
      b.quality = b.buffer ? qualityMean(b.quality, b.buffer, c.quality, n) : c.quality;
      b.buffer += n;
      pay(s, { crystal: n }, null);
      return 'ok';
    }
  },
  reinforce: {
    kinds: ['chamber', 'vault'],
    run({ s, b }) {
      if (b.reinforced) return 'occupied';
      if (!canPay(s, CULTIVATION_RECIPES.reinforce)) return 'materials';
      pay(s, CULTIVATION_RECIPES.reinforce);
      b.reinforced = true;
      return 'ok';
    }
  },
  repair: { kinds: ['machine'], run: repairMachine },
  activate: {
    kinds: ['machine'],
    run({ s, c, b }) {
      if (c.completed) return 'completed';
      if (machineSections(b) < MACHINE_REPAIRS.length) return 'sections';
      if (b.health <= 0 || b.quality < MIN_QUALITY) return 'quality';
      if (cultivationTarget(s, b) > COOL || b.temperature > COOL) return 'cooling';
      c.completed = true;
      normalizeCarriedLight(s);
      c.completedAt = s.time;
      return 'activated';
    }
  }
};

// Restores the machine's next section; the second one takes the heart.
function repairMachine({ s, c, b }) {
  const recipe = machineRepairCost(b);
  if (!recipe) return 'repaired';
  if (c.quality < MIN_QUALITY) return 'quality';
  if (cultivationTarget(s, b) > COOL) return 'cooling';
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
