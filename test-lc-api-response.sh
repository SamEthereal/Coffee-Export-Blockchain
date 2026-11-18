#!/bin/bash

OUTPUT_FILE="/home/guda/GoCBC/lc-api-response.txt"

echo "=== Testing LC API Response ===" > "$OUTPUT_FILE"
echo "Timestamp: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

LC_ID="LC-CONTRACT1794809015706"

# Test 1: Get single LC details
echo "--- Test 1: GET /api/v1/banking/lc/$LC_ID ---" >> "$OUTPUT_FILE"
echo "This endpoint should return LC with documents array" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
curl -s "http://localhost:3001/api/v1/banking/lc/$LC_ID" | jq '.' >> "$OUTPUT_FILE" 2>&1

echo "" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Test 2: Get all LCs
echo "--- Test 2: GET /api/v1/banking/lcs ---" >> "$OUTPUT_FILE"
echo "This endpoint should return array of LCs" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
curl -s "http://localhost:3001/api/v1/banking/lcs" | jq '.' >> "$OUTPUT_FILE" 2>&1

echo "" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Test 3: Check what documents exist for this LC's contract
echo "--- Test 3: Database - Documents for LC's Contract ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -c "
SELECT 
    lc.lc_id,
    lc.contract_id,
    COUNT(d.document_id) as doc_count,
    array_agg(d.document_type) as doc_types
FROM letters_of_credit lc
LEFT JOIN documents d ON d.entity_id = lc.contract_id AND d.entity_type = 'CONTRACT'
WHERE lc.lc_id = '$LC_ID'
GROUP BY lc.lc_id, lc.contract_id
" >> "$OUTPUT_FILE" 2>&1

echo "" >> "$OUTPUT_FILE"
echo "=== End of Report ===" >> "$OUTPUT_FILE"

cat "$OUTPUT_FILE"
