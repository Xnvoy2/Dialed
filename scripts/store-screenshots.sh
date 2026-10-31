#!/bin/sh
# Resize iPhone screenshots to the 6.9-inch App Store size (1320 x 2868).
# Pro and Pro Max screenshots have the same shape, so nothing gets cropped.
# Usage: scripts/store-screenshots.sh ~/Desktop/shots/*.PNG
# Output goes to store-screenshots/ (git-ignored).
set -e
out="$(dirname "$0")/../store-screenshots"
mkdir -p "$out"
for f in "$@"; do
  name="$(basename "${f%.*}").png"
  sips -s format png -z 2868 1320 "$f" --out "$out/$name" >/dev/null
  echo "$out/$name"
done
