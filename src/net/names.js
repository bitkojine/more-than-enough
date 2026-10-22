/* The names in the game a room service may write in its audit log: the
 * resources, tools, perks, unlocks and buildings in src/core/content.js and
 * src/core/tiles.js, copied here so the room service bundles them without the
 * game's text. Anything else a player sends (a save's keys, a building's
 * kind) is never logged as written, because the log is read by people and by
 * an AI reviewer, and a name could be made to read like an instruction.
 * test/unit/together.test.js fails when these drift from the game's tables.
 * No imports, so the room service can bundle it as is. */

export const NAMES = Object.freeze({
  inv: Object.freeze(['mycelium', 'stone', 'ore', 'crystal']),
  tools: Object.freeze(['basket', 'pickaxe', 'boots', 'overclock']),
  perks: Object.freeze(['legacy', 'memory', 'heirloom', 'cartographer', 'nomad']),
  unlocks: Object.freeze(['logistics', 'compost', 'brickyard', 'foundry', 'observatory']),
  buildings: Object.freeze(['depot', 'garden', 'quarry', 'mine', 'resonator', 'compost', 'brickyard', 'foundry', 'stoneworks', 'observatory'])
});
