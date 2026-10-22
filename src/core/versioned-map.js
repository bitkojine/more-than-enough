/* Map-compatible mutation epochs for derived runtime indexes; never saved. */
export class VersionedMap extends Map {
  #revision = 0;
  constructor(entries = []) { super(); for (const [key, value] of entries) this.set(key, value); }
  get revision() { return this.#revision; }
  set(key, value) { if (!this.has(key) || this.get(key) !== value) this.#revision++; return super.set(key, value); }
  delete(key) { const removed = super.delete(key); if (removed) this.#revision++; return removed; }
  clear() { if (this.size) this.#revision++; super.clear(); }
}
