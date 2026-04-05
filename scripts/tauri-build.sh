#!/bin/bash
# Tauri static export build script
# Only exports the pages the desktop app needs (setlab, sonix)
# Temporarily moves everything else out

set -e
cd "$(dirname "$0")/.."

BACKUP_DIR="/tmp/signallab-tauri-backup"
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/app" "$BACKUP_DIR/root"

echo "→ Isolating desktop-only pages for static export..."

# Save middleware (not supported in static export)
if [ -f "src/middleware.ts" ]; then
  cp "src/middleware.ts" "$BACKUP_DIR/root/middleware.ts"
  rm "src/middleware.ts"
fi

# Move all app directories EXCEPT setlab, sonix, and layout/globals
cd src/app
for dir in */; do
  dir="${dir%/}"
  case "$dir" in
    setlab|sonix|_*) ;; # keep these
    *) mv "$dir" "$BACKUP_DIR/app/$dir" ;;
  esac
done
cd ../..

# Remove API directory entirely
if [ -d "src/app/api" ]; then
  mv "src/app/api" "$BACKUP_DIR/app/api"
fi

# Run Next.js build with static export
echo "→ Building static export..."
TAURI_BUILD=1 npm run build
BUILD_EXIT=$?

# Restore everything
echo "→ Restoring full app..."
for dir in "$BACKUP_DIR/app"/*/; do
  dirname="$(basename "$dir")"
  mv "$dir" "src/app/$dirname"
done
# Restore standalone files
for f in "$BACKUP_DIR/app"/*; do
  [ -f "$f" ] && mv "$f" "src/app/$(basename "$f")"
done

if [ -f "$BACKUP_DIR/root/middleware.ts" ]; then
  cp "$BACKUP_DIR/root/middleware.ts" "src/middleware.ts"
fi

rm -rf "$BACKUP_DIR"

exit $BUILD_EXIT
