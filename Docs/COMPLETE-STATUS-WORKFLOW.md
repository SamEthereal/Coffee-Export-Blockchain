# Complete Status Workflow - End to End

## Overview
This document traces the complete LC workflow from contract to completion with exact status at each step, ensuring all filters, tabs, and actions align correctly.

---

## Complete Status Flow

```
CONTRACT → LC → SHIPMENT → DOCUMENT EXAMINATION → PAYMENT RELEASE → COMPLETION

APPROVED   REQUESTED   CUSTOMS_CLEARED   FOREX_ALLOCATED   UTILIZED   PAYMENT_RELEASED
           ↓           ↓                 ↓                 ↓          ↓
           APPROVED    LAND_TRANSPORT    (documents        (payment   SETTLED
           ↓           ↓                 examined)         released)  ↓
           ISSUED      VESSEL_LOADING                                 COMPLETED
                       ↓
                       DELIVERED
```

---

## Phase 1: Contract & LC Setup

### Step 1.1: Contract Creation
**Action:** Exporter creates contract

**Status:**
- Contract: `CREATED`

**Where Visible:**
- Exporter Portal → Contracts tab

---

### Step 1.2: Contract Approval
**Action:** Admin approves contract

**Status:**
- Contract: `APPROVED`

**Where Visible:**
- Admin Portal → Contract Approvals
- Exporter Portal → Contracts (approved)

---

### Step 1.3: LC Request
**Action:** Exporter requests LC for contract

**Status:**
- Contract: `APPROVED`
- LC: `REQUESTED`

**Where Visible:**
- Exporter Portal → LCs tab
- Banks Portal → LC Requests

**Banks Portal Filter:**
- Tab 1 (All LCs): Shows LC with status REQUESTED
- Tab 2 (Document Examination): Does NOT show (need FOREX_ALLOCATED + shipment DELIVERED)
- Tab 3 (Payment Release): Does NOT show (need UTILIZED)

---

### Step 1.4: LC Approval
**Action:** Bank approves LC request

**Status:**
- Contract: `APPROVED`
- LC: `APPROVED`

**Where Visible:**
- Banks Portal → All LCs (APPROVED)

**Banks Portal Filter:**
- Tab 1: Shows LC with status APPROVED
- Tab 2: Does NOT show (need FOREX_ALLOCATED + shipment)
- Tab 3: Does NOT show (need UTILIZED)

---

### Step 1.5: LC Issuance
**Action:** Bank issues LC

**Status:**
- Contract: `APPROVED`
- LC: `ISSUED`
- **SWIFT:** MT700 created (auto) ✅

**Where Visible:**
- Banks Portal → All LCs (ISSUED)
- **Communication & Issues → SWIFT Messages** (MT700) ✅

**Banks Portal Filter:**
- Tab 1: Shows LC with status ISSUED
- Tab 2: CAN show if shipment exists and DELIVERED (accepts ISSUED status)
- Tab 3: Does NOT show (need UTILIZED)

**SWIFT Messages:**
- MT700 message with status DRAFT
- Message ID: MT700-{lcId}-{timestamp}

---

### Step 1.6: Forex Allocation
**Action:** Bank allocates forex for LC

**Status:**
- Contract: `APPROVED`
- LC: `FOREX_ALLOCATED` ✅ (YOUR CURRENT STATE)
- Forex: `ALLOCATED`

**Where Visible:**
- Banks Portal → Forex Allocations
- Banks Portal → All LCs (FOREX_ALLOCATED)

**Banks Portal Filter:**
- Tab 1: Shows LC with status FOREX_ALLOCATED
- Tab 2: **CAN SHOW** if shipment DELIVERED (accepts FOREX_ALLOCATED) ✅
- Tab 3: Does NOT show (need UTILIZED)

**This is where your LC is now!**

---

## Phase 2: Shipment Workflow

### Step 2.1: Shipment Creation
**Action:** Exporter creates shipment for contract

**Status:**
- Contract: `APPROVED`
- LC: `FOREX_ALLOCATED`
- Shipment: `CREATED`

