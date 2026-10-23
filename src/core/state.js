/* The game state, and the prestige loop that replaces it with a fresh world. */

import {newCultivation} from './cultivation.js';
import { economyForState } from './economy-context.js';
import { SURFACE } from './coords.js';
import { RESOURCES } from './tiles.js';
import { createWorld, findSpawn, markExplored } from './world.js';
import { HOME_HALF } from './terrain.js';
import { UNLOCKS, PERKS, EMBARK_MIN_TOTAL } from './content.js';
import { SOURCES } from './economy.js';
import { revealAround } from './sim.js';
import { worldMastered } from './upgrades.js';
import { t } from '../i18n/i18n.js';

const HOME_VIEW = 6; // tiles of land around home ground in view from the start

/**
 * @typedef {{x: number, y: number, z: number}} Position
 * @typedef {object} Extractor
 * @property {string} key      an EXTRACTORS id
 * @property {string} res
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} buffer   produced units waiting to be collected
 * @typedef {object} State
 * @property {number} seed
 * @property {import('./world.js').World} world
 * @property {Position} player
 * @property {Record<string, number>} inv
 * @property {Record<string, number>} tools        tool levels; 0 means uncrafted, 1 is legacy basic gear
 * @property {Record<string, boolean>} unlocks
 * @property {Record<string, number>} resUp        refinery chain levels
 * @property {number} abundanceLv
 * @property {number} insight
 * @property {number} prestiges
 * @property {number} totalEver                    resources gathered in earlier worlds
 * @property {Record<string, number>} perks        perk levels (one-shots are 0 or 1)
 * @property {Extractor[]} extractors
 * @property {Record<string, number>} stats
 * @property {{ore: boolean, crystal: boolean}} discovered
 * @property {string[]} goalsDone
 * @property {number} goalIndex
 * @property {number} time                         game seconds
 * @property {number} battery                      your device's charge, 0 (flat) to 1 (full)
 * @property {number} [seen]                     when this world was last open (ms since 1970, set by the game: core keeps no clock)
 * @property {{deepest: number}} underground     the deepest layer reached so far
 * @property {string} [shared]                   the room of a shared world (not set when alone)
 * @property {string} [me]                       your id in that room; your buildings carry it
 * @property {Array<{res: string, amt: number, x: number, y: number, z: number}>} events
 *           transient (never saved): auto-collections for the UI to animate
 */

function perResource(value) {
  return Object.fromEntries(RESOURCES.map((r) => [r, value]));
}

/** @returns {State} */
export function createState(seed, {cultivation=false}={}) {
  const world = createWorld(seed,cultivation);
  const spawn = findSpawn(world);
  const s = blankState(world, { x: spawn.x + 0.5, y: spawn.y + 0.5, z: SURFACE });
  if(cultivation){s.cultivation=newCultivation();s.logisticsModel='depot-v1';}
  // Home ground, where your stockpile stands, is in view from the start, and
  // the land just around it, so there's something to go and gather.
  const r = HOME_HALF + HOME_VIEW;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) markExplored(world, x, y, SURFACE);
  revealAround(s);
  return s;
}

// A state with nothing done yet, in `world`, standing at `player`. Cheap: it
// looks at no land (the room's copies of players start from these).
export function blankState(world, player = { x: 0.5, y: 0.5, z: SURFACE }) {
  return {
    seed: world.seed,
    emptyStart: true,
    world,
    player,
    inv: perResource(0),
    tools: { basket: 0, pickaxe: 0, boots: 0, overclock: 0 },
    unlocks: Object.fromEntries(Object.keys(UNLOCKS).map((k) => [k, false])),
    resUp: perResource(0),
    abundanceLv: 0,
    insight: 0,
    prestiges: 0,
    totalEver: 0,
    perks: Object.fromEntries(Object.keys(PERKS).map((k) => [k, 0])),
    extractors: [],
    stats: { ...perResource(0), foraged: 0, gathers: 0, finds: 0, collected: 0, built: 0, playedMs: 0 },
    // Where this world's resources came from ({res: {source: amount}}), how
    // much of each kind of mushroom you've picked here, and every kind you've
    // ever found, in any world.
    sources: Object.fromEntries(RESOURCES.map((r) => [r, Object.fromEntries(Object.keys(SOURCES).map((k) => [k, 0]))])),
    mushrooms: {},
    mushroomsEver: [],
    discovered: { ore: false, crystal: false },
    goalsDone: [],  // milestone ids, in the order reached
    goalIndex: 0,   // how many: goalsDone.length
    time: 0,
    battery: 1,     // the device's charge, 0..1 (battery.js)
    underground: { deepest: SURFACE },
    events: []
  };
}

/* -------------------------------------------------------------- prestige */

// Resources gathered (or produced) in the current world.
export function worldTotal(s) {
  economyForState(s)?.settle();
  return RESOURCES.reduce((n, r) => n + s.stats[r], 0);
}

// Every resource ever gathered, across all worlds.
export function lifetimeTotal(s) {
  return s.totalEver + worldTotal(s);
}

// Insight for embarking: 22 for one world's worth (EMBARK_MIN_TOTAL), and the
// square root of the lifetime total in worlds' worth after that.
export function embarkGain(s) {
  return Math.floor(Math.sqrt(500 * lifetimeTotal(s) / EMBARK_MIN_TOTAL));
}

// Eligibility counts this world's upgrades only. Finishing mastery ends the
// world immediately; there is no production-total waiting gate afterward.
// The Insight reward still uses the lifetime total.
// Never in a shared world: Embark is for playing alone.
export function canEmbark(s) {
  return !s.shared && (s.cultivation ? s.cultivation.completed===true : worldMastered(s));
}

// Starts empty-handed, keeping lifetime records and known mushroom kinds.
export function embark(s, seed) {
  if (!canEmbark(s)) return { ok: false, reason: t('reason.embark') };
  const gained = embarkGain(s);
  const fresh = createState(seed,{cultivation:!!s.cultivation});
  if (s.logisticsModel) fresh.logisticsModel=s.logisticsModel;
  // New worlds carry records and knowledge only, never equipment or bonuses.
  // The old world retains its Insight and perks in its preserved save.
  fresh.prestiges = s.prestiges + 1;
  fresh.totalEver = lifetimeTotal(s);
  fresh.mushroomsEver = [...s.mushroomsEver];
  revealAround(fresh);
  return { ok: true, state: fresh, gained };
}
