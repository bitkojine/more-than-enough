#!/usr/bin/env node
/* Which source files part `i` of `n` of the mutation sweep plants bugs in
 * (.github/workflows/mutation.yml): every file the sweep covers, dealt out
 * biggest first to the part with the fewest lines so far, so the parts take
 * about as long as each other. Prints a comma-separated list for
 * `stryker run --mutate`.
 *   node scripts/mutation-shard.mjs <i> <n>     (i counts from 1) */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['src/core', 'src/net', 'server/src', 'src/game'];

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.posix.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [];
  });
}

export function shards(list, n) {
  const parts = Array.from({ length: n }, () => ({ lines: 0, files: [] }));
  const sized = list
    .map((f) => ({ f, lines: readFileSync(f, 'utf8').split('\n').length }))
    .sort((a, b) => b.lines - a.lines || a.f.localeCompare(b.f));
  for (const { f, lines } of sized) {
    const least = parts.reduce((a, b) => (b.lines < a.lines ? b : a));
    least.files.push(f);
    least.lines += lines;
  }
  return parts.map((p) => p.files.sort());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [i, n] = process.argv.slice(2).map(Number);
  if (!(n >= 1 && i >= 1 && i <= n)) {
    console.error('usage: node scripts/mutation-shard.mjs <i> <n>');
    process.exit(2);
  }
  console.log(shards(ROOTS.flatMap(files), n)[i - 1].join(','));
}
