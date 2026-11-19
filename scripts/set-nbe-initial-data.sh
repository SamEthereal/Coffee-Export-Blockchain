#!/bin/bash
# Set initial NBE exchange rate and retention policy
# This needs to be done once so banks can allocate forex
#
# IDEMPOTENT (fixed 2026-11-19): before posting anything, the script GETs
# the currently active rate / policy from the ledger and SKIPS the POST when
# the active values already equal the targets below. A second run therefore
# creates zero new rows. This is the only correct shape here because there
# is NO upsert endpoint: POST /forex/exchange-rate and POST /forex/retention-
# policy are create-only, and the chaincode rejects a duplicate ID
# (SetExchangeRate / SetRetentionPolicy: "already exists", forex.go).
# A fresh timestamped ID is therefore used ONLY when a new row is genuinely
# needed (no active record, or the active values differ from the targets);
# re-using a fixed ID would fail with "already exists" on the update path.
#
# LIVE VALUES (verified 2026-11-19, ~19:02 EAT, before this fix):
#   GET /forex/rates/USD/current -> HTTP 200, active rate
#   rateId RATE1795102539724XTIF887F0, buyingRate 57, sellingRate 57.5,
#   midRate 57.25, status ACTIVE (mid = (57 + 57.5) / 2, computed by the
#   chaincode). The old 118.50 / 119.50 / mid 119.00 values were stale and
#   would have posted a wrong rate. COFFEE retention was already 40% ACTIVE
#   (policyId POLICY-COFFEE-1794717382226), which is the target kept here.
#
# FAIL-LOUD: every curl is checked for transport failure AND for its HTTP
# status AND for the API's .success flag. A failed login, a failed POST, or
# a failed final verification exits non-zero. (The old script captured curl
# output in variables, which defeated `set -e`, and only echoed failures.)

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3001/api/v1}"
NBE_USERNAME="${NBE_USERNAME:-nbe_admin}"
NBE_PASSWORD="${NBE_PASSWORD:-password123}"

# Targets — the verified live NBE values (see header). Do not change these
# without re-verifying GET /forex/rates/USD/current on the live system.
TARGET_CURRENCY="USD"
TARGET_BUYING="57"
TARGET_SELLING="57.50"
TARGET_MID="57.25"
TARGET_COMMODITY="COFFEE"
TARGET_RETENTION="40"

command -v curl >/dev/null 2>&1 || { echo "❌ curl is required but not installed" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "❌ jq is required but not installed" >&2; exit 1; }

die() {
  echo "❌ $*" >&2
  exit 1
}

# api_call <METHOD> <URL> [JSON_BODY]
# On success sets API_CODE (HTTP status) and API_BODY (response body) and
# returns 0. On a curl transport failure it dies immediately (non-zero exit,
# never a silent empty body). HTTP status is left for the caller to check so
# a 404 can mean "no active record yet" instead of a fatal error.
API_CODE=""
API_BODY=""
api_call() {
  local method="$1" url="$2" body="${3:-}"
  local tmpfile http_code curl_rc
  tmpfile="$(mktemp)" || die "could not create temp file"
  if [ -n "$body" ]; then
    curl -sS -o "$tmpfile" -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer ${TOKEN:-}" \
      -H "Content-Type: application/json" \
      -d "$body" > "$tmpfile.code" 2>"$tmpfile.err" || curl_rc=$?
  else
    curl -sS -o "$tmpfile" -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer ${TOKEN:-}" > "$tmpfile.code" 2>"$tmpfile.err" || curl_rc=$?
  fi
  curl_rc="${curl_rc:-0}"
  http_code="$(cat "$tmpfile.code")"
  API_CODE="$http_code"
  API_BODY="$(cat "$tmpfile")"
  rm -f "$tmpfile" "$tmpfile.code" "$tmpfile.err"
  if [ "$curl_rc" -ne 0 ]; then
    die "curl failed (exit $curl_rc) for $method $url — is the API up at $API_BASE?"
  fi
  if [ -z "$http_code" ]; then
    die "no HTTP status received for $method $url"
  fi
}

# require_success <what> — dies unless the last api_call was HTTP 2xx with
# .success == true. Prints the raw response body so the failure is visible.
require_success() {
  local what="$1"
  case "$API_CODE" in
    2*) ;;
    *) echo "$API_BODY" | jq '.' 2>/dev/null || echo "$API_BODY"; die "$what failed: HTTP $API_CODE";;
  esac
  if [ "$(echo "$API_BODY" | jq -r '.success // false')" != "true" ]; then
    echo "$API_BODY" | jq '.' 2>/dev/null || echo "$API_BODY"
    die "$what failed: API returned success=false (HTTP $API_CODE)"
  fi
}

