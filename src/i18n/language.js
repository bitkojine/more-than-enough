/* Which language this page plays in, picked once at load: ?lang= in the
 * address, else the player's choice (kept in this browser), else the
 * browser's own if it is one of ours, else English. Under Node (the tests),
 * MTE_LANG picks it.
 *
 * Its own small module because the page's first script (src/game/start.js)
 * needs the answer before the game loads: the deployed site fetches only the
 * dictionary of that language, and src/i18n/i18n.js then asks this same
 * question, so the two can never disagree. */

export const CODES = ['en', 'lt'];
export const LANGUAGE_KEY = 'mte.lang';
export const FALLBACK = 'en';

export function pickLanguage() {
  const env = globalThis.process && globalThis.process.env && globalThis.process.env.MTE_LANG;
  if (env) return env;
  const asked = globalThis.location && new URLSearchParams(globalThis.location.search).get('lang');
  if (asked) return asked;
  let saved;
  try {
    saved = globalThis.localStorage && globalThis.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    saved = null;
  }
  if (saved && CODES.includes(saved)) return saved;
  const nav = globalThis.navigator;
  const wanted = nav ? [...(nav.languages || []), nav.language] : [];
  for (const w of wanted) {
    const code = String(w || '')
      .slice(0, 2)
      .toLowerCase();
    if (CODES.includes(code)) return code;
  }
  return FALLBACK;
}
