# ☕ CECBS - Fast Quick Start Guide
> **Ethiopian Coffee Export Consortium Blockchain System (CECBS)**  
> Production-grade trade finance, logistics, and compliance platform.

---

## ⚡ 10-Second Quick Start (Fast Dev Mode)

The project includes a **Tier 1 Fast Dev Mode** that boots in seconds with **<300MB RAM** using a built-in **Simulated Ledger Engine**. You do **not** need to start 36 heavy Hyperledger Fabric containers to develop, test, or demonstrate the application.

### Step 1: Start Backing Services
Run the launcher for your operating system:

**Windows (PowerShell):**
```powershell
.\start-dev.ps1
```

**macOS / Linux / WSL / Git Bash:**
```bash
chmod +x start-dev.sh
./start-dev.sh
```

*(Alternatively, via standard Docker Compose: `docker compose -f docker-compose.dev.yml up -d`)*

### Step 2: Start API Server
In a new terminal:
```bash
cd api
npm install
npm run dev
```
> The API automatically validates your environment, connects to PostgreSQL, activates the **Simulated Ledger Engine**, and starts listening at `http://localhost:3001`.

### Step 3: Start UI Portals
In another terminal:
```bash
cd ui
npm install
npm run dev
```
> The Next.js frontend will be live at `http://localhost:3000`.

---

## 🔐 Pre-Seeded Portal Login Credentials

All sample accounts are pre-seeded in the database with the baseline schema:

| Organization / Portal | Username | Password | Role / Primary Capability |
|---|---|---|---|
| **System Administrator** | `admin` | `admin123` | Full administrative control & audit trail |
| **ECTA Authority** | `ecta_admin` | `password123` | Contract approvals, licensing & quality verification |
| **ECX Exchange** | `ecx_admin` | `password123` | Lot inspection & warehouse receipt validation |
| **Commercial Banks** | `bank_admin` | `password123` | LC issuance, document examination & payment release |
| **NBE Central Bank** | `nbe_admin` | `password123` | Forex allocation, retention policy & repatriation |
| **Customs Commission** | `customs_admin` | `password123` | Export declarations, duty assessment & border clearance |
| **Shipping Lines** | `shipping_admin` | `password123` | Freight booking, Bill of Lading & vessel dispatch |
| **Coffee Exporter** | `exporter1` | `password123` | Sales contract registration, shipment build & LC requests |

---

## 🔄 End-to-End Export Workflow Walkthrough

You can test the entire Ethiopian coffee export lifecycle across portals in **under 10 minutes**:

1. **Register Sales Contract:**
   - Log in as `exporter1` at `http://localhost:3000`.
   - Go to **Contracts** tab → Click **Register New Sales Contract**.
   - Fill in buyer details, coffee grade (e.g. Yirgacheffe Grade 1), quantity, and price. Submit.
   - Status: `REGISTERED`.

2. **ECTA Contract Review & Approval:**
   - Log in as `ecta_admin`.
   - Go to **Contracts Approval** → Review the contract and click **Approve Contract**.
   - Status: `APPROVED`.

3. **NBE Forex & Bank LC Issuance:**
   - Log in as `bank_admin`.
   - Open **LC & Documentary Collections** → Click **Issue LC** on the approved contract.
   - Central Bank (NBE) allocates forex rate; LC status moves to `ISSUED` / `FOREX_ALLOCATED`.

4. **Shipment Preparation & Customs Filing:**
   - Log back in as `exporter1`.
   - Go to **Shipments** → Click **Create Shipment** linked to your approved contract.
   - Go to **Customs Declaration** tab → Submit export declaration to ECC.

5. **Customs Clearance & Freight Booking:**
   - Log in as `customs_admin` → Approve inspection and mark shipment as `CUSTOMS_CLEARED`.
   - Log in as `shipping_admin` → Issue Bill of Lading (`B/L`) and record vessel dispatch from Djibouti port.

6. **Document Examination & Payment Settlement:**
   - Log in as `bank_admin`.
   - Go to **Document Examination** tab → Review shipping documents and mark LC as `UTILIZED`.
   - Go to **Payment Release** tab → Release payment.
   - Automated SWIFT `MT103` message is generated, and NBE retention policy credits proceeds.

---

## 🛑 Stopping the Development Stack

When you are done testing:

**Windows (PowerShell):**
```powershell
.\stop-dev.ps1
```

**macOS / Linux / WSL:**
```bash
./stop-dev.sh
```

---

## 🏛️ Full Fabric Consortium Mode (Production / Multi-Org)

When you need to test against real Hyperledger Fabric 2.5 Raft consensus with live peer nodes and Go chaincode:

```bash
# Start full 6-org Fabric network + Orderer + Chaincode-as-a-Service
docker compose -f docker-compose-fabric.yml up -d

# Stop full network
docker compose -f docker-compose-fabric.yml down
```
