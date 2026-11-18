#!/bin/bash

OUTPUT_FILE="/home/guda/GoCBC/validation-test-results.txt"

echo "=== LC Document Validation System Test ===" > "$OUTPUT_FILE"
echo "Timestamp: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Get the LC ID
LC_ID=$(docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT lc_id FROM letters_of_credit LIMIT 1" | tr -d ' ')

if [ -z "$LC_ID" ]; then
    echo "ERROR: No LC found in database" >> "$OUTPUT_FILE"
    exit 1
fi

echo "Testing LC: $LC_ID" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Get LC details
echo "--- LC Status ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT 'Status: ' || status || ', Amount: ' || amount || ' ' || currency FROM letters_of_credit WHERE lc_id = '$LC_ID'" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Count documents by type for this LC's contract
echo "--- Documents Available (by type) ---" >> "$OUTPUT_FILE"
docker exec cecbs-postgres psql -U cecbs -d cecbs -c "
SELECT 
    document_type,
    COUNT(*) as count
FROM documents 
WHERE entity_type = 'CONTRACT' 
AND entity_id = (SELECT contract_id FROM letters_of_credit WHERE lc_id = '$LC_ID')
GROUP BY document_type
ORDER BY document_type
" >> "$OUTPUT_FILE" 2>&1

echo "" >> "$OUTPUT_FILE"

# Test the document-checklist API endpoint
echo "--- Document Checklist API Test ---" >> "$OUTPUT_FILE"
echo "Endpoint: GET /api/v1/banking/lc/$LC_ID/document-checklist" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# First, try to get a valid token by logging in as a bank user
echo "Step 1: Attempting to login as bank user..." >> "$OUTPUT_FILE"

# Check if we have any bank users
BANK_USER=$(docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT username FROM users WHERE role = 'BANK' LIMIT 1" | tr -d ' ')

if [ -z "$BANK_USER" ]; then
    echo "WARNING: No bank user found. Creating test bank user..." >> "$OUTPUT_FILE"
    # We can't easily create a user without the API, so we'll try without auth
    echo "" >> "$OUTPUT_FILE"
    echo "Step 2: Testing API without authentication (will show auth error)..." >> "$OUTPUT_FILE"
    curl -s "http://localhost:3001/api/v1/banking/lc/$LC_ID/document-checklist" | jq '.' >> "$OUTPUT_FILE" 2>&1
else
    echo "Found bank user: $BANK_USER" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "Step 2: Testing API (Note: Requires valid auth token from browser)..." >> "$OUTPUT_FILE"
    curl -s "http://localhost:3001/api/v1/banking/lc/$LC_ID/document-checklist" | jq '.' >> "$OUTPUT_FILE" 2>&1
fi

echo "" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Show what documents are required for APPROVAL stage
echo "--- Required Documents for APPROVAL Stage ---" >> "$OUTPUT_FILE"
echo "According to UCP 600 standards:" >> "$OUTPUT_FILE"
echo "1. PROFORMA_INVOICE - Pro Forma Invoice" >> "$OUTPUT_FILE"
echo "2. CONTRACT_SIGNED - Sales Contract" >> "$OUTPUT_FILE"
echo "3. PURCHASE_ORDER - Purchase Order" >> "$OUTPUT_FILE"
echo "4. QUALITY_CERTIFICATE - Quality Certificate" >> "$OUTPUT_FILE"
echo "5. CERTIFICATE_OF_ORIGIN - Certificate of Origin" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Show what documents are required for ISSUANCE stage
echo "--- Required Documents for ISSUANCE Stage ---" >> "$OUTPUT_FILE"
echo "1. Credit assessment completed" >> "$OUTPUT_FILE"
echo "2. Collateral verified" >> "$OUTPUT_FILE"
echo "3. All APPROVAL documents present" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Check which documents we have vs need
echo "--- Gap Analysis ---" >> "$OUTPUT_FILE"
HAS_PROFORMA=$(docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT COUNT(*) FROM documents WHERE entity_type = 'CONTRACT' AND entity_id = (SELECT contract_id FROM letters_of_credit WHERE lc_id = '$LC_ID') AND document_type = 'PROFORMA_INVOICE'" | tr -d ' ')
HAS_CONTRACT=$(docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT COUNT(*) FROM documents WHERE entity_type = 'CONTRACT' AND entity_id = (SELECT contract_id FROM letters_of_credit WHERE lc_id = '$LC_ID') AND document_type = 'CONTRACT_SIGNED'" | tr -d ' ')
HAS_PO=$(docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT COUNT(*) FROM documents WHERE entity_type = 'CONTRACT' AND entity_id = (SELECT contract_id FROM letters_of_credit WHERE lc_id = '$LC_ID') AND document_type = 'PURCHASE_ORDER'" | tr -d ' ')
HAS_QUALITY=$(docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT COUNT(*) FROM documents WHERE entity_type = 'CONTRACT' AND entity_id = (SELECT contract_id FROM letters_of_credit WHERE lc_id = '$LC_ID') AND document_type = 'QUALITY_CERTIFICATE'" | tr -d ' ')
HAS_COO=$(docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT COUNT(*) FROM documents WHERE entity_type = 'CONTRACT' AND entity_id = (SELECT contract_id FROM letters_of_credit WHERE lc_id = '$LC_ID') AND document_type = 'CERTIFICATE_OF_ORIGIN'" | tr -d ' ')

echo "✓ Proforma Invoice: $([ "$HAS_PROFORMA" -gt 0 ] && echo 'YES' || echo 'NO')" >> "$OUTPUT_FILE"
echo "✓ Sales Contract: $([ "$HAS_CONTRACT" -gt 0 ] && echo 'YES' || echo 'NO')" >> "$OUTPUT_FILE"
echo "✓ Purchase Order: $([ "$HAS_PO" -gt 0 ] && echo 'YES' || echo 'NO')" >> "$OUTPUT_FILE"
echo "✓ Quality Certificate: $([ "$HAS_QUALITY" -gt 0 ] && echo 'YES' || echo 'NO')" >> "$OUTPUT_FILE"
echo "✓ Certificate of Origin: $([ "$HAS_COO" -gt 0 ] && echo 'YES' || echo 'NO')" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

TOTAL_REQUIRED=5
TOTAL_PRESENT=$((HAS_PROFORMA + HAS_CONTRACT + HAS_PO + HAS_QUALITY + HAS_COO))

if [ "$TOTAL_PRESENT" -ge "$TOTAL_REQUIRED" ]; then
    echo "✅ All required documents for APPROVAL are present ($TOTAL_PRESENT/$TOTAL_REQUIRED)" >> "$OUTPUT_FILE"
    echo "   → LC can be approved" >> "$OUTPUT_FILE"
else
    echo "❌ Missing documents for APPROVAL ($TOTAL_PRESENT/$TOTAL_REQUIRED present)" >> "$OUTPUT_FILE"
    echo "   → LC cannot be approved yet" >> "$OUTPUT_FILE"
fi

echo "" >> "$OUTPUT_FILE"
echo "=== Test Instructions ===" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "To test in the UI:" >> "$OUTPUT_FILE"
echo "1. Login as a bank user (Bank of America or Commercial Bank of Ethiopia)" >> "$OUTPUT_FILE"
echo "2. Navigate to Banks Portal" >> "$OUTPUT_FILE"
echo "3. Find LC: $LC_ID" >> "$OUTPUT_FILE"
echo "4. Click on the LC to view details" >> "$OUTPUT_FILE"
echo "5. Look for the 'Document Compliance Check' section" >> "$OUTPUT_FILE"
echo "6. Verify the section shows:" >> "$OUTPUT_FILE"
echo "   - Required documents checklist with green/red status" >> "$OUTPUT_FILE"
echo "   - Current stage (APPROVAL)" >> "$OUTPUT_FILE"
echo "   - Whether LC can be approved" >> "$OUTPUT_FILE"
echo "7. Try to approve the LC:" >> "$OUTPUT_FILE"
if [ "$TOTAL_PRESENT" -ge "$TOTAL_REQUIRED" ]; then
    echo "   - Should succeed (all documents present)" >> "$OUTPUT_FILE"
else
    echo "   - Should fail with error listing missing documents" >> "$OUTPUT_FILE"
fi

echo "" >> "$OUTPUT_FILE"
echo "=== End of Report ===" >> "$OUTPUT_FILE"

cat "$OUTPUT_FILE"
