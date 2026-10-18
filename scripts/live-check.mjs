/* Is everything live what main says it should be? Run hourly and after every
 * deploy by .github/workflows/live-check.yml, or by hand:
 *   GITHUB_TOKEN=... node scripts/live-check.mjs   (the token is optional locally)
 * Checks that the latest run of every workflow on main passed, that the game
 * site serves the build main would stage (build.json) and that the room
 * service answers and runs the newest commit its workflow deploys. Prints one
 * line per problem and exits 1 if there is any. A deploy gets GRACE_MIN to go
 * live before a stale site or service counts. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const GRACE_MIN = 30;
const SITE = 'https://play.robertasrudys.com';
const ROOMS = 'https://rooms.robertasrudys.com';
const REPO = process.env.GITHUB_REPOSITORY || 'bitkojine/more-than-enough';
const OK = new Set(['success', 'skipped', 'cancelled', 'neutral']);

/** The latest run of each workflow, from runs listed newest first. */
export function latestRuns(runs, skip = []) {
  const seen = new Map();
  for (const r of runs) if (!seen.has(r.name) && !skip.includes(r.name)) seen.set(r.name, r);
  return [...seen.values()];
}

/** Every problem the facts show, as lines for a person to read. */
export function problems({ runs = [], runsError, site, rooms }) {
  const out = [];
  if (runsError) out.push(`couldn't read the workflow runs: ${runsError}`);
  for (const r of runs) {
    if (r.status === 'completed' && !OK.has(r.conclusion)) out.push(`${r.name}: the latest run on main ${r.conclusion} (${r.html_url})`);
  }
  if (site) {
    if (!site.up) out.push(`the game site doesn't answer: ${site.error}`);
    else if (site.live !== site.want && site.ageMin > GRACE_MIN) out.push(`the game site serves build ${site.live}, main would deploy ${site.want} (main is ${Math.round(site.ageMin)} min old)`);
  }
  if (rooms) {
    if (!rooms.up) out.push(`the room service doesn't answer: ${rooms.error}`);
    else if (rooms.ageMin > GRACE_MIN && !rooms.current) out.push(`the room service runs ${rooms.live || 'an unnamed commit'}, not ${rooms.want} or newer (${Math.round(rooms.ageMin)} min old)`);
  }
  return out;
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const minutesSince = (sha) => (Date.now() / 1000 - Number(git('log', '-1', '--format=%ct', sha))) / 60;

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function facts() {
  const auth = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  let runs = [], runsError;
  try {
    const list = await getJSON(`https://api.github.com/repos/${REPO}/actions/runs?branch=main&event=push&per_page=50`, auth);
    runs = latestRuns(list.workflow_runs, ['Live check']);
  } catch (e) { runsError = e.message; }

  const site = { want: execFileSync('sh', ['scripts/site-hash.sh'], { encoding: 'utf8' }).trim(), ageMin: minutesSince('HEAD') };
  try { site.live = (await getJSON(`${SITE}/build.json?now=${Date.now()}`)).build; site.up = true; } catch (e) { site.error = e.message; }

  // The paths rooms.yml deploys on, read from the workflow so they can't differ.
  const paths = JSON.parse(readFileSync('.github/workflows/rooms.yml', 'utf8').match(/paths: (\[.*\])/)[1].replace(/'/g, '"'));
  const want = git('log', '-1', '--format=%H', 'HEAD', '--', ...paths.map((p) => p.replace(/\/\*\*$/, '')));
  const rooms = { want, ageMin: minutesSince(want) };
  try {
    rooms.live = (await getJSON(`${ROOMS}/`)).commit || null;
    rooms.up = true;
    rooms.current = !!rooms.live && (() => { try { git('merge-base', '--is-ancestor', want, rooms.live); return true; } catch { return false; } })();
  } catch (e) { rooms.error = e.message; }
  return { runs, runsError, site, rooms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = problems(await facts());
  for (const p of found) console.log('- ' + p);
  if (!found.length) console.log('All live and green.');
  process.exit(found.length ? 1 : 0);
}
