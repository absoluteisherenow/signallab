#!/usr/bin/env bash
# check-outbound-gated.sh
# Enforces the HARD RULE from feedback_approve_before_send.md:
#   Every outbound action (email, social post, DM, SMS, invoice send, Buffer
#   schedule, promo blast) MUST flow through src/lib/outbound.ts (useGatedSend)
#   so the user sees a rendered preview + explicit confirm.
#
# This script scans frontend code (src/app + src/components, EXCLUDING src/app/api)
# for any direct `fetch(...)` call to an outbound endpoint. The only allowed
# caller is src/lib/outbound.ts itself.
#
# Exit 0 on clean, 1 on violation.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Outbound endpoint patterns — these MUST go through useGatedSend.
# We look for direct fetch() calls whose URL contains any of these tokens.
#   /send           → /api/*/send, /api/invoices/*/send, etc.
#   /publish        → /api/*/publish
#   /api/social/*/post  → instagram/tiktok/twitter post
#   /api/buffer     → Buffer queue
#   /api/promo-blast  → mass DM/email blast
#   /api/promo/send   → promo email send
OUTBOUND_REGEX='fetch\([`'"'"'"][^)]*?(\/send["'"'"'`?]|\/publish["'"'"'`?]|\/api\/social\/[a-z]+\/post|\/api\/buffer["'"'"'`?]|\/api\/promo-blast|\/api\/promo\/send)'

# Directories to scan (frontend only — server routes in src/app/api are allowed
# to call internal endpoints because they are themselves the server layer).
SCAN_DIRS=(src/app src/components)

# Files allowed to contain direct outbound fetches.
# lib/outbound.ts IS the gated send helper — everyone else must use it.
ALLOWLIST_REGEX='^(src/lib/outbound\.ts|src/app/api/)'

echo "[check-outbound-gated] Scanning ${SCAN_DIRS[*]} for ungated outbound fetches..."

# Find all matches, then filter out allowlist + src/app/api (server-side).
violations=$(
  grep -rEn "$OUTBOUND_REGEX" "${SCAN_DIRS[@]}" \
    --include='*.ts' --include='*.tsx' \
    --exclude-dir='api' \
    2>/dev/null || true
)

if [ -z "$violations" ]; then
  echo "[check-outbound-gated] ✓ all outbound sends flow through useGatedSend."
  exit 0
fi

echo ""
echo "[check-outbound-gated] ✗ HARD RULE VIOLATION — approve-before-send"
echo ""
echo "The following direct fetch() calls bypass the approval gate."
echo "Route them through useGatedSend from @/lib/outbound instead:"
echo ""
echo "$violations"
echo ""
echo "See: ~/.claude/projects/-Users-anthonymcginley-CLAUDE/memory/feedback_approve_before_send.md"
echo ""
exit 1
