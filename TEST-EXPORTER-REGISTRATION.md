# 🧪 Test: Exporter Registration with Document Upload

## ✅ Prerequisites
- UI running on http://localhost:3003 (already running)
- API running on http://localhost:5000 (already running)
- Blockchain network running (already running)

## 📋 Test Steps

### Step 1: Open Registration Form
1. Open browser: **http://localhost:3003/register-exporter**
2. You should see the "Become a Licensed Coffee Exporter" page

### Step 2: Fill Company Information
```
Company Name: Test Coffee Exports Ltd
TIN Number: 1234567890
Business License Number: BL-2026-9999
Registration Date: 2024-01-15
Exporter Type: Select "Private Exporter"
Capital Requirement: 15000000 (15M ETB - meets requirement)
```

### Step 3: Fill ECTA Requirements
```
Professional Taster: Ahmed Mohammed
Taster Certificate: TC-2024-5678
Laboratory Facility: Select "Own Laboratory"
Lab Certificate Number: LAB-2024-1234
```

### Step 4: Fill Contact Information
```
Contact Person: Hawi Tesfaye
Email: test@coffeeexports.et
Phone: 911234567 (will become +251911234567)
Address: Bole, Addis Ababa, Ethiopia
City: Addis Ababa
Region: Addis Ababa
```

### Step 5: Fill Banking Information
```
Bank Name: Select "Commercial Bank of Ethiopia"
Branch Name: Select "Bole Branch" 
Account Number: 1000034345677
```

### Step 6: Upload Documents (CRITICAL!)

Create 6 sample documents on your desktop or any folder:

**Option A: Create Real PDF Files**
1. Open any text editor
2. Type some text like "Sample Business License"
3. Save/Print as PDF
4. Name it: `business-license.pdf`
5. Repeat for all 6 documents

**Option B: Use Any Existing PDF Files**
- Just rename them to match the requirements
- Minimum 1 KB each

**Required Documents:**
1. **TIN Certificate** - Click upload button next to TIN field → Select PDF
2. **Business License** - Click upload button next to Business License field → Select PDF
3. **Bank Statement** - Click upload button in Banking section → Select PDF
4. **Taster Certificate** - Click upload button next to Taster Certificate field → Select PDF
5. **Laboratory Certificate** - Click upload button next to Lab Certificate field → Select PDF
6. **Company History** (Optional) - Click the dashed box at bottom → Select PDF

### Step 7: Review & Submit
1. Click **"Review Application"** button
2. Check all information is correct
3. Verify all 6 documents show green checkmarks ✅
4. Click **"Submit Application"** button

### Step 8: Watch Browser Console (IMPORTANT!)
1. Open Developer Tools (F12)
2. Go to **Console** tab
3. You should see logs like:
```
[REGISTER] Application created: APP-1731418934567-XXXXX
[REGISTER] Uploading 6 documents...
[REGISTER] Uploading TINDOC : tin-certificate.pdf
[REGISTER] Upload success for TINDOC
[REGISTER] Uploading BUSINESSLICENSEDOC : business-license.pdf
[REGISTER] Upload success for BUSINESSLICENSEDOC
... (4 more)
[REGISTER] All documents uploaded successfully!
```

### Step 9: Verify Success
1. You should see "Application Submitted!" success page
2. Note the Application ID shown (e.g., APP-1731418...)
3. Click "Go to Home"

### Step 10: Check in ECTA Portal
1. Login to ECTA Portal: http://localhost:3003/login
   - Username: `ecta_admin`
   - Password: `admin123`
2. You should see **"Pending Applications"** tab
3. Find your new application in the list
4. Click the **👁️ (eye icon)** to view details
5. Click **"Documents (6)"** tab
6. **VERIFY:** All 6 documents should show:
   - ✅ Green "AVAILABLE" badge (not MISSING)
   - Document name
   - Upload date
   - File size
   - "VIEW" button (blue)

## ✅ Expected Results

### Success Indicators:
- ✅ No errors in browser console
- ✅ Success page appears with application ID
- ✅ In ECTA Portal, Documents tab shows 6/6 AVAILABLE
- ✅ Each document has a VIEW button
- ✅ Prerequisites tab shows green PASSED badges

### Failure Indicators (What We Fixed):
- ❌ Documents show as "MISSING" 
- ❌ Console shows upload errors
- ❌ Prerequisites show failed checks

## 🐛 If Documents Still Show MISSING

**Check Console Logs:**
1. Look for `[REGISTER]` logs
2. Look for any errors like "Failed to upload"
3. Take screenshot and share

**Check API Logs:**
```bash
cd /home/guda/GoCBC/api
tail -f api.log | grep -i "upload\|document"
```

**Check Database:**
```bash
PGPASSWORD=cecbs123 psql -h localhost -p 5432 -U cecbs -d cecbs -c "SELECT document_id, entity_type, entity_id, file_name, status FROM documents ORDER BY uploaded_at DESC LIMIT 10;"
```

## 📸 Screenshots to Verify

1. **Registration form** with all fields filled
2. **All 6 document upload buttons** showing green checkmarks
3. **Browser console** showing successful upload logs
4. **Success page** with application ID
5. **ECTA Portal Documents tab** showing all documents as AVAILABLE

---

## 🎯 What This Test Proves

This test verifies:
- ✅ Registration form collects all required data
- ✅ Document upload uses correct endpoint
- ✅ Documents are stored in database
- ✅ Documents are registered on blockchain
- ✅ ECTA portal displays uploaded documents
- ✅ The bug we fixed is actually fixed!

---

**Ready to test? Follow the steps above and let me know the results!** 🚀
