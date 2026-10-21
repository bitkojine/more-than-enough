/* Milestones. Each one counts the moment it's done, in any order, and the
 * Awards sheet shows the next one with what it still takes (the trophy glows
 * when it's within reach). Each goal may say what reaching it takes:
 *   buy    an upgrade id: its next purchase's price
 *   build  a building: its price (or its blueprint's, before that)
 *   count  (s) => { n, of }: a number to reach
 * `text` says what to do; `reached` says it's done, for the banner and the
 * list of milestones reached. */

import { economyForState } from './economy-context.js';
import { EMBARK_MIN_TOTAL, EMBARK_ABUNDANCE, EXTRACTORS, UNLOCKS, TOOLS } from './content.js';
import { RESOURCES } from './tiles.js';
import { extractorCount, ownBuilding, extractorCost } from './economy.js';
import { canEmbark, worldTotal } from './state.js';
import { upgradeCost, isMaxed, worldMastery } from './upgrades.js';
import { t, number } from '../i18n/i18n.js';

const has = (key) => (s) => extractorCount(s, key) > 0;
const STRUCTURES = 25;
const ownBuildings = (s) => s.extractors.filter((e) => ownBuilding(s, e)).length;

// Refinery levels bought, counting each chain up to `top` levels.
const refined = (top) => (s) => ({ n: RESOURCES.reduce((n, r) => n + Math.min(top, s.resUp[r]), 0), of: top * RESOURCES.length });

// Tool levels bought, out of every level there is.
function toolLevels(s) {
  const ids = Object.keys(TOOLS);
  return { n: ids.reduce((n, id) => n + s.tools[id] - 1, 0), of: ids.reduce((n, id) => n + TOOLS[id].levels.length - 1, 0) };
}

// Master the world: every upgrade first, then the resources to gather.
function masterProgress(s) {
  const m = worldMastery(s);
  return m.done < m.total ? { n: m.done, of: m.total } : { n: Math.floor(worldTotal(s)), of: EMBARK_MIN_TOTAL };
}

export const GOALS = [
  { id: 'forage', text: t('goal.forage'), reached: t('goal.forage.reached'), done: (s) => s.stats.foraged > 0 },
  { id: 'basket', text: t('goal.basket'), reached: t('goal.basket.reached'), buy: 'basket', done: (s) => s.tools.basket >= 2 },
  { id: 'stone', text: t('goal.stone'), reached: t('goal.stone.reached'), done: (s) => s.stats.stone > 0 },
  { id: 'pickaxe', text: t('goal.pickaxe'), reached: t('goal.pickaxe.reached'), buy: 'pickaxe', done: (s) => s.tools.pickaxe >= 2 },
  { id: 'garden', text: t('goal.garden'), reached: t('goal.garden.reached'), build: 'garden', done: has('garden') },
  { id: 'collect', text: t('goal.collect'), reached: t('goal.collect.reached'), done: (s) => s.stats.collected > 0 || s.unlocks.logistics },
  { id: 'ore', text: t('goal.ore'), reached: t('goal.ore.reached'), done: (s) => s.discovered.ore },
  { id: 'mine', text: t('goal.mine'), reached: t('goal.mine.reached'), build: 'mine', done: has('mine') },
  { id: 'overclock', text: t('goal.overclock'), reached: t('goal.overclock.reached'), buy: 'overclock', done: (s) => s.tools.overclock >= 2 },
  { id: 'logistics', text: t('goal.logistics'), reached: t('goal.logistics.reached'), buy: 'logistics', done: (s) => s.unlocks.logistics },
  { id: 'crystal', text: t('goal.crystal'), reached: t('goal.crystal.reached'), done: (s) => s.discovered.crystal },
  { id: 'resonator', text: t('goal.resonator'), reached: t('goal.resonator.reached'), build: 'resonator', done: has('resonator') },
  { id: 'abundance1', text: t('goal.abundance1'), reached: t('goal.abundance1.reached'), buy: 'abundance', done: (s) => s.abundanceLv >= 1 },
  { id: 'abundance2', text: t('goal.abundance2'), reached: t('goal.abundance2.reached'), buy: 'abundance', done: (s) => s.abundanceLv >= 2 },
  { id: 'mycology', text: t('goal.mycology'), reached: t('goal.mycology.reached'), buy: 'mycelium', done: (s) => s.resUp.mycelium >= 1 },
  { id: 'masonry', text: t('goal.masonry'), reached: t('goal.masonry.reached'), buy: 'stone', done: (s) => s.resUp.stone >= 1 },
  { id: 'foundryBlueprint', text: t('goal.foundryBlueprint'), reached: t('goal.foundryBlueprint.reached'), buy: 'foundry', done: (s) => s.unlocks.foundry },
  { id: 'foundry', text: t('goal.foundry'), reached: t('goal.foundry.reached'), build: 'foundry', done: has('foundry') },
  { id: 'crystallurgy', text: t('goal.crystallurgy'), reached: t('goal.crystallurgy.reached'), buy: 'crystal', done: (s) => s.resUp.crystal >= 1 },
  { id: 'observatoryBlueprint', text: t('goal.observatoryBlueprint'), reached: t('goal.observatoryBlueprint.reached'), buy: 'observatory', done: (s) => s.unlocks.observatory },
  { id: 'observatory', text: t('goal.observatory'), reached: t('goal.observatory.reached'), build: 'observatory', done: has('observatory') },
  { id: 'compost', text: t('goal.compost'), reached: t('goal.compost.reached'), build: 'compost', done: has('compost') },
  { id: 'brickyard', text: t('goal.brickyard'), reached: t('goal.brickyard.reached'), build: 'brickyard', done: has('brickyard') },
  { id: 'metallurgy', text: t('goal.metallurgy'), reached: t('goal.metallurgy.reached'), buy: 'ore', done: (s) => s.resUp.ore >= 1 },
  { id: 'abundance4', text: t('goal.abundance4'), reached: t('goal.abundance4.reached'), buy: 'abundance', done: (s) => s.abundanceLv >= 4 },
  { id: 'structures', text: t('goal.structures'), reached: t('goal.structures.reached'), count: (s) => ({ n: ownBuildings(s), of: STRUCTURES }), done: (s) => ownBuildings(s) >= STRUCTURES },
  { id: 'refined5', text: t('goal.refined5'), reached: t('goal.refined5.reached'), count: refined(5), done: (s) => refined(5)(s).n >= refined(5)(s).of },
  { id: 'tools', text: t('goal.tools'), reached: t('goal.tools.reached'), count: toolLevels, done: (s) => toolLevels(s).n >= toolLevels(s).of },
  { id: 'abundance5', text: t('goal.abundance5'), reached: t('goal.abundance5.reached'), buy: 'abundance', done: (s) => s.abundanceLv >= 5 },
  { id: 'refined9', text: t('goal.refined9'), reached: t('goal.refined9.reached'), count: refined(9), done: (s) => refined(9)(s).n >= refined(9)(s).of },
  { id: 'refined10', text: t('goal.refined10'), reached: t('goal.refined10.reached'), count: refined(10), done: (s) => refined(10)(s).n >= refined(10)(s).of },
  { id: 'master', text: t('goal.master', { level: EMBARK_ABUNDANCE, total: number(EMBARK_MIN_TOTAL) }), reached: t('goal.master.reached', { level: EMBARK_ABUNDANCE, total: number(EMBARK_MIN_TOTAL) }), count: masterProgress, done: canEmbark },
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
  economyForState(s)?.settle();
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
