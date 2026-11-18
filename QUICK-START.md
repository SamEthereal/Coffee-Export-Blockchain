# Quick Start - Document Examination to Payment Release

## Your Current State
- ✅ Contract: CONTRACT1794809015706
- ✅ LC: LC-CONTRACT1794809015706 (Status: FOREX_ALLOCATED)
- ✅ Shipment: SHIP1794897257941 (Status: DELIVERED)
- ✅ Documents: 3 documents uploaded

## 3-Step Workflow

### Step 1: Document Examination (5 minutes)
```
1. Refresh browser (Ctrl+Shift+R)
2. Banks Portal → Document Examination tab
3. Click "Examine Documents" on your LC
4. Click "Approve" on each of 3 documents
5. Click "Mark LC as Compliant & Ready for Payment"
   → LC status becomes UTILIZED
```

### Step 2: Payment Release (2 minutes)
```
1. Go to Payment Release tab
2. Click "Release Payment" on your LC
3. Confirm
   → LC status becomes PAYMENT_RELEASED
   → MT103 SWIFT message auto-created ✅
```

### Step 3: View SWIFT Messages (1 minute)
```
1. Go to Communication & Issues tab
2. See MT103 payment message
3. View details (optional)
```

## Expected Results

### Document Examination Tab
- Shows: LC-CONTRACT1794809015706
- Documents: 3 shipping documents from SHIP1794897257941
- Action: Approve each document

### Payment Release Tab  
- Shows: LC-CONTRACT1794809015706 (after examination)
- Status: UTILIZED, all docs verified
- Action: Release payment

### Communication & Issues Tab
- Shows: MT103 SWIFT message (after payment release)
- Type: MT103 Payment
- Status: DRAFT
- Amount: Your LC amount

## Console Logs to Watch

Open DevTools (F12) → Console:

```javascript
// Document Examination
[BANKS] ✅ LC LC-CONTRACT1794809015706 ready for examination
[TAB3] 📄 Fetching CUSTOMS_DECLARATION documents
[TAB3] ✅ Fetched 3 CUSTOMS_DECLARATION documents
[TAB3] 📚 Total documents (LC + Shipment): 3

// Payment Release  
[PAYMENT METHODS] ✅ Including LC-CONTRACT1794809015706 - status is UTILIZED
[BANKS] Payment released successfully

// SWIFT
[PAYMENT RELEASE] Auto-creating MT103 SWIFT message
[PAYMENT RELEASE] ✅ MT103 SWIFT message auto-created
```

## Quick Verification

### After Document Examination:
```bash
# Check LC status changed to UTILIZED
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT status FROM letters_of_credit WHERE lc_id = 'LC-CONTRACT1794809015706';"
# Expected: UTILIZED
```

### After Payment Release:
```bash
# Check LC status changed to PAYMENT_RELEASED
docker exec cecbs-postgres psql -U cecbs -d cecbs -t -c "SELECT status FROM letters_of_credit WHERE lc_id = 'LC-CONTRACT1794809015706';"
# Expected: PAYMENT_RELEASED

# Check MT103 SWIFT message created
docker exec cecbs-postgres psql -U cecbs -d cecbs -c "SELECT message_id, message_type FROM swift_messages WHERE lc_id = 'LC-CONTRACT1794809015706';"
# Expected: 1 row with message_type = MT103
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| LC not in Document Examination tab | Check LC status is FOREX_ALLOCATED and shipment is DELIVERED |
| Documents not loading | Check browser console for fetch errors, verify shipment has documents |
| LC not in Payment Release tab | Complete Document Examination first, LC must be UTILIZED |
| No SWIFT messages | MT103 only created during payment release, check API logs |

## Timeline

```
Start → Document Examination (5 min) → Payment Release (2 min) → SWIFT Messages (1 min) → Done!
         ↓                              ↓                          ↓
    FOREX_ALLOCATED              UTILIZED                  PAYMENT_RELEASED
                                                          + MT103 Created
```

## Ready?

**Refresh your browser and go to Banks Portal → Document Examination tab!**

Your LC should be waiting there with all 3 shipping documents ready for examination.

---

**Total Time: ~8 minutes**  
**Difficulty: Easy**  
**Result: Complete end-to-end workflow with SWIFT messages ✅**
