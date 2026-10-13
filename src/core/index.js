/* MORE THAN ENOUGH — simulation core. Pure game rules: no DOM, no clock, no
 * Math.random, so it runs identically in the browser and in Node tests. The
 * browser layer (src/game/) drives the game only through these exports. */

export * from './coords.js';
export { hash2 } from './noise.js';
export { shaftInChunk, GEOLOGY, DEPOSIT } from './terrain.js';
export * from './tiles.js';
export * from './world.js';
export * from './content.js';
export * from './economy.js';
export * from './upgrades.js';
export * from './state.js';
export * from './sim.js';
export * from './actions.js';
export * from './underground.js';
export * from './goals.js';
export * from './save.js';
export * from './catalog.js';
