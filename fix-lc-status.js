#!/usr/bin/env node

/**
 * Fix LC status on blockchain by calling ExamineLCDocuments
 * This sets the LC from PAYMENT_RELEASED back to UTILIZED
 */

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api/v1';
const LC_ID = 'LC-CONTRACT1794809015706';

async function fixLCStatus() {
  console.log('🔧 Fixing LC status on blockchain...');
  console.log(`LC ID: ${LC_ID}`);
  
  // Login as bank admin
  console.log('\n1️⃣ Logging in as bank_admin...');
  const loginResponse = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'bank_admin',
      password: 'admin123'
    })
  });
  
  const loginData = await loginResponse.json();
  if (!loginData.success) {
    console.error('❌ Login failed:', loginData);
    process.exit(1);
  }
  
  const token = loginData.token;
  console.log('✅ Logged in successfully');
  
  // Check current status on blockchain
  console.log('\n2️⃣ Checking current LC status on blockchain...');
  const readResponse = await fetch(`${API_BASE}/banking/lc/${LC_ID}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const lcData = await readResponse.json();
  if (lcData.success && lcData.data) {
    console.log(`Current blockchain status: ${lcData.data.status}`);
    
    if (lcData.data.status === 'UTILIZED') {
      console.log('✅ LC is already UTILIZED on blockchain - no fix needed!');
      return;
    }
  }
  
  // Call ExamineLCDocuments to set status to UTILIZED
  console.log('\n3️⃣ Calling ExamineLCDocuments to set UTILIZED status...');
  const examineResponse = await fetch(`${API_BASE}/banking/lc/${LC_ID}/examine-documents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      compliant: true,
      remarks: 'Status correction: All documents verified',
      examinedBy: 'bank_admin'
    })
  });
  
  const examineData = await examineResponse.json();
  
  if (examineData.success) {
    console.log('✅ Successfully set LC status to UTILIZED on blockchain!');
    console.log('Transaction ID:', examineData.txId || examineData.transactionId);
    console.log('\n🎉 Fix complete! You can now release payment.');
  } else {
    console.error('❌ Failed to update LC status:', examineData);
    console.error('\nThis might mean the LC status on blockchain is not in a state that allows examination.');
    console.error('Current status might need manual blockchain intervention.');
  }
}

fixLCStatus().catch(err => {
  console.error('❌ Script error:', err);
  process.exit(1);
});
