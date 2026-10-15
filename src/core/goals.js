/* Milestones. Each one counts the moment it's done, in any order, and the
 * Awards sheet shows the next one with what it still takes (the trophy glows
 * when it's within reach). Each goal may say what reaching it takes:
 *   buy    an upgrade id: its next purchase's price
 *   build  a building: its price (or its blueprint's, before that)
 *   count  (s) => { n, of }: a number to reach */

import { EMBARK_MIN_TOTAL, EMBARK_ABUNDANCE, EXTRACTORS, UNLOCKS } from './content.js';
import { extractorCount, ownBuilding, extractorCost, canAfford } from './economy.js';
import { canEmbark, worldTotal } from './state.js';
import { upgradeCost, isMaxed, worldMastery } from './upgrades.js';
import { t, number } from '../i18n/i18n.js';

const has = (key) => (s) => extractorCount(s, key) > 0;
const STRUCTURES = 25;
const ownBuildings = (s) => s.extractors.filter((e) => ownBuilding(s, e)).length;

// Master the world: every upgrade first, then the resources to gather.
function masterProgress(s) {
  const m = worldMastery(s);
  return m.done < m.total ? { n: m.done, of: m.total } : { n: Math.floor(worldTotal(s)), of: EMBARK_MIN_TOTAL };
}

export const GOALS = [
  { id: 'forage', text: t('goal.forage'), done: (s) => s.stats.foraged > 0 },
  { id: 'basket', text: t('goal.basket'), buy: 'basket', done: (s) => s.tools.basket >= 2 },
  { id: 'stone', text: t('goal.stone'), done: (s) => s.stats.stone > 0 },
  { id: 'pickaxe', text: t('goal.pickaxe'), buy: 'pickaxe', done: (s) => s.tools.pickaxe >= 2 },
  { id: 'garden', text: t('goal.garden'), build: 'garden', done: has('garden') },
  { id: 'collect', text: t('goal.collect'), done: (s) => s.stats.collected > 0 || s.unlocks.logistics },
  { id: 'ore', text: t('goal.ore'), done: (s) => s.discovered.ore },
  { id: 'mine', text: t('goal.mine'), build: 'mine', done: has('mine') },
  { id: 'overclock', text: t('goal.overclock'), buy: 'overclock', done: (s) => s.tools.overclock >= 2 },
  { id: 'logistics', text: t('goal.logistics'), buy: 'logistics', done: (s) => s.unlocks.logistics },
  { id: 'crystal', text: t('goal.crystal'), done: (s) => s.discovered.crystal },
  { id: 'resonator', text: t('goal.resonator'), build: 'resonator', done: has('resonator') },
  { id: 'abundance1', text: t('goal.abundance1'), buy: 'abundance', done: (s) => s.abundanceLv >= 1 },
  { id: 'abundance2', text: t('goal.abundance2'), buy: 'abundance', done: (s) => s.abundanceLv >= 2 },
  { id: 'mycology', text: t('goal.mycology'), buy: 'mycelium', done: (s) => s.resUp.mycelium >= 1 },
  { id: 'masonry', text: t('goal.masonry'), buy: 'stone', done: (s) => s.resUp.stone >= 1 },
  { id: 'foundryBlueprint', text: t('goal.foundryBlueprint'), buy: 'foundry', done: (s) => s.unlocks.foundry },
  { id: 'foundry', text: t('goal.foundry'), build: 'foundry', done: has('foundry') },
  { id: 'crystallurgy', text: t('goal.crystallurgy'), buy: 'crystal', done: (s) => s.resUp.crystal >= 1 },
  { id: 'observatoryBlueprint', text: t('goal.observatoryBlueprint'), buy: 'observatory', done: (s) => s.unlocks.observatory },
  { id: 'observatory', text: t('goal.observatory'), build: 'observatory', done: has('observatory') },
  { id: 'compost', text: t('goal.compost'), build: 'compost', done: has('compost') },
  { id: 'brickyard', text: t('goal.brickyard'), build: 'brickyard', done: has('brickyard') },
  { id: 'metallurgy', text: t('goal.metallurgy'), buy: 'ore', done: (s) => s.resUp.ore >= 1 },
  { id: 'abundance4', text: t('goal.abundance4'), buy: 'abundance', done: (s) => s.abundanceLv >= 4 },
  { id: 'structures', text: t('goal.structures'), count: (s) => ({ n: ownBuildings(s), of: STRUCTURES }), done: (s) => ownBuildings(s) >= STRUCTURES },
  { id: 'master', text: t('goal.master', { level: EMBARK_ABUNDANCE, total: number(EMBARK_MIN_TOTAL) }), count: masterProgress, done: canEmbark },
  { id: 'forever', text: t('goal.forever'), done: () => false }
];

// How many milestones there are to reach: every one but the last, which goes
// on forever. A shared world has no Embark (Watch's choice: those are hidden
// there), so its milestones end before "Master the world".
export function goalsTotal(s) {
  return s.shared ? GOALS.findIndex((g) => g.id === 'master') : GOALS.length - 1;
}

// The milestones there are to reach in this world.
const reachable = (s) => GOALS.slice(0, goalsTotal(s));

// Marks every milestone that's now done, in any order, and keeps goalIndex as
// how many are. Returns the goals just reached, in the order they're listed.
export function advanceGoals(s) {
  const reached = reachable(s).filter((g) => !s.goalsDone.includes(g.id) && g.done(s));
  s.goalsDone.push(...reached.map((g) => g.id));
  s.goalIndex = s.goalsDone.length;
  return reached;
}

// The first milestone still to reach, or null once all are.
export function nextGoal(s) {
  return reachable(s).find((g) => !s.goalsDone.includes(g.id)) || null;
}

// What reaching `goal` still takes: { cost } (a price, to show as what's still
// needed), { n, of } (a number to reach), or null (just go and do it).
export function goalNeeds(s, goal) {
  if (goal.buy) return isMaxed(s, goal.buy) ? null : { cost: upgradeCost(s, goal.buy) };
  if (goal.build) {
    const blueprint = EXTRACTORS[goal.build].unlock;
    return { cost: blueprint && !s.unlocks[blueprint] ? UNLOCKS[blueprint].cost : extractorCost(s, goal.build) };
  }
  return goal.count ? goal.count(s) : null;
}

// Whether the next milestone could be reached right now (its price is in
// your packs), so the trophy can say it's worth a look.
export function nextGoalReady(s) {
  const goal = nextGoal(s);
  const needs = goal && goalNeeds(s, goal);
  return !!(needs && needs.cost && canAfford(s.inv, needs.cost));
}
