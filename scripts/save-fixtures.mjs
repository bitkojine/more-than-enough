// Real saves from a past release, for test/unit/old-saves.test.js.
//
//   node scripts/save-fixtures.mjs <commit> <version>
//
// Checks <commit> out into a temporary worktree and runs THAT release's own
// rules and save code: an old-economy world held on AUTO (when the release has
// test/unit/helpers.js holdPerfect), and a crystal world played by that
// release's scripts/cultivation-playtest.mjs, saved at its first, middle and
// last stage. Each save goes to test/fixtures/saves/<version>-<kind>.json; a
// save identical to one already there isn't written again. Add a release
// whenever it changes what a save holds ("No world is ever lost", AGENTS.md).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SEED = 4242;
const OUT = new URL('../test/fixtures/saves/', import.meta.url).pathname;
const [commit, version] = process.argv.slice(2);
if (!commit || !/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('usage: node scripts/save-fixtures.mjs <commit> <version>');
  process.exit(1);
}

const digest = (save) => createHash('sha256').update(JSON.stringify(save)).digest('hex');
const have = new Set(
  readdirSync(OUT)
    .filter((f) => f.endsWith('.json'))
    .map((f) => digest(JSON.parse(readFileSync(join(OUT, f), 'utf8')).save))
);
function keep(kind, raw, note) {
  const save = JSON.parse(raw);
  if (have.has(digest(save))) return console.log(version, kind, 'same as a save already kept');
  have.add(digest(save));
  writeFileSync(
    join(OUT, `${version}-${kind}.json`),
    JSON.stringify({ version, commit, note, save }) + '\n'
  );
  console.log(version, kind, raw.length, 'bytes');
}

const wt = mkdtempSync(join(tmpdir(), 'mte-save-'));
execFileSync('git', ['worktree', 'add', '--detach', wt, commit], { stdio: 'inherit' });
try {
  const at = (p) => pathToFileURL(join(wt, p)).href;
  const C = await import(at('src/core/index.js'));
  const helpers = join(wt, 'test/unit/helpers.js');
  if (existsSync(helpers) && readFileSync(helpers, 'utf8').includes('holdPerfect')) {
    const { holdPerfect } = await import(at('test/unit/helpers.js'));
    const s = C.createState(SEED);
    holdPerfect(s, 120);
    keep('old-early', C.serialize(s), 'old economy, 2 min of AUTO');
    holdPerfect(s, 1800);
    keep('old-mid', C.serialize(s), 'old economy, 32 min of AUTO');
  } else {
    const s = C.createState(SEED);
    for (let i = 0; i < 400; i++) C.step(s, 0.25);
    s.inv.stone = (s.inv.stone || 0) + 321;
    keep('old-early', C.serialize(s), 'old economy, 100 s played, 321 stone given');
  }
  const playtest = join(wt, 'scripts/cultivation-playtest.mjs');
  if (existsSync(playtest)) {
    // Hook the playtest's own stage() so each chapter it reaches is saved.
    const src = readFileSync(playtest, 'utf8');
    if (!src.includes('function stage(name)')) throw Error('playtest has no stage(name) to hook');
    writeFileSync(
      join(wt, 'scripts/save-fixture-playtest.mjs'),
      src.replace(
        'function stage(name)',
        'function stage(name) { globalThis.saveFixtureStage?.(state, name); return stage0(name); }\n  function stage0(name)'
      )
    );
    const { playCultivation } = await import(at('scripts/save-fixture-playtest.mjs'));
    const stages = [];
    globalThis.saveFixtureStage = (s, name) => stages.push([name, C.serialize(s)]);
    try {
      playCultivation(SEED, { wallSeconds: 240 });
    } catch (e) {
      console.log('playtest stopped:', e.message);
    }
    const picks = [
      ['crystal-start', 0],
      ['crystal-mid', Math.floor(stages.length / 2)],
      ['crystal-late', stages.length - 1]
    ];
    for (const [kind, i] of picks)
      if (stages[i]) keep(kind, stages[i][1], `crystal world at playtest stage "${stages[i][0]}"`);
  }
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', wt], { stdio: 'inherit' });
  rmSync(wt, { recursive: true, force: true });
}
