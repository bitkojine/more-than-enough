/* Milestones. The game celebrates each one when it happens but never says
 * what comes next; the list itself is documented in the wiki. */

import { EMBARK_MIN_TOTAL, EMBARK_ABUNDANCE } from './content.js';
import { extractorCount } from './economy.js';
import { canEmbark } from './state.js';
import { t, number } from '../i18n/i18n.js';

const has = (key) => (s) => extractorCount(s, key) > 0;

export const GOALS = [
  { id: 'forage', text: t('goal.forage'), done: (s) => s.stats.foraged > 0 },
  { id: 'basket', text: t('goal.basket'), done: (s) => s.tools.basket >= 2 },
  { id: 'stone', text: t('goal.stone'), done: (s) => s.stats.stone > 0 },
  { id: 'pickaxe', text: t('goal.pickaxe'), done: (s) => s.tools.pickaxe >= 2 },
  { id: 'garden', text: t('goal.garden'), done: has('garden') },
  { id: 'collect', text: t('goal.collect'), done: (s) => s.stats.collected > 0 || s.unlocks.logistics },
  { id: 'ore', text: t('goal.ore'), done: (s) => s.discovered.ore },
  { id: 'mine', text: t('goal.mine'), done: has('mine') },
  { id: 'overclock', text: t('goal.overclock'), done: (s) => s.tools.overclock >= 2 },
  { id: 'logistics', text: t('goal.logistics'), done: (s) => s.unlocks.logistics },
  { id: 'crystal', text: t('goal.crystal'), done: (s) => s.discovered.crystal },
  { id: 'resonator', text: t('goal.resonator'), done: has('resonator') },
  { id: 'abundance1', text: t('goal.abundance1'), done: (s) => s.abundanceLv >= 1 },
  { id: 'abundance2', text: t('goal.abundance2'), done: (s) => s.abundanceLv >= 2 },
  { id: 'mycology', text: t('goal.mycology'), done: (s) => s.resUp.mycelium >= 1 },
  { id: 'masonry', text: t('goal.masonry'), done: (s) => s.resUp.stone >= 1 },
  { id: 'foundryBlueprint', text: t('goal.foundryBlueprint'), done: (s) => s.unlocks.foundry },
  { id: 'foundry', text: t('goal.foundry'), done: has('foundry') },
  { id: 'crystallurgy', text: t('goal.crystallurgy'), done: (s) => s.resUp.crystal >= 1 },
  { id: 'observatoryBlueprint', text: t('goal.observatoryBlueprint'), done: (s) => s.unlocks.observatory },
  { id: 'observatory', text: t('goal.observatory'), done: has('observatory') },
  { id: 'compost', text: t('goal.compost'), done: has('compost') },
  { id: 'brickyard', text: t('goal.brickyard'), done: has('brickyard') },
  { id: 'metallurgy', text: t('goal.metallurgy'), done: (s) => s.resUp.ore >= 1 },
  { id: 'abundance4', text: t('goal.abundance4'), done: (s) => s.abundanceLv >= 4 },
  { id: 'structures', text: t('goal.structures'), done: (s) => s.extractors.length >= 25 },
  { id: 'master', text: t('goal.master', { level: EMBARK_ABUNDANCE, total: number(EMBARK_MIN_TOTAL) }), done: canEmbark },
  { id: 'forever', text: t('goal.forever'), done: () => false }
];

// Moves past every completed goal. Returns true if any were completed.
export function advanceGoals(s) {
  const start = s.goalIndex;
  while (s.goalIndex < GOALS.length && GOALS[s.goalIndex].done(s)) s.goalIndex++;
  return s.goalIndex > start;
}
