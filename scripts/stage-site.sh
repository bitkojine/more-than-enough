#!/bin/sh
# Stage the deployable site into <outdir> (default: site/): the game at the
# root and the wiki under wiki/.
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
SOURCES="index.html style.css manifest.webmanifest icons src wiki packs"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R $SOURCES "$OUT/"

HASH=$(find $SOURCES -type f | LC_ALL=C sort | xargs cat | shasum | cut -c1-10)

# Pages: local href/src to stylesheets, scripts, icons and the manifest
# (anything without a scheme).
find "$OUT" -name '*.html' -exec sed -i.bak -E "s#((href|src)=\"[^\":]+\\.(css|js|png|svg|webmanifest))\"#\\1?v=$HASH\"#g" {} +
# Manifest: its icons' "src".
sed -i.bak -E "s#(\"src\": *\"[^\":]+\\.(png|svg))\"#\\1?v=$HASH\"#g" "$OUT/manifest.webmanifest"
# Modules: from './x.js' -> from './x.js?v=HASH'.
find "$OUT" -name '*.js' -exec sed -i.bak -E "s#(from '\\.{1,2}/[^']+\\.js)'#\\1?v=$HASH'#g" {} +
find "$OUT" -name '*.bak' -delete

echo "Staged $OUT/ (asset version $HASH)"
grep -rEo '(href|src)="[^"]+\?v=[^"]+"' "$OUT" --include='*.html'
if grep -rEn "from '\.{1,2}/[^']+\.js'" "$OUT" --include='*.js'; then
  echo "error: unstamped module import left in $OUT" >&2
  exit 1
fi
