/* Saves a backup of every shared world to disk (server/src/backup.js), one
 * file per world, as the admin page's Download backup does for one.
 *
 *   ADMIN_TOKEN=... node scripts/backup-worlds.mjs [folder]
 *
 * The folder defaults to ./world-backups. Without ADMIN_TOKEN it sends no
 * token (a proxy that adds it, as in the project's cloud sessions, works).
 * The smoke test's worlds are skipped. */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SERVICE = process.env.ROOMS_URL || 'https://rooms.robertasrudys.com';
const dir = process.argv[2] || 'world-backups';
const headers = process.env.ADMIN_TOKEN ? { Authorization: 'Bearer ' + process.env.ADMIN_TOKEN } : {};

async function get(path) {
  const res = await fetch(SERVICE + path, { headers });
  if (!res.ok) throw new Error(path + ': ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res;
}

const { rooms } = await (await get('/admin/players')).json();
await mkdir(dir, { recursive: true });
let failed = 0;
for (const w of rooms) {
  try {
    const res = await get('/admin/rooms/' + encodeURIComponent(w.id) + '/backup');
    const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || w.id + '.json';
    const text = await res.text();
    await writeFile(join(dir, name), text);
    console.log(name, (text.length / 1024).toFixed(0) + ' KB', w.name?.en ?? '');
  } catch (e) {
    failed++;
    console.error('failed:', w.id, e.message);
  }
}
console.log(rooms.length - failed + ' of ' + rooms.length + ' worlds saved to ' + dir);
process.exitCode = failed ? 1 : 0;
