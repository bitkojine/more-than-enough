/* Game content and tuning: everything a designer tweaks lives here as data. */

import { T } from './tiles.js';
import { t } from '../i18n/i18n.js';

/* ------------------------------------------------------------- tuning */

export const EXPLORE_RADIUS = 6;
export const MINE_EXPLORE_RADIUS = 3; // underground you only see the rock close by
export const CLIFF_LAYERS = 8;        // layers a cliff at the edge of the known world shows before fading
export const REACH = 1.65;            // how far the player can gather, dig or build
export const COLLECT_RANGE = 1.7;
// Logistics auto-collects whole units from any extractor within this many
// tiles. Wider than manual collection so a few camps packed in your base all
// feed you at once — but walk away and they just buffer up.
export const AUTO_COLLECT_RANGE = 3.0;
export const BASE_SPEED = 3.7;
export const SWIM_SPEED = 0.75;       // multiplier on water
export const PLAYER_RADIUS = 0.3;
export const DAY_LENGTH = 240;        // seconds of game time per day-night cycle
export const REGROW_RADIUS = 20;      // only tiles near the player regrow
export const REGROW_INTERVAL = 0.5;
export const REGROW_CHANCE = 0.02;
export const EXTRACTOR_GROWTH = 1.65; // each extra extractor of a kind costs this much more
// Embarking is the end of a world, not a step in it: every tool, refinery and
// unlock at its top level, the Abundance Engine at EMBARK_ABUNDANCE, and this
// much gathered in the world.
export const EMBARK_MIN_TOTAL = 1000000;
export const EMBARK_ABUNDANCE = 5;

/* -------------------------------------------------------------- props */

// Things you place on the tunnel floor where you stand, one per tile, in the
// mine only. `light` is how far it lights, in tiles (the lantern reaches 1.7);
// a `beacon` shows through the dark from anywhere on screen, to find your way
// back by.
export const PROPS = {
  glowcap: { name: t('prop.glowcap'), cost: { mycelium: 3 }, light: 4.5, does: t('prop.glowcap.does') },
  lamp: { name: t('prop.lamp'), cost: { stone: 8, crystal: 1 }, light: 8, does: t('prop.lamp.does') },
  flag: { name: t('prop.flag'), cost: { mycelium: 2 }, beacon: true, does: t('prop.flag.does') }
};

/* -------------------------------------------------------------- finds */

// Things hidden in the rock, a few to every 16x16 area of each layer, that
// glint in the dark from GLINT_RANGE tiles away so there is always something
// close to dig toward. Digging one out pays its loot at once: each amount is
// multiplied by the layer number and by your Basket or Pickaxe yield for that
// resource, so deeper finds and better tools pay more. A find shows from
// layer `from` down.
export const FINDS_PER_CHUNK = 3;
export const GLINT_RANGE = 9;
export const FINDS = {
  [T.CACHE]: { name: t('tile.cache'), loot: { mycelium: 8, stone: 6, ore: 2 }, from: 1 },
  [T.GEODE]: { name: t('tile.geode'), loot: { stone: 4, crystal: 1 }, from: 2 }
};

/* -------------------------------------------------------------- tools */

