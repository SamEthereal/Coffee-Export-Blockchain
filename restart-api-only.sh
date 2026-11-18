#!/bin/bash

# Quick script to restart ONLY the API with proper network configuration

set -e

echo "🔄 Restarting CECBS API..."

# Stop and remove existing API container
echo "Stopping existing API container..."
docker stop cecbs-api 2>/dev/null || true
docker rm cecbs-api 2>/dev/null || true

# Start API using docker-compose
echo "Starting API with docker-compose..."
cd /home/guda/GoCBC
docker-compose -f docker-compose-fabric.yml up -d cecbs-api

# Wait for API to start
echo "Waiting for API to initialize..."
sleep 10

# Check status
echo ""
echo "=== API Container Status ==="
docker ps --filter "name=cecbs-api" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== Recent API Logs ==="
docker logs cecbs-api --tail 20

echo ""
echo "=== Network Check ==="
docker inspect cecbs-api --format='Networks: {{range $net,$v := .NetworkSettings.Networks}}{{$net}} {{end}}'

echo ""
echo "=== Database Connection Test ==="
docker exec cecbs-api sh -c 'timeout 2 nc -zv cecbs-postgres 5432 2>&1 || echo "Cannot reach PostgreSQL"'

echo ""
echo "✅ API restart complete!"
echo ""
echo "If API is still failing to connect to PostgreSQL, check:"
echo "1. Both containers are on 'cecbs-network'"
echo "2. DATABASE_URL in api/.env is correct"
echo "3. PostgreSQL container is running"
