#!/bin/bash
set -e

echo "🔄 Redeploying chaincode with ResetLCStatusForTesting function..."

cd /home/guda/GoCBC/blockchain

# Set environment variables
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/config/

echo "📦 Step 1: Package chaincode..."
peer lifecycle chaincode package coffee.tar.gz \
  --path ../chaincodes/coffee \
  --lang golang \
  --label coffee_1.1

echo "✅ Chaincode packaged"

# Function to install and approve on each org
install_and_approve() {
  local ORG=$1
  local ORG_LOWER=$(echo $ORG | tr '[:upper:]' '[:lower:]')
  local PEER_PORT=$2
  local MSP_ID="${ORG}MSP"
  
  echo ""
  echo "🏢 Processing $ORG..."
  
  # Set environment for this org
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID=$MSP_ID
  export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/${ORG_LOWER}.cecbs.et/peers/peer0.${ORG_LOWER}.cecbs.et/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/${ORG_LOWER}.cecbs.et/users/Admin@${ORG_LOWER}.cecbs.et/msp
  export CORE_PEER_ADDRESS=localhost:${PEER_PORT}
  
  echo "📥 Installing chaincode on $ORG..."
  peer lifecycle chaincode install coffee.tar.gz
  
  echo "✅ Installed on $ORG"
}

# Install on all organizations
install_and_approve "ECTA" 7051
install_and_approve "ECX" 9051
install_and_approve "BANKS" 11051
install_and_approve "NBE" 13051
install_and_approve "CUSTOMS" 15051
install_and_approve "SHIPPING" 17051

echo ""
echo "🔍 Getting package ID..."
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep coffee_1.1 | awk '{print $3}' | sed 's/,$//')
echo "Package ID: $PACKAGE_ID"

# Approve for all orgs
approve_chaincode() {
  local ORG=$1
  local ORG_LOWER=$(echo $ORG | tr '[:upper:]' '[:lower:]')
  local PEER_PORT=$2
  local MSP_ID="${ORG}MSP"
  
  echo ""
  echo "✅ Approving chaincode for $ORG..."
  
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID=$MSP_ID
  export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/${ORG_LOWER}.cecbs.et/peers/peer0.${ORG_LOWER}.cecbs.et/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/${ORG_LOWER}.cecbs.et/users/Admin@${ORG_LOWER}.cecbs.et/msp
  export CORE_PEER_ADDRESS=localhost:${PEER_PORT}
  
  peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.cecbs.et \
    --channelID coffee-channel \
    --name coffee \
    --version 1.1 \
    --package-id $PACKAGE_ID \
    --sequence 2 \
    --tls \
    --cafile ${PWD}/organizations/ordererOrganizations/cecbs.et/orderers/orderer.cecbs.et/msp/tlscacerts/tlsca.cecbs.et-cert.pem
}

approve_chaincode "ECTA" 7051
approve_chaincode "ECX" 9051
approve_chaincode "BANKS" 11051
approve_chaincode "NBE" 13051
approve_chaincode "CUSTOMS" 15051
approve_chaincode "SHIPPING" 17051

echo ""
echo "📋 Checking commit readiness..."
peer lifecycle chaincode checkcommitreadiness \
  --channelID coffee-channel \
  --name coffee \
  --version 1.1 \
  --sequence 2 \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/cecbs.et/orderers/orderer.cecbs.et/msp/tlscacerts/tlsca.cecbs.et-cert.pem \
  --output json

echo ""
echo "🚀 Committing chaincode..."
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.cecbs.et \
  --channelID coffee-channel \
  --name coffee \
  --version 1.1 \
  --sequence 2 \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/cecbs.et/orderers/orderer.cecbs.et/msp/tlscacerts/tlsca.cecbs.et-cert.pem \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/ecta.cecbs.et/peers/peer0.ecta.cecbs.et/tls/ca.crt \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/ecx.cecbs.et/peers/peer0.ecx.cecbs.et/tls/ca.crt \
  --peerAddresses localhost:11051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/banks.cecbs.et/peers/peer0.banks.cecbs.et/tls/ca.crt \
  --peerAddresses localhost:13051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/nbe.cecbs.et/peers/peer0.nbe.cecbs.et/tls/ca.crt \
  --peerAddresses localhost:15051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/customs.cecbs.et/peers/peer0.customs.cecbs.et/tls/ca.crt \
  --peerAddresses localhost:17051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/shipping.cecbs.et/peers/peer0.shipping.cecbs.et/tls/ca.crt

echo ""
echo "✅ Chaincode redeployed successfully!"
echo "🎉 ResetLCStatusForTesting function is now available"
