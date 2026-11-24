#!/usr/bin/env bash
# ==============================================================================
# Ethiopian Coffee Export Consortium Blockchain System (CECBS)
# Fast Local Development Launcher (Tier 1: Fast Dev Mode)
# ==============================================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${GREEN}   ☕ CECBS - Fast Local Development Mode (Tier 1: Dev Mode)    ${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo ""

# 1. Check Docker
echo -e "${YELLOW}[1/4] Checking Docker daemon status...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}[ERROR] Docker is not running. Please start Docker and retry.${NC}"
    exit 1
fi
echo -e "${GREEN}  --> Docker daemon is active and responding.${NC}"

# 2. Check & Prepare Environment Files
echo -e "${YELLOW}[2/4] Ensuring environment configuration files...${NC}"
if [ ! -f "api/.env" ]; then
    if [ -f "api/.env.dev" ]; then
        cp api/.env.dev api/.env
        echo -e "${GREEN}  --> Created api/.env from api/.env.dev (Fast Dev Mode defaults)${NC}"
    elif [ -f "api/.env.example" ]; then
        cp api/.env.example api/.env
        echo -e "${GREEN}  --> Created api/.env from api/.env.example${NC}"
    fi
else
    echo -e "  --> api/.env already exists."
fi

if [ ! -f "ui/.env.local" ]; then
    if [ -f "ui/.env.dev" ]; then
        cp ui/.env.dev ui/.env.local
        echo -e "${GREEN}  --> Created ui/.env.local from ui/.env.dev${NC}"
    elif [ -f "ui/.env.example" ]; then
        cp ui/.env.example ui/.env.local
        echo -e "${GREEN}  --> Created ui/.env.local from ui/.env.example${NC}"
    fi
else
    echo -e "  --> ui/.env.local already exists."
fi

# 3. Start Backing Containers
echo -e "${YELLOW}[3/4] Launching lightweight backing stack (PostgreSQL + Redis + IPFS)...${NC}"
docker compose -f docker-compose.dev.yml up -d

# 4. Wait for PostgreSQL readiness
echo -e "${YELLOW}[4/4] Verifying PostgreSQL readiness...${NC}"
max_attempts=12
attempt=0
db_ready=false

while [ $attempt -lt $max_attempts ] && [ "$db_ready" = false ]; do
    sleep 1
    if docker exec cecbs-postgres pg_isready -U cecbs -d cecbs > /dev/null 2>&1; then
        db_ready=true
    fi
    attempt=$((attempt + 1))
done

if [ "$db_ready" = true ]; then
    echo -e "${GREEN}  --> PostgreSQL database 'cecbs' is ready and accepting connections.${NC}"
else
    echo -e "${YELLOW}  --> PostgreSQL container started (initialization continuing in background).${NC}"
fi

echo ""
echo -e "${CYAN}=================================================================${NC}"
echo -e "${GREEN}                  FAST DEV STACK IS ACTIVE                       ${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo -e "  Database:     localhost:5432  (DB: cecbs, User: cecbs)"
echo -e "  Redis Cache:  localhost:6379"
echo -e "  IPFS API:     localhost:5001  (Gateway: http://localhost:8080/ipfs)"
echo -e "  Blockchain:   ${CYAN}SIMULATED (Built-in Simulated Ledger Engine Active)${NC}"
echo ""
echo -e "${YELLOW}To start the application servers:${NC}"
echo -e "  Terminal 1 (Backend API):"
echo -e "    ${CYAN}cd api && npm install && npm run dev${NC}"
echo -e "  Terminal 2 (Frontend UI):"
echo -e "    ${CYAN}cd ui && npm install && npm run dev${NC}"
echo ""
echo -e "${GREEN}Access Portals at: http://localhost:3000${NC}"
echo -e "${GREEN}API Gateway at:    http://localhost:3001/api-docs${NC}"
echo -e "To stop services:  ./stop-dev.sh"
echo -e "${CYAN}=================================================================${NC}"
echo ""
