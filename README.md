# GoCBC - Ethiopian Coffee Export Blockchain System

> **Branch:** `samuel` (Active cleanup & refactoring)

## Overview

GoCBC is a consortium blockchain-based management platform designed for Ethiopia's coffee export ecosystem. It coordinates trade finance, regulatory compliance, quality verification, and shipping logistics across 7 participant organizations:

1. **ECTA** — Ethiopian Coffee & Tea Authority (Licensing & Contract approval)
2. **ECX** — Ethiopia Commodity Exchange (Lot verification & warehouse receipts)
3. **Commercial Banks** — Letters of Credit (LC), payments, advance settlements
4. **NBE** — National Bank of Ethiopia (Forex allocation, retention policy & repatriation tracking)
5. **Quality & Inspection** — Pre-shipment grading, cupping, phytosanitary certification
6. **Customs Commission** — Export declarations, duty valuation & border clearance
7. **Shipping Lines (ESLSE)** — Freight booking, bill of lading & dispatch tracking

---

## Technical Stack

- **Blockchain:** Hyperledger Fabric 2.5 (External Chaincode-as-a-Service)
  - 6 Organization Peers (`ECTAMSP`, `ECXMSP`, `BanksMSP`, `NBEMSP`, `CustomsMSP`, `ShippingMSP`)
  - Raft Ordering Service (`orderer.cecbs.et`)
  - CouchDB State Databases
- **Smart Contracts (Chaincode):** Go (`chaincodes/coffee/`)
- **API Backend:** Node.js / TypeScript / Express (`api/`)
  - Hyperledger Fabric Node SDK (`fabric-network`)
  - PostgreSQL 15 database mirror
  - JWT Authentication & RBAC
- **Frontend:** Next.js / React / Material-UI (`ui/`)
  - 7 Portal interfaces for participant organizations
- **Document Storage:** Local/object storage with SHA-256 cryptographic registration on Fabric ledger (IPFS integration pending)

---

## Directory Structure

```text
├── api/                    # Backend REST API (Node.js/TypeScript)
│   ├── src/                # Routes, services, middleware, utils
│   └── migrations/         # PostgreSQL schema migrations
├── blockchain/             # Fabric network configs, crypto materials, channel artifacts
├── chaincodes/             # Hyperledger Fabric smart contracts (Go)
│   └── coffee/             # Export trade finance & logistics chaincode
├── Docs/                   # System specifications & architecture references
├── scripts/                # Network ops, deployment & initial seed scripts
├── test/                   # E2E & integration test suites
├── ui/                     # Frontend Next.js application
├── docker-compose-fabric.yml # Main container orchestration
├── start-all.sh            # Stack bootstrap & network launcher
└── stop-all.sh             # Graceful teardown script
```

---

## Quick Start

### 1. Prerequisites
- Docker Engine & Docker Compose
- Node.js 18+ & npm 9+
- Go 1.20+ (for chaincode modifications)

### 2. Network Bootstrap
```bash
# Start blockchain network, database, and background containers
./start-all.sh

# Stop services
./stop-all.sh
```

### 3. Application Services
```bash
# Backend API
cd api
npm install
npm run dev

# Frontend UI
cd ui
npm install
npm run dev
```

---

## Key Reference Documentation

All core reference materials are organized in `Docs/`:
- [Architecture Analysis](Docs/CODEBASE-ARCHITECTURE-ANALYSIS.md)
- [System Architecture](Docs/ARCHITECTURE.md)
- [API Reference](Docs/API-DOCUMENTATION.md)
- [Workflow API Guide](Docs/WORKFLOW-API-REFERENCE.md)
- [Database Schema Reference](Docs/DATABASE-SCHEMA-REFERENCE.md)
- [Ethiopian Coffee Export Requirements](Docs/ETHIOPIAN-COFFEE-EXPORT-REQUIREMENTS.md)
- [Complete Export Workflow](Docs/COMPLETE-EXPORT-WORKFLOW.md)
