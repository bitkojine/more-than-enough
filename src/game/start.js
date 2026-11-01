/* The page's first script. It fetches the dictionary of the language this
 * page plays in, then the game (main.js, which the deployed page already
 * preloads, so both download side by side).
 *
 * The deployed game carries no words of its own: scripts/stage-speed.mjs
 * bundles it with src/i18n/dictionaries.js swapped for one that reads
 * globalThis.MTE_DICTIONARY, set here first. In the source tree the game
 * imports every dictionary itself and the one set here is unused.
 *
 * Both loads go through lazy(), so a phone waking with no network yet tries
 * again, and the ?v= of this script carries over to both. A load that still
 * fails rejects, and the page's crash screen says so (index.html). */

import { CODES, FALLBACK, pickLanguage } from '../i18n/language.js';
import { lazy } from './lazy.js';

const asked = pickLanguage();
// An unknown ?lang= still loads, so src/i18n/i18n.js can say what is wrong.
const lang = CODES.includes(asked) ? asked : FALLBACK;

// A failure is left unhandled on purpose: the crash screen shows it.
lazy(`../i18n/${lang}.js`).then((dictionary) => {
  globalThis.MTE_DICTIONARY = { lang, strings: dictionary.default };
  return lazy('./main.js');
});
