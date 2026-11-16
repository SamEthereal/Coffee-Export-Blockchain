#!/bin/bash
# Test if chaincode works in traditional mode (non-CCAAS)

echo "Testing chaincode in traditional mode..."

# Temporarily rename the CCAAS package
cd /home/guda/GoCBC/chaincodes/coffee
docker exec peer0.ecta.cecbs.et peer lifecycle chaincode package coffee-traditional.tar.gz \
  --path /opt/gopath/src/github.com/chaincode/coffee \
  --lang golang \
  --label coffee_traditional_1.0 2>&1

echo "Traditional packaging test complete"
