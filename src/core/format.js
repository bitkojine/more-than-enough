/* How worlds are made. FROZEN FOREVER: never change WORLD_FORMAT or
 * ECON_FORMAT. Every solo and shared world is kept (Watch, 2026-10-18: "all
 * current worlds must be preserved", "nukes are never allowed anymore").
 * Bumping either used to reset every solo world and nuke every shared one;
 * test/unit/worlds-kept.test.js fails if either moves. An update that
 * changes what a seed grows must fit worlds already played: change only land
 * nobody has seen yet, or keep the new thing in saved edits. No imports, so
 * the room service (server/) bundles it as is. */

export const WORLD_FORMAT = 11;

/* How shared worlds keep score (frozen too). 1: the room's own count is the
 * truth (server economy, v0.89.0). */
export const ECON_FORMAT = 1;
