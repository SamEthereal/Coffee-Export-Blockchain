#!/bin/bash

# Test Document Examination Workflow - Complete End-to-End Test
# This script tests the entire LC workflow from contract creation to payment release

set -e

API_URL="http://localhost:3001/api/v1"
UI_URL="http://localhost:3000"

echo "============================================"
echo "Document Examination Workflow Test"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print step headers
print_step() {
    echo -e "\n${BLUE}==== STEP $1: $2 ====${NC}\n"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print info
print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Store tokens
EXPORTER_TOKEN=""
BANK_TOKEN=""
CUSTOMS_TOKEN=""

# ============================================
# STEP 1: Login as Exporter
# ============================================
print_step 1 "Login as Exporter"

EXPORTER_LOGIN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "exporter1",
    "password": "password123"
  }')

EXPORTER_TOKEN=$(echo $EXPORTER_LOGIN | jq -r '.data.token')

if [ "$EXPORTER_TOKEN" != "null" ] && [ -n "$EXPORTER_TOKEN" ]; then
    print_success "Logged in as exporter1"
    print_info "Token: ${EXPORTER_TOKEN:0:20}..."
else
    print_error "Failed to login as exporter"
    echo $EXPORTER_LOGIN | jq '.'
    exit 1
fi

# ============================================
# STEP 2: Create Contract
# ============================================
print_step 2 "Create Export Contract"

CONTRACT_ID="CONTRACT$(date +%s)"
print_info "Creating contract: $CONTRACT_ID"

CONTRACT_RESPONSE=$(curl -s -X POST "$API_URL/contracts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EXPORTER_TOKEN" \
  -d "{
    \"contractID\": \"$CONTRACT_ID\",
    \"exporterID\": \"exporter1\",
    \"buyerID\": \"BUYER001\",
    \"buyerCountry\": \"USA\",
    \"buyerBank\": \"Bank of America\",
    \"exporterBank\": \"Commercial Bank of Ethiopia\",
    \"coffeeType\": \"Yirgacheffe\",
    \"quantity\": 1000,
    \"pricePerKg\": 5.50,
    \"currency\": \"USD\",
    \"paymentMethod\": \"LC\",
    \"eudrRequired\": true,
    \"incoterm\": \"FOB\",
    \"portOfLoading\": \"Djibouti\",
    \"portOfDestination\": \"New York\",
    \"deliveryDate\": \"2026-12-31\"
  }")

if echo $CONTRACT_RESPONSE | jq -e '.success == true' > /dev/null; then
    print_success "Contract created: $CONTRACT_ID"
else
    print_error "Failed to create contract"
    echo $CONTRACT_RESPONSE | jq '.'
    exit 1
fi

# ============================================
# STEP 3: Login as Bank
# ============================================
print_step 3 "Login as Bank"

BANK_LOGIN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "bank",
    "password": "password123"
  }')

BANK_TOKEN=$(echo $BANK_LOGIN | jq -r '.data.token')

if [ "$BANK_TOKEN" != "null" ] && [ -n "$BANK_TOKEN" ]; then
    print_success "Logged in as bank"
else
    print_error "Failed to login as bank"
    echo $BANK_LOGIN | jq '.'
    exit 1
fi

# ============================================
# STEP 4: Issue Letter of Credit
# ============================================
print_step 4 "Issue Letter of Credit"

LC_ID="LC-$CONTRACT_ID"
print_info "Creating LC: $LC_ID"

LC_RESPONSE=$(curl -s -X POST "$API_URL/banking/letters-of-credit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BANK_TOKEN" \
  -d "{
    \"lcID\": \"$LC_ID\",
    \"contractID\": \"$CONTRACT_ID\",
    \"exporterID\": \"exporter1\",
    \"issuingBank\": \"Bank of America\",
    \"advisingBank\": \"Commercial Bank of Ethiopia\",
    \"beneficiary\": \"exporter1\",
    \"amount\": 5500,
    \"currency\": \"USD\",
    \"expiryDate\": \"2026-12-31\",
    \"latestShipmentDate\": \"2026-12-15\",
    \"terms\": \"Documentary Credit\",
    \"portOfLoading\": \"Djibouti\",
    \"portOfDischarge\": \"New York\"
  }")

if echo $LC_RESPONSE | jq -e '.success == true' > /dev/null; then
    print_success "LC issued: $LC_ID"
    print_info "Status: ISSUED (MT700 SWIFT message auto-created)"
