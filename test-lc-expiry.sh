#!/bin/bash
# Test script to check LC expiry date

LC_ID="LC-CONTRACT1794809015706"
API_BASE="http://localhost:3001/api/v1"

# Get token from browser or use this test token
TOKEN="${AUTH_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5OTA4NjdlYy0zMzA5LTRmMDItODM1NC1mOGQ1MmI2NmMzYTYiLCJ1c2VybmFtZSI6ImJhbmtfYWRtaW4iLCJyb2xlIjoiQkFOSyIsImlhdCI6MTczMTc1NDIxNCwiZXhwIjoxNzMxODQwNjE0fQ.7yYUJhqJmQNfX1GqO5mQTQMxn8sXUV5b9PnL9wZ0abc}"

echo ""
echo "🔍 Fetching LC: $LC_ID"
echo ""

response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "$API_BASE/banking/lc/$LC_ID")

http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS:/d')

if [ "$http_status" = "200" ]; then
  echo "✅ LC Data Retrieved"
  echo "─────────────────────────────────────────────────────────────"
  echo "$body" | jq -r '
    .data | 
    "LC ID:          \(.lcId // .LCID // "N/A")",
    "Contract ID:    \(.contractId // .ContractID // "N/A")",
    "Amount:         \(.amount // "N/A") \(.currency // "N/A")",
    "Status:         \(.status // .Status // "N/A")",
    "Request Date:   \(.requestDate // .RequestDate // .request_date // "N/A")",
    "Expiry Date:    \(.expiryDate // .ExpiryDate // .expiry_date // "N/A")",
    "Issue Date:     \(.issueDate // .IssueDate // .issue_date // "N/A")"
  '
  echo "─────────────────────────────────────────────────────────────"
  
  echo ""
  echo "🔍 All date-related fields:"
  echo "$body" | jq '.data | to_entries | map(select(.key | test("date|expiry|Date|Expiry"; "i"))) | .[] | "  \(.key): \(.value)"' -r
  
  echo ""
  echo "📦 Full LC object:"
  echo "$body" | jq '.data'
else
  echo "❌ Error: HTTP $http_status"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
fi