# rate_matches_target <response-body> — 0 when .data is buying 57 / selling 57.5.
rate_matches_target() {
  echo "$1" | jq -e \
    --argjson buying "$TARGET_BUYING" \
    --argjson selling "$TARGET_SELLING" \
    '.data.buyingRate == $buying and .data.sellingRate == $selling' >/dev/null 2>&1
}

# policy_matches_target <response-body> — 0 when .data.retentionRate is 40.
policy_matches_target() {
  echo "$1" | jq -e \
    --argjson retention "$TARGET_RETENTION" \
    '.data.retentionRate == $retention' >/dev/null 2>&1
}

echo ""
echo "🔐 Logging in as NBE Admin..."

# Login — no TOKEN yet, so call curl directly (api_call adds an empty
# Authorization header otherwise, which is harmless, but keep login explicit).
login_body="$(mktemp)" || die "could not create temp file"
login_code_file="$(mktemp)" || die "could not create temp file"
if ! curl -sS -o "$login_body" -w "%{http_code}" -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$NBE_USERNAME\",\"password\":\"$NBE_PASSWORD\"}" \
    > "$login_code_file" 2>"$login_body.err"; then
  rm -f "$login_body" "$login_code_file" "$login_body.err"
  die "login request failed (curl error) — is the API up at $API_BASE?"
fi
login_code="$(cat "$login_code_file")"
login_response="$(cat "$login_body")"
rm -f "$login_body" "$login_code_file" "$login_body.err"
if [ "$login_code" != "200" ]; then
  echo "$login_response" | jq '.' 2>/dev/null || echo "$login_response"
  die "NBE login failed: HTTP $login_code"
fi
TOKEN="$(echo "$login_response" | jq -r '.data.token // .token // empty')"
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "$login_response" | jq '.' 2>/dev/null || echo "$login_response"
  die "NBE login failed: no token in response (HTTP $login_code)"
fi

echo "✅ NBE login successful"

# --- USD exchange rate: skip when the active ledger rate already matches ---
echo ""
echo "💱 Checking USD exchange rate..."
api_call GET "$API_BASE/forex/rates/USD/current"
case "$API_CODE" in
  200)
    if [ "$(echo "$API_BODY" | jq -r '.success // false')" != "true" ]; then
      echo "$API_BODY" | jq '.' 2>/dev/null || echo "$API_BODY"
      die "could not read current USD rate: API returned success=false (HTTP 200)"
    fi
    if rate_matches_target "$API_BODY"; then
      echo "✅ Exchange rate already set: USD buying $TARGET_BUYING / selling $TARGET_SELLING (mid $TARGET_MID) — skipping, no new row created"
      echo "   Rate ID: $(echo "$API_BODY" | jq -r '.data.rateId // .data.RateID // "unknown"')"
    else
      echo "ℹ️  Active USD rate differs from target (buying $(echo "$API_BODY" | jq -r '.data.buyingRate'), selling $(echo "$API_BODY" | jq -r '.data.sellingRate')) — posting the target rate (old row is superseded on-ledger)"
      rate_id="RATE-USD-$(date +%s)"
      api_call POST "$API_BASE/forex/exchange-rate" "{
        \"rateID\": \"$rate_id\",
        \"currency\": \"$TARGET_CURRENCY\",
        \"buyingRate\": \"$TARGET_BUYING\",
        \"sellingRate\": \"$TARGET_SELLING\",
        \"setBy\": \"$NBE_USERNAME\",
        \"justification\": \"Initial system configuration - Official NBE rate\"
      }"
      require_success "Setting exchange rate"
      echo "✅ Exchange rate set successfully"
      echo "   Rate ID: $rate_id"
      echo "   USD Buying: $TARGET_BUYING ETB"
      echo "   USD Selling: $TARGET_SELLING ETB"
      echo "   Mid Rate: $TARGET_MID ETB"
    fi
    ;;
  404)
    echo "ℹ️  No active USD rate on the ledger — posting the initial rate"
    rate_id="RATE-USD-$(date +%s)"
    api_call POST "$API_BASE/forex/exchange-rate" "{
      \"rateID\": \"$rate_id\",
      \"currency\": \"$TARGET_CURRENCY\",
      \"buyingRate\": \"$TARGET_BUYING\",
      \"sellingRate\": \"$TARGET_SELLING\",
      \"setBy\": \"$NBE_USERNAME\",
      \"justification\": \"Initial system configuration - Official NBE rate\"
    }"
    require_success "Setting exchange rate"
    echo "✅ Exchange rate set successfully"
    echo "   Rate ID: $rate_id"
    echo "   USD Buying: $TARGET_BUYING ETB"
    echo "   USD Selling: $TARGET_SELLING ETB"
    echo "   Mid Rate: $TARGET_MID ETB"
    ;;
  *)
    echo "$API_BODY" | jq '.' 2>/dev/null || echo "$API_BODY"
    die "could not read current USD rate: HTTP $API_CODE"
    ;;
