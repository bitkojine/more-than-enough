#!/bin/sh
# Stage the deployable site into <outdir> (default: site/): the game at the
# root, the wiki under wiki/ and the privacy policy under privacy/.
#
# The site is static files with no build step. GitHub Pages caches every file
# for 10 minutes and doesn't let us set headers, so a returning player could
# get a mix of old and new modules. Every local asset URL (stylesheets and
# scripts in each page, and every module import) gets ?v=<hash of the whole
# source tree>, so any change makes every URL new at once. Icons and the
# manifest get it too: Safari keeps one icon cache per host, and every project
# on bitkojine.github.io shares that host, so a fixed icon URL can show another
# project's icon in Favorites or on the home screen.
set -eu
cd "$(dirname "$0")/.."
OUT="${1:-site}"
SOURCES="index.html style.css autoplay-lab.css manifest.webmanifest icons src wiki packs privacy"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R $SOURCES "$OUT/"

HASH=$(sh scripts/site-hash.sh)

# One file for the default pack's pictures, and every module named up front
# (before stamping, so the preload links get the same ?v= as the imports).
node scripts/stage-speed.mjs "$OUT"

# Pages: local href/src to stylesheets, scripts, icons and the manifest
# (anything without a scheme).
find "$OUT" -name '*.html' -exec sed -i.bak -E "s#((href|src)=\"[^\":]+\\.(css|js|json|png|svg|webmanifest))\"#\\1?v=$HASH\"#g" {} +
# Manifest: its icons' "src".
sed -i.bak -E "s#(\"src\": *\"[^\":]+\\.(png|svg))\"#\\1?v=$HASH\"#g" "$OUT/manifest.webmanifest"
# Modules: from './x.js' -> from './x.js?v=HASH'.
find "$OUT" -name '*.js' -exec sed -i.bak -E "s#(from '\\.{1,2}/[^']+\\.js)'#\\1?v=$HASH'#g" {} +
# Lazy developer modules get the same cache identity as the main bundle.
find "$OUT" -name '*.js' -exec sed -i.bak -E "s#(import\\(['\"]\\.{1,2}/[^'\"]+\\.js)(['\"]\\))#\\1?v=$HASH\\2#g" {} +
find "$OUT" -name '*.bak' -delete
# The live site never talks to a developer's own room service: the
# Content-Security-Policy's localhost entries (for `wrangler dev`) stay in
# the source only.
sed -i.bak -E "s# (http|ws)://localhost:8787##g" "$OUT/index.html"
rm -f "$OUT/index.html.bak"
if grep -q 'localhost' "$OUT/index.html"; then
  echo "error: localhost left in the staged page's CSP" >&2
  exit 1
fi
# The build the site serves: the running game compares it with the ?v= on its
# own modules and reloads into a new deploy at once (src/game/update.js).
printf '{"build":"%s"}\n' "$HASH" > "$OUT/build.json"

echo "Staged $OUT/ (asset version $HASH)"
grep -rEo '(href|src)="[^"]+\?v=[^"]+"' "$OUT" --include='*.html'
if grep -rEn "from '\.{1,2}/[^']+\.js'" "$OUT" --include='*.js'; then
  echo "error: unstamped module import left in $OUT" >&2
  exit 1
fi
