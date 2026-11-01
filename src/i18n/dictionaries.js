/* Every language's dictionary, by code (the keys of CODES in language.js).
 *
 * The source tree, the tests, the wiki and the room service get all of them
 * from here. The deployed game does not: scripts/stage-speed.mjs bundles it
 * with this module swapped for one that hands over the single dictionary
 * src/game/start.js fetched for the player's language, so a first load
 * carries one language, not every one (about 18 KB gzipped each). */

import en from './en.js';
import lt from './lt.js';

export default { en, lt };
