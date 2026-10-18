/* A backup of a shared world, as one JSON file the moderator keeps on their
 * own disk (GET /admin/rooms/<id>/backup, scripts/backup-worlds.mjs). Every
 * world is kept (src/core/format.js); this is a second copy of it, outside
 * Cloudflare.
 *
 * It's every entry the room's storage holds, as the room would write it now
 * (copy.js snapshot): the seed and every edit, buildings, props, each
 * player's progress as the room has it, the bans and the tombstones. The
 * invite links are left out: their codes would let whoever has the file
 * into the real world, and they stop working within days anyway.
 *
 * `Room.restore(id, entriesOf(file))` reads it back into a room exactly.
 * POST /admin/rooms/<id>/restore puts a world back from its file, at its
 * own address, but only when no world is there (Watch: a restore never
 * touches a live world). It can't go anywhere else: each player's id is
 * worked out from the world's address and their key (protocol.js
 * playerId), so at another address nobody would be let back in. */

export const BACKUP_KIND = 'mte-shared-world';

// The backup of room `id` from its entries (snapshot), made at `now` by
// game version `version`, as the file's text.
export function backupOf(entries, id, now, version) {
  const out = new Map(entries);
  const meta = out.get('meta');
  if (meta) out.set('meta', { ...meta, inv: [] });
  return JSON.stringify({ kind: BACKUP_KIND, room: id, at: now, version, entries: [...out] });
}

// The entries a backup's text holds, or null if it isn't one (or isn't of
// room `id`, when given). A copy's own marks are dropped: what comes back
// is a world, never an admin's copy.
export function entriesOf(text, id) {
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || d.kind !== BACKUP_KIND || !Array.isArray(d.entries)) return null;
  if (id !== undefined && d.room !== id) return null;
  const entries = new Map(d.entries.filter((e) => Array.isArray(e) && typeof e[0] === 'string' && e[0] !== 'id'));
  const meta = entries.get('meta');
  if (!meta || typeof meta !== 'object') return null;
  const { copy, ...rest } = meta;
  entries.set('meta', rest);
  return entries;
}

// The file name a backup of room `id` made at `now` is saved under.
export function backupName(id, now) {
  return 'mte-world-' + id + '-' + new Date(now).toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
}

// The largest backup a restore takes (a Durable Object's call carries at
// most 32 MiB).
export const BACKUP_MAX = 30 * 1024 * 1024;