**Where Visible:**
- Shipping Portal → Shipments

**Banks Portal Filter:**
- Tab 2: Does NOT show (shipment not DELIVERED yet)

---

### Step 2.2: Customs Clearance
**Action:** Customs clears shipment

**Status:**
- Shipment: `CUSTOMS_CLEARED`

**Where Visible:**
- Shipping Portal → Shipments (cleared)
- Customs Portal → Clearances (completed)

**Banks Portal Filter:**
- Tab 2: Does NOT show (shipment not DELIVERED yet)

---

### Step 2.3: Land Transport
**Action:** Transporter completes land transport

**Status:**
- Shipment: `LAND_TRANSPORT_COMPLETED`

**Where Visible:**
- Shipping Portal → Shipments

**Banks Portal Filter:**
- Tab 2: Does NOT show (shipment not DELIVERED yet)

---

### Step 2.4: Vessel Loading
**Action:** Carrier loads onto vessel

**Status:**
- Shipment: `VESSEL_LOADING_COMPLETED`

**Where Visible:**
- Shipping Portal → Shipments

**Banks Portal Filter:**
- Tab 2: Does NOT show (shipment not DELIVERED yet)

---

### Step 2.5: Shipment Delivery
**Action:** Carrier confirms delivery at destination

**Status:**
- Shipment: `DELIVERED` ✅ (YOUR CURRENT STATE)
- Documents: 3 uploaded (CUSTOMS_DECLARATION entity)

**Where Visible:**
- Shipping Portal → Shipments (DELIVERED)

**Banks Portal Filter:**
- Tab 1: Shows LC with status FOREX_ALLOCATED
- **Tab 2: NOW SHOWS LC** (FOREX_ALLOCATED + shipment DELIVERED) ✅✅✅
- Tab 3: Does NOT show (need UTILIZED)

**This is the trigger point for Document Examination!**

---

## Phase 3: Document Examination (YOUR NEXT STEP)

### Step 3.1: Open Document Examination
**Action:** Bank navigates to Document Examination tab

**Status:**
- LC: `FOREX_ALLOCATED`
- Shipment: `DELIVERED`
- Documents: 3 uploaded, status `approved` in DB

**Filter Logic:**
```javascript
// Shows LC if:
lc.status === 'FOREX_ALLOCATED' OR 'ISSUED'  ✅ (FOREX_ALLOCATED)
AND shipment.status === 'DELIVERED'           ✅ (DELIVERED)
AND shipment.contractId === lc.contractId     ✅ (CONTRACT1794809015706)

Result: ✅ LC APPEARS IN TAB
```

**Expected Display:**
- LC-CONTRACT1794809015706
- Status: FOREX_ALLOCATED
- Exporter: {your exporter}
- "Examine Documents" button

---

### Step 3.2: Examine Documents (Click Button)
**Action:** Bank clicks "Examine Documents"

**System Actions:**
1. Fetches LC details from `/banking/lc/{lcId}`
2. Finds shipment by `contractId` match
3. Fetches documents from `/documents/entity/SHIPMENT/{shipmentId}`
4. Fetches documents from `/documents/entity/CUSTOMS_DECLARATION/{shipmentId}` ✅
5. Merges and deduplicates documents
6. Displays in dialog

**Expected Documents:**
- CUSTOMS_DECLARATION | Gurmu_Demuma_Resume.pdf | PENDING
- EXPORT_PERMIT | Gurmu_Demuma_Resume.pdf | PENDING
- DUTY_ASSESSMENT | CV-Tips.jpg | PENDING

**Status (Unchanged):**
- LC: `FOREX_ALLOCATED`
- Shipment: `DELIVERED`
- Documents: Status from DB (approved/pending)

---

### Step 3.3: Approve Documents
**Action:** Bank clicks "Approve" on each document

**System Actions:**
1. Calls `/documents/{documentId}/verify` with `verified: true`
2. Updates document `verification_status = 'verified'`
3. Refreshes document display

**Status After Each Approval:**
- Document 1: `verification_status = 'verified'` ✅
- Document 2: `verification_status = 'verified'` ✅
- Document 3: `verification_status = 'verified'` ✅
- LC: Still `FOREX_ALLOCATED` (not changed yet)