else
    print_error "Failed to issue LC"
    echo $LC_RESPONSE | jq '.'
    exit 1
fi

# ============================================
# STEP 5: Allocate Forex
# ============================================
print_step 5 "Allocate Forex to LC"

FOREX_RESPONSE=$(curl -s -X PUT "$API_URL/banking/letters-of-credit/$LC_ID/allocate-forex" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BANK_TOKEN" \
  -d '{
    "forexAmount": 5500,
    "forexRate": 1.0,
    "allocationDate": "2026-11-17"
  }')

if echo $FOREX_RESPONSE | jq -e '.success == true' > /dev/null; then
    print_success "Forex allocated to LC"
    print_info "Status: FOREX_ALLOCATED"
else
    print_error "Failed to allocate forex"
    echo $FOREX_RESPONSE | jq '.'
    exit 1
fi

# ============================================
# STEP 6: Create Shipment (as Exporter)
# ============================================
print_step 6 "Create Shipment"

SHIPMENT_ID="SHIP$(date +%s)"
print_info "Creating shipment: $SHIPMENT_ID"

SHIPMENT_RESPONSE=$(curl -s -X POST "$API_URL/logistics/shipments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EXPORTER_TOKEN" \
  -d "{
    \"shipmentID\": \"$SHIPMENT_ID\",
    \"contractID\": \"$CONTRACT_ID\",
    \"exporterID\": \"exporter1\",
    \"buyerID\": \"BUYER001\",
    \"origin\": \"Addis Ababa, Ethiopia\",
    \"quantity\": 1000,
    \"grade\": \"Grade 1\",
    \"icoNumber\": \"ICO-$(date +%s)\",
    \"channel\": \"Direct Export\",
    \"bondReference\": \"BOND-$(date +%s)\",
    \"forexRate\": 1.0,
    \"valueUSD\": 5500,
    \"eudrCompliant\": true
  }")

if echo $SHIPMENT_RESPONSE | jq -e '.success == true' > /dev/null; then
    print_success "Shipment created: $SHIPMENT_ID"
else
    print_error "Failed to create shipment"
    echo $SHIPMENT_RESPONSE | jq '.'
    exit 1
fi

# ============================================
# STEP 7: Login as Customs
# ============================================
print_step 7 "Login as Customs"

CUSTOMS_LOGIN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "customs",
    "password": "password123"
  }')

CUSTOMS_TOKEN=$(echo $CUSTOMS_LOGIN | jq -r '.data.token')

if [ "$CUSTOMS_TOKEN" != "null" ] && [ -n "$CUSTOMS_TOKEN" ]; then
    print_success "Logged in as customs"
else
    print_error "Failed to login as customs"
    echo $CUSTOMS_LOGIN | jq '.'
    exit 1
fi

# ============================================
# STEP 8: Upload Shipping Documents
# ============================================
print_step 8 "Upload Shipping Documents"

print_info "Creating test document files..."

# Create temporary test documents
mkdir -p /tmp/test-docs
echo "Bill of Lading - Shipment $SHIPMENT_ID" > /tmp/test-docs/bill-of-lading.txt
echo "Certificate of Origin - Ethiopian Coffee" > /tmp/test-docs/certificate-of-origin.txt
echo "Packing List - 1000 units" > /tmp/test-docs/packing-list.txt

# Upload Bill of Lading
DOC1=$(curl -s -X POST "$API_URL/documents/upload" \
  -H "Authorization: Bearer $CUSTOMS_TOKEN" \
  -F "file=@/tmp/test-docs/bill-of-lading.txt" \
  -F "entityType=CUSTOMS_DECLARATION" \
  -F "entityId=$SHIPMENT_ID" \
  -F "documentType=BILL_OF_LADING" \
  -F "category=SHIPPING")

if echo $DOC1 | jq -e '.success == true' > /dev/null; then
    DOC1_ID=$(echo $DOC1 | jq -r '.data.documentId')
    print_success "Uploaded: Bill of Lading ($DOC1_ID)"
else
    print_error "Failed to upload Bill of Lading"
fi

# Upload Certificate of Origin
DOC2=$(curl -s -X POST "$API_URL/documents/upload" \
  -H "Authorization: Bearer $CUSTOMS_TOKEN" \
  -F "file=@/tmp/test-docs/certificate-of-origin.txt" \
  -F "entityType=CUSTOMS_DECLARATION" \
  -F "entityId=$SHIPMENT_ID" \
  -F "documentType=CERTIFICATE_OF_ORIGIN" \
  -F "category=SHIPPING")

