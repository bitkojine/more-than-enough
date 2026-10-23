/* MORE THAN ENOUGH — simulation core. Pure game rules: no DOM, no clock, no
 * Math.random, so it runs identically in the browser and in Node tests. The
 * browser layer (src/game/) drives the game only through these exports. */

export * from './coords.js';
export { hash2 } from './noise.js';
export { shaftInChunk, caveInChunk, WAYS_APART, wayDownInChunk, wayUpInChunk, findsInChunk, GEOLOGY, geologyShare, DEPOSIT, WEALTH, SURFACE_SHARE, farness, FOREST_KINDS, forestKind, HOME_HALF } from './terrain.js';
export * from './tiles.js';
export * from './world.js';
export * from './content.js';
export * from './economy.js';
export * from './logistics.js';
export * from './upgrades.js';
export * from './state.js';
export * from './sim.js';
export * from './drill.js';
export * from './actions.js';
export * from './underground.js';
export * from './light.js';
export * from './goals.js';
export * from './save.js';
export * from './stockpile.js';
export * from './mushrooms.js';
export * from './catalog.js';
export * from './regions.js';
export * from './shared.js';
export * from './acts.js';
export * from './replay.js';
export * from './paths.js';
export * from './perfect.js';
export * from './ledger.js';

export * from './cultivation.js';
