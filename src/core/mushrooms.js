/* Mushrooms: the kinds of mycelium you can find. Every forest tile grows one
 * kind at the trees' feet, chosen from what that kind of forest grows; every
 * spore bed in the mine holds one kind of cave mushroom. The kind is a pure
 * function of the seed and the tile, so it never changes as a patch is
 * foraged bare and grows back. Each kind pays mycelium alike: what you collect
 * is the kinds themselves, counted in the earnings statement.
 *
 *   where   'forest' (the floor under the trees) or 'cave' (spore beds)
 *   kinds   the forest kinds it grows in (forest only)
 *   from    the shallowest mine layer it grows on (cave only)
 *   weight  how common it is where it grows, against the others there
 *   magic   a rare, strange one */

import { T } from './tiles.js';
import { hash2 } from './noise.js';
import { forestKind } from './terrain.js';
import { t } from '../i18n/i18n.js';

const ALL = ['pine', 'birch', 'oak', 'maple', 'mixed'];

export const MUSHROOMS = {
  flyAgaric: { name: t('mushroom.flyAgaric'), where: 'forest', kinds: ['pine', 'birch', 'mixed'], weight: 5, does: t('mushroom.flyAgaric.does') },
  pennyBun: { name: t('mushroom.pennyBun'), where: 'forest', kinds: ['oak', 'pine', 'mixed'], weight: 5, does: t('mushroom.pennyBun.does') },
  chanterelle: { name: t('mushroom.chanterelle'), where: 'forest', kinds: ['birch', 'oak', 'pine', 'mixed'], weight: 5, does: t('mushroom.chanterelle.does') },
  honey: { name: t('mushroom.honey'), where: 'forest', kinds: ['birch', 'pine', 'mixed'], weight: 3, does: t('mushroom.honey.does') },
  parasol: { name: t('mushroom.parasol'), where: 'forest', kinds: ['maple', 'oak', 'mixed'], weight: 4, does: t('mushroom.parasol.does') },
  oyster: { name: t('mushroom.oyster'), where: 'forest', kinds: ['oak', 'maple', 'birch'], weight: 3, does: t('mushroom.oyster.does') },
  inkCap: { name: t('mushroom.inkCap'), where: 'forest', kinds: ['mixed', 'birch', 'maple'], weight: 3, does: t('mushroom.inkCap.does') },
  puffball: { name: t('mushroom.puffball'), where: 'forest', kinds: ['mixed', 'maple', 'birch'], weight: 3, does: t('mushroom.puffball.does') },
  morel: { name: t('mushroom.morel'), where: 'forest', kinds: ['maple', 'oak'], weight: 2, does: t('mushroom.morel.does') },
  milkCap: { name: t('mushroom.milkCap'), where: 'forest', kinds: ['pine', 'oak'], weight: 1.5, does: t('mushroom.milkCap.does') },
  libertyCap: { name: t('mushroom.libertyCap'), where: 'forest', kinds: ALL, weight: 0.4, magic: true, does: t('mushroom.libertyCap.does') },
  moonCap: { name: t('mushroom.moonCap'), where: 'forest', kinds: ALL, weight: 0.2, magic: true, does: t('mushroom.moonCap.does') },
  glowcap: { name: t('mushroom.glowcap'), where: 'cave', from: 1, weight: 5, does: t('mushroom.glowcap.does') },
  ghost: { name: t('mushroom.ghost'), where: 'cave', from: 1, weight: 3, does: t('mushroom.ghost.does') },
  crystalCap: { name: t('mushroom.crystalCap'), where: 'cave', from: 7, weight: 1, magic: true, does: t('mushroom.crystalCap.does') }
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
