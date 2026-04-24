#!/bin/bash
set -e
SRC=public/icon-512.png
BG=050505
DST=public/splash
declare -a SIZES=(
  "1290x2796"  # iPhone 15 Pro Max / 14 Pro Max
  "1179x2556"  # iPhone 15 Pro / 15 / 14 Pro
  "1284x2778"  # iPhone 14 Plus / 13 Pro Max
  "1170x2532"  # iPhone 14 / 13 / 13 Pro
  "1125x2436"  # iPhone 13 mini / 12 mini / X / XS / 11 Pro
  "828x1792"   # iPhone XR / 11
  "750x1334"   # iPhone SE (2nd/3rd) / 8 / 7 / 6s / 6
  "640x1136"   # iPhone SE (1st) / 5s
)
for S in "${SIZES[@]}"; do
  W=${S%x*}
  H=${S#*x}
  # Shorter dim * 0.4 = logo size
  if (( W < H )); then LOGO=$(( W * 4 / 10 )); else LOGO=$(( H * 4 / 10 )); fi
  # 1. solid background
  sips -s format png -z "$H" "$W" --padToHeightWidth "$H" "$W" --padColor "$BG" "$SRC" --out "$DST/bg-$S.png" >/dev/null
  # 2. resize logo
  sips -Z "$LOGO" "$SRC" --out "/tmp/logo-$S.png" >/dev/null
  # 3. composite
  OX=$(( (W - LOGO) / 2 ))
  OY=$(( (H - LOGO) / 2 ))
  /usr/bin/python3 <<PY
from PIL import Image
bg = Image.open("$DST/bg-$S.png").convert("RGBA")
logo = Image.open("/tmp/logo-$S.png").convert("RGBA")
bg.paste(logo, (${OX}, ${OY}), logo)
bg.convert("RGB").save("$DST/splash-$S.png", "PNG")
PY
  rm -f "$DST/bg-$S.png" "/tmp/logo-$S.png"
  echo "  $DST/splash-$S.png"
done
