/* Your world on another device, loaded the first time it's needed
 * (main.js loadSync): when this device is linked, opens a link, or shows the
 * Another device screen. Most players never link one, so none of it is in
 * the first load. It imports nothing that keeps state (no i18n.js): its
 * words come as data, added to the game's by main.js. */

import en from '../i18n/sync/en.js';
import lt from '../i18n/sync/lt.js';

export { createSync, linkFrom, linkUrl } from './sync.js';
export { renderDevices } from './devices.js';
export const strings = { en, lt };
