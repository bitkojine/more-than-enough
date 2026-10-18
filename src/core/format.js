/* How worlds are made. Bump WORLD_FORMAT when an update changes what a
 * seed grows (or the save), so older worlds can't carry over: saves from
 * before it start a new world (src/core/save.js), and the room service,
 * which redeploys with it, gives every shared world made before it the
 * nuke. Only the room service decides that, never a player. No imports, so
 * the room service (server/) bundles it as is. */

export const WORLD_FORMAT = 11;

/* How shared worlds keep score. Bump ECON_FORMAT when an update changes how
 * the room service counts players' progress so much that what it counted
 * before can't stand: every shared world gets the nuke (as for WORLD_FORMAT),
 * but solo worlds are untouched. 1: the room's own count is the truth (server
 * economy, v0.89.0). */
export const ECON_FORMAT = 1;
