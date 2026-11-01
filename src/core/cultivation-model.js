/* What a crystal world is made of (cultivation.js runs it): the recipes,
 * the machine's repair stages, how each part looks, and an empty start. */

import { newHeart } from './cultivation-heart.js';

export const CULTIVATION_MODEL = 'living-crystal-1';
export const CULTIVATION_RECIPES = {
  chamber: { mycelium: 8, stone: 14, ore: 8 },
  cooler: { stone: 10, ore: 6 },
  vault: { stone: 6, ore: 4 },
  conduit: { stone: 2, ore: 4 },
  carrier: { mycelium: 8, stone: 4, ore: 12 },
  lantern: { stone: 3, ore: 2 },
  tend: { mycelium: 2, ore: 1 },
  reinforce: { crystal: 2 },
  repair: { stone: 16, ore: 16, crystal: 6 },
  shade: { mycelium: 1 },
  shelter: { mycelium: 6, stone: 10 }
};
// Each stage installs physical machine components; activation is a separate act.
export const MACHINE_REPAIRS = [
  CULTIVATION_RECIPES.repair,
  { stone: 24, ore: 24, crystal: 8 },
  { stone: 32, ore: 32, crystal: 12 }
];
export function machineSections(b) {
  return b.sections ?? (b.health > 0 ? 1 : 0);
}
export function machineRepairCost(b) {
  return (
    MACHINE_REPAIRS[machineSections(b)] ??
    (b.health <= 0 || b.quality < 60 ? MACHINE_REPAIRS.at(-1) : null)
  );
}
export const CULTIVATION_LOOK = {
  chamber: 'building.crystalChamber',
  cooler: 'building.coolingTower',
  vault: 'building.crystalVault',
  conduit: 'building.sealedConduit',
  machine: 'building.sleepingMachine',
  carrier: 'tool.crystalCarrier',
  lantern: 'tool.hoodedLantern',
  station: 'building.hidingPlace',
  shelter: 'building.heartShelter'
};
// A crystal world before anything is built: the heart still at its hiding place.
export function newCultivation() {
  return {
    model: CULTIVATION_MODEL,
    facilities: [],
    wild: {},
    starter: null,
    quality: 100,
    gear: { lantern: false, carrier: false },
    lantern: false,
    phase: 0,
    clock: 0,
    nextId: 1,
    restored: false,
    heart: newHeart()
  };
}