---

### Step 3.4: Mark LC as Compliant
**Action:** Bank clicks "Mark LC as Compliant & Ready for Payment"

**System Actions:**
1. Calls blockchain `ExamineLCDocuments(lcId, compliant=true, remarks="")`
2. Blockchain validates: LC must be ISSUED or FOREX_ALLOCATED ✅
3. Blockchain updates: LC status → `UTILIZED`
4. PostgreSQL syncs: LC status → `UTILIZED`

**Status After:**
- LC: `UTILIZED` ✅✅✅ (STATUS CHANGED!)
- Shipment: `DELIVERED`
- Documents: All `verification_status = 'verified'`

**Banks Portal Filter:**
- Tab 1: Shows LC with status UTILIZED
- Tab 2: **LC DISAPPEARS** (only shows FOREX_ALLOCATED/ISSUED)
- Tab 3: **LC NOW APPEARS** (shows UTILIZED) ✅✅✅

**This is the transition point to Payment Release!**

---

## Phase 4: Payment Release (AFTER DOCUMENT EXAMINATION)

### Step 4.1: Navigate to Payment Release
**Action:** Bank goes to Payment Release tab

**Status:**
- LC: `UTILIZED`
- Documents: All `verification_status = 'verified'`

**Filter Logic:**
```javascript
// Shows LC if:
lc.status === 'UTILIZED'                      ✅ (UTILIZED)
AND lc.documents.length > 0                   ✅ (has documents)
AND all documents verified                    ✅ (all verified in step 3.3)

Result: ✅ LC APPEARS IN TAB
```

**Expected Display:**
- LC-CONTRACT1794809015706
- Status: UTILIZED
- All docs: ✅ Verified
- "Release Payment" button

---

### Step 4.2: Release Payment
**Action:** Bank clicks "Release Payment"

**System Actions:**
1. Validates: LC must be `UTILIZED` ✅
2. Calls blockchain `ReleaseLCPayment(lcId, amount, currency)`
3. Blockchain updates: LC status → `PAYMENT_RELEASED`
4. PostgreSQL syncs: LC status → `PAYMENT_RELEASED`
5. **Auto-creates MT103 SWIFT message** ✅
6. Sends notification

**Status After:**
- LC: `PAYMENT_RELEASED` ✅✅✅ (STATUS CHANGED!)
- Shipment: `DELIVERED`
- Documents: All verified
- **SWIFT:** MT103 created ✅

**Banks Portal Filter:**
- Tab 1: Shows LC with status PAYMENT_RELEASED
- Tab 2: Does NOT show (only FOREX_ALLOCATED/ISSUED)
- Tab 3: May still show or disappear (depends on filter)

**SWIFT Messages:**
- MT103 message with status DRAFT
- Message ID: MT103-{lcId}-{timestamp}
- Linked to LC

---

## Phase 5: SWIFT Messages & Completion

### Step 5.1: View SWIFT Messages
**Action:** Bank goes to Communication & Issues → SWIFT Messages

**Expected Messages:**
1. **MT700** (from LC issuance) - If LC was issued with new code
2. **MT103** (from payment release) - Just created ✅

**Status:**
- Both messages: Status `DRAFT`
- Can approve and send (optional)

---

### Step 5.2: LC Settlement (Optional)
**Action:** Bank marks LC as settled

**System Actions:**
1. Calls `SettleLCPayment(lcId)`
2. LC status → `SETTLED`

**Status After:**
- LC: `SETTLED`

---

### Step 5.3: Contract Completion (Optional)
**Action:** System marks contract as complete

**Status After:**
- Contract: `COMPLETED`
- LC: `SETTLED` or `COMPLETED`

---

## Complete Status Matrix