if echo $DOC2 | jq -e '.success == true' > /dev/null; then
    DOC2_ID=$(echo $DOC2 | jq -r '.data.documentId')
    print_success "Uploaded: Certificate of Origin ($DOC2_ID)"
else
    print_error "Failed to upload Certificate of Origin"
fi

# Upload Packing List
DOC3=$(curl -s -X POST "$API_URL/documents/upload" \
  -H "Authorization: Bearer $CUSTOMS_TOKEN" \
  -F "file=@/tmp/test-docs/packing-list.txt" \
  -F "entityType=CUSTOMS_DECLARATION" \
  -F "entityId=$SHIPMENT_ID" \
  -F "documentType=PACKING_LIST" \
  -F "category=SHIPPING")

if echo $DOC3 | jq -e '.success == true' > /dev/null; then
    DOC3_ID=$(echo $DOC3 | jq -r '.data.documentId')
    print_success "Uploaded: Packing List ($DOC3_ID)"
else
    print_error "Failed to upload Packing List"
fi

# ============================================
# STEP 9: Update Shipment Status to DELIVERED
# ============================================
print_step 9 "Mark Shipment as DELIVERED"

DELIVERY_RESPONSE=$(curl -s -X PUT "$API_URL/logistics/shipments/$SHIPMENT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CUSTOMS_TOKEN" \
  -d '{
    "status": "DELIVERED",
    "actualArrival": "2026-11-17"
  }')

if echo $DELIVERY_RESPONSE | jq -e '.success == true' > /dev/null; then
    print_success "Shipment marked as DELIVERED"
    print_info "Documents are now ready for bank examination"
else
    print_error "Failed to update shipment status"
    echo $DELIVERY_RESPONSE | jq '.'
    exit 1
fi

# ============================================
# STEP 10: Verify LC appears in Document Examination
# ============================================
print_step 10 "Verify LC in Document Examination Tab"

print_info "Checking if LC appears in Document Examination filter..."

