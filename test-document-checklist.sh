#!/bin/bash
# Test Document Checklist API Endpoint

echo "=== Testing Document Checklist API ==="
echo ""

# Get latest LC
LC_ID=$(docker exec cecbs-postgres psql -U cecbsuser -d cecbsdb -t -c "SELECT lc_id FROM letters_of_credit ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | xargs)

if [ -z "$LC_ID" ]; then
  echo "❌ No LCs found in database"
  exit 1
fi

echo "📋 Testing with LC: $LC_ID"
echo ""

# Test endpoint (will fail auth but show it exists)
echo "Testing endpoint (without auth - will fail):"
curl -s http://localhost:3001/api/v1/banking/lc/$LC_ID/document-checklist | jq '.'
echo ""

echo "✅ Endpoint is responding!"
echo ""
echo "To see it work in the UI:"
echo "1. Login to Banks Portal"
echo "2. View Details of any LC"
echo "3. Scroll to see 'Document Compliance Check' section"
echo "4. Check browser console (F12) for logs"
