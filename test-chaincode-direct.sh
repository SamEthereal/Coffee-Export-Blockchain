#!/bin/bash
set -e

echo "=== Testing Direct Chaincode Query ==="
echo "Querying coffee_2.13 chaincode via peer0.ecta..."

# Set environment for ECTA peer
export CORE_PEER_TLS_ENABLED=false
export CORE_PEER_LOCALMSPID="ECTAMSP"
export CORE_PEER_ADDRESS="peer0.ecta.cecbs.et:7051"
export CORE_PEER_MSPCONFIGPATH="/home/guda/GoCBC/blockchain/organizations/peerOrganizations/ecta.cecbs.et/users/Admin@ecta.cecbs.et/msp"

# Simple query with 10 second timeout
timeout 15 docker exec peer0.ecta.cecbs.et peer chaincode query \
  -C coffeechannel \
  -n coffee \
  -c '{"Args":["QueryAllLCs"]}' \
  2>&1 || echo "Query timed out or failed"

echo ""
echo "=== Test Complete ==="
