/* Developer worlds have their own durable archive. Never overwrite player
 * saves or delete old runs. Unique-key insertion reserves seeds atomically. */
import { TRAINING_SEEDS } from './autoplay-seeds.js';

export async function openAutoplayStore() {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('more-than-enough-autoplay', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('worlds', { keyPath: 'seed' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Archive blocked')); // i18n-ok: developer diagnostic
  });
  const run = (mode, work) => new Promise((resolve, reject) => {
    const tx = db.transaction('worlds', mode), request = work(tx.objectStore('worlds'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error || request.error);
  });
  return {
    async reserve() {
      for (let n = 0; n < 100; n++) {
        const seed = crypto.getRandomValues(new Uint32Array(1))[0];
        if (!seed || TRAINING_SEEDS.includes(seed)) continue;
        try { await run('readwrite', s => s.add({ seed, reserved: Date.now() })); return seed; }
        catch (err) { if (err?.name !== 'ConstraintError') throw err; }
      }
      throw new Error('Cannot reserve seed'); // i18n-ok: developer diagnostic
    },
    save: record => run('readwrite', s => s.put(record)),
    list: () => run('readonly', s => s.getAll())
  };
}
