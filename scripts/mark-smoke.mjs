/* One-off pass over the worlds made before the room service kept a smoke
 * flag (v0.130.1): every room the deploy's smoke test made since the start
 * has seed 12345 but no flag, so this marks those rooms the moderator's way
 * (POST /admin/rooms/<id>/smoke) and they age out like every smoke room.
 * A player's world on seed 12345 would look the same here, so the list this
 * prints is worth an eye before it is trusted; rooms already marked, or
 * without the seed, are left alone. Run once, after the deploy that
 * introduced the flag.
 *
 *   ADMIN_TOKEN=... node scripts/mark-smoke.mjs [--yes]
 *
 * Without --yes it marks nothing and only prints what it would mark. */

const SERVICE = process.env.ROOMS_URL || 'https://rooms.robertasrudys.com';
const headers = { ...(process.env.ADMIN_TOKEN ? { Authorization: 'Bearer ' + process.env.ADMIN_TOKEN } : {}) };
const commit = process.argv.includes('--yes');

async function get(path) {
  const res = await fetch(SERVICE + path, { headers });
  if (!res.ok) throw new Error(path + ': ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { rooms } = await (await get('/admin/rooms')).json();
const old = rooms.filter((w) => w.seed === 12345 && w.smk !== true);
console.log(rooms.length + ' worlds, ' + old.length + ' with the smoke seed and no flag' + (commit ? '' : '; marking nothing without --yes'));
let failed = 0;
for (const w of old) {
  if (!commit) { console.log('would mark:', w.id, 'made', new Date(w.created).toISOString(), 'last seen', new Date(w.last).toISOString()); continue; }
  try {
    // Paced: the zone's rate limit answers bursts of admin POSTs with a 429
    // (Cloudflare's HTML, not the service's JSON), and a 429 is retried
    // with backoff before it counts as failed.
    let res = null;
    for (let wait = 1000; wait <= 16000; wait *= 2) {
      await sleep(300);
      res = await fetch(`${SERVICE}/admin/rooms/${encodeURIComponent(w.id)}/smoke`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ smoke: true })
      });
      if (res.status !== 429) break;
      console.log('  (429, waiting ' + wait + 'ms):', w.id);
      await sleep(wait);
    }
    if (!res.ok) throw new Error(res.status + ' ' + (await res.text()).slice(0, 80).replace(/\s+/g, ' '));
    console.log('marked:', w.id, 'last seen', new Date(w.last).toISOString());
  } catch (e) {
    failed++;
    console.error('failed:', w.id, e.message);
  }
}
if (commit) console.log(old.length - failed + ' of ' + old.length + ' marked; they age out within 30 days of their last visit');
process.exitCode = failed ? 1 : 0;
