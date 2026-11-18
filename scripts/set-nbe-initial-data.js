#!/usr/bin/env node
/**
 * Set initial NBE exchange rate and retention policy
 * This needs to be done once so banks can allocate forex
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api/v1';

// NBE Admin credentials - adjust if needed
const NBE_USERNAME = process.env.NBE_USERNAME || 'nbe_admin';
const NBE_PASSWORD = process.env.NBE_PASSWORD || 'nbe123';

async function setNBEData() {
  try {
    console.log('\n🔐 Logging in as NBE Admin...');
    
    // Login as NBE
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      username: NBE_USERNAME,
      password: NBE_PASSWORD
    });
    
    if (!loginResponse.data.success) {
      throw new Error('NBE login failed: ' + (loginResponse.data.error || 'Unknown error'));
    }
    
    const token = loginResponse.data.token;
    console.log('✅ NBE login successful');
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // Set USD Exchange Rate
    console.log('\n💱 Setting USD Exchange Rate...');
    const rateId = `RATE-USD-${Date.now()}`;
    const exchangeRatePayload = {
      rateID: rateId,
      currency: 'USD',
      buyingRate: '118.50', // Current approximate ETB/USD rate
      sellingRate: '119.50',
      setBy: NBE_USERNAME,
      justification: 'Initial system configuration - Official NBE rate'
    };
    
    const rateResponse = await axios.post(
      `${API_BASE}/forex/exchange-rate`,
      exchangeRatePayload,
      { headers }
    );
    
    if (rateResponse.data.success) {
      console.log('✅ Exchange rate set successfully');
      console.log(`   Rate ID: ${rateId}`);
      console.log(`   USD Buying: ${exchangeRatePayload.buyingRate} ETB`);
      console.log(`   USD Selling: ${exchangeRatePayload.sellingRate} ETB`);
      console.log(`   Mid Rate: ${((parseFloat(exchangeRatePayload.buyingRate) + parseFloat(exchangeRatePayload.sellingRate)) / 2).toFixed(2)} ETB`);
    } else {
      console.error('❌ Failed to set exchange rate:', rateResponse.data.error);
    }
    
    // Set COFFEE Retention Policy
    console.log('\n📋 Setting COFFEE Retention Policy...');
    const policyId = `POLICY-COFFEE-${Date.now()}`;
    const retentionPolicyPayload = {
      policyID: policyId,
      commodityType: 'COFFEE',
      retentionRate: 40, // 40% USD retention, 60% converted to ETB
      setBy: NBE_USERNAME,
      justification: 'Initial system configuration - NBE coffee export retention policy'
    };
    
    const policyResponse = await axios.post(
      `${API_BASE}/forex/retention-policy`,
      retentionPolicyPayload,
      { headers }
    );
    
    if (policyResponse.data.success) {
      console.log('✅ Retention policy set successfully');
      console.log(`   Policy ID: ${policyId}`);
      console.log(`   Commodity: COFFEE`);
      console.log(`   Retention Rate: ${retentionPolicyPayload.retentionRate}% USD retained`);
      console.log(`   Conversion: ${100 - retentionPolicyPayload.retentionRate}% converted to ETB`);
    } else {
      console.error('❌ Failed to set retention policy:', policyResponse.data.error);
    }
    
    // Verify data is retrievable
    console.log('\n🔍 Verifying NBE data...');
    
    const [verifyRateResponse, verifyPolicyResponse] = await Promise.all([
      axios.get(`${API_BASE}/forex/rates/USD/current`, { headers }),
      axios.get(`${API_BASE}/forex/retention-policy/COFFEE`, { headers })
    ]);
    
    if (verifyRateResponse.data.success) {
      const rate = verifyRateResponse.data.data;
      console.log('✅ Exchange rate verified:');
      console.log(`   Mid Rate: ${rate.midRate || rate.MidRate} ETB/USD`);
    } else {
      console.error('❌ Could not verify exchange rate');
    }
    
    if (verifyPolicyResponse.data.success) {
      const policy = verifyPolicyResponse.data.data;
      console.log('✅ Retention policy verified:');
      console.log(`   Retention Rate: ${policy.retentionRate || policy.RetentionRate}%`);
    } else {
      console.error('❌ Could not verify retention policy');
    }
    
    console.log('\n✨ NBE initial data setup complete!');
    console.log('\n📌 Banks can now allocate forex with:');
    console.log(`   Exchange Rate: ~119 ETB/USD`);
    console.log(`   Retention: 40% USD, 60% ETB`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

setNBEData();