esac

# --- COFFEE retention policy: skip when the active policy already matches ---
echo ""
echo "📋 Checking COFFEE retention policy..."
api_call GET "$API_BASE/forex/retention-policy/$TARGET_COMMODITY"
case "$API_CODE" in
  200)
    if [ "$(echo "$API_BODY" | jq -r '.success // false')" != "true" ]; then
      echo "$API_BODY" | jq '.' 2>/dev/null || echo "$API_BODY"
      die "could not read current COFFEE retention policy: API returned success=false (HTTP 200)"
    fi
    if policy_matches_target "$API_BODY"; then
      echo "✅ Retention policy already set: COFFEE $TARGET_RETENTION% retention — skipping, no new row created"
      echo "   Policy ID: $(echo "$API_BODY" | jq -r '.data.policyId // .data.PolicyID // "unknown"')"
    else
      echo "ℹ️  Active COFFEE policy differs from target (retention $(echo "$API_BODY" | jq -r '.data.retentionRate')%) — posting the target policy (old row is deactivated on-ledger)"
      policy_id="POLICY-COFFEE-$(date +%s)"
      api_call POST "$API_BASE/forex/retention-policy" "{
        \"policyID\": \"$policy_id\",
        \"commodityType\": \"$TARGET_COMMODITY\",
        \"retentionRate\": $TARGET_RETENTION,
        \"setBy\": \"$NBE_USERNAME\",
        \"justification\": \"Initial system configuration - NBE coffee export retention policy\"
      }"
      require_success "Setting retention policy"
      echo "✅ Retention policy set successfully"
      echo "   Policy ID: $policy_id"
      echo "   Commodity: COFFEE"
      echo "   Retention Rate: $TARGET_RETENTION% USD retained"
      echo "   Conversion: 60% converted to ETB"
    fi
    ;;
  404)
    echo "ℹ️  No active COFFEE retention policy on the ledger — posting the initial policy"
    policy_id="POLICY-COFFEE-$(date +%s)"
    api_call POST "$API_BASE/forex/retention-policy" "{
      \"policyID\": \"$policy_id\",
      \"commodityType\": \"$TARGET_COMMODITY\",
      \"retentionRate\": $TARGET_RETENTION,
      \"setBy\": \"$NBE_USERNAME\",
      \"justification\": \"Initial system configuration - NBE coffee export retention policy\"
    }"
    require_success "Setting retention policy"
    echo "✅ Retention policy set successfully"
    echo "   Policy ID: $policy_id"
    echo "   Commodity: COFFEE"
    echo "   Retention Rate: $TARGET_RETENTION% USD retained"
    echo "   Conversion: 60% converted to ETB"
    ;;
  *)
    echo "$API_BODY" | jq '.' 2>/dev/null || echo "$API_BODY"
    die "could not read current COFFEE retention policy: HTTP $API_CODE"
    ;;
esac

# --- Verify the final state by reading it back; any mismatch is fatal ---
echo ""
echo "🔍 Verifying NBE data..."

api_call GET "$API_BASE/forex/rates/USD/current"
require_success "Verifying exchange rate"
if ! rate_matches_target "$API_BODY"; then
  echo "$API_BODY" | jq '.' 2>/dev/null || echo "$API_BODY"
  die "exchange rate verification failed: active USD rate is buying $(echo "$API_BODY" | jq -r '.data.buyingRate') / selling $(echo "$API_BODY" | jq -r '.data.sellingRate'), expected $TARGET_BUYING / $TARGET_SELLING"
fi
mid_rate="$(echo "$API_BODY" | jq -r '.data.midRate // .data.MidRate // "N/A"')"
if [ "$mid_rate" != "$TARGET_MID" ]; then
  die "exchange rate verification failed: mid rate is $mid_rate, expected $TARGET_MID"
fi
echo "✅ Exchange rate verified: $mid_rate ETB/USD"

api_call GET "$API_BASE/forex/retention-policy/$TARGET_COMMODITY"
require_success "Verifying retention policy"
if ! policy_matches_target "$API_BODY"; then
  echo "$API_BODY" | jq '.' 2>/dev/null || echo "$API_BODY"
  die "retention policy verification failed: active COFFEE retention is $(echo "$API_BODY" | jq -r '.data.retentionRate')%, expected $TARGET_RETENTION%"
fi
retention="$(echo "$API_BODY" | jq -r '.data.retentionRate // .data.RetentionRate // "N/A"')"
echo "✅ Retention policy verified: $retention% retention"

echo ""
echo "✨ NBE initial data setup complete!"
echo ""
echo "📌 Banks can now allocate forex with:"
echo "   Exchange Rate: $TARGET_MID ETB/USD (buying $TARGET_BUYING, selling $TARGET_SELLING)"
echo "   Retention: $TARGET_RETENTION% USD, 60% ETB"
echo ""
