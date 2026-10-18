#!/bin/sh
# The hash of the site's whole source tree: the ?v= on every asset and the
# "build" in build.json (scripts/stage-site.sh). scripts/live-check.mjs uses it
# to tell whether the live site is the one main would deploy.
set -eu
cd "$(dirname "$0")/.."
SOURCES="index.html style.css manifest.webmanifest icons src wiki packs privacy"
find $SOURCES -type f | LC_ALL=C sort | xargs cat | shasum | cut -c1-10
