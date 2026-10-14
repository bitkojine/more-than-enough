#!/bin/sh
# Renders the app icons from icons/icon.svg (rounded, for favicons and
# "any" manifest icons) and icons/icon-full.svg (edge to edge, art inside the
# safe zone, for iOS and Android maskable icons, which crop to their own
# shape), and social.svg (the link preview). Needs rsvg-convert
# (brew install librsvg). Commit the PNGs.
set -eu
cd "$(dirname "$0")/../icons"
rsvg-convert -w 32 -h 32 icon.svg -o favicon-32.png
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
rsvg-convert -w 180 -h 180 icon-full.svg -o apple-touch-icon.png
rsvg-convert -w 512 -h 512 icon-full.svg -o icon-maskable-512.png
rsvg-convert -w 1200 -h 630 social.svg -o social.png
echo "Rendered icons/"
