/* Commit messages explain why (AGENTS.md, Watch 2026-10-31). A commit that
 * changes more than SMALL lines needs a body: at least one line after the
 * subject that isn't a trailer (Co-Authored-By:, Claude-Session: and the
 * like). Tiny fixes may stay one line.
 *
 *   node scripts/commit-messages.mjs <base> <head>   every commit in base..head
 *   node scripts/commit-messages.mjs <head>          just that commit
 *
 * .github/workflows/commits.yml runs it on every push and pull request. It
 * flags; it never blocks a deploy, since a pushed commit on main is not
 * rewritten (AGENTS.md). Fix the habit in the next commit. */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SMALL = 20; // changed lines a one-line message may cover

const TRAILER = /^[A-Za-z][A-Za-z0-9-]*: \S/;

// The explaining part of a message: the lines after the subject, without
// trailers and blank lines.
export function bodyOf(message) {
  const [, ...rest] = message.replace(/\r/g, '').trimEnd().split('\n');
  return rest.filter((l) => l.trim() && !TRAILER.test(l.trim()));
}

// Why a commit's message falls short, or null when it's fine.
export function problem({ message, changed, parents = 1 }) {
  if (parents > 1) return null; // merges say what they merge
  if (changed <= SMALL) return null;
  if (bodyOf(message).length) return null;
  return `${changed} changed lines and no body saying why`;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

function changedLines(sha) {
  let n = 0;
  for (const line of git('show', '--numstat', '--format=', sha).split('\n')) {
    const [add, del] = line.split('\t');
    if (/^\d+$/.test(add) && /^\d+$/.test(del)) n += Number(add) + Number(del);
  }
  return n;
}

function commits(base, head) {
  const zero = !base || /^0+$/.test(base);
  return git(
    'rev-list',
    '--reverse',
    zero ? '--max-count=1' : `${base}..${head}`,
    ...(zero ? [head] : [])
  )
    .split('\n')
    .filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b] = process.argv.slice(2);
  const [base, head] = b ? [a, b] : [null, a || 'HEAD'];
  const bad = [];
  for (const sha of commits(base, head)) {
    const message = git('log', '-1', '--format=%B', sha);
    const parents = git('log', '-1', '--format=%P', sha).trim().split(/\s+/).length;
    const why = problem({ message, changed: changedLines(sha), parents });
    if (why) bad.push(`${sha.slice(0, 7)} ${message.split('\n')[0]}\n    ${why}`);
  }
  if (bad.length) {
    console.log(
      `Commits that need a body saying why (AGENTS.md, Commit messages):\n${bad.join('\n')}`
    );
    process.exit(1);
  }
  console.log('Commit messages explain their changes.');
}
