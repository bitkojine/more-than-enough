#!/bin/sh
# Quick local feedback by default; CI keeps the longer regression checks.
# One command, one pass/fail, each step named.
#
#   npm run check            quick local tests and staging
#   npm run check -- full    also run the long Perfect benchmark
#
# What it runs, and why each is here:
#   - npm run lint       ESLint: errors fail, and the warning count may only
#                        go down (--max-warnings in package.json is a
#                        ratchet: lower it when you clear warnings). Then
#                        Prettier: unformatted JavaScript fails; run
#                        `npm run format` to fix it.
#   - npm test           pages.yml and rooms.yml both run it (unit + property,
#                        including the smoke test's checks against a local
#                        Room: test/unit/smoke.test.js — the same assertions
#                        the deploy's smoke test makes, so a wrong idea about
#                        the wire fails here, not only in CI)
#   - Perfect benchmark  explicit -- full, and pages.yml for rule/brain changes
#   - stage-site.sh      pages.yml's deploy step: a staging break would only
#                        show up live
#   - render checks      pages.yml's render job (scripts/check-render-host.mjs
#                        on the staged site, with WebGL), which blocks the
#                        deploy. Run whenever code the browser loads differs
#                        from origin/main. 0.190.0 was pushed with only the
#                        main browser journey run, and the deploy stopped on
#                        a lighting check that journey doesn't include.
#                        Needs Chrome: google-chrome, or CHROME_PATH (a
#                        wrapper adding --no-sandbox when running as root).
#
# Deliberately not in the gate, because each takes minutes and none is what
# usually breaks a push — run them by hand when you touch what they cover:
#   - npm run test:layout   every screen at 12 sizes × 2 languages (~4 min).
#                           Run after a layout or text-length change. Use
#                           MTE_LAYOUT_SCREENS=320x568,375x667,430x932,1366x768
#                           for a quicker pass.
#   - npm run test:e2e      gameplay in real Chrome, in a randomly seeded
#                           world. CI runs it too (browser.yml, re-run once
#                           when red, never blocking a deploy). Run it after
#                           a change under src/game/.
set -eu
cd "$(dirname "$0")/.."
QUICK="${1:-}"

step() { printf '\n== %s\n' "$1"; }

step 'lint (npm run lint)'
npm run lint

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

# Everything the staged site is built from, and the render checks themselves.
BROWSER_INPUTS="index.html style.css packs src/game src/i18n src/core src/net src/vendor scripts/stage-site.sh scripts/stage-speed.mjs scripts/check-render-host.mjs test/browser.e2e.js test/*.browser.js"
if [ -n "$BASE" ] && git diff --quiet "$BASE" -- $BROWSER_INPUTS &&
   [ -z "$(git ls-files --others --exclude-standard -- $BROWSER_INPUTS)" ]; then
  step 'render checks (skipped: nothing the browser loads changed)'
else
  step 'render checks, as the deploy runs them (check-render-host.mjs)'
  if [ -z "${CHROME_PATH:-}" ] && ! command -v google-chrome >/dev/null 2>&1; then
    echo 'No Chrome: set CHROME_PATH (see the top of this file). The deploy runs these checks and stops if they fail.' >&2
    exit 1
  fi
  MTE_SITE=site MTE_WEBGL=1 node scripts/check-render-host.mjs
fi

step 'all green'