| Phase | Step | Contract | LC | Shipment | Documents | SWIFT | Banks Tab 2 | Banks Tab 3 |
|-------|------|----------|----|-----------|-----------| ------|-------------|-------------|
| Setup | Contract Created | CREATED | - | - | - | - | ❌ | ❌ |
| Setup | Contract Approved | APPROVED | - | - | - | - | ❌ | ❌ |
| Setup | LC Requested | APPROVED | REQUESTED | - | - | - | ❌ | ❌ |
| Setup | LC Approved | APPROVED | APPROVED | - | - | - | ❌ | ❌ |
| Setup | LC Issued | APPROVED | ISSUED | - | - | MT700 | ❌* | ❌ |
| Setup | Forex Allocated | APPROVED | **FOREX_ALLOCATED** | - | - | MT700 | ❌* | ❌ |
| Shipping | Shipment Created | APPROVED | FOREX_ALLOCATED | CREATED | - | MT700 | ❌ | ❌ |
| Shipping | Customs Cleared | APPROVED | FOREX_ALLOCATED | CUSTOMS_CLEARED | - | MT700 | ❌ | ❌ |
| Shipping | Land Transport | APPROVED | FOREX_ALLOCATED | LAND_TRANSPORT | - | MT700 | ❌ | ❌ |
| Shipping | Vessel Loading | APPROVED | FOREX_ALLOCATED | VESSEL_LOADING | - | MT700 | ❌ | ❌ |
| **Shipping** | **Delivered** | APPROVED | **FOREX_ALLOCATED** | **DELIVERED** | **3 uploaded** | MT700 | **✅** | ❌ |
| **Exam** | **Open Dialog** | APPROVED | FOREX_ALLOCATED | DELIVERED | Fetched | MT700 | ✅ | ❌ |
| **Exam** | **Approve Docs** | APPROVED | FOREX_ALLOCATED | DELIVERED | **All verified** | MT700 | ✅ | ❌ |
| **Exam** | **Mark Compliant** | APPROVED | **UTILIZED** | DELIVERED | All verified | MT700 | ❌ | **✅** |
| **Payment** | **Release Payment** | APPROVED | **PAYMENT_RELEASED** | DELIVERED | All verified | **MT700 + MT103** | ❌ | ✅* |
| Complete | Settled | APPROVED | SETTLED | DELIVERED | All verified | MT700 + MT103 | ❌ | ❌ |

**Legend:**
- ❌ = LC does NOT appear in this tab
- ✅ = LC APPEARS in this tab
- ❌* = Would appear IF shipment is DELIVERED
- ✅* = May still show or disappear depending on final filter logic

---

## Critical Status Transitions

### Transition 1: FOREX_ALLOCATED → UTILIZED
**Trigger:** Bank clicks "Mark LC as Compliant & Ready for Payment"

**Chaincode:** `ExamineLCDocuments(lcId, true, "")`

**Requirements:**
- LC status must be `ISSUED` or `FOREX_ALLOCATED` ✅
- All documents must be verified
- Bank user with proper permissions

**Effect:**
- LC status changes to `UTILIZED`
- LC disappears from Document Examination tab
- LC appears in Payment Release tab

---

### Transition 2: UTILIZED → PAYMENT_RELEASED
**Trigger:** Bank clicks "Release Payment"

**Chaincode:** `ReleaseLCPayment(lcId, amount, currency)`

**Requirements:**
- LC status must be `UTILIZED` ✅
- All documents must be verified
- Bank user with proper permissions

**Effect:**
- LC status changes to `PAYMENT_RELEASED`
- MT103 SWIFT message auto-created
- Payment released to exporter

---

## Your Current State Validation

### Current Status (From Previous Commands)
```
LC: LC-CONTRACT1794809015706
  Status: FOREX_ALLOCATED ✅
  Contract: CONTRACT1794809015706 ✅

Shipment: SHIP1794897257941
  Status: DELIVERED ✅
  Contract: CONTRACT1794809015706 ✅

Documents: 3 documents
  Entity Type: CUSTOMS_DECLARATION ✅
  Entity ID: SHIP1794897257941 ✅
  Status: approved (in DB)
```

### Expected Behavior Right Now

