/* Number and text formatting for the UI, as the player's language writes
 * numbers (decimal point or comma, and its words for thousand, million,
 * billion and trillion). */

import { t, number } from '../i18n/i18n.js';

const SUFFIX = { k: t('num.thousand'), M: t('num.million'), B: t('num.billion'), T: t('num.trillion') };

export function fmt(n) {
  n = Math.floor(n);
  if (n < 10000) return String(n);
  if (n < 1e6) return number(n / 1000, 1) + SUFFIX.k;
  if (n < 1e9) return number(n / 1e6, 2) + SUFFIX.M;
  if (n < 1e12) return number(n / 1e9, 2) + SUFFIX.B;
  if (n < 1e15) return number(n / 1e12, 2) + SUFFIX.T;
  return sci(n);
}

// Past a thousand trillion no word helps: 1.2e15.
function sci(n) {
  const e = Math.floor(Math.log10(n));
  return number(Math.floor(n / 10 ** e * 10) / 10, 1) + 'e' + e;
}

// The same, as short as it goes: for the resource bar, where every
// character counts. Never more than three digits and a one-letter unit:
// 9999, 45k, 4.7M, 459B, 12T; past a thousand trillion, 1e15.
const SHORT = { k: t('num.short.thousand'), M: t('num.short.million'), B: t('num.short.billion'), T: t('num.short.trillion') };
function short(x, unit) {
  return x < 10 ? number(Math.floor(x * 10) / 10, 1) + unit : number(Math.floor(x), 0) + unit;
}
export function fmtShort(n) {
  n = Math.floor(n);
  if (n < 10000) return String(n);
  if (n < 1e6) return short(n / 1000, SHORT.k);
  if (n < 1e9) return short(n / 1e6, SHORT.M);
  if (n < 1e12) return short(n / 1e9, SHORT.B);
  if (n < 1e15) return short(n / 1e12, SHORT.T);
  return sciShort(n);
}

// Past a thousand trillion no word helps: 1e15. The bar has room for four
// characters, so the number keeps one digit in front of the exponent (the
// full form, which has room, keeps two: 1.2e15).
function sciShort(n) {
  let e = Math.floor(Math.log10(n));
  let m = Math.round(n / 10 ** e);
  if (m >= 10) { m = 1; e += 1; }
  return m + 'e' + e;
}

export function fmt1(n) {
  return number(Math.round(n * 10) / 10, 1);
}

// A per-second rate: a decimal while it's small (0.6), then whole and
// abbreviated like the counts (7.7M), never 7 726 237.6. `short` picks the
// resource bar's tight abbreviations.
export function fmtRate(n, short = false) {
  if (n < 100) return fmt1(n);
  return short ? fmtShort(n) : fmt(n);
}

// Multipliers read best as "2.5" when small and "26.0k" when large.
export function fmtMult(m) {
  return m >= 1000 ? fmt(m) : number(Math.round(m * 100) / 100);
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ENTITIES[c]);
}

// A stretch of time in minutes, or hours and minutes: "25 min", "2 h 5 min".
export function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  if (m < 60) return t('duration.minutes', { m });
  return t('duration.hours', { h: Math.floor(m / 60), m: m % 60 });
}
