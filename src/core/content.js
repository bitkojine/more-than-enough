/* Game content and tuning: everything a designer tweaks lives here as data. */

import { T } from './tiles.js';
import { t } from '../i18n/i18n.js';

/* ------------------------------------------------------------- tuning */

export const EXPLORE_RADIUS = 6;
export const MINE_EXPLORE_RADIUS = 3; // underground you only see the rock close by
export const REACH = 1.65;            // how far the player can gather, dig or build
export const COLLECT_RANGE = 1.7;
// Waiting must never beat doing something (Watch, 2026-10-18), so hands keep
// up with buildings: each gather (and each find's loot) also brings in this
// many seconds of what your buildings make of that resource.
export const HAND_SHARE = 0.1;
// Time away from a solo world (closed, or in another app): buildings and the
// Abundance Engine keep working at full rate for up to AWAY_CAP seconds
// (Watch's choice), straight into your packs. Gaps under AWAY_MIN are ignored.
export const AWAY_CAP = 8 * 3600;
export const AWAY_MIN = 10;
export const BASE_SPEED = 3.7;
export const SWIM_SPEED = 0.75;       // multiplier on water
export const PLAYER_RADIUS = 0.3;
export const DAY_LENGTH = 240;        // seconds of game time per day-night cycle
export const REGROW_RADIUS = 20;      // only tiles near the player regrow
export const REGROW_INTERVAL = 0.5;
export const REGROW_CHANCE = 0.02;
export const EXTRACTOR_GROWTH = 2.2; // each extra extractor of a kind costs this much more
// Embarking is the end of a world, not a step in it: every tool, refinery and
// unlock at its top level, the Abundance Engine at EMBARK_ABUNDANCE, and this
// much gathered in the world.
export const EMBARK_MIN_TOTAL = 500000000000;
export const EMBARK_ABUNDANCE = 5;

/* -------------------------------------------------------------- props */

// Things you place where you stand, one per tile. `on` is where they go:
// 'tunnel' (open mine floor), 'water' (any water on the surface) or 'river'
// (a river between regions). `light` is how far it lights, in tiles (your
// screen reaches 1.7 in the mine); a `beacon` shows through the dark from
// anywhere on screen, to find your way back by. `charge` charges the battery
// of anyone within CHARGE_RANGE: 'day' while the sun is up, 'always' at any
// hour (see battery.js).
export const PROPS = {
  glowcap: { name: t('prop.glowcap'), cost: { mycelium: 3 }, on: 'tunnel', light: 4.5, does: t('prop.glowcap.does') },
  lamp: { name: t('prop.lamp'), cost: { stone: 8, crystal: 1 }, on: 'tunnel', light: 8, does: t('prop.lamp.does') },
  flag: { name: t('prop.flag'), cost: { mycelium: 2 }, on: 'tunnel', beacon: true, does: t('prop.flag.does') },
  solar: { name: t('prop.solar'), cost: { stone: 30, ore: 6 }, on: 'water', charge: 'day', does: t('prop.solar.does') },
  wheel: { name: t('prop.wheel'), cost: { stone: 60, ore: 20 }, on: 'river', charge: 'always', does: t('prop.wheel.does') }
};

/* ------------------------------------------------------------ battery */

// The phone or laptop in your hands lights the dark, and that runs its
// battery down (Watch, 2026-10-18). It drains only while it's dark (night,
// the mine), never while you're away, and only water power charges it.
// Below BATTERY_LOW your light starts to shrink, down to BATTERY_DIM of its
// full reach when it's flat: you see and uncover less, but can still do
// everything.
export const BATTERY_LIFE = 900;   // seconds of dark a full battery lasts
export const BATTERY_LOW = 0.3;
export const BATTERY_DIM = 0.4;
export const CHARGE_TIME = 10;     // seconds by a working charger from flat to full
export const CHARGE_RANGE = 2.5;   // tiles from a charger it reaches

/* -------------------------------------------------------------- finds */