// Level 1 is what you start with; each later level has a cost.
export const TOOLS = {
  basket: {
    name: t('tool.basket'), desc: t('tool.basket.desc'),
    levels: [
      { yield: 1 },
      { yield: 2, cost: { mycelium: 6 } },
      { yield: 4, cost: { mycelium: 22, stone: 8 } },
      { yield: 8, cost: { mycelium: 70, stone: 30 } },
      { yield: 16, cost: { mycelium: 220, stone: 110 } },
      { yield: 32, cost: { mycelium: 650, stone: 320 } }
    ]
  },
  pickaxe: {
    name: t('tool.pickaxe'), desc: t('tool.pickaxe.desc'),
    levels: [
      { yield: 1 },
      { yield: 2, cost: { mycelium: 10, stone: 6 } },
      { yield: 4, cost: { mycelium: 30, stone: 24 } },
      { yield: 8, cost: { mycelium: 80, stone: 90, ore: 6 } },
      { yield: 16, cost: { mycelium: 200, stone: 260, ore: 30 } },
      { yield: 32, cost: { mycelium: 520, stone: 700, ore: 110 } }
    ]
  },
  boots: {
    name: t('tool.boots'), desc: t('tool.boots.desc'),
    levels: [
      { mult: 1.0 },
      { mult: 1.3, cost: { mycelium: 8 } },
      { mult: 1.6, cost: { mycelium: 26, stone: 12 } },
      { mult: 2.0, cost: { mycelium: 70, stone: 45 } },
      { mult: 2.5, cost: { mycelium: 180, stone: 140, ore: 12 } }
    ]
  },
  overclock: {
    name: t('tool.overclock'), desc: t('tool.overclock.desc'),
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

/* --------------------------------------------------------- extractors */

// Deposit extractors sit on a matching surface tile. Converters (tile: null)
// need a blueprint and synthesize their resource on any open land.
export const EXTRACTORS = {
  garden: { name: t('building.garden'), tile: T.FOREST, res: 'mycelium', rate: 0.6, buffer: 60, baseCost: { mycelium: 15 } },
  quarry: { name: t('building.quarry'), tile: T.STONE, res: 'stone', rate: 0.45, buffer: 60, baseCost: { mycelium: 30, stone: 15 } },
  mine: { name: t('building.mine'), tile: T.ORE, res: 'ore', rate: 0.32, buffer: 50, baseCost: { stone: 45, ore: 12 } },
  resonator: { name: t('building.resonator'), tile: T.CRYSTAL, res: 'crystal', rate: 0.09, buffer: 30, baseCost: { stone: 140, ore: 70, crystal: 6 } },
  compost: { name: t('building.compost'), tile: null, res: 'mycelium', rate: 0.5, buffer: 60, baseCost: { mycelium: 120, stone: 25 }, unlock: 'compost' },
  brickyard: { name: t('building.brickyard'), tile: null, res: 'stone', rate: 0.38, buffer: 60, baseCost: { mycelium: 150, stone: 90 }, unlock: 'brickyard' },
  foundry: { name: t('building.foundry'), tile: null, res: 'ore', rate: 0.3, buffer: 50, baseCost: { mycelium: 220, stone: 170, ore: 60 }, unlock: 'foundry' },
  observatory: { name: t('building.observatory'), tile: null, res: 'crystal', rate: 0.11, buffer: 30, baseCost: { mycelium: 380, stone: 400, ore: 160, crystal: 22 }, unlock: 'observatory' }
};

export const DEPOSIT_EXTRACTORS = Object.keys(EXTRACTORS).filter((k) => EXTRACTORS[k].tile !== null);
export const CONVERTERS = Object.keys(EXTRACTORS).filter((k) => EXTRACTORS[k].tile === null);

/* ------------------------------------------------------------ unlocks */

// One-time purchases.
export const UNLOCKS = {
  logistics: { name: t('unlock.logistics'), desc: t('unlock.logistics.desc'), cost: { stone: 150, ore: 40 } },
  compost: { name: t('unlock.compost'), desc: t('unlock.compost.desc'), cost: { mycelium: 150, stone: 40 } },
  brickyard: { name: t('unlock.brickyard'), desc: t('unlock.brickyard.desc'), cost: { mycelium: 220, stone: 120 } },
  foundry: { name: t('unlock.foundry'), desc: t('unlock.foundry.desc'), cost: { stone: 180, ore: 60 } },
  observatory: { name: t('unlock.observatory'), desc: t('unlock.observatory.desc'), cost: { stone: 340, ore: 150, crystal: 26 } }
};

// Repeatable: every level adds +1/s of each resource and x1.5 to all production.
export const ABUNDANCE = {
  name: t('engine.abundance'), desc: t('engine.abundance.desc'),
  baseCost: { mycelium: 1500, stone: 1500, ore: 750, crystal: 80 },
  growth: 2.4,
  prodMult: 1.5
};

/* ----------------------------------------------------- refinery chains */

// Every level multiplies ALL production of its resource, from deposit
// extractors and converters alike. The multipliers compound.
export const REFINERIES = {
  mycelium: {
    name: t('refinery.mycelium'),
    levels: [
      { mult: 2, cost: { mycelium: 60 } },
      { mult: 2, cost: { mycelium: 180, stone: 30 } },
      { mult: 2, cost: { mycelium: 480, stone: 120 } },
      { mult: 3, cost: { mycelium: 1200, stone: 400, ore: 20 } },
      { mult: 3, cost: { mycelium: 3200, stone: 1100, ore: 60 } },
      { mult: 3, cost: { mycelium: 9000, stone: 3000, ore: 160, crystal: 8 } },
      { mult: 4, cost: { mycelium: 26000, stone: 9000, ore: 420, crystal: 24 } },
      { mult: 4, cost: { mycelium: 90000, stone: 30000, ore: 1100, crystal: 70 } },
      { mult: 5, cost: { mycelium: 350000, stone: 120000, ore: 3200, crystal: 200 } },
      { mult: 6, cost: { mycelium: 1600000, stone: 500000, ore: 9500, crystal: 600 } }
    ]
  },
  stone: {
    name: t('refinery.stone'),
    levels: [
      { mult: 2, cost: { mycelium: 60, stone: 40 } },
      { mult: 2, cost: { mycelium: 200, stone: 120 } },
      { mult: 2, cost: { mycelium: 600, stone: 300, ore: 12 } },
      { mult: 3, cost: { mycelium: 1800, stone: 800, ore: 40 } },
      { mult: 3, cost: { mycelium: 5500, stone: 2400, ore: 130 } },
      { mult: 3, cost: { mycelium: 17000, stone: 7500, ore: 420, crystal: 10 } },
      { mult: 4, cost: { mycelium: 60000, stone: 26000, ore: 1300, crystal: 35 } },
      { mult: 4, cost: { mycelium: 240000, stone: 100000, ore: 4000, crystal: 110 } },
      { mult: 5, cost: { mycelium: 1000000, stone: 450000, ore: 14000, crystal: 340 } },
      { mult: 6, cost: { mycelium: 5000000, stone: 2200000, ore: 50000, crystal: 1000 } }
    ]
  },
  ore: {
    name: t('refinery.ore'),
    levels: [
      { mult: 2, cost: { mycelium: 80, stone: 60 } },
      { mult: 2, cost: { mycelium: 260, stone: 180, ore: 10 } },
      { mult: 2, cost: { mycelium: 800, stone: 550, ore: 30 } },
      { mult: 3, cost: { mycelium: 2400, stone: 1700, ore: 100 } },
      { mult: 3, cost: { mycelium: 7500, stone: 5500, ore: 320 } },
      { mult: 3, cost: { mycelium: 24000, stone: 18000, ore: 1000, crystal: 12 } },
      { mult: 4, cost: { mycelium: 90000, stone: 70000, ore: 3200, crystal: 45 } },
      { mult: 4, cost: { mycelium: 380000, stone: 300000, ore: 11000, crystal: 150 } },
      { mult: 5, cost: { mycelium: 1800000, stone: 1500000, ore: 50000, crystal: 480 } },
      { mult: 6, cost: { mycelium: 10000000, stone: 8000000, ore: 250000, crystal: 1500 } }
    ]
  },
  crystal: {
    name: t('refinery.crystal'),
    levels: [
      { mult: 2, cost: { stone: 120, ore: 40 } },
      { mult: 2, cost: { stone: 400, ore: 140, crystal: 5 } },
      { mult: 2, cost: { stone: 1300, ore: 450, crystal: 16 } },
      { mult: 3, cost: { stone: 4200, ore: 1500, crystal: 50 } },
      { mult: 3, cost: { stone: 14000, ore: 4800, crystal: 160 } },
      { mult: 3, cost: { mycelium: 20000, stone: 48000, ore: 16000, crystal: 500 } },
      { mult: 4, cost: { mycelium: 60000, stone: 170000, ore: 56000, crystal: 1600 } },
      { mult: 4, cost: { mycelium: 240000, stone: 650000, ore: 220000, crystal: 5200 } },
      { mult: 5, cost: { mycelium: 1000000, stone: 2800000, ore: 1000000, crystal: 20000 } },
      { mult: 6, cost: { mycelium: 5000000, stone: 14000000, ore: 5000000, crystal: 80000 } }
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
