# LC Document Requirements - Quick Reference

## System Implementation Status: ✅ COMPLETE

The CECBS system now implements comprehensive LC document validation based on UCP 600 standards.

---

## 📋 Required Documents by Stage

### Stage 1: APPROVAL (5 documents required)
Before bank can approve LC request:

1. ✅ **Sales Contract** - Signed agreement between buyer and seller
2. ✅ **Proforma Invoice** - Estimated costs and breakdown
3. ✅ **Certificate of Origin** - Proves Ethiopian origin
4. ✅ **ICO Certificate** - International Coffee Organization certificate
5. ✅ **Quality Certificate** - Lab testing and grading results

### Stage 2: ISSUANCE (3 requirements)
Before bank can issue LC to advising bank:

1. ✅ **Exporter License** - Must be ACTIVE status
2. ✅ **Contract Approval** - ECTA must have approved the contract
3. ⚠️ **Forex Allocation** - If LC payment method (conditional)

### Stage 3: PAYMENT RELEASE (7 documents required)
Before bank releases payment to exporter:

1. ✅ **Commercial Invoice** - Final invoice matching LC terms
2. ✅ **Bill of Lading** - Transport document (clean, within dates)
3. ✅ **Packing List** - Detailed packaging information
4. ✅ **Inspection Certificate** - SGS/BV pre-shipment inspection
5. ✅ **Insurance Certificate** - Cargo insurance (110% CIF value)
6. ✅ **Phytosanitary Certificate** - Plant health clearance
7. ✅ **Customs Declaration** - Export customs clearance

---

## 🔧 New API Endpoints

### 1. Get Document Checklist
```
GET /api/v1/banking/lc/:lcID/document-checklist
```
Returns required documents and validation status for current LC stage.

### 2. Enhanced Approval (with validation)
```
POST /api/v1/banking/lc/:lcID/approve
```
Now validates all approval stage documents before approving.

### 3. Enhanced Issuance (with validation)
```
POST /api/v1/banking/lc/:lcID/issue
```
Now validates issuance requirements before issuing.

---

## ⚠️ Common LC Rejection Reasons (UCP 600)

1. Misspelled names (even 1 character)
2. Wrong Incoterm or missing port location
3. Bill of Lading date outside shipment window
4. Product description doesn't match LC exactly
5. Missing or incorrect HS code
6. Missing stamps or signatures
7. Quantity mismatch between documents
8. Wrong packaging details
9. Documents presented late (> 21 days after B/L)
10. Insufficient insurance coverage
11. Wrong consignee on Bill of Lading
12. Wrong number of document copies

---

## 🎯 Who Uploads What Documents?

### EXPORTER uploads during contract registration:
- Sales Contract
- Proforma Invoice
- Certificate of Origin
- ICO Certificate
- Quality Certificate

### EXPORTER uploads after shipment:
- Commercial Invoice
- Bill of Lading
- Packing List
- Inspection Certificate
- Insurance Certificate
- Phytosanitary Certificate

### CUSTOMS uploads:
- Customs Declaration

---

## ✅ Validation Rules

### Approval Stage
- All 5 required documents must exist with entity_type='CONTRACT'
- Contract status must be 'APPROVED' by ECTA
- Documents must have status='active'

### Issuance Stage
- All approval stage documents must be available
- Exporter license status must be 'ACTIVE'
- Contract status must be 'APPROVED'
- LC status must be 'APPROVED'
- Forex allocation required if payment method is LC

### Payment Release Stage
- All 7 required documents must be available
- Documents must be presented within presentation period (typically 21 days)
- All details must match LC terms exactly

---

## 📊 Testing Steps

### Test 1: Approval Validation
1. Create contract with only 3 documents
2. Request LC
3. Try to approve → Should fail with missing documents error
4. Upload missing documents
5. Try approval again → Should succeed

### Test 2: Issuance Validation
1. Approve LC
2. Suspend exporter license
3. Try to issue → Should fail with license status error
4. Reactivate license
5. Try issuance again → Should succeed

### Test 3: Document Checklist
```bash
curl http://localhost:3001/api/v1/banking/lc/LC123/document-checklist \
  -H "Authorization: Bearer TOKEN"
```

---

## 🔗 References

Based on:
- UCP 600 (Uniform Customs and Practice for Documentary Credits)
- International Chamber of Commerce standards
- Trade finance best practices

Content rephrased for compliance with licensing restrictions.

---

## 📝 Implementation Files

**Backend:**
- `/api/src/config/lcDocumentRequirements.ts` - Document requirements configuration
- `/api/src/services/lcDocumentValidationService.ts` - Validation service
- `/api/src/routes/banking.ts` - Enhanced approval/issuance endpoints

**Key Fix from Earlier:**
- `/api/src/services/contractService.ts` - Now links documents to contracts properly

**Migration:**
- `/fix-existing-contract-documents.js` - Backfill script for existing contracts

---

## 🚀 Next Steps

1. ✅ Test document checklist API
2. ✅ Test approval with missing documents (should fail)
3. ✅ Upload missing documents and retry (should succeed)
4. ✅ Test issuance validation
5. 📱 Add document checklist UI to Banks Portal LC Details dialog
6. 📱 Show validation status and missing documents in UI
7. 📊 Run migration script to fix existing contracts

---

*Last Updated: 2026-11-15*
*Status: Implemented and Ready for Testing*
