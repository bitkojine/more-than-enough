/* Number and text formatting for the UI, as the player's language writes
 * numbers (decimal point or comma, and its words for thousand, million and
 * billion). */

import { t, number } from '../i18n/i18n.js';

const SUFFIX = { k: t('num.thousand'), M: t('num.million'), B: t('num.billion') };

export function fmt(n) {
  n = Math.floor(n);
  if (n < 10000) return String(n);
  if (n < 1e6) return number(n / 1000, 1) + SUFFIX.k;
  if (n < 1e9) return number(n / 1e6, 2) + SUFFIX.M;
  return number(n / 1e9, 2) + SUFFIX.B;
}

// The same, as short as it goes: for the resource bar, where every
// character counts. Never more than three digits: 9999, 45k, 4.7M, 459M.
const SHORT = { k: t('num.short.thousand'), M: t('num.short.million'), B: t('num.short.billion') };
function short(x, unit) {
  return x < 10 ? number(Math.floor(x * 10) / 10, 1) + unit : number(Math.floor(x), 0) + unit;
}
export function fmtShort(n) {
  n = Math.floor(n);
  if (n < 10000) return String(n);
  if (n < 1e6) return short(n / 1000, SHORT.k);
  if (n < 1e9) return short(n / 1e6, SHORT.M);
  return short(n / 1e9, SHORT.B);
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