// Things hidden in the rock, a few to every 16x16 area of each layer, that
// glint in the dark from GLINT_RANGE tiles away so there is always something
// close to dig toward. Digging one out pays its loot at once: each amount is
// multiplied by the layer number and by your Basket or Pickaxe yield for that
// resource, so deeper finds and better tools pay more. A find shows from
// layer `from` down.
export const FINDS_PER_CHUNK = 2;
export const GLINT_RANGE = 9;
export const FINDS = {
  [T.CACHE]: { name: t('tile.cache'), loot: { mycelium: 8, stone: 6, ore: 2 }, from: 1 },
  [T.GEODE]: { name: t('tile.geode'), loot: { stone: 4, crystal: 1 }, from: 2 }
};

/* --------------------------------------------------------------- gear */

// What tools open, not only how much they gather: rock too hard for the
// Pickaxe you have, the shafts down to the deep layers, rare mushrooms and
// the water. Below the level named here, working the tile is refused (or,
// for water, you stop at the shore). Checked by gearNeeded and canWade.
export const GEAR = {
  // the Pickaxe level that breaks each kind of rock
  rock: { [T.ORE]: 2, [T.ORE_SEAM]: 2, [T.CRYSTAL]: 3, [T.CRYSTAL_SEAM]: 3, [T.GEODE]: 3 },
  // the Pickaxe level that breaks the shafts down out of mine layer `from` and below
  shafts: [{ from: 3, level: 4 }, { from: 6, level: 5 }, { from: 9, level: 6 }],
  rare: 4,       // the Basket level that picks rare (magic) mushrooms
  water: 2       // the Boots level that takes you onto water
};
// A rare mushroom pays this many times what a common one does.
export const RARE_PAYS = 3;

/* -------------------------------------------------------------- tools */

// Level 1 is what you start with; each later level has a cost.
export const TOOLS = {
  basket: {
    name: t('tool.basket'), desc: t('tool.basket.desc'),
    levels: [
      { yield: 1 },
      { yield: 2, cost: { mycelium: 34 } },
      { yield: 4, cost: { mycelium: 37, stone: 14 } },
      { yield: 8, cost: { mycelium: 61, stone: 26 } },
      { yield: 16, cost: { mycelium: 16000, stone: 8000 } },
      { yield: 32, cost: { mycelium: 880000, stone: 430000 } }
    ]
  },
  pickaxe: {
    name: t('tool.pickaxe'), desc: t('tool.pickaxe.desc'),
    levels: [
      { yield: 1 },
      { yield: 2, cost: { mycelium: 8, stone: 5 } },
      { yield: 4, cost: { mycelium: 25, stone: 20 } },
      { yield: 8, cost: { mycelium: 150, stone: 170, ore: 11 } },
      { yield: 16, cost: { mycelium: 66000, stone: 86000, ore: 10000 } },
      { yield: 32, cost: { mycelium: 3700000, stone: 5000000, ore: 790000 } }
    ]
  },
  boots: {
    name: t('tool.boots'), desc: t('tool.boots.desc'),
    levels: [
      { mult: 1.0 },
      { mult: 1.3, cost: { mycelium: 32 } },
      { mult: 1.6, cost: { mycelium: 33, stone: 15 } },
      { mult: 2.0, cost: { mycelium: 530, stone: 340 } },
      { mult: 2.5, cost: { mycelium: 51000, stone: 40000, ore: 3400 } }
    ]
  },
  overclock: {
    name: t('tool.overclock'), desc: t('tool.overclock.desc'),
    levels: [
      { mult: 1 },
      { mult: 2, cost: { stone: 21, ore: 3 } },
      { mult: 4, cost: { stone: 63, ore: 11 } },
      { mult: 8, cost: { stone: 11000, ore: 2500 } },
      { mult: 16, cost: { stone: 940000, ore: 240000 } },
      { mult: 32, cost: { stone: 22000000, ore: 6400000, crystal: 120000 } }
    ]
  }
};

/* --------------------------------------------------------- extractors */

