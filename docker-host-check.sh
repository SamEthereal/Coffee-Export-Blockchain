#!/usr/bin/env bash
# CECBS Docker-host check — read-only. Run on the machine where the
# Docker stack is running, from the GoCBC repo root (or pass the repo
# directory as the first argument). It prints the state of every
# container, the committed chaincode, the Postgres tables and the API/UI
# health, so the full integration test can start from known-good state.
# Nothing here writes, restarts or changes any container.
set -u
REPO_DIR="${1:-$(pwd)}"
cd "$REPO_DIR" || { echo "Cannot cd to $REPO_DIR"; exit 1; }

echo "=== 1. Docker containers ==="
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo
echo "=== 2. Compose services (docker-compose-fabric.yml) ==="
docker compose -f docker-compose-fabric.yml ps 2>&1

echo
echo "=== 3. Committed chaincode on coffeechannel (ECTA peer) ==="
docker exec peer0.ecta.cecbs.et peer lifecycle chaincode querycommitted \
  --channelID coffeechannel --name coffee 2>&1

echo
echo "=== 4. Chaincode container ==="
docker inspect coffee-chaincode --format 'Status: {{.State.Status}}  Image: {{.Config.Image}}' 2>&1
docker logs coffee-chaincode --tail 5 2>&1

echo
echo "=== 5. Postgres (cecbs-postgres) ==="
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c \
  "SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public';" 2>&1
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c \
  "SELECT count(*) AS applied_migrations FROM _schema_migrations;" 2>&1

echo
echo "=== 6. API + UI health ==="
curl -s -m 5 http://localhost:3001/health; echo
curl -s -m 5 -o /dev/null -w "UI /login: %{http_code}\n" http://localhost:3000/login

echo
echo "=== 7. API recent log (last 20 lines) ==="
docker logs cecbs-api --tail 20 2>&1 || docker logs api --tail 20 2>&1

echo
echo "=== 8. CouchDBs ==="
# Host ports per docker-compose-fabric.yml (ECTA is 5985:5984 — 5984 is
# the in-container port, not reachable from the host).
for org in ecta ecx banks nbe customs shipping; do
  printf "%-10s " "$org"
  curl -s -m 3 "http://localhost:$(
    case $org in
      ecta) echo 5985;; ecx) echo 6984;; banks) echo 7984;;
      nbe) echo 8984;; customs) echo 9984;; shipping) echo 10984;;
    esac)/" | head -c 60; echo
done
echo
echo "Done. Paste the whole output back to Muse."
