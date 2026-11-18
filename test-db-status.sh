#!/bin/bash

OUTPUT_FILE="/home/guda/GoCBC/db-status-results.txt"

echo "=== Database Status Check ===" > "$OUTPUT_FILE"
echo "Timestamp: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Check LC count
echo "--- Letters of Credit ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT COUNT(*) FROM letters_of_credit" >> "$OUTPUT_FILE" 2>&1

# Check documents count  
echo "" >> "$OUTPUT_FILE"
echo "--- Documents ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT COUNT(*) FROM documents" >> "$OUTPUT_FILE" 2>&1

# Check contracts count
echo "" >> "$OUTPUT_FILE"
echo "--- Contracts ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT COUNT(*) FROM contracts" >> "$OUTPUT_FILE" 2>&1

# Check if any LCs exist with details
echo "" >> "$OUTPUT_FILE"
echo "--- Recent LCs (if any) ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT lc_number, status, requested_amount FROM letters_of_credit LIMIT 5" >> "$OUTPUT_FILE" 2>&1

# Check documents linked to contracts
echo "" >> "$OUTPUT_FILE"
echo "--- Documents linked to contracts ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT COUNT(*) FROM documents WHERE entity_type = 'CONTRACT'" >> "$OUTPUT_FILE" 2>&1

echo "" >> "$OUTPUT_FILE"
echo "=== End of Report ===" >> "$OUTPUT_FILE"

echo "Results written to: $OUTPUT_FILE"