// Deposit extractors sit on a matching surface tile. Converters (tile: null)
// need a blueprint and synthesize their resource on any open land.
export const EXTRACTORS = {
  garden: { name: t('building.garden'), tile: T.FOREST, res: 'mycelium', rate: 0.45, buffer: 45, baseCost: { mycelium: 15 } },
  quarry: { name: t('building.quarry'), tile: T.STONE, res: 'stone', rate: 0.34, buffer: 45, baseCost: { mycelium: 30, stone: 15 } },
  mine: { name: t('building.mine'), tile: T.ORE, res: 'ore', rate: 0.24, buffer: 38, baseCost: { stone: 45, ore: 12 } },
  resonator: { name: t('building.resonator'), tile: T.CRYSTAL, res: 'crystal', rate: 0.07, buffer: 22, baseCost: { stone: 140, ore: 70, crystal: 6 } },
  compost: { name: t('building.compost'), tile: null, res: 'mycelium', rate: 0.375, buffer: 45, baseCost: { mycelium: 120, stone: 25 }, unlock: 'compost' },
  brickyard: { name: t('building.brickyard'), tile: null, res: 'stone', rate: 0.285, buffer: 45, baseCost: { mycelium: 150, stone: 90 }, unlock: 'brickyard' },
  foundry: { name: t('building.foundry'), tile: null, res: 'ore', rate: 0.225, buffer: 38, baseCost: { mycelium: 220, stone: 170, ore: 60 }, unlock: 'foundry' },
  observatory: { name: t('building.observatory'), tile: null, res: 'crystal', rate: 0.08, buffer: 22, baseCost: { mycelium: 380, stone: 400, ore: 160, crystal: 22 }, unlock: 'observatory' }
};

export const DEPOSIT_EXTRACTORS = Object.keys(EXTRACTORS).filter((k) => EXTRACTORS[k].tile !== null);
export const CONVERTERS = Object.keys(EXTRACTORS).filter((k) => EXTRACTORS[k].tile === null);

/* ------------------------------------------------------------ unlocks */

// One-time purchases.
export const UNLOCKS = {
  logistics: { name: t('unlock.logistics'), desc: t('unlock.logistics.desc'), cost: { stone: 110, ore: 28 } },
  compost: { name: t('unlock.compost'), desc: t('unlock.compost.desc'), cost: { mycelium: 110, stone: 28 } },
  brickyard: { name: t('unlock.brickyard'), desc: t('unlock.brickyard.desc'), cost: { mycelium: 150, stone: 84 } },
  foundry: { name: t('unlock.foundry'), desc: t('unlock.foundry.desc'), cost: { stone: 130, ore: 42 } },
  observatory: { name: t('unlock.observatory'), desc: t('unlock.observatory.desc'), cost: { stone: 240, ore: 110, crystal: 18 } }
};

// Repeatable: every level adds +1/s of each resource and x1.5 to all production.
export const ABUNDANCE = {
  name: t('engine.abundance'), desc: t('engine.abundance.desc'),
  baseCost: { mycelium: 2300, stone: 2300, ore: 1100, crystal: 120 },
  growth: 27,
  prodMult: 1.5
};

/* ----------------------------------------------------- refinery chains */

