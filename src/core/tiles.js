/* Tile types and their rules. Behaviour is data: code asks TILE_INFO what a
 * tile does instead of comparing against specific types.
 *
 *   walk     the player can stand on it
 *   land     open surface ground where converters can be built
 *   sealed   no way between layers ever opens here, from above or below
 *            (home ground: kept for the stockpile)
 *   swim     walkable, but slow (water)
 *   harvest  gathering works it, lowering its richness by one for good
 *   solid    a harvestable tile you cannot stand on (underground rock); it must
 *            be chosen deliberately with a tap or a Trail, never auto-targeted
 *   res      the resource a harvest yields (none for plain soil)
 *   forage   what stands on it is never worked out (trees stay standing):
 *            you gather what grows at its foot, and that is what runs out
 *   cleared  the type a solid tile becomes once its richness reaches zero
 *   sweep    false keeps a Trail from harvesting it (the shaft needs a tap)
 *   descend  a way down: the player drops through it to the layer below
 *   rise     a way up: a ladder to the way down of the layer above
 *   height   how far its top stands above the layer's floor, in layers: walls
 *            and mountains reach the layer above, water sits a little low
 *   rough    how much the height varies from tile to tile (mountain peaks)
 *   find     a find hidden in the rock (see FINDS): digging it out pays its
 *            loot all at once, and it glints in the dark from a way off */

import { t } from '../i18n/i18n.js';

export const RESOURCES = ['mycelium', 'stone', 'ore', 'crystal'];
// Each resource's name, and its lowercase forms for use inside a sentence:
// as the subject (`lower`) and "of it" (`of`, the Lithuanian genitive).
export const RESOURCE_LABEL = Object.fromEntries(RESOURCES.map((r) => [r, t('res.' + r)]));
export const RESOURCE_LOWER = Object.fromEntries(RESOURCES.map((r) => [r, t('res.' + r + '.lower')]));
export const RESOURCE_OF = Object.fromEntries(RESOURCES.map((r) => [r, t('res.' + r + '.of')]));

// Values are stable: the surface ids match older saves and tests refer to them.
export const T = {
  // surface (z = 0)
  GRASS: 0, FOREST: 1, STONE: 2, ORE: 3, CRYSTAL: 4, WATER: 5, ROCK: 6,
  // underground (z < 0)
  TUNNEL: 7, SOIL: 8, STONE_SEAM: 9, ORE_SEAM: 10, CRYSTAL_SEAM: 11, SPORE_BED: 12,
  BEDROCK: 13, SHAFT: 14, SHAFT_OPEN: 15,
  // surface again: the clearing every world starts in
  HOME: 16,
  // underground finds
  CACHE: 17, GEODE: 18,
  // the generated ways between layers: a cave mouth in the forest, and the
  // foot of the ladder up beneath every way down
  CAVE: 19, RISE: 20,
  // surface: the borders between regions people built, a dry stone wall
  // and a living hedge (see regions.js)
  WALL: 21, HEDGE: 22
};

// Each type's name, and the key a texture pack knows it by (look id "tile.<key>").
export const TILE_NAME = [];
export const TILE_KEY = [];
[
  [T.GRASS, 'grass'], [T.FOREST, 'forest'], [T.STONE, 'stone'],
  [T.ORE, 'ore'], [T.CRYSTAL, 'crystal'], [T.WATER, 'water'],
  [T.ROCK, 'mountain'], [T.TUNNEL, 'tunnel'], [T.SOIL, 'soil'],
  [T.STONE_SEAM, 'stone-seam'], [T.ORE_SEAM, 'ore-seam'],
  [T.CRYSTAL_SEAM, 'crystal-seam'], [T.SPORE_BED, 'spore-bed'],
  [T.BEDROCK, 'bedrock'], [T.SHAFT, 'shaft'], [T.SHAFT_OPEN, 'shaft-open'],
  [T.HOME, 'home'], [T.CACHE, 'cache'], [T.GEODE, 'geode'],
  [T.CAVE, 'cave'], [T.RISE, 'rise'], [T.WALL, 'wall'], [T.HEDGE, 'hedge']
].forEach(([type, key]) => { TILE_KEY[type] = key; TILE_NAME[type] = t('tile.' + key); });

export const TILE_INFO = [];
TILE_INFO[T.GRASS] = { walk: true, land: true };
TILE_INFO[T.FOREST] = { walk: true, land: true, harvest: true, res: 'mycelium', forage: true };
TILE_INFO[T.STONE] = { walk: true, land: true, harvest: true, res: 'stone' };
TILE_INFO[T.ORE] = { walk: true, land: true, harvest: true, res: 'ore' };
TILE_INFO[T.CRYSTAL] = { walk: true, land: true, harvest: true, res: 'crystal' };
TILE_INFO[T.WATER] = { walk: true, swim: true, height: -0.15 };
TILE_INFO[T.ROCK] = { height: 1, rough: 0.6 };
TILE_INFO[T.TUNNEL] = { walk: true };
TILE_INFO[T.SOIL] = { harvest: true, solid: true, cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.STONE_SEAM] = { harvest: true, solid: true, res: 'stone', cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.ORE_SEAM] = { harvest: true, solid: true, res: 'ore', cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.CRYSTAL_SEAM] = { harvest: true, solid: true, res: 'crystal', cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.SPORE_BED] = { harvest: true, solid: true, res: 'mycelium', cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.BEDROCK] = { cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.SHAFT] = { harvest: true, solid: true, sweep: false, cleared: T.SHAFT_OPEN, height: 1 };
TILE_INFO[T.SHAFT_OPEN] = { walk: true, descend: true };
TILE_INFO[T.HOME] = { walk: true, sealed: true };
TILE_INFO[T.CACHE] = { harvest: true, solid: true, find: true, cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.GEODE] = { harvest: true, solid: true, find: true, cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.CAVE] = { walk: true, descend: true };
TILE_INFO[T.RISE] = { walk: true, rise: true };
TILE_INFO[T.WALL] = { height: 0.5 };
TILE_INFO[T.HEDGE] = { height: 0.7 };

// The lowest and highest a tile's top can sit above its layer's floor.
export const RELIEF_MIN = Math.min(...TILE_INFO.map((i) => (i.height || 0) - (i.rough || 0) / 2));
export const RELIEF_MAX = Math.max(...TILE_INFO.map((i) => (i.height || 0) + (i.rough || 0) / 2));

export function isWalkable(t) {
  return !!TILE_INFO[t].walk;
}
