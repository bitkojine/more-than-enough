/* Every word the player reads, in English and Lithuanian.
 *
 * Code never writes player-facing text itself: it asks for it by key,
 * t('sheet.title.build'), and the current language's dictionary answers.
 * Fail loud: a key missing from the current language, a placeholder left
 * without a value, or a plural form the language needs and lacks throws, so
 * the crash screen names it. The unit tests check every dictionary has every
 * key and that no raw text bypasses this module (test/unit/i18n.test.js).
 *
 * The language is picked once, at load: the one the player chose (kept in
 * this browser), else the browser's own if it is one of ours, else English.
 * Switching saves the choice and reloads the page, so everything built from
 * text at load (names in the game's content tables) is in the new language.
 *
 * A dictionary value is a string, with {name} placeholders filled from
 * t(key, {name: value}), or a plural: an object of the language's plural
 * forms (Intl.PluralRules categories: English one/other, Lithuanian
 * one/few/many/other), picked by the `count` parameter.
 *
 * Text also fits what you play on (DEVICE): a phone (a touch screen) or a
 * laptop (a mouse or trackpad). Anything that differs between them is
 * written as a choice, {phone:tap|laptop:click}, and only the one for this
 * device is shown; the tests reject words like "tap" or "phone" outside one. */

import en from './en.js';
import lt from './lt.js';

export const LANGUAGES = {
  en: { name: 'English', locale: 'en-US', strings: en },
  lt: { name: 'Lietuvių', locale: 'lt-LT', strings: lt }
};
export const LANGUAGE_KEY = 'mte.lang';
const FALLBACK = 'en';

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

// ?lang= in the address, else the player's choice, else the browser's
// language, else English. Under Node (the tests), MTE_LANG picks it.
function detect() {
  const env = globalThis.process && globalThis.process.env && globalThis.process.env.MTE_LANG;
  if (env) return env;
  const asked = globalThis.location && new URLSearchParams(globalThis.location.search).get('lang');
  if (asked) return asked;
  let saved = null;
  try { saved = storage() && storage().getItem(LANGUAGE_KEY); } catch { saved = null; }
  if (saved && LANGUAGES[saved]) return saved;
  const nav = globalThis.navigator;
  const wanted = nav ? [...(nav.languages || []), nav.language] : [];
  for (const w of wanted) {
    const code = String(w || '').slice(0, 2).toLowerCase();
    if (LANGUAGES[code]) return code;
  }
  return FALLBACK;
}

// What you play on: ?device= in the address, else a touch screen as the
// main pointer means a phone (tablets count as phones), anything else a
// laptop. Under Node (the tests), MTE_DEVICE picks it.
export const DEVICES = ['phone', 'laptop'];
function detectDevice() {
  const env = globalThis.process && globalThis.process.env && globalThis.process.env.MTE_DEVICE;
  const asked = env || (globalThis.location && new URLSearchParams(globalThis.location.search).get('device'));
  if (DEVICES.includes(asked)) return asked;
  const touch = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches; // i18n-ok: a media query
  return touch || !globalThis.matchMedia ? 'phone' : 'laptop';
}
export const DEVICE = detectDevice();

export const LANG = detect();
if (!LANGUAGES[LANG]) throw new Error(`Unknown language "${LANG}" (known: ${Object.keys(LANGUAGES).join(', ')})`);
export const LOCALE = LANGUAGES[LANG].locale;
const strings = LANGUAGES[LANG].strings;
const plurals = new Intl.PluralRules(LOCALE);

// More dictionaries (the wiki's), one per language, merged into these.
// Every language must bring exactly the same keys.
export function addStrings(byLang) {
  for (const code of Object.keys(LANGUAGES)) {
    if (!byLang[code]) throw new Error(`addStrings: no "${code}" strings`);
    for (const key of Object.keys(byLang[code])) {
      if (key in LANGUAGES[code].strings) throw new Error(`addStrings: "${key}" is defined twice`);
      LANGUAGES[code].strings[key] = byLang[code][key];
    }
  }
}

// {phone:…|laptop:…}: the part for this device.
export const DEVICE_CHOICE = /\{phone:([^{}|]*)\|laptop:([^{}]*)\}/g;
const forDevice = (text) => text.replace(DEVICE_CHOICE, (_, phone, laptop) => (DEVICE === 'phone' ? phone : laptop));

function fill(template, key, params) {
  template = forDevice(template);
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    if (!params || !(name in params)) throw new Error(`Translation "${key}" (${LANG}) needs {${name}}`);
    return String(params[name]);
  });
}

// The text for `key` in the current language.
export function t(key, params) {
  const value = strings[key];
  if (value === undefined) throw new Error(`Missing translation: "${key}" in ${LANGUAGES[LANG].name} (${LANG})`);
  if (typeof value === 'string') return params ? fill(value, key, params) : forDevice(value);
  if (!params || typeof params.count !== 'number') throw new Error(`Translation "${key}" is a plural: pass {count}`);
  const form = value[plurals.select(params.count)];
  if (form === undefined) throw new Error(`Translation "${key}" (${LANG}) has no "${plurals.select(params.count)}" form`);
  return fill(form, key, params);
}

// Whether a key exists (for text that is optional by design).
export const has = (key) => strings[key] !== undefined;

// "a, b or c" / "a, b ar c".
export function listOr(items) {
  if (items.length < 2) return items.join('');
  return items.slice(0, -1).join(', ') + ' ' + t('list.or') + ' ' + items[items.length - 1];
}

export const capitalize = (s) => s.charAt(0).toLocaleUpperCase(LOCALE) + s.slice(1);

// Numbers as the language writes them (1,234.5 / 1 234,5).
export const number = (n, digits) => n.toLocaleString(LOCALE, digits === undefined ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits });

// A distance, from tiles (every tile is 1 m x 1 m x 1 m): whole metres up
// to a kilometre, then kilometres (one decimal under 10 km).
export function distance(tiles) {
  const m = Math.round(tiles);
  if (m < 1000) return t('unit.m', { n: number(m) });
  const km = Math.round(m / 100) / 10;
  return t('unit.km', { n: km < 10 ? number(km, 1) : number(Math.round(km)) });
}

// Remembers `code` and reloads, so the whole game comes back in it. A
// browser that can't keep it (storage blocked) gets it in the address.
export function setLanguage(code) {
  if (!LANGUAGES[code]) throw new Error(`Unknown language "${code}"`);
  const url = new URL(globalThis.location.href);
  try {
    storage().setItem(LANGUAGE_KEY, code);
    url.searchParams.delete('lang');
  } catch {
    url.searchParams.set('lang', code);
  }
  if (url.href === globalThis.location.href) globalThis.location.reload();
  else globalThis.location.replace(url.href);
}

// The next language in the list: the language button cycles through them.
export function nextLanguage() {
  const codes = Object.keys(LANGUAGES);
  return codes[(codes.indexOf(LANG) + 1) % codes.length];
}

// Fills static markup: data-i18n="key" sets an element's text, and
// data-i18n-<attr>="key" sets that attribute (aria-label, placeholder, title,
// alt, content). The page's own lang follows.
export function localizePage(root = globalThis.document) {
  if (root.documentElement) root.documentElement.lang = LANG;
  for (const node of root.querySelectorAll('*')) {
    for (const attr of node.getAttributeNames()) {
      if (attr === 'data-i18n') node.textContent = t(node.getAttribute(attr));
      else if (attr.startsWith('data-i18n-')) node.setAttribute(attr.slice(10), t(node.getAttribute(attr)));
    }
  }
}
