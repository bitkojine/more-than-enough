/* Milestones. The game celebrates each one when it happens but never says
 * what comes next; the list itself is documented in the wiki. */

import { EMBARK_MIN_TOTAL, EMBARK_ABUNDANCE } from './content.js';
import { extractorCount } from './economy.js';
import { canEmbark } from './state.js';

const has = (key) => (s) => extractorCount(s, key) > 0;

export const GOALS = [
  { text: 'Gather wood from the forest', done: (s) => s.stats.forestWood > 0 },
  { text: 'Craft an Axe upgrade (6 wood)', done: (s) => s.tools.axe >= 2 },
  { text: 'Gather stone from a stone deposit', done: (s) => s.stats.stone > 0 },
  { text: 'Craft a Pickaxe upgrade (10 wood, 6 stone)', done: (s) => s.tools.pickaxe >= 2 },
  { text: 'Build a Lumber Camp on a forest tile (15 wood)', done: has('lumber') },
  { text: 'Collect your camp’s output (stand next to it)', done: (s) => s.stats.collected > 0 || s.unlocks.logistics },
  { text: 'Explore outward to find ore', done: (s) => s.discovered.ore },
  { text: 'Build a Mine on an ore deposit', done: has('mine') },
  { text: 'Research Overclock II (30 stone, 4 ore)', done: (s) => s.tools.overclock >= 2 },
  { text: 'Unlock Logistics (camps near you auto-collect)', done: (s) => s.unlocks.logistics },
  { text: 'Discover crystal in the far wilds', done: (s) => s.discovered.crystal },
  { text: 'Build a Resonator on a crystal deposit', done: has('resonator') },
  { text: 'Build the Abundance Engine', done: (s) => s.abundanceLv >= 1 },
  { text: 'Push the Abundance Engine to II', done: (s) => s.abundanceLv >= 2 },
  { text: 'Sharpen wood production (Silviculture I)', done: (s) => s.resUp.wood >= 1 },
  { text: 'Sharpen stone production (Masonry I)', done: (s) => s.resUp.stone >= 1 },
  { text: 'Unlock the Foundry blueprint', done: (s) => s.unlocks.foundry },
  { text: 'Build a Foundry (ore, anywhere)', done: has('foundry') },
  { text: 'Sharpen crystal production (Crystallurgy I)', done: (s) => s.resUp.crystal >= 1 },
  { text: 'Unlock the Observatory blueprint', done: (s) => s.unlocks.observatory },
  { text: 'Build an Observatory (crystal, anywhere)', done: has('observatory') },
  { text: 'Automate a Sapling Grove (wood, anywhere)', done: has('sapling') },
  { text: 'Automate a Brickyard (stone, anywhere)', done: has('brickyard') },
  { text: 'Sharpen ore production (Metallurgy I)', done: (s) => s.resUp.ore >= 1 },
  { text: 'Push the Abundance Engine to IV', done: (s) => s.abundanceLv >= 4 },
  { text: 'Own 25 automated structures', done: (s) => s.extractors.length >= 25 },
  { text: 'Master the world: every upgrade, the Abundance Engine at ' + EMBARK_ABUNDANCE + ', and ' + EMBARK_MIN_TOTAL.toLocaleString('en-US') + ' gathered', done: canEmbark },
  { text: 'MORE THAN ENOUGH — expand forever', done: () => false }
];

// Moves past every completed goal. Returns true if any were completed.
export function advanceGoals(s) {
  const start = s.goalIndex;
  while (s.goalIndex < GOALS.length && GOALS[s.goalIndex].done(s)) s.goalIndex++;
  return s.goalIndex > start;
}
