#!/bin/sh
# Quick local feedback by default; CI keeps the longer regression checks.
# One command, one pass/fail, each step named.
#
#   npm run check            quick local tests and staging
#   npm run check -- full    also run the long Perfect benchmark
#
# What it runs, and why each is here:
#   - npm test           pages.yml and rooms.yml both run it (unit + property,
#                        including the smoke test's checks against a local
#                        Room: test/unit/smoke.test.js — the same assertions
#                        the deploy's smoke test makes, so a wrong idea about
#                        the wire fails here, not only in CI)
#   - Perfect benchmark  explicit -- full, and pages.yml for rule/brain changes
#   - stage-site.sh      pages.yml's deploy step: a staging break would only
#                        show up live
#
# Deliberately not in the gate, because each takes minutes and none is what
# usually breaks a push — run them by hand when you touch what they cover:
#   - npm run test:layout   every screen at 12 sizes × 2 languages (~4 min).
#                           Run after a layout or text-length change.
#   - npm run test:e2e      gameplay in real Chrome. It plays in a randomly
#                           seeded world, so checks that depend on the world
#                           it happens to draw fail on some runs and not
#                           others: a failure means "re-run and look", not
#                           "CI would have caught it". Run after a change
#                           under src/game/. Use MTE_LAYOUT_SCREENS=320x568,
#                           375x667,430x932,1366x768 for a quicker layout pass.
set -eu
cd "$(dirname "$0")/.."
QUICK="${1:-}"

step() { printf '\n== %s\n' "$1"; }

step 'unit and property tests (npm test)'
npm test

# The explicit full check benchmarks changed rules/brain, the way
# pages.yml decides it (it diffs the pushed-to commit) — checked here against
# origin/main, including uncommitted work, so a green local run means the same
# set CI runs.
BASE="$(git rev-parse --verify origin/main 2>/dev/null || git rev-parse --verify main 2>/dev/null || true)"
if [ "$QUICK" = "full" ] && [ -n "$BASE" ] &&
   ! git diff --quiet "$BASE" -- src/core scripts/perfect-bench.mjs test/perfect-baseline.json test/unit/helpers.js; then
  step 'Perfect benchmark against the baseline'
  node scripts/perfect-bench.mjs --check
else
  step 'Perfect benchmark (skipped: not asked, or the rules and the brain did not change)'
fi

step 'stage the deployable site (stage-site.sh)'
sh scripts/stage-site.sh site >/dev/null
echo "staged site/ OK"

step 'all green'
