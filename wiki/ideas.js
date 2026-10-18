/* The Ideas section: directions the game could take next. Nothing here is in
 * the game. It's a sketchbook to pick from, so ideas are added freely and
 * removed once they ship (or are dropped).
 *
 *   area     which group it sits in (see AREAS)
 *   size     rough effort: small, medium, large or huge
 *
 * Its words are in the wiki's dictionaries (wiki/i18n/), under
 * wiki.idea.<id>: title, pitch (what it is and why it would be good) and
 * builds (what already in the game it grows out of). */

import { t } from './strings.js';

export const AREAS = ['look', 'depth', 'mechanics', 'economy', 'big'];

export const IDEAS = [
  /* ------------------------------------------------------------ look */
  { id: 'toolsYouCanSee', area: 'look', size: 'small' },
  { id: 'aPackThatFillsUp', area: 'look', size: 'small' },
  { id: 'buildingsThatGrow', area: 'look', size: 'medium' },
  { id: 'crystalsThatLightTheDark', area: 'look', size: 'small' },
  { id: 'seasons', area: 'look', size: 'medium' },

  { id: 'packGallery', area: 'look', size: 'medium' },
  { id: 'soundPacks', area: 'look', size: 'medium' },
  { id: 'packsThatChangeWithDepth', area: 'look', size: 'small' },

  /* ----------------------------------------------------------- depth */
  { id: 'distantPlateaus', area: 'depth', size: 'medium' },
  { id: 'waterfallsOffTheEdge', area: 'depth', size: 'medium' },
  { id: 'tunnelsInTheCliffFace', area: 'depth', size: 'small' },
  { id: 'turnTheView', area: 'depth', size: 'large' },
  { id: 'deepBiomes', area: 'depth', size: 'large' },
  { id: 'buildingUpward', area: 'depth', size: 'large' },

  /* ------------------------------------------------------- mechanics */
  { id: 'liftsInHoleColumns', area: 'mechanics', size: 'medium' },
  { id: 'minecartRails', area: 'mechanics', size: 'large' },
  { id: 'caveInsAndMyceliumProps', area: 'mechanics', size: 'medium' },
  { id: 'glowOre', area: 'mechanics', size: 'small' },
  { id: 'littleDiggers', area: 'mechanics', size: 'large' },
  { id: 'weather', area: 'mechanics', size: 'medium' },

  /* --------------------------------------------------------- economy */
  { id: 'visualRecipes', area: 'economy', size: 'medium' },
  { id: 'roads', area: 'economy', size: 'small' },
  { id: 'caravansAtTheEdge', area: 'economy', size: 'medium' },
  { id: 'trophiesOnThePlateau', area: 'economy', size: 'small' },
  { id: 'insightAsConstellations', area: 'economy', size: 'medium' },
  { id: 'aSharedBank', area: 'economy', size: 'medium' },

  /* ------------------------------------------------------------- big */
  { id: 'aMountainColony', area: 'big', size: 'huge' },
  { id: 'everyEmbarkIsANewMountain', area: 'big', size: 'large' },
  { id: 'visitAFriendSPlateau', area: 'big', size: 'huge' },
  { id: 'theWorldThatRemembers', area: 'big', size: 'large' },
  { id: 'downIsTheWholeGame', area: 'big', size: 'huge' },
  { id: 'noNumbersAtAll', area: 'big', size: 'large' },
  { id: 'playtesterBots', area: 'big', size: 'large' }
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// The ideas grouped by area, as HTML.
export function renderIdeas() {
  return AREAS.map((area) => {
    const cards = IDEAS.filter((i) => i.area === area).map((i) => `
      <li class="idea">
        <div class="idea-head"><strong>${esc(t(`wiki.idea.${i.id}.title`))}</strong><span class="size size-${i.size}">${t('wiki.size.' + i.size)}</span></div>
        <p>${esc(t(`wiki.idea.${i.id}.pitch`))}</p>
        <p class="builds">${esc(t('wiki.buildsOn', { builds: t(`wiki.idea.${i.id}.builds`) }))}</p>
      </li>`).join('');
    return `<h2>${t('wiki.area.' + area)}</h2><p class="area-blurb">${t('wiki.area.' + area + '.blurb')}</p><ul class="ideas">${cards}</ul>`;
  }).join('');
}
