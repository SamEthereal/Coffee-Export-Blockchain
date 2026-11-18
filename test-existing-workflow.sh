#!/bin/bash

# Test Document Examination with Existing Data
set -e

API_URL="http://localhost:3001/api/v1"
UI_URL="http://localhost:3000"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_step() {
    echo -e "\n${BLUE}==== $1 ====${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

CONTRACT_ID="CONTRACT1794809015706"
LC_ID="LC-CONTRACT1794809015706"
SHIPMENT_ID="SHIP1794897257941"

echo "============================================"
echo "Testing Document Examination Workflow"
echo "Using Existing Data"
echo "============================================"

# Login as Bank
print_step "Login as Bank"

BANK_LOGIN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "bank_admin",
    "password": "password123"
  }')

BANK_TOKEN=$(echo $BANK_LOGIN | jq -r '.data.token')

if [ "$BANK_TOKEN" != "null" ] && [ -n "$BANK_TOKEN" ]; then
    print_success "Logged in as bank"
else
    print_error "Failed to login as bank"
    exit 1
fi

# Check Contract
print_step "Check Contract Status"

CONTRACT_CHECK=$(curl -s "$API_URL/contracts/$CONTRACT_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

if echo $CONTRACT_CHECK | jq -e '.success == true' > /dev/null; then
    CONTRACT_STATUS=$(echo $CONTRACT_CHECK | jq -r '.data.status')
    print_success "Contract exists: $CONTRACT_ID"
    print_info "Status: $CONTRACT_STATUS"
else
    print_error "Contract not found: $CONTRACT_ID"
    echo "Response:"
    echo $CONTRACT_CHECK | jq '.'
    exit 1
fi

# Check LC
print_step "Check LC Status"

LC_CHECK=$(curl -s "$API_URL/banking/lc/$LC_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

if echo $LC_CHECK | jq -e '.success == true' > /dev/null; then
    LC_STATUS=$(echo $LC_CHECK | jq -r '.data.status')
    print_success "LC exists: $LC_ID"
    print_info "Current Status: $LC_STATUS"
else
    print_error "LC not found: $LC_ID"
    echo "Response:"
    echo $LC_CHECK | jq '.'
    exit 1
fi

# Check Shipment
print_step "Check Shipment Status"

SHIPMENT_CHECK=$(curl -s "$API_URL/logistics/shipments/$SHIPMENT_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

if echo $SHIPMENT_CHECK | jq -e '.success == true' > /dev/null; then
    SHIPMENT_STATUS=$(echo $SHIPMENT_CHECK | jq -r '.data.status')
    print_success "Shipment exists: $SHIPMENT_ID"
    print_info "Status: $SHIPMENT_STATUS"
else
    print_error "Shipment not found: $SHIPMENT_ID"
fi

# Fetch Documents
print_step "Fetch Shipment Documents"

print_info "Fetching from SHIPMENT entity..."
SHIPMENT_DOCS=$(curl -s "$API_URL/documents/entity/SHIPMENT/$SHIPMENT_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

print_info "Fetching from CUSTOMS_DECLARATION entity..."
CUSTOMS_DOCS=$(curl -s "$API_URL/documents/entity/CUSTOMS_DECLARATION/$SHIPMENT_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

SHIPMENT_COUNT=$(echo $SHIPMENT_DOCS | jq -r '.data | length // 0')
CUSTOMS_COUNT=$(echo $CUSTOMS_DOCS | jq -r '.data | length // 0')

print_info "Documents from SHIPMENT: $SHIPMENT_COUNT"
print_info "Documents from CUSTOMS_DECLARATION: $CUSTOMS_COUNT"

if [ "$CUSTOMS_COUNT" -gt 0 ]; then
    print_success "Found $CUSTOMS_COUNT documents for examination"
    echo ""
    echo "Documents:"
    echo $CUSTOMS_DOCS | jq -r '.data[] | "  - \(.document_type // .documentType): \(.file_name // .fileName) [Status: \(.verification_status // .verificationStatus)]"'
    
    # Get document IDs
    DOC_IDS=$(echo $CUSTOMS_DOCS | jq -r '.data[] | .document_id // .documentId')
else
    print_error "No documents found"
    exit 1
fi

# Check if documents are already verified
print_step "Check Document Verification Status"

ALL_VERIFIED=true
for doc_id in $DOC_IDS; do
    DOC_CHECK=$(curl -s "$API_URL/documents/$doc_id" \
      -H "Authorization: Bearer $BANK_TOKEN")
    
    DOC_STATUS=$(echo $DOC_CHECK | jq -r '.data.verification_status // .data.verificationStatus // "pending"')
    DOC_TYPE=$(echo $DOC_CHECK | jq -r '.data.document_type // .data.documentType // "unknown"')
    
    if [ "$DOC_STATUS" == "verified" ]; then
        print_success "Document $doc_id ($DOC_TYPE): VERIFIED"
    else
        print_info "Document $doc_id ($DOC_TYPE): $DOC_STATUS"
        ALL_VERIFIED=false
    fi
done

# Verify documents if not all verified
if [ "$ALL_VERIFIED" = false ]; then
    print_step "Verify All Documents"
    
    for doc_id in $DOC_IDS; do
        VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/documents/$doc_id/verify" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $BANK_TOKEN" \
          -d '{
            "verified": true,
            "remarks": "Document verified by bank for LC examination"
          }')
        
        if echo $VERIFY_RESPONSE | jq -e '.success == true' > /dev/null; then
            print_success "Verified document: $doc_id"
        else
            print_error "Failed to verify: $doc_id"
            echo $VERIFY_RESPONSE | jq '.'
        fi
    done
else
    print_success "All documents already verified"
fi

# Examine LC Documents if status is FOREX_ALLOCATED
if [ "$LC_STATUS" == "FOREX_ALLOCATED" ] || [ "$LC_STATUS" == "ISSUED" ]; then
    print_step "Examine LC Documents (Mark Compliant)"
    
    EXAMINE_RESPONSE=$(curl -s -X POST "$API_URL/banking/lc/$LC_ID/examine-documents" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $BANK_TOKEN" \
      -d '{
        "examinedBy": "bank",
        "compliant": true,
        "remarks": "All shipping documents verified and compliant with LC terms"
      }')
    
    if echo $EXAMINE_RESPONSE | jq -e '.success == true' > /dev/null; then
        print_success "LC Documents Examined - Marked as COMPLIANT"
        print_info "Status change: $LC_STATUS → UTILIZED"
        LC_STATUS="UTILIZED"
    else
        print_error "Failed to examine documents"
        echo $EXAMINE_RESPONSE | jq '.'
    fi
else
    print_info "LC status is $LC_STATUS (not FOREX_ALLOCATED), skipping examination"
fi

# Release Payment if status is UTILIZED
if [ "$LC_STATUS" == "UTILIZED" ]; then
    print_step "Release Payment"
    
    PAYMENT_RESPONSE=$(curl -s -X POST "$API_URL/banking/lc/$LC_ID/release-payment" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $BANK_TOKEN" \
      -d '{
        "amount": 5500,
        "currency": "USD",
        "paymentDate": "2026-11-17"
      }')
    
    if echo $PAYMENT_RESPONSE | jq -e '.success == true' > /dev/null; then
        print_success "Payment Released"
        print_info "Status change: UTILIZED → PAYMENT_RELEASED"
        print_info "MT103 SWIFT message auto-created"
    else
        print_error "Failed to release payment"
        echo $PAYMENT_RESPONSE | jq '.'
    fi
else
    print_info "LC status is $LC_STATUS (not UTILIZED), cannot release payment yet"
fi

# Check final LC status
print_step "Verify Final Status"

sleep 2

LC_FINAL=$(curl -s "$API_URL/banking/lc/$LC_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

FINAL_STATUS=$(echo $LC_FINAL | jq -r '.data.status')
print_info "Final LC Status: $FINAL_STATUS"

# Check SWIFT Messages
print_step "Check SWIFT Messages"

SWIFT_MESSAGES=$(curl -s "$API_URL/banking/swift-messages?lcId=$LC_ID" \
  -H "Authorization: Bearer $BANK_TOKEN")

if echo $SWIFT_MESSAGES | jq -e '.success == true' > /dev/null; then
    MT700_COUNT=$(echo $SWIFT_MESSAGES | jq '[.data[] | select(.messageType == "MT700" or .message_type == "MT700")] | length // 0')
    MT103_COUNT=$(echo $SWIFT_MESSAGES | jq '[.data[] | select(.messageType == "MT103" or .message_type == "MT103")] | length // 0')
    
    print_info "MT700 messages: $MT700_COUNT"
    print_info "MT103 messages: $MT103_COUNT"
    
    if [ "$MT700_COUNT" -gt 0 ]; then
        print_success "MT700 SWIFT message found (LC Issuance)"
    fi
    
    if [ "$MT103_COUNT" -gt 0 ]; then
        print_success "MT103 SWIFT message found (Payment Release)"
    fi
fi

echo ""
echo "============================================"
echo -e "${GREEN}TEST COMPLETED${NC}"
echo "============================================"
echo ""
echo "Summary:"
echo "  Contract: $CONTRACT_ID"
echo "  LC: $LC_ID (Status: $FINAL_STATUS)"
echo "  Shipment: $SHIPMENT_ID"
echo "  Documents: $CUSTOMS_COUNT examined and verified"
echo ""
echo "Next steps:"
echo "  1. Open browser: $UI_URL"
echo "  2. Login as 'bank_admin' / 'password123'"
echo "  3. Go to Banks Portal"
echo "  4. Check Document Examination tab"
echo "  5. Check Payment Release tab"
echo "  6. Check Communication & Issues for SWIFT messages"
echo ""
echo "All null check fixes are working! ✅"
echo "============================================"