// Every level multiplies ALL production of its resource, from deposit
// extractors and converters alike. The multipliers compound.
export const REFINERIES = {
  mycelium: {
    name: t('refinery.mycelium'),
    levels: [
      { mult: 2, cost: { mycelium: 42 } },
      { mult: 2, cost: { mycelium: 130, stone: 21 } },
      { mult: 2, cost: { mycelium: 820, stone: 200 } },
      { mult: 2, cost: { mycelium: 54000, stone: 18000, ore: 900 } },
      { mult: 2, cost: { mycelium: 710000, stone: 240000, ore: 13000 } },
      { mult: 2, cost: { mycelium: 12000000, stone: 4000000, ore: 210000, crystal: 11000 } },
      { mult: 2, cost: { mycelium: 130000000, stone: 44000000, ore: 2100000, crystal: 120000 } },
      { mult: 2, cost: { mycelium: 660000000, stone: 220000000, ore: 8100000, crystal: 510000 } },
      { mult: 2, cost: { mycelium: 3300000000, stone: 1100000000, ore: 30000000, crystal: 1900000 } },
      { mult: 2, cost: { mycelium: 16000000000, stone: 5100000000, ore: 97000000, crystal: 6100000 } }
    ]
  },
  stone: {
    name: t('refinery.stone'),
    levels: [
      { mult: 2, cost: { mycelium: 42, stone: 28 } },
      { mult: 2, cost: { mycelium: 140, stone: 84 } },
      { mult: 2, cost: { mycelium: 5000, stone: 2500, ore: 100 } },
      { mult: 2, cost: { mycelium: 100000, stone: 46000, ore: 2300 } },
      { mult: 2, cost: { mycelium: 1200000, stone: 520000, ore: 28000 } },
      { mult: 2, cost: { mycelium: 22000000, stone: 9700000, ore: 540000, crystal: 13000 } },
      { mult: 2, cost: { mycelium: 260000000, stone: 110000000, ore: 5500000, crystal: 150000 } },
      { mult: 2, cost: { mycelium: 1100000000, stone: 480000000, ore: 19000000, crystal: 520000 } },
      { mult: 2, cost: { mycelium: 5700000000, stone: 2500000000, ore: 79000000, crystal: 1900000 } },
      { mult: 2, cost: { mycelium: 24000000000, stone: 11000000000, ore: 240000000, crystal: 4800000 } }
    ]
  },
  ore: {
    name: t('refinery.ore'),
    levels: [
      { mult: 2, cost: { mycelium: 56, stone: 42 } },
      { mult: 2, cost: { mycelium: 180, stone: 130, ore: 7 } },
      { mult: 2, cost: { mycelium: 12000, stone: 8400, ore: 460 } },
      { mult: 2, cost: { mycelium: 310000, stone: 220000, ore: 13000 } },
      { mult: 2, cost: { mycelium: 2400000, stone: 1800000, ore: 100000 } },
      { mult: 2, cost: { mycelium: 22000000, stone: 17000000, ore: 930000, crystal: 11000 } },
      { mult: 2, cost: { mycelium: 280000000, stone: 210000000, ore: 9800000, crystal: 140000 } },
      { mult: 2, cost: { mycelium: 940000000, stone: 740000000, ore: 27000000, crystal: 370000 } },
      { mult: 2, cost: { mycelium: 5800000000, stone: 4800000000, ore: 160000000, crystal: 1500000 } },
      { mult: 2, cost: { mycelium: 20000000000, stone: 16000000000, ore: 510000000, crystal: 3100000 } }
    ]
  },
  crystal: {
    name: t('refinery.crystal'),
    levels: [
      { mult: 2, cost: { stone: 84, ore: 28 } },
      { mult: 2, cost: { stone: 280, ore: 98, crystal: 4 } },
      { mult: 2, cost: { stone: 25000, ore: 8700, crystal: 310 } },
      { mult: 2, cost: { stone: 420000, ore: 150000, crystal: 5000 } },
      { mult: 2, cost: { stone: 8700000, ore: 3000000, crystal: 99000 } },
      { mult: 2, cost: { mycelium: 41000000, stone: 99000000, ore: 33000000, crystal: 1000000 } },
      { mult: 2, cost: { mycelium: 160000000, stone: 450000000, ore: 150000000, crystal: 4200000 } },
      { mult: 2, cost: { mycelium: 860000000, stone: 2300000000, ore: 790000000, crystal: 19000000 } },
      { mult: 2, cost: { mycelium: 3200000000, stone: 9100000000, ore: 3200000000, crystal: 65000000 } },
      { mult: 2, cost: { mycelium: 9600000000, stone: 27000000000, ore: 9600000000, crystal: 150000000 } }
    ]
  }
};

/* -------------------------------------------------------------- perks */

// Permanent perks bought with Insight; they survive embarking to a new world.
// Repeatable perks cost base + level; one-shots cost base.
export const PERKS = {
  legacy: { name: t('perk.legacy'), base: 1, repeat: true, desc: t('perk.legacy.desc') },
  memory: { name: t('perk.memory'), base: 1, repeat: false, desc: t('perk.memory.desc') },
  heirloom: { name: t('perk.heirloom'), base: 1, repeat: false, desc: t('perk.heirloom.desc') },
  cartographer: { name: t('perk.cartographer'), base: 2, repeat: false, desc: t('perk.cartographer.desc') },
  nomad: { name: t('perk.nomad'), base: 2, repeat: true, desc: t('perk.nomad.desc') }
};
