#!/bin/bash
# Test LC data from both PostgreSQL and Blockchain

echo "=== Checking LC Data Sources ==="
echo ""

# Check PostgreSQL
echo "📊 PostgreSQL LCs:"
PG_COUNT=$(docker exec cecbs-postgres psql -U cecbsuser -d cecbsdb -t -c "SELECT COUNT(*) FROM letters_of_credit;" 2>/dev/null | xargs)
echo "   Count: $PG_COUNT"

if [ "$PG_COUNT" -gt "0" ]; then
  echo "   Latest LC:"
  docker exec cecbs-postgres psql -U cecbsuser -d cecbsdb -c "SELECT lc_id, contract_id, status, exporter_id FROM letters_of_credit ORDER BY created_at DESC LIMIT 3;" 2>/dev/null
fi

echo ""

# Check Blockchain via API
echo "🔗 Blockchain LCs (via API):"
BLOCKCHAIN_RESPONSE=$(curl -s http://localhost:3001/api/v1/banking/lc?blockchain=true 2>/dev/null)
BLOCKCHAIN_COUNT=$(echo "$BLOCKCHAIN_RESPONSE" | jq -r '.data | length' 2>/dev/null || echo "0")
echo "   Count: $BLOCKCHAIN_COUNT"

if [ "$BLOCKCHAIN_COUNT" != "0" ] && [ "$BLOCKCHAIN_COUNT" != "null" ]; then
  echo "   Sample LCs from blockchain:"
  echo "$BLOCKCHAIN_RESPONSE" | jq -r '.data[0:3] | .[] | "   - \(.lcId || .LCID) | Status: \(.status || .Status)"' 2>/dev/null
fi

echo ""
echo "=== Document Check ==="

# Check documents table
echo "📄 Documents in PostgreSQL:"
CONTRACT_DOCS=$(docker exec cecbs-postgres psql -U cecbsuser -d cecbsdb -t -c "SELECT COUNT(*) FROM documents WHERE entity_type='CONTRACT' AND status='active';" 2>/dev/null | xargs)
echo "   Contract Documents: $CONTRACT_DOCS"

ALL_DOCS=$(docker exec cecbs-postgres psql -U cecbsuser -d cecbsdb -t -c "SELECT COUNT(*) FROM documents WHERE status='active';" 2>/dev/null | xargs)
echo "   All Active Documents: $ALL_DOCS"

if [ "$CONTRACT_DOCS" -gt "0" ]; then
  echo ""
  echo "   Sample Contract Documents:"
  docker exec cecbs-postgres psql -U cecbsuser -d cecbsdb -c "SELECT entity_id as contract_id, document_type, file_name FROM documents WHERE entity_type='CONTRACT' AND status='active' LIMIT 5;" 2>/dev/null
fi

echo ""
echo "=== Summary ==="
if [ "$PG_COUNT" -eq "0" ]; then
  echo "❌ No LCs in PostgreSQL"
  echo "   This means:"
  echo "   1. No LCs have been requested yet, OR"
  echo "   2. LCs are only on blockchain (sync issue)"
else
  echo "✅ LCs exist in PostgreSQL: $PG_COUNT"
fi

if [ "$CONTRACT_DOCS" -eq "0" ]; then
  echo "❌ No contract documents in PostgreSQL"
  echo "   Documents won't show in LC Details until:"
  echo "   1. Contracts are created with documents, OR"
  echo "   2. Migration script is run to link existing docs"
else
  echo "✅ Contract documents exist: $CONTRACT_DOCS"
fi
