#!/bin/bash

# Test contract registration with payment method
# This directly invokes the chaincode to test if the function works

set -e

echo "Testing RegisterSalesContractWithPaymentMethod..."

# Set environment for ECTA admin
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="EctaMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=/home/guda/GoCBC/network/organizations/peerOrganizations/ecta.cecbs.et/peers/peer0.ecta.cecbs.et/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=/home/guda/GoCBC/network/organizations/peerOrganizations/ecta.cecbs.et/users/Admin@ecta.cecbs.et/msp
export CORE_PEER_ADDRESS=localhost:7051
export ORDERER_CA=/home/guda/GoCBC/network/organizations/ordererOrganizations/cecbs.et/orderers/orderer.cecbs.et/msp/tlscacerts/tlsca.cecbs.et-cert.pem

CONTRACT_ID="TEST-$(date +%s)"
EXPORTER_ID="EXP-049"  # Use the exporter we created
BUYER_ID="BUY-TEST-001"
BUYER_NAME="Test Buyer Corp"
BUYER_COUNTRY="USA"
COFFEE_TYPE="Arabica"
QUANTITY="1000"
PRICE_PER_KG="6.5"
CURRENCY="USD"
EUDR_REQUIRED="true"
BUYER_BANK="Test Buyer Bank"
EXPORTER_BANK="Commercial Bank of Ethiopia"
PAYMENT_METHOD="LC"
DOCUMENTS_JSON="[]"

echo "Contract ID: $CONTRACT_ID"
echo "Exporter: $EXPORTER_ID"
echo "Calling chaincode..."

docker exec cli peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.cecbs.et \
  --tls \
  --cafile "$ORDERER_CA" \
  -C cecbs-channel \
  -n coffee \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/ecta.cecbs.et/peers/peer0.ecta.cecbs.et/tls/ca.crt \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/nbe.cecbs.et/peers/peer0.nbe.cecbs.et/tls/ca.crt \
  -c "{\"function\":\"RegisterSalesContractWithPaymentMethod\",\"Args\":[\"$CONTRACT_ID\",\"$EXPORTER_ID\",\"$BUYER_ID\",\"$BUYER_NAME\",\"$BUYER_COUNTRY\",\"$COFFEE_TYPE\",\"$QUANTITY\",\"$PRICE_PER_KG\",\"$CURRENCY\",\"$EUDR_REQUIRED\",\"$BUYER_BANK\",\"$EXPORTER_BANK\",\"$PAYMENT_METHOD\",\"$DOCUMENTS_JSON\"]}" \
  --waitForEvent

echo ""
echo "✓ Contract registered successfully!"
echo ""
echo "Querying contract..."

docker exec cli peer chaincode query \
  -C cecbs-channel \
  -n coffee \
  -c "{\"function\":\"ReadSalesContract\",\"Args\":[\"$CONTRACT_ID\"]}"

echo ""
echo "✓ Test complete!"
