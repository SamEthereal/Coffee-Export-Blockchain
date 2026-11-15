#!/bin/bash

# Manual chaincode installation test with debugging

echo "🔍 Testing Chaincode Installation"
echo ""

CHAINCODE_PACKAGE="/home/guda/GoCBC/chaincodes/coffee/coffee_2.4.tar.gz"

if [ ! -f "$CHAINCODE_PACKAGE" ]; then
    echo "❌ Package not found: $CHAINCODE_PACKAGE"
    exit 1
fi

echo "✅ Package found: $CHAINCODE_PACKAGE"
echo ""

# Show package structure
echo "📦 Package structure:"
tar -tzf "$CHAINCODE_PACKAGE"
echo ""

# Show metadata.json
echo "📄 metadata.json:"
tar -xzOf "$CHAINCODE_PACKAGE" metadata.json
echo ""
echo ""

# Show connection.json
echo "📄 connection.json:"
tar -xzOf "$CHAINCODE_PACKAGE" code.tar.gz | tar -xzO connection.json
echo ""
echo ""

# Copy to container
echo "📋 Copying package to peer container..."
docker cp "$CHAINCODE_PACKAGE" peer0.ecta.cecbs.et:/tmp/test_coffee.tar.gz
echo ""

# Try to install with environment set
echo "🚀 Attempting installation..."
docker exec \
    -e CORE_PEER_LOCALMSPID=ECTAMSP \
    -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/users/Admin@ecta.cecbs.et/msp \
    -e FABRIC_LOGGING_SPEC=DEBUG \
    peer0.ecta.cecbs.et \
    peer lifecycle chaincode install /tmp/test_coffee.tar.gz 2>&1 | tee /tmp/install-test.log

echo ""
echo "📋 Installation attempt logged to /tmp/install-test.log"
