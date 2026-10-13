/* Tile types and their rules. Behaviour is data: code asks TILE_INFO what a
 * tile does instead of comparing against specific types.
 *
 *   walk     the player can stand on it
 *   land     open surface ground where converters can be built
 *   dig      surface ground you can dig a hole down through
 *   swim     walkable, but slow (water)
 *   harvest  the Gather action works it, lowering its richness by one
 *   solid    a harvestable tile you cannot stand on (underground rock); it must
 *            be chosen deliberately with a tap or a Trail, never auto-targeted
 *   res      the resource a harvest yields (none for plain soil)
 *   regrows  richness creeps back up near the player
 *   cleared  the type a solid tile becomes once its richness reaches zero
 *   sweep    false keeps a Trail from harvesting it (the shaft needs a tap)
 *   descend  standing next to it lets the player drop to the layer below
 *   height   how far its top stands above the layer's floor, in layers: walls
 *            and mountains reach the layer above, water sits a little low
 *   rough    how much the height varies from tile to tile (mountain peaks)
 *   yard     the stockpile can stand on it; the number is how many tiles
 *            further out it would rather go to avoid it (0 = home ground,
 *            used first). Without it, no piles stand there: never on
 *            anything you can gather, so piles never hide a resource */

export const RESOURCES = ['wood', 'stone', 'ore', 'crystal'];
export const RESOURCE_LABEL = { wood: 'Wood', stone: 'Stone', ore: 'Ore', crystal: 'Crystal' };

// Values are stable: the surface ids match older saves and tests refer to them.
export const T = {
  // surface (z = 0)
  GRASS: 0, FOREST: 1, STONE: 2, ORE: 3, CRYSTAL: 4, WATER: 5, ROCK: 6,
  // underground (z < 0)
  TUNNEL: 7, SOIL: 8, STONE_SEAM: 9, ORE_SEAM: 10, CRYSTAL_SEAM: 11, FOSSIL: 12,
  BEDROCK: 13, SHAFT: 14, SHAFT_OPEN: 15,
  // surface again: the clearing every world starts in
  HOME: 16
};

// Each type's name, and the key a texture pack knows it by (look id "tile.<key>").
export const TILE_NAME = [];
export const TILE_KEY = [];
[
  [T.GRASS, 'grass', 'Grass'], [T.FOREST, 'forest', 'Forest'], [T.STONE, 'stone', 'Stone'],
  [T.ORE, 'ore', 'Ore'], [T.CRYSTAL, 'crystal', 'Crystal'], [T.WATER, 'water', 'Water'],
  [T.ROCK, 'mountain', 'Mountain'], [T.TUNNEL, 'tunnel', 'Tunnel'], [T.SOIL, 'soil', 'Soil'],
  [T.STONE_SEAM, 'stone-seam', 'Stone seam'], [T.ORE_SEAM, 'ore-seam', 'Ore seam'],
  [T.CRYSTAL_SEAM, 'crystal-seam', 'Crystal seam'], [T.FOSSIL, 'fossil', 'Fossil'],
  [T.BEDROCK, 'bedrock', 'Bedrock'], [T.SHAFT, 'shaft', 'Shaft'], [T.SHAFT_OPEN, 'shaft-open', 'Open shaft'],
  [T.HOME, 'home', 'Home ground']
].forEach(([t, key, name]) => { TILE_KEY[t] = key; TILE_NAME[t] = name; });

export const TILE_INFO = [];
TILE_INFO[T.GRASS] = { walk: true, land: true, dig: true, yard: 3 };
TILE_INFO[T.FOREST] = { walk: true, land: true, dig: true, harvest: true, res: 'wood', regrows: true };
TILE_INFO[T.STONE] = { walk: true, land: true, dig: true, harvest: true, res: 'stone', regrows: true };
TILE_INFO[T.ORE] = { walk: true, land: true, dig: true, harvest: true, res: 'ore' };
TILE_INFO[T.CRYSTAL] = { walk: true, land: true, dig: true, harvest: true, res: 'crystal' };
TILE_INFO[T.WATER] = { walk: true, swim: true, height: -0.15 };
TILE_INFO[T.ROCK] = { height: 1, rough: 0.6 };
TILE_INFO[T.TUNNEL] = { walk: true };
TILE_INFO[T.SOIL] = { harvest: true, solid: true, cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.STONE_SEAM] = { harvest: true, solid: true, res: 'stone', cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.ORE_SEAM] = { harvest: true, solid: true, res: 'ore', cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.CRYSTAL_SEAM] = { harvest: true, solid: true, res: 'crystal', cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.FOSSIL] = { harvest: true, solid: true, res: 'wood', cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.BEDROCK] = { cleared: T.TUNNEL, height: 1 };
TILE_INFO[T.SHAFT] = { harvest: true, solid: true, sweep: false, cleared: T.SHAFT_OPEN, height: 1 };
TILE_INFO[T.SHAFT_OPEN] = { walk: true, descend: true };
TILE_INFO[T.HOME] = { walk: true, dig: true, yard: 0 };

// The lowest and highest a tile's top can sit above its layer's floor.
export const RELIEF_MIN = Math.min(...TILE_INFO.map((i) => (i.height || 0) - (i.rough || 0) / 2));
export const RELIEF_MAX = Math.max(...TILE_INFO.map((i) => (i.height || 0) + (i.rough || 0) / 2));

export function isWalkable(t) {
  return !!TILE_INFO[t].walk;
}