**Banks Portal → Document Examination Tab:**
```
Filter Check:
✅ LC.status = FOREX_ALLOCATED (matches ISSUED or FOREX_ALLOCATED)
✅ Shipment found with contractId = CONTRACT1794809015706
✅ Shipment.status = DELIVERED

Result: ✅ LC SHOULD APPEAR IN DOCUMENT EXAMINATION TAB
```

**Banks Portal → Payment Release Tab:**
```
Filter Check:
❌ LC.status = FOREX_ALLOCATED (need UTILIZED)

Result: ❌ LC SHOULD NOT APPEAR (correct - need document examination first)
```

---

## Next Steps (In Order)

### 1. Document Examination ← **START HERE**
```
1. Refresh browser (Ctrl+Shift+R)
2. Banks Portal → Document Examination tab
3. Verify: LC-CONTRACT1794809015706 appears
4. Click: "Examine Documents"
5. Wait: 3 documents load
6. Approve: Each document (click Approve 3 times)
7. Click: "Mark LC as Compliant & Ready for Payment"
8. Verify: LC status → UTILIZED

Expected Status After:
- LC: UTILIZED ✅
- Documents: All verification_status = 'verified' ✅
- Tab 2: LC disappears (correct)
- Tab 3: LC appears (ready for payment)
```

### 2. Payment Release ← **AFTER STEP 1**
```
1. Banks Portal → Payment Release tab
2. Verify: LC-CONTRACT1794809015706 appears
3. Verify: Status = UTILIZED
4. Verify: All docs = ✅ Verified
5. Click: "Release Payment"
6. Wait: Blockchain transaction
7. Verify: MT103 created

Expected Status After:
- LC: PAYMENT_RELEASED ✅
- SWIFT: MT103 message created ✅
- Tab 3: LC may still show or disappear
- Communication tab: MT103 visible
```

### 3. SWIFT Messages ← **AFTER STEP 2**
```
1. Banks Portal → Communication & Issues
2. Click: SWIFT Messages section
3. Verify: MT103 message appears
4. View: Message details
5. Optional: Approve and send

Expected:
- MT103 message visible ✅
- Type: Payment
- Status: DRAFT
- Linked to LC
```

---

## Status Validation Commands

### After Document Examination
```bash
# Check LC status changed to UTILIZED
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "
SELECT lc_id, status, updated_at 
FROM letters_of_credit 
WHERE lc_id = 'LC-CONTRACT1794809015706';
"
# Expected: LC-CONTRACT1794809015706 | UTILIZED | {recent timestamp}

# Check documents verified
docker exec cecbs-postgres psql -U cecbs -d cecbs -c "
SELECT document_type, verification_status 
FROM documents 
WHERE entity_id = 'SHIP1794897257941';
"
# Expected: All show verification_status = 'verified'
```

### After Payment Release
```bash
# Check LC status changed to PAYMENT_RELEASED
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "
SELECT lc_id, status, updated_at 
FROM letters_of_credit 
WHERE lc_id = 'LC-CONTRACT1794809015706';
"
# Expected: LC-CONTRACT1794809015706 | PAYMENT_RELEASED | {recent timestamp}

# Check MT103 created
docker exec cecbs-postgres psql -U cecbs -d cecbs -c "
SELECT message_id, message_type, status, created_at 
FROM swift_messages 
WHERE lc_id = 'LC-CONTRACT1794809015706';
"
# Expected: 1 row with message_type = 'MT103'
```

---

## Summary

**Your Current Position:** ✅
- Contract: APPROVED
- LC: FOREX_ALLOCATED (correct for document examination)
- Shipment: DELIVERED (correct - ready for examination)
- Documents: 3 uploaded (correct - ready to verify)

**Next Immediate Step:** ✅
- Banks Portal → Document Examination tab
- LC should appear there NOW
- Start document examination workflow

**Expected Progression:** ✅
1. Document Examination: FOREX_ALLOCATED → UTILIZED
2. Payment Release: UTILIZED → PAYMENT_RELEASED
3. SWIFT Messages: MT103 visible

**Status Flow is Correct:** ✅
All status transitions align with chaincode requirements and filter logic.

---

**Everything is aligned! Start with Document Examination now! 🚀**
