#!/bin/bash

OUTPUT_FILE="/home/guda/GoCBC/lc-details-results.txt"

echo "=== LC Details ===" > "$OUTPUT_FILE"

# Get LC details
echo "--- LC Record ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -x -c "SELECT * FROM letters_of_credit LIMIT 1" >> "$OUTPUT_FILE" 2>&1

echo "" >> "$OUTPUT_FILE"
echo "--- Documents for this LC ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -c "SELECT d.document_id, d.document_type, d.file_name, d.entity_type, d.entity_id FROM documents d JOIN letters_of_credit lc ON d.entity_id = lc.contract_id WHERE d.entity_type = 'CONTRACT' LIMIT 10" >> "$OUTPUT_FILE" 2>&1

echo "" >> "$OUTPUT_FILE"
echo "=== Test document checklist API ===" >> "$OUTPUT_FILE"

# Get LC ID
LC_ID=$(docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT lc_id FROM letters_of_credit LIMIT 1" | tr -d ' ')

echo "LC ID: $LC_ID" >> "$OUTPUT_FILE"

if [ ! -z "$LC_ID" ]; then
    echo "" >> "$OUTPUT_FILE"
    echo "--- API Response ---" >> "$OUTPUT_FILE"
    curl -s "http://localhost:3001/api/v1/banking/lc/$LC_ID/document-checklist" | jq '.' >> "$OUTPUT_FILE" 2>&1
fi

echo "" >> "$OUTPUT_FILE"
echo "=== End of Report ===" >> "$OUTPUT_FILE"
