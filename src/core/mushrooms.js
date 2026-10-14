/* Mushrooms: the kinds of mycelium you can find. Every forest tile grows one
 * kind at the trees' feet, chosen from what that kind of forest grows; every
 * spore bed in the mine holds one kind of cave mushroom. The kind is a pure
 * function of the seed and the tile, so it never changes as a patch is
 * foraged bare and grows back. Each kind pays mycelium alike: what you collect
 * is the kinds themselves, counted in the Collected sheet.
 *
 *   where   'forest' (the floor under the trees) or 'cave' (spore beds)
 *   kinds   the forest kinds it grows in (forest only)
 *   from    the shallowest mine layer it grows on (cave only)
 *   weight  how common it is where it grows, against the others there
 *   magic   a rare, strange one */

import { T } from './tiles.js';
import { hash2 } from './noise.js';
import { forestKind } from './terrain.js';

const ALL = ['pine', 'birch', 'oak', 'maple', 'mixed'];

export const MUSHROOMS = {
  flyAgaric: { name: 'Fly agaric', where: 'forest', kinds: ['pine', 'birch', 'mixed'], weight: 5, does: 'Red with white spots, the storybook toadstool. Under pines and birches.' },
  pennyBun: { name: 'Penny bun', where: 'forest', kinds: ['oak', 'pine', 'mixed'], weight: 5, does: 'A fat brown cap on a stout stalk. Under oaks and pines.' },
  chanterelle: { name: 'Chanterelle', where: 'forest', kinds: ['birch', 'oak', 'pine', 'mixed'], weight: 5, does: 'Golden funnels that smell of apricots.' },
  honey: { name: 'Honey fungus', where: 'forest', kinds: ['birch', 'pine', 'mixed'], weight: 3, does: 'Amber caps in a crowded clump.' },
  parasol: { name: 'Parasol', where: 'forest', kinds: ['maple', 'oak', 'mixed'], weight: 4, does: 'A tall stalk under a wide, scaly umbrella.' },
  oyster: { name: 'Oyster mushroom', where: 'forest', kinds: ['oak', 'maple', 'birch'], weight: 3, does: 'Grey shelves stacked one over another.' },
  inkCap: { name: 'Shaggy ink cap', where: 'forest', kinds: ['mixed', 'birch', 'maple'], weight: 3, does: 'Tall white shaggy caps that melt to ink.' },
  puffball: { name: 'Puffball', where: 'forest', kinds: ['mixed', 'maple', 'birch'], weight: 3, does: 'White balls that puff out a cloud of spores.' },
  morel: { name: 'Morel', where: 'forest', kinds: ['maple', 'oak'], weight: 2, does: 'A honeycombed cone. Warm country only.' },
  milkCap: { name: 'Indigo milk cap', where: 'forest', kinds: ['pine', 'oak'], weight: 1.5, does: 'Blue right through, even its milk. Uncommon.' },
  libertyCap: { name: 'Liberty cap', where: 'forest', kinds: ALL, weight: 0.4, magic: true, does: 'A little pointed cap that shimmers. Magic, and rare in any forest.' },
  moonCap: { name: 'Moonlight cap', where: 'forest', kinds: ALL, weight: 0.2, magic: true, does: 'Glows violet in the shade. Magic, and the rarest thing in the forest.' },
  glowcap: { name: 'Glowcap', where: 'cave', from: 1, weight: 5, does: 'The cave mushroom that lights the dark, found in spore beds.' },
  ghost: { name: 'Ghost fungus', where: 'cave', from: 1, weight: 3, does: 'Pale fans with a cold green glow.' },
  crystalCap: { name: 'Crystal cap', where: 'cave', from: 7, weight: 1, magic: true, does: 'Grown half into crystal. Magic, and only in the deepest spore beds.' }
};

export const MUSHROOM_KEYS = Object.keys(MUSHROOMS);

function pick(keys, h) {
  const total = keys.reduce((n, k) => n + MUSHROOMS[k].weight, 0);
  let x = h * total;
  for (const k of keys) if ((x -= MUSHROOMS[k].weight) < 0) return k;
  return keys[keys.length - 1];
}

// What grows in a forest of kind `kind`, and in a spore bed on mine layer `layer`.
export const forestMushrooms = (kind) => MUSHROOM_KEYS.filter((k) => MUSHROOMS[k].where === 'forest' && MUSHROOMS[k].kinds.includes(kind));
export const caveMushrooms = (layer) => MUSHROOM_KEYS.filter((k) => MUSHROOMS[k].where === 'cave' && layer >= MUSHROOMS[k].from);

// The kind of mushroom growing on tile (x, y, z) of type `type`, or null.
export function mushroomAt(seed, type, x, y, z) {
  if (type === T.FOREST) return pick(forestMushrooms(forestKind(seed, x, y)), hash2(x, y, seed + 7331));
  if (type === T.SPORE_BED) return pick(caveMushrooms(-z), hash2(x + z * 131, y, seed + 7333));
  return null;
}
