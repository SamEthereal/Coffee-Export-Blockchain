#!/usr/bin/env bash
echo "Stopping CECBS Fast Dev Backing Stack..."
docker compose -f docker-compose.dev.yml down
echo "All development containers stopped cleanly."