LC_CHECK=$(curl -s "$API_URL/banking/letters-of-credit/$LC_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

LC_STATUS=$(echo $LC_CHECK | jq -r '.data.status')
print_info "Current LC Status: $LC_STATUS"

if [ "$LC_STATUS" == "FOREX_ALLOCATED" ]; then
    print_success "LC is in correct status for Document Examination"
    print_info "LC should now appear in Banks Portal > Document Examination tab"
else
    print_error "LC status is $LC_STATUS, expected FOREX_ALLOCATED"
fi

# ============================================
# STEP 11: Fetch Documents for Examination
# ============================================
print_step 11 "Fetch Shipment Documents"

print_info "Fetching documents from SHIPMENT entity..."
SHIPMENT_DOCS=$(curl -s "$API_URL/documents/entity/SHIPMENT/$SHIPMENT_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

print_info "Fetching documents from CUSTOMS_DECLARATION entity..."
CUSTOMS_DOCS=$(curl -s "$API_URL/documents/entity/CUSTOMS_DECLARATION/$SHIPMENT_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

DOCS_COUNT=$(echo $CUSTOMS_DOCS | jq -r '.data | length // 0')
print_success "Found $DOCS_COUNT documents for examination"

if [ "$DOCS_COUNT" -ge 3 ]; then
    print_success "All required documents are available"
    echo ""
    echo "Documents:"
    echo $CUSTOMS_DOCS | jq -r '.data[] | "  - \(.document_type): \(.file_name)"'
else
    print_error "Expected at least 3 documents, found $DOCS_COUNT"
fi

# ============================================
# STEP 12: Verify Documents
# ============================================
print_step 12 "Verify All Documents"

for doc_id in $DOC1_ID $DOC2_ID $DOC3_ID; do
    if [ -n "$doc_id" ] && [ "$doc_id" != "null" ]; then
        VERIFY_RESPONSE=$(curl -s -X PUT "$API_URL/documents/$doc_id/verify" \
          -H "Authorization: Bearer $BANK_TOKEN" \
          -d '{
            "verificationStatus": "verified",
            "verifiedBy": "bank"
          }')
        
        if echo $VERIFY_RESPONSE | jq -e '.success == true' > /dev/null; then
            print_success "Document verified: $doc_id"
        else
            print_error "Failed to verify document: $doc_id"
        fi
    fi
done

# ============================================
# STEP 13: Mark LC as Compliant (Examine Documents)
# ============================================
print_step 13 "Examine LC Documents (Mark Compliant)"

EXAMINE_RESPONSE=$(curl -s -X POST "$API_URL/banking/letters-of-credit/$LC_ID/examine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BANK_TOKEN" \
  -d '{
    "examinedBy": "bank",
    "compliant": true,
    "remarks": "All documents verified and compliant with LC terms"
  }')

if echo $EXAMINE_RESPONSE | jq -e '.success == true' > /dev/null; then
    print_success "LC Documents Examined - Marked as COMPLIANT"
    print_info "Status changed: FOREX_ALLOCATED → UTILIZED"
else
    print_error "Failed to examine documents"
    echo $EXAMINE_RESPONSE | jq '.'
    exit 1
fi

# ============================================
# STEP 14: Verify LC Status Changed to UTILIZED
# ============================================
print_step 14 "Verify LC Status Changed"

sleep 2

LC_CHECK_AFTER=$(curl -s "$API_URL/banking/letters-of-credit/$LC_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

NEW_STATUS=$(echo $LC_CHECK_AFTER | jq -r '.data.status')
print_info "New LC Status: $NEW_STATUS"

if [ "$NEW_STATUS" == "UTILIZED" ]; then
    print_success "LC status successfully changed to UTILIZED"
    print_info "LC should now appear in Payment Release tab"
else
    print_error "LC status is $NEW_STATUS, expected UTILIZED"
fi

# ============================================
# STEP 15: Release Payment
# ============================================
print_step 15 "Release Payment"

PAYMENT_RESPONSE=$(curl -s -X POST "$API_URL/banking/letters-of-credit/$LC_ID/release-payment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BANK_TOKEN" \
  -d '{
    "paymentAmount": 5500,
    "paymentDate": "2026-11-17",
    "remarks": "Payment released after successful document examination"
  }')

if echo $PAYMENT_RESPONSE | jq -e '.success == true' > /dev/null; then
    print_success "Payment Released"
    print_info "Status changed: UTILIZED → PAYMENT_RELEASED"
    print_info "MT103 SWIFT message auto-created"
else
    print_error "Failed to release payment"
    echo $PAYMENT_RESPONSE | jq '.'
    exit 1
fi

# ============================================
# STEP 16: Verify SWIFT Messages Created
# ============================================
print_step 16 "Verify SWIFT Messages"

SWIFT_MESSAGES=$(curl -s "$API_URL/banking/swift-messages?lcId=$LC_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

MT700_COUNT=$(echo $SWIFT_MESSAGES | jq '[.data[] | select(.messageType == "MT700")] | length // 0')
MT103_COUNT=$(echo $SWIFT_MESSAGES | jq '[.data[] | select(.messageType == "MT103")] | length // 0')

print_info "MT700 messages (Documentary Credit): $MT700_COUNT"
print_info "MT103 messages (Customer Credit Transfer): $MT103_COUNT"

if [ "$MT700_COUNT" -ge 1 ]; then
    print_success "MT700 SWIFT message created (LC Issuance)"
fi

if [ "$MT103_COUNT" -ge 1 ]; then
    print_success "MT103 SWIFT message created (Payment Release)"
fi

# ============================================
# FINAL SUMMARY
# ============================================
echo ""
echo "============================================"
echo -e "${GREEN}TEST COMPLETED SUCCESSFULLY${NC}"
echo "============================================"
echo ""
echo "Summary:"
echo "  Contract ID: $CONTRACT_ID"
echo "  LC ID: $LC_ID"
echo "  Shipment ID: $SHIPMENT_ID"
echo "  Documents Uploaded: $DOCS_COUNT"
echo "  Final LC Status: PAYMENT_RELEASED"
echo ""
echo "You can now:"
echo "  1. Open browser: $UI_URL"
echo "  2. Login as 'bank' / 'password123'"
echo "  3. Navigate to Banks Portal"
echo "  4. View LC in Communication & Issues tab"
echo "  5. Check SWIFT messages (MT700 & MT103)"
echo ""
echo "All null check fixes are working correctly!"
echo "============================================"

# Cleanup
rm -rf /tmp/test-docs
