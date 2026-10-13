/* Remembering the player's texture pack between visits. Packs can be
 * megabytes of pictures, too big for localStorage, so they live in
 * IndexedDB. Every call resolves to { value, error } instead of throwing, so a
 * blocked database is reported, never fatal. */

const DB = 'more-than-enough', STORE = 'packs', KEY = 'player';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, work) {
  try {
    const db = await open();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error || req.error);
    });
    db.close();
    return { value, error: null };
  } catch (error) {
    return { value: null, error };
  }
}

// The remembered pack's JSON (self-contained), or null.
export const loadSavedPack = () => run('readonly', (s) => s.get(KEY));
export const savePack = (json) => run('readwrite', (s) => s.put(json, KEY));
export const forgetPack = () => run('readwrite', (s) => s.delete(KEY));
