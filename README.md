# GoCBC - Ethiopian Coffee Export Consortium Blockchain System

> **Branch:** `samuel` (Production-grade refactoring & cleanup)

## Overview

GoCBC (CECBS) is an enterprise consortium blockchain platform designed for Ethiopia's coffee export ecosystem. It coordinates trade finance, regulatory compliance, quality verification, and shipping logistics across 7 participant organizations:

1. **ECTA** — Ethiopian Coffee & Tea Authority (Licensing & Contract approval)
2. **ECX** — Ethiopia Commodity Exchange (Lot verification & warehouse receipts)
3. **Commercial Banks** — Letters of Credit (LC), payments, CAD, and advance settlements
4. **NBE** — National Bank of Ethiopia (Forex allocation, retention policy & repatriation tracking)
5. **Quality & Inspection** — Pre-shipment grading, cupping, and phytosanitary certification
6. **Customs Commission (ECC)** — Export declarations, duty valuation & border clearance
7. **Shipping Lines (ESLSE)** — Freight booking, Bill of Lading (`B/L`) & dispatch tracking

---

## Technical Stack

- **Blockchain Engine:** Hyperledger Fabric 2.5 (Chaincode-as-a-Service) + Built-in Simulated Ledger Engine for Instant Dev
- **Smart Contracts (Chaincode):** Go (`chaincodes/coffee/`)
- **API Gateway:** Node.js / TypeScript / Express (`api/`)
  - Modularized sub-routers (`contracts`, `banking`, `shipments`, `customs`, `forex`, `users`)
  - Unified Cryptographic Hub (`SignatureService.ts`) with Ed25519 & ECDSA verification
  - Hybrid IPFS Layer (`ipfsService.ts`) with SHA-256 fallback and on-chain CID pinning
  - Clean idempotent PostgreSQL baseline schema (`001_baseline_schema.sql`, `002_seed_initial_data.sql`)
- **Frontend Portals:** Next.js / React / Material-UI (`ui/`)
  - Modular portal component architecture (`BanksPortal`, `ExporterPortal`, `ECTAPortal`, `NBEPortal`)
- **Backing Services:** PostgreSQL 15, Redis 7, Kubo IPFS v0.26.0

---

## ⚡ Quick Start: 2 Modes of Operation

### Mode 1: Fast Dev Mode (Recommended — Starts in 5-10 Seconds)
Runs lightweight backing services (**PostgreSQL 15 + Redis 7 + Kubo IPFS**, <300MB RAM) with the **Simulated Ledger Engine**. Allows developers and evaluators to run all 7 portals and complete export cycles instantly without launching heavy blockchain peer containers.

1. **Start Backing Services:**
   ```powershell
   # Windows (PowerShell)
   .\start-dev.ps1

   # Linux / macOS / Git Bash
   chmod +x start-dev.sh && ./start-dev.sh
   ```
   *(Or via Docker Compose: `docker compose -f docker-compose.dev.yml up -d`)*

2. **Start Backend API (Terminal 1):**
   ```bash
   cd api
   npm install
   npm run dev
   ```
   *(API Gateway runs on `http://localhost:3001` with Swagger docs at `/api-docs`)*

3. **Start Frontend UI (Terminal 2):**
   ```bash
   cd ui
   npm install
   npm run dev
   ```
   *(Frontend Portals run on `http://localhost:3000`)*

4. **Stop Dev Services:**
   ```powershell
   .\stop-dev.ps1   # Windows
   ./stop-dev.sh    # Linux / macOS
   ```

---

### Mode 2: Full Fabric Consortium Mode (Production / Multi-Org)
When you want to run the full distributed network with 6 organization peer containers, Raft ordering service, and Go chaincode:

```bash
# Launch 6-org Fabric network
docker compose -f docker-compose-fabric.yml up -d

# Teardown full network
docker compose -f docker-compose-fabric.yml down
```

---

## 🔐 Default Seed Accounts

The database comes pre-seeded with accounts for all roles (passwords hashed with bcrypt):

| Role | Username | Password | Organization |
|---|---|---|---|
| **System Admin** | `admin` | `admin123` | System Administrator |
| **ECTA Authority** | `ecta_admin` | `password123` | ECTA |
| **ECX Exchange** | `ecx_admin` | `password123` | ECX |
| **Commercial Bank** | `bank_admin` | `password123` | Commercial Bank of Ethiopia (CBE) |
| **Central Bank** | `nbe_admin` | `password123` | National Bank of Ethiopia (NBE) |
| **Customs** | `customs_admin` | `password123` | Ethiopian Customs Commission |
| **Shipping Line** | `shipping_admin` | `password123` | Ethiopian Shipping & Logistics (ESLSE) |
| **Exporter** | `exporter1` | `password123` | Ethiopian Specialty Coffee Exporter (EXP001) |

---

## Directory Structure

```text
├── api/                    # Backend REST API (Node.js/TypeScript)
│   ├── src/                # Modular routes, services, middleware, utils
│   │   ├── migrations/     # Idempotent baseline schema & seed data
│   │   ├── routes/         # Express routers (banking, contracts, customs, etc.)
│   │   └── services/       # FabricService, SignatureService, IPFSService
├── blockchain/             # Fabric network configs, crypto materials, channel artifacts
├── chaincodes/             # Hyperledger Fabric smart contracts (Go)
│   └── coffee/             # Trade finance, EUDR traceability & logistics chaincode
├── Docs/                   # System specifications & architecture references
├── ui/                     # Frontend Next.js application
│   └── src/components/portals/ # Decomposed modular portal components
├── docker-compose.dev.yml  # Fast Dev Mode backing stack (Postgres, Redis, IPFS)
├── docker-compose-fabric.yml # Full 6-org Hyperledger Fabric network
├── start-dev.ps1 / .sh     # Fast Dev Mode launchers
└── stop-dev.ps1 / .sh      # Fast Dev Mode teardown scripts
```

---

## Key Reference Documentation

- [Fast Quick Start Guide](QUICK-START.md)
- [Architecture Analysis](Docs/CODEBASE-ARCHITECTURE-ANALYSIS.md)
- [System Architecture](Docs/ARCHITECTURE.md)
- [API Reference](Docs/API-DOCUMENTATION.md)
- [Workflow API Guide](Docs/WORKFLOW-API-REFERENCE.md)
- [Database Schema Reference](Docs/DATABASE-SCHEMA-REFERENCE.md)
- [Ethiopian Coffee Export Requirements](Docs/ETHIOPIAN-COFFEE-EXPORT-REQUIREMENTS.md)
- [Complete Export Workflow](Docs/COMPLETE-EXPORT-WORKFLOW.md)
