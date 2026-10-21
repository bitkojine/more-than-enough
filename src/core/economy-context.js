/* Optional indexed economy contexts. Kept outside saves and state objects. */
const states = new WeakMap(), inventories = new WeakMap();
export const economyForState = state => states.get(state);
export const economyForInventory = inventory => inventories.get(inventory);
export function attachEconomy(state, economy) {
  states.set(state, economy); inventories.set(state.inv, economy);
}
export function detachEconomy(state) {
  states.delete(state); inventories.delete(state.inv);
}
