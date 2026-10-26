/* Your own world, kept in the cloud, so one world plays on every device you
 * link (the game's Settings, Another device) and comes back after a browser
 * wipes its storage (Safari does, for a site not opened in 7 days).
 *
 * One Durable Object per sync key (worker.js Vault), named by a hash of the
 * key: the key itself is never stored. A solo world is nobody else's, so
 * there is nothing to check: the vault keeps what the game sends, by seed,
 * with a revision number. A game says which revision its copy grew from;
 * if another device kept a newer one since, the vault answers with that copy
 * instead of writing over it, and the game asks the player which to keep.
 * Nothing here deletes a world: a key keeps up to SOLO.worlds of them, and
 * then new ones stop.
 *
 * Storage: `meta` {cur, revs} (the world played last, and every world kept
 * with its revision) and `w:<seed>` {rev, at, save}. `storage` is the
 * object's own (get/put), and the get-then-put of one request runs without
 * another in between (a Durable Object's input gate). */

import { SOLO, sha256Hex } from '../../src/net/protocol.js';

// The vault's name for a key.
export async function vaultName(key) {
  return 'solo|' + await sha256Hex('mte-solo|' + key);
}

async function metaOf(storage) {
  const m = await storage.get('meta');
  return m && m.revs && typeof m.revs === 'object' ? m : { cur: null, revs: {} };
}

// The world played last, and its save unless `have` says the game has that
// very revision already; and every world kept, by seed, with its revision
// (`worlds`), so a device can fetch the ones it lacks (get).
export async function pull(storage, have) {
  const meta = await metaOf(storage);
  if (meta.cur === null) return { cur: null };
  const w = await storage.get('w:' + meta.cur);
  if (!w) return { cur: null };
  const base = { cur: meta.cur, rev: w.rev, at: w.at, worlds: meta.revs };
  return have && have.seed === meta.cur && have.rev === w.rev ? { ...base, same: true } : { ...base, save: w.save };
}

// One world, by seed.
export async function get(storage, seed) {
  const w = await storage.get('w:' + seed);
  return w ? { seed, rev: w.rev, at: w.at, save: w.save } : { error: 'none' };
}

// Keeps a world (a checked push, protocol.js cleanSoloAsk) at `now`.
export async function push(storage, ask, now) {
  const meta = await metaOf(storage);
  const had = await storage.get('w:' + ask.seed);
  // Another device kept this world since the game's copy: it gets that copy
  // back, and nothing is written over.
  if (had && had.rev !== ask.base) return { conflict: true, seed: ask.seed, rev: had.rev, at: had.at, save: had.save };
  if (!had && Object.keys(meta.revs).length >= SOLO.worlds) return { error: 'full' };
  const rev = (had ? had.rev : 0) + 1;
  const cur = ask.cur || meta.cur === null ? ask.seed : meta.cur;
  await storage.put({ ['w:' + ask.seed]: { rev, at: now, save: ask.save }, meta: { cur, revs: { ...meta.revs, [ask.seed]: rev } } });
  return { rev };
}
