#!/bin/bash
# Set initial NBE exchange rate and retention policy
# This needs to be done once so banks can allocate forex

set -e

API_BASE="${API_BASE:-http://localhost:3001/api/v1}"
NBE_USERNAME="${NBE_USERNAME:-nbe_admin}"
NBE_PASSWORD="${NBE_PASSWORD:-password123}"

echo ""
echo "🔐 Logging in as NBE Admin..."

# Login as NBE
login_response=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$NBE_USERNAME\",\"password\":\"$NBE_PASSWORD\"}")

token=$(echo "$login_response" | jq -r '.data.token // .token // empty')

if [ -z "$token" ] || [ "$token" = "null" ]; then
  echo "❌ NBE login failed"
  echo "$login_response" | jq '.'
  exit 1
fi

echo "✅ NBE login successful"

# Set USD Exchange Rate
echo ""
echo "💱 Setting USD Exchange Rate..."
rate_id="RATE-USD-$(date +%s)"
rate_response=$(curl -s -X POST "$API_BASE/forex/exchange-rate" \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d "{
    \"rateID\": \"$rate_id\",
    \"currency\": \"USD\",
    \"buyingRate\": \"118.50\",
    \"sellingRate\": \"119.50\",
    \"setBy\": \"$NBE_USERNAME\",
    \"justification\": \"Initial system configuration - Official NBE rate\"
  }")

rate_success=$(echo "$rate_response" | jq -r '.success // false')
if [ "$rate_success" = "true" ]; then
  echo "✅ Exchange rate set successfully"
  echo "   Rate ID: $rate_id"
  echo "   USD Buying: 118.50 ETB"
  echo "   USD Selling: 119.50 ETB"
  echo "   Mid Rate: 119.00 ETB"
else
  echo "❌ Failed to set exchange rate:"
  echo "$rate_response" | jq '.'
fi

# Set COFFEE Retention Policy
echo ""
echo "📋 Setting COFFEE Retention Policy..."
policy_id="POLICY-COFFEE-$(date +%s)"
policy_response=$(curl -s -X POST "$API_BASE/forex/retention-policy" \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d "{
    \"policyID\": \"$policy_id\",
    \"commodityType\": \"COFFEE\",
    \"retentionRate\": 40,
    \"setBy\": \"$NBE_USERNAME\",
    \"justification\": \"Initial system configuration - NBE coffee export retention policy\"
  }")

policy_success=$(echo "$policy_response" | jq -r '.success // false')
if [ "$policy_success" = "true" ]; then
  echo "✅ Retention policy set successfully"
  echo "   Policy ID: $policy_id"
  echo "   Commodity: COFFEE"
  echo "   Retention Rate: 40% USD retained"
  echo "   Conversion: 60% converted to ETB"
else
  echo "❌ Failed to set retention policy:"
  echo "$policy_response" | jq '.'
fi

# Verify data is retrievable
echo ""
echo "🔍 Verifying NBE data..."

verify_rate=$(curl -s -X GET "$API_BASE/forex/rates/USD/current" \
  -H "Authorization: Bearer $token")

rate_verify_success=$(echo "$verify_rate" | jq -r '.success // false')
if [ "$rate_verify_success" = "true" ]; then
  mid_rate=$(echo "$verify_rate" | jq -r '.data.midRate // .data.MidRate // "N/A"')
  echo "✅ Exchange rate verified: $mid_rate ETB/USD"
else
  echo "❌ Could not verify exchange rate"
fi

verify_policy=$(curl -s -X GET "$API_BASE/forex/retention-policy/COFFEE" \
  -H "Authorization: Bearer $token")

policy_verify_success=$(echo "$verify_policy" | jq -r '.success // false')
if [ "$policy_verify_success" = "true" ]; then
  retention=$(echo "$verify_policy" | jq -r '.data.retentionRate // .data.RetentionRate // "N/A"')
  echo "✅ Retention policy verified: $retention% retention"
else
  echo "❌ Could not verify retention policy"
fi

echo ""
echo "✨ NBE initial data setup complete!"
echo ""
echo "📌 Banks can now allocate forex with:"
echo "   Exchange Rate: ~119 ETB/USD"
echo "   Retention: 40% USD, 60% ETB"
echo ""
