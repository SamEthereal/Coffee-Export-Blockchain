#!/bin/bash

# Upload Shipping Documents for Document Examination
# This script creates the required shipping documents for LC payment release

API_URL="http://localhost:3001/api/v1"
SHIPMENT_ID="SHIP-CONTRACT1794809015706-TEST"
CONTRACT_ID="CONTRACT1794809015706"

# Login and get token
echo "🔐 Logging in as exporter..."
TOKEN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"exporter_user","password":"password123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed. Trying bank_admin..."
  TOKEN=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"bank_admin","password":"password123"}' \
    | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed. Cannot proceed."
  exit 1
fi

echo "✅ Logged in successfully"

# Create dummy PDF files for upload
echo "📄 Creating dummy shipping documents..."

# Create Bill of Lading
cat > /tmp/bill_of_lading.txt << 'EOF'
BILL OF LADING

Shipper: Ethiopian Coffee Exporter (exporter1)
Consignee: MERCY_COFFEE_EXPORT_AND_IMPORT (buyer1)
Notify Party: Commercial Bank of Ethiopia

Port of Loading: Djibouti, Djibouti
Port of Discharge: Hamburg, Germany

Description of Goods:
- Ethiopian Specialty Coffee, Grade 2
- Quantity: 150,000.00 kg
- Container: Dry Container

Freight: Prepaid
Date of Shipment: 2026-11-17
B/L Number: BL-CONTRACT1794809015706-001

Signed by: Shipping Company
EOF

# Create Commercial Invoice
cat > /tmp/commercial_invoice.txt << 'EOF'
COMMERCIAL INVOICE

Invoice No: INV-CONTRACT1794809015706-001
Date: 2026-11-17

Seller: Ethiopian Coffee Exporter (exporter1)
Buyer: MERCY_COFFEE_EXPORT_AND_IMPORT (buyer1)

Description:
- Ethiopian Specialty Coffee, Grade 2
- Quantity: 150,000.00 kg
- Unit Price: $2.67/kg
- Total Amount: $399,816.00 USD

Payment Terms: Letter of Credit LC-CONTRACT1794809015706
Incoterms: FOB Djibouti
Country of Origin: Ethiopia

Banking Details:
Commercial Bank of Ethiopia
LC Reference: LC-CONTRACT1794809015706
EOF

# Create Packing List
cat > /tmp/packing_list.txt << 'EOF'
PACKING LIST

Packing List No: PL-CONTRACT1794809015706-001
Date: 2026-11-17

Shipper: Ethiopian Coffee Exporter (exporter1)
Consignee: MERCY_COFFEE_EXPORT_AND_IMPORT (buyer1)

Container Details:
- Total Packages: 2,500 bags
- Package Type: 60kg jute bags
- Net Weight: 150,000.00 kg
- Gross Weight: 152,500.00 kg

Marks & Numbers:
- CONTRACT1794809015706
- Ethiopian Coffee
- Grade 2
- Crop Year 2026

Shipment Reference: SHIP-CONTRACT1794809015706-TEST
EOF

echo "✅ Documents created"

# Upload Bill of Lading
echo ""
echo "📤 Uploading Bill of Lading..."
RESPONSE=$(curl -s -X POST "$API_URL/documents/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/bill_of_lading.txt" \
  -F "entityType=SHIPMENT" \
  -F "entityId=$SHIPMENT_ID" \
  -F "documentType=BILL_OF_LADING" \
  -F "remarks=Bill of Lading for shipment")

echo "$RESPONSE" | grep -q '"success":true' && echo "✅ Bill of Lading uploaded" || echo "❌ Failed: $RESPONSE"

# Upload Commercial Invoice
echo ""
echo "📤 Uploading Commercial Invoice..."
RESPONSE=$(curl -s -X POST "$API_URL/documents/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/commercial_invoice.txt" \
  -F "entityType=SHIPMENT" \
  -F "entityId=$SHIPMENT_ID" \
  -F "documentType=COMMERCIAL_INVOICE" \
  -F "remarks=Commercial Invoice for LC payment")

echo "$RESPONSE" | grep -q '"success":true' && echo "✅ Commercial Invoice uploaded" || echo "❌ Failed: $RESPONSE"

# Upload Packing List
echo ""
echo "📤 Uploading Packing List..."
RESPONSE=$(curl -s -X POST "$API_URL/documents/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/packing_list.txt" \
  -F "entityType=SHIPMENT" \
  -F "entityId=$SHIPMENT_ID" \
  -F "documentType=PACKING_LIST" \
  -F "remarks=Detailed packing list")

echo "$RESPONSE" | grep -q '"success":true' && echo "✅ Packing List uploaded" || echo "❌ Failed: $RESPONSE"

# Clean up
rm -f /tmp/bill_of_lading.txt /tmp/commercial_invoice.txt /tmp/packing_list.txt

echo ""
echo "========================================="
echo "✅ Shipping documents upload complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Refresh browser at http://localhost:3000"
echo "2. Open Document Examination for LC-CONTRACT1794809015706"
echo "3. You should now see the shipping documents"
echo "4. Approve each document (Bill of Lading, Commercial Invoice, Packing List)"
echo "5. Proceed to Payment Release"
echo ""
