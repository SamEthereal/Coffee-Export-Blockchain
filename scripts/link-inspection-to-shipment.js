#!/usr/bin/env node
/**
 * Link existing quality inspection to shipment
 * Run this once to fix the existing data
 */

const { Pool } = require('pg');
const path = require('path');

// Load environment from api/.env
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://gocbc_user:gocbc_password@localhost:5432/gocbc_db'
});

async function linkInspectionToShipment() {
  const client = await pool.connect();
  
  try {
    console.log('🔗 Linking quality inspections to shipments...\n');
    
    // Find all shipments with a contract_id
    const shipments = await client.query(
      'SELECT shipment_id, contract_id, exporter_id FROM shipments WHERE contract_id IS NOT NULL'
    );
    
    console.log(`Found ${shipments.rows.length} shipments with contract IDs\n`);
    
    let linked = 0;
    
    for (const shipment of shipments.rows) {
      // Find the approved inspection for this contract
      const inspection = await client.query(
        `SELECT inspection_id, shipment_id FROM quality_inspections 
         WHERE contract_id = $1 AND status IN ('APPROVED', 'PERMIT_ISSUED') 
         ORDER BY created_at DESC LIMIT 1`,
        [shipment.contract_id]
      );
      
      if (inspection.rows.length > 0) {
        const insp = inspection.rows[0];
        
        if (!insp.shipment_id || insp.shipment_id !== shipment.shipment_id) {
          // Update inspection with shipment_id
          await client.query(
            `UPDATE quality_inspections 
             SET shipment_id = $1, updated_at = NOW() 
             WHERE inspection_id = $2`,
            [shipment.shipment_id, insp.inspection_id]
          );
          
          console.log(`✅ Linked inspection ${insp.inspection_id} to shipment ${shipment.shipment_id} (contract ${shipment.contract_id})`);
          linked++;
        } else {
          console.log(`ℹ️  Inspection ${insp.inspection_id} already linked to shipment ${shipment.shipment_id}`);
        }
      } else {
        console.log(`⚠️  No approved inspection found for shipment ${shipment.shipment_id} (contract ${shipment.contract_id})`);
      }
    }
    
    console.log(`\n✅ Linked ${linked} inspections to shipments`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

linkInspectionToShipment();
