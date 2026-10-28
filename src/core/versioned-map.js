/* Map-compatible mutation epochs for derived runtime indexes; never saved. */
export class VersionedMap extends Map {
  #revision = 0;
  #listeners = new Set();
  constructor(entries = []) { super(); for (const [key, value] of entries) this.set(key, value); }
  get revision() { return this.#revision; }
  observe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  set(key, value) {
    const before = this.get(key), changed = !this.has(key) || before !== value;
    super.set(key, value);
    if (changed) { this.#revision++; for (const fn of this.#listeners) fn(key, value, before); }
    return this;
  }
  delete(key) {
    const before = this.get(key), removed = super.delete(key);
    if (removed) { this.#revision++; for (const fn of this.#listeners) fn(key, undefined, before); }
    return removed;
  }
  clear() { for (const key of [...this.keys()]) this.delete(key); }
}
