#!/bin/bash

echo "=== Chaincode Container Status ==="
docker ps | grep coffee-chaincode

echo ""
echo "=== Chaincode Logs (last 20 lines) ==="
docker logs coffee-chaincode 2>&1 | tail -20

echo ""
echo "=== Network Connectivity Test ==="
docker exec peer0.ecta.cecbs.et getent hosts coffee-chaincode 2>&1 || echo "DNS resolution failed"

echo ""
echo "=== Peer Chaincode Logs ==="
docker logs peer0.ecta.cecbs.et 2>&1 | grep -i "coffee_2.13\|chaincode.*error\|timeout" | tail -10

echo ""
echo "=== API Chaincode Query Errors ==="
docker logs cecbs-api 2>&1 | grep -i "timeout\|chaincode.*error" | tail -5
