/* Tile types and their rules. Behaviour is data: code asks TILE_INFO what a
 * tile does instead of comparing against specific types.
 *
 *   walk     the player can stand on it
 *   land     open surface ground where converters can be built
 *   swim     walkable, but slow (water)
 *   harvest  the Gather action works it, lowering its richness by one
 *   solid    a harvestable tile you cannot stand on (underground rock); it must
 *            be chosen deliberately with a tap or a Trail, never auto-targeted
 *   res      the resource a harvest yields (none for plain soil)
 *   regrows  richness creeps back up near the player
 *   cleared  the type a solid tile becomes once its richness reaches zero
 *   sweep    false keeps a Trail from harvesting it (the shaft needs a tap)
 *   descend  standing next to it lets the player drop to the layer below */

export const RESOURCES = ['wood', 'stone', 'ore', 'crystal'];
export const RESOURCE_LABEL = { wood: 'Wood', stone: 'Stone', ore: 'Ore', crystal: 'Crystal' };
export const RESOURCE_ICON = { wood: '\u{1FAB5}', stone: '\u{1FAA8}', ore: '⛏️', crystal: '\u{1F4A0}' };

// Values are stable: the surface ids match older saves and tests refer to them.
export const T = {
  // surface (z = 0)
  GRASS: 0, FOREST: 1, STONE: 2, ORE: 3, CRYSTAL: 4, WATER: 5, ROCK: 6,
  // underground (z < 0)
  TUNNEL: 7, SOIL: 8, STONE_SEAM: 9, ORE_SEAM: 10, CRYSTAL_SEAM: 11, FOSSIL: 12,
  BEDROCK: 13, SHAFT: 14, SHAFT_OPEN: 15
};

export const TILE_INFO = [];
TILE_INFO[T.GRASS] = { walk: true, land: true };
TILE_INFO[T.FOREST] = { walk: true, land: true, harvest: true, res: 'wood', regrows: true };
TILE_INFO[T.STONE] = { walk: true, land: true, harvest: true, res: 'stone', regrows: true };
TILE_INFO[T.ORE] = { walk: true, land: true, harvest: true, res: 'ore' };
TILE_INFO[T.CRYSTAL] = { walk: true, land: true, harvest: true, res: 'crystal' };
TILE_INFO[T.WATER] = { walk: true, swim: true };
TILE_INFO[T.ROCK] = {};
TILE_INFO[T.TUNNEL] = { walk: true };
TILE_INFO[T.SOIL] = { harvest: true, solid: true, cleared: T.TUNNEL };
TILE_INFO[T.STONE_SEAM] = { harvest: true, solid: true, res: 'stone', cleared: T.TUNNEL };
TILE_INFO[T.ORE_SEAM] = { harvest: true, solid: true, res: 'ore', cleared: T.TUNNEL };
TILE_INFO[T.CRYSTAL_SEAM] = { harvest: true, solid: true, res: 'crystal', cleared: T.TUNNEL };
TILE_INFO[T.FOSSIL] = { harvest: true, solid: true, res: 'wood', cleared: T.TUNNEL };
TILE_INFO[T.BEDROCK] = { cleared: T.TUNNEL };
TILE_INFO[T.SHAFT] = { harvest: true, solid: true, sweep: false, cleared: T.SHAFT_OPEN };
TILE_INFO[T.SHAFT_OPEN] = { walk: true, descend: true };

export function isWalkable(t) {
  return !!TILE_INFO[t].walk;
}
