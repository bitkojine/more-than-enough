/* Set-compatible change notifications for derived caches; contents alone save. */
export class VersionedSet extends Set {
  #listeners = new Set();
  constructor(values = []) { super(); for (const value of values) super.add(value); }
  observe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  add(value) { const changed = !this.has(value); super.add(value); if (changed) for (const fn of this.#listeners) fn(value); return this; }
  delete(value) { const changed = super.delete(value); if (changed) for (const fn of this.#listeners) fn(value); return changed; }
  clear() { for (const value of [...this]) this.delete(value); }
}
