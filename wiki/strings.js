/* The wiki's words: the game's dictionaries plus the wiki's own
 * (wiki/i18n/), merged before any wiki module asks for one. Every wiki module
 * takes t() from here, never straight from src/i18n/i18n.js. */

import { addStrings } from '../src/i18n/i18n.js';
import en from './i18n/en.js';
import lt from './i18n/lt.js';

addStrings({ en, lt });

export * from '../src/i18n/i18n.js';
