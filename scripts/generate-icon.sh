#!/bin/bash
# Generate PNG icon from SVG (optional - Ubuntu supports SVG directly)
# This script uses a simple approach - you can install sharp or use other tools

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SVG_FILE="${PROJECT_DIR}/public/favicon.svg"
ICON_DIR="${PROJECT_DIR}/share/icons/hicolor"

echo "Generating app icon..."
echo "  Source: ${SVG_FILE}"

# Check if we can use sharp (Node.js)
if command -v node >/dev/null 2>&1; then
  if npm list sharp 2>/dev/null | grep -q sharp || npm install --no-save sharp 2>/dev/null; then
    echo "  Using sharp to convert SVG to PNG..."
    node -e "
      const sharp = require('sharp');
      const fs = require('fs');
      sharp('${SVG_FILE}')
        .resize(256, 256)
        .png()
        .toFile('${ICON_DIR}/256x256/apps/huddle.png')
        .then(() => console.log('✅ Icon generated: ${ICON_DIR}/256x256/apps/huddle.png'))
        .catch(e => {
          console.error('Error:', e.message);
          process.exit(1);
        });
    " && exit 0
  fi
fi

# Check for ImageMagick
if command -v convert >/dev/null 2>&1; then
  echo "  Using ImageMagick to convert SVG to PNG..."
  mkdir -p "${ICON_DIR}/256x256/apps"
  convert -background none -resize 256x256 "${SVG_FILE}" "${ICON_DIR}/256x256/apps/huddle.png" && \
    echo "✅ Icon generated: ${ICON_DIR}/256x256/apps/huddle.png" && exit 0
fi

# Check for Inkscape
if command -v inkscape >/dev/null 2>&1; then
  echo "  Using Inkscape to convert SVG to PNG..."
  mkdir -p "${ICON_DIR}/256x256/apps"
  inkscape --export-type=png --export-width=256 --export-height=256 \
    --export-filename="${ICON_DIR}/256x256/apps/huddle.png" "${SVG_FILE}" && \
    echo "✅ Icon generated: ${ICON_DIR}/256x256/apps/huddle.png" && exit 0
fi

# Check for rsvg-convert
if command -v rsvg-convert >/dev/null 2>&1; then
  echo "  Using rsvg-convert to convert SVG to PNG..."
  mkdir -p "${ICON_DIR}/256x256/apps"
  rsvg-convert -w 256 -h 256 "${SVG_FILE}" > "${ICON_DIR}/256x256/apps/huddle.png" && \
    echo "✅ Icon generated: ${ICON_DIR}/256x256/apps/huddle.png" && exit 0
fi

# Fallback: just copy SVG (Ubuntu supports SVG icons)
echo "  No PNG converter found. Copying SVG (Ubuntu supports SVG icons)..."
mkdir -p "${ICON_DIR}/scalable/apps"
cp "${SVG_FILE}" "${ICON_DIR}/scalable/apps/huddle.svg"
echo "✅ Icon copied: ${ICON_DIR}/scalable/apps/huddle.svg"
echo "  Note: Ubuntu desktop supports SVG icons directly"
















