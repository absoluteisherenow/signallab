#!/usr/bin/env bash
# check-brain-wired.sh
# Enforces the central-brain contract:
#   1. Server routes (src/app/api) MUST NOT raw-fetch https://api.anthropic.com.
#      Allowed callers:
#        - src/lib/callClaude.ts            (the central wrapper itself)
#        - src/app/api/claude/route.ts      (generic non-stream proxy)
#        - src/app/api/claude/stream/route.ts (SSE streaming proxy; callClaude
#          does not support streaming, so the stream route is the official
#          server-side streaming boundary)
#      Everyone else goes through callClaude, callClaudeWithBrain, or /api/claude.
#   2. Tonight's "Night Manoeuvres" / "bookings@signallabos.com" hardcodes in
#      server routes are flagged — identity must load from artist_profiles /
#      connected_email_accounts via getOperatingContext(), not be baked into
#      route code.
#
# Exit 0 on clean, 1 on violation.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

fail=0

echo "[check-brain-wired] Scanning src/app/api for direct Anthropic fetches..."
anthro_violations=$(
  grep -rEn "https://api\.anthropic\.com" src/app/api src/components src/lib \
    --include='*.ts' --include='*.tsx' \
    2>/dev/null \
    | grep -v 'src/lib/callClaude\.ts' \
    | grep -v 'src/app/api/claude/route\.ts' \
    | grep -v 'src/app/api/claude/stream/route\.ts' \
    || true
)
anthro_count=$(echo "$anthro_violations" | grep -c '^' || true)
[ -z "$anthro_violations" ] && anthro_count=0

# Ratchet threshold — lowered as routes migrate to callClaudeWithBrain /
# callClaude. Target: 0. We get there by ratcheting this down on every PR;
# a new raw-fetch landing in src/app/api will fail the build as soon as the
# count exceeds this ceiling.
#
# 2026-04-21 baseline  : 33  (pre-central-brain)
# 2026-04-21 this wave : 0   after migrating analyse-document, signal-bar,
#                            artist-scan (×3), spotify, setlab-reference,
#                            stem-analyse, mix-scan, sets/from-screenshot,
#                            and allowlisting the claude/stream SSE proxy.
BRAIN_MIGRATION_CEILING=0

if [ "$anthro_count" -gt "$BRAIN_MIGRATION_CEILING" ]; then
  echo ""
  echo "[check-brain-wired] ✗ RATCHET VIOLATION — direct Anthropic fetches increased"
  echo ""
  echo "Current: $anthro_count, ceiling: $BRAIN_MIGRATION_CEILING. Every new"
  echo "AI caller MUST go through callClaudeWithBrain or /api/claude."
  echo ""
  echo "$anthro_violations"
  echo ""
  fail=1
elif [ "$anthro_count" -gt 0 ]; then
  echo "[check-brain-wired] ℹ $anthro_count routes still raw-fetch Anthropic (ceiling: $BRAIN_MIGRATION_CEILING). Migrating in progress."
fi

echo "[check-brain-wired] Scanning for hardcoded 'Night Manoeuvres' in server routes..."
# Allowed places to reference the artist name literally:
#  - seed data in supabase/seed (if present)
#  - memory files in .claude/
#  - /tmp migration SQL (out of repo)
#  - brand asset files (public/)
nm_hardcoded=$(
  grep -rEn "Night Manoeuvres|NIGHT manoeuvres" src/app/api src/lib \
    --include='*.ts' \
    2>/dev/null \
    | grep -v 'src/lib/rules/' \
    | grep -v 'rule_' \
    || true
)
if [ -n "$nm_hardcoded" ]; then
  echo ""
  echo "[check-brain-wired] ⚠ SOFT FLAG — hardcoded artist name in server code"
  echo ""
  echo "These files reference 'Night Manoeuvres' directly. Prefer loading"
  echo "ctx.artist.name via getOperatingContext() so new users work too:"
  echo ""
  echo "$nm_hardcoded"
  echo ""
  # Soft flag only — don't fail the build on this yet. After migration
  # is complete, flip this to fail=1.
fi

echo "[check-brain-wired] Scanning for hardcoded 'bookings@signallabos.com' in server routes..."
bookings_hardcoded=$(
  grep -rEn "bookings@signallabos\.com" src/app src/lib \
    --include='*.ts' --include='*.tsx' \
    2>/dev/null || true
)
if [ -n "$bookings_hardcoded" ]; then
  echo ""
  echo "[check-brain-wired] ✗ HARD RULE VIOLATION — hardcoded Resend-from"
  echo ""
  echo "rule_invoice_from_address.md: invoices/reminders MUST send from the"
  echo "user's connected Gmail OAuth account (ctx.connections.gmail_from),"
  echo "never from bookings@signallabos.com / Resend:"
  echo ""
  echo "$bookings_hardcoded"
  echo ""
  fail=1
fi

if [ $fail -eq 0 ]; then
  echo "[check-brain-wired] ✓ all Claude calls + identity references respect the central brain."
  exit 0
fi

exit 1
