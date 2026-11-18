#!/usr/bin/env node
/**
 * Test script to check LC expiry date
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api/v1';
const LC_ID = 'LC-CONTRACT1794809015706';

// Use a valid token - get from browser devtools or login
const TOKEN = process.env.AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5OTA4NjdlYy0zMzA5LTRmMDItODM1NC1mOGQ1MmI2NmMzYTYiLCJ1c2VybmFtZSI6ImJhbmtfYWRtaW4iLCJyb2xlIjoiQkFOSyIsImlhdCI6MTczMTc1NDIxNCwiZXhwIjoxNzMxODQwNjE0fQ.7yYUJhqJmQNfX1GqO5mQTQMxn8sXUV5b9PnL9wZ0abc';

async function testLCExpiry() {
  console.log(`\n🔍 Fetching LC: ${LC_ID}\n`);
  
  try {
    const response = await axios.get(`${API_BASE}/banking/lc/${LC_ID}`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const lc = response.data;
    
    console.log('✅ LC Data Retrieved:');
    console.log('─'.repeat(60));
    console.log(`LC ID:          ${lc.lcId || lc.LCID}`);
    console.log(`Contract ID:    ${lc.contractId || lc.ContractID}`);
    console.log(`Amount:         ${lc.amount} ${lc.currency}`);
    console.log(`Status:         ${lc.status || lc.Status}`);
    console.log(`Request Date:   ${lc.requestDate || lc.RequestDate || 'N/A'}`);
    console.log(`Expiry Date:    ${lc.expiryDate || lc.ExpiryDate || lc.expiry_date || 'N/A'}`);
    console.log(`Issue Date:     ${lc.issueDate || lc.IssueDate || lc.issue_date || 'N/A'}`);
    console.log('─'.repeat(60));
    
    // Check all possible field names
    console.log('\n🔍 All date-related fields in response:');
    const dateFields = Object.keys(lc).filter(key => 
      key.toLowerCase().includes('date') || 
      key.toLowerCase().includes('expiry')
    );
    dateFields.forEach(field => {
      console.log(`  ${field}: ${lc[field]}`);
    });
    
    // Raw data
    console.log('\n📦 Raw LC object:');
    console.log(JSON.stringify(lc, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.log('\n💡 Tip: Get a valid token from browser devtools and set AUTH_TOKEN environment variable');
      console.log('   Example: AUTH_TOKEN="your_token_here" node test-lc-expiry.js');
    }
  }
}

testLCExpiry();
