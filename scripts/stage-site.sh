#!/bin/sh
# Stage the deployable site into <outdir> (default: site/).
#
# The game is static files with no build step. GitHub Pages caches every file
# for 10 minutes and doesn't let us set headers, so a returning player could
# get a mix of old and new modules. Every local asset URL (in index.html and
# in each module's imports) gets ?v=<hash of the whole source tree>, so any
# change makes every URL new at once.
set -eu
cd "$(dirname "$0")/.."
OUT="${1:-site}"

rm -rf "$OUT"
mkdir -p "$OUT"
cp index.html style.css "$OUT/"
cp -R src "$OUT/src"

HASH=$(find index.html style.css src -type f | LC_ALL=C sort | xargs cat | shasum | cut -c1-10)

# index.html: the stylesheet and the entry module.
sed -i.bak -E "s#(href=\"style\\.css)\"#\\1?v=$HASH\"#; s#(src=\"src/[^\"]+\\.js)\"#\\1?v=$HASH\"#" "$OUT/index.html"
# Every relative import/export specifier: from './x.js' -> from './x.js?v=HASH'.
find "$OUT/src" -name '*.js' -exec sed -i.bak -E "s#(from '\\.{1,2}/[^']+\\.js)'#\\1?v=$HASH'#g" {} +
find "$OUT" -name '*.bak' -delete

echo "Staged $OUT/ (asset version $HASH)"
grep -Eo '(href|src)="[^"]+\?v=[^"]+"' "$OUT/index.html"
if grep -rEn "from '\.{1,2}/[^']+\.js'" "$OUT/src"; then
  echo "error: unstamped module import left in $OUT/src" >&2
  exit 1
fi
