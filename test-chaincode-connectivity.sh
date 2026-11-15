#!/bin/bash
set -e

echo "=== Testing Chaincode Connectivity ==="

echo "1. Checking if chaincode container is running..."
docker ps --filter name=coffee-chaincode --format "{{.Names}}: {{.Status}}"

echo -e "\n2. Checking chaincode process inside container..."
docker exec coffee-chaincode ps aux | grep -E "PID|chaincode" || echo "No chaincode process found!"

echo -e "\n3. Checking if port 9999 is listening..."
docker exec coffee-chaincode netstat -tuln 2>/dev/null | grep 9999 || docker exec coffee-chaincode ss -tuln 2>/dev/null | grep 9999 || echo "Port check tools not available"

echo -e "\n4. Checking last 10 chaincode log lines..."
docker logs coffee-chaincode --tail 10 2>&1 | grep -v "VendorExtensible\|SchemaProps"

echo -e "\n5. Testing if peers can resolve chaincode hostname..."
docker exec peer0.ecta.cecbs.et getent hosts coffee-chaincode || echo "DNS resolution failed"

echo -e "\n6. Checking peer chaincode endpoint configuration..."
docker exec peer0.ecta.cecbs.et env | grep -i chaincode | grep -i address || echo "No chaincode address env vars"

echo -e "\n=== Test Complete ==="
