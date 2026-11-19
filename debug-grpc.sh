#!/bin/bash

echo "=== Starting gRPC Debug Session ==="
echo "This will tail chaincode logs while triggering a query"
echo ""

# Start tailing chaincode logs in background
echo "Starting log tail..."
docker logs -f coffee-chaincode 2>&1 | grep -E "grpc|connect|register|invoke|query|error|ERROR" &
TAIL_PID=$!

sleep 2

# Trigger a chaincode query
echo ""
echo "Triggering chaincode query..."
timeout 10 curl -s -X GET \
  -H "Authorization: Bearer $(docker exec cecbs-api cat /tmp/test-token 2>/dev/null || echo 'none')" \
  http://localhost:3001/api/v1/banking/lc 2>&1 | head -20 &

sleep 8

# Kill the tail
kill $TAIL_PID 2>/dev/null

echo ""
echo "=== Debug session complete ==="
echo ""
echo "Now checking peer logs for the same timeframe:"
docker logs peer0.ecta.cecbs.et --since 15s 2>&1 | grep -E "coffee_2.13|chaincode.*invoke|timeout" | tail -10
