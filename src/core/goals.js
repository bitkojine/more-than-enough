/* The milestone track shown in the goal banner. */

import { EMBARK_MIN_TOTAL } from './content.js';
import { extractorCount } from './economy.js';
import { worldTotal } from './state.js';

const has = (key) => (s) => extractorCount(s, key) > 0;

export const GOALS = [
  { text: '\u{1FAB5} Gather wood from the forest', done: (s) => s.stats.wood > 0 },
  { text: '\u{1FAB5} Craft an Axe upgrade (6 wood)', done: (s) => s.tools.axe >= 2 },
  { text: '\u{1FAA8} Gather stone from a stone deposit', done: (s) => s.stats.stone > 0 },
  { text: '⛏️ Craft a Pickaxe upgrade (10 wood, 6 stone)', done: (s) => s.tools.pickaxe >= 2 },
  { text: '\u{1F3D5}️ Build a Lumber Camp on a forest tile (15 wood)', done: has('lumber') },
  { text: '\u{1F4E6} Collect your camp’s output (stand next to it)', done: (s) => s.stats.collected > 0 || s.unlocks.logistics },
  { text: '\u{1F9ED} Explore outward to find ore', done: (s) => s.discovered.ore },
  { text: '⛏️ Build a Mine on an ore deposit', done: has('mine') },
  { text: '⚙️ Research Overclock II (30 stone, 4 ore)', done: (s) => s.tools.overclock >= 2 },
  { text: '\u{1F69A} Unlock Logistics (camps near you auto-collect)', done: (s) => s.unlocks.logistics },
  { text: '\u{1F4A0} Discover crystal in the far wilds', done: (s) => s.discovered.crystal },
  { text: '\u{1F4A0} Build a Resonator on a crystal deposit', done: has('resonator') },
  { text: '✨ Build the Abundance Engine', done: (s) => s.abundanceLv >= 1 },
  { text: '⚙️ Push the Abundance Engine to II', done: (s) => s.abundanceLv >= 2 },
  { text: '\u{1FA9A} Sharpen wood production (Silviculture I)', done: (s) => s.resUp.wood >= 1 },
  { text: '\u{1F9F1} Sharpen stone production (Masonry I)', done: (s) => s.resUp.stone >= 1 },
  { text: '⚒️ Unlock the Foundry blueprint', done: (s) => s.unlocks.foundry },
  { text: '⚒️ Build a Foundry (ore, anywhere)', done: has('foundry') },
  { text: '\u{1F48E} Sharpen crystal production (Crystallurgy I)', done: (s) => s.resUp.crystal >= 1 },
  { text: '\u{1F50D} Unlock the Observatory blueprint', done: (s) => s.unlocks.observatory },
  { text: '\u{1F50D} Build an Observatory (crystal, anywhere)', done: has('observatory') },
  { text: '\u{1F331} Automate a Sapling Grove (wood, anywhere)', done: has('sapling') },
  { text: '\u{1FAA8} Automate a Brickyard (stone, anywhere)', done: has('brickyard') },
  { text: '⚙️ Sharpen ore production (Metallurgy I)', done: (s) => s.resUp.ore >= 1 },
  { text: '❤️‍\u{1F525} Push the Abundance Engine to IV', done: (s) => s.abundanceLv >= 4 },
  { text: '\u{1F3D4}️ Own 25 automated structures', done: (s) => s.extractors.length >= 25 },
  { text: '\u{1F305} The Long Road — gather ' + EMBARK_MIN_TOTAL.toLocaleString('en-US') + ' resources in this world', done: (s) => worldTotal(s) >= EMBARK_MIN_TOTAL },
  { text: '♾️ MORE THAN ENOUGH — expand forever', done: () => false }
];

// Moves past every completed goal. Returns true if any were completed.
export function advanceGoals(s) {
  const start = s.goalIndex;
  while (s.goalIndex < GOALS.length && GOALS[s.goalIndex].done(s)) s.goalIndex++;
  return s.goalIndex > start;
}

export function currentGoal(s) {
  return GOALS[Math.min(s.goalIndex, GOALS.length - 1)].text;
}
