/* The modules main.js shares with the modules it loads later. In the source
 * tree this is empty: every module is loaded once by its URL anyway. In the
 * deployed game, scripts/stage-speed.mjs fills it in: it puts the modules a
 * lazy bundle needs from main.js in globalThis.MTE_SHARED, so the lazy
 * bundle uses main.js's copy instead of carrying its own. It is main.js's
 * last import, so it runs after every module it shares and before main.js's
 * own code. */
export {};
