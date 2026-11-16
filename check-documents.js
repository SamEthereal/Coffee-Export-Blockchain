#!/usr/bin/env node
/**
 * Check documents in database for a specific LC and its contract
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'cecbsdb',
  user: 'cecbsuser',
  password: 'cecbspass',
});

async function checkDocuments() {
  try {
    // Get latest LC
    const lcResult = await pool.query(`
      SELECT lc_id, contract_id, status 
      FROM letters_of_credit 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (lcResult.rows.length === 0) {
      console.log('No LCs found in database');
      return;
    }
    
    const lc = lcResult.rows[0];
    console.log('\n=== Latest LC ===');
    console.log(`LC ID: ${lc.lc_id}`);
    console.log(`Contract ID: ${lc.contract_id}`);
    console.log(`Status: ${lc.status}`);
    
    // Check for LC documents
    const lcDocsResult = await pool.query(`
      SELECT document_id, entity_type, entity_id, document_type, file_name, status, uploaded_at
      FROM documents 
      WHERE entity_type = 'LC' AND entity_id = $1
      ORDER BY uploaded_at DESC
    `, [lc.lc_id]);
    
    console.log(`\n=== LC Documents (${lcDocsResult.rows.length}) ===`);
    lcDocsResult.rows.forEach(doc => {
      console.log(`- ${doc.document_type}: ${doc.file_name} (${doc.status})`);
    });
    
    // Check for contract documents
    const contractDocsResult = await pool.query(`
      SELECT document_id, entity_type, entity_id, document_type, file_name, status, uploaded_at
      FROM documents 
      WHERE entity_type = 'CONTRACT' AND entity_id = $1
      ORDER BY uploaded_at DESC
    `, [lc.contract_id]);
    
    console.log(`\n=== Contract Documents (${contractDocsResult.rows.length}) ===`);
    contractDocsResult.rows.forEach(doc => {
      console.log(`- ${doc.document_type}: ${doc.file_name} (${doc.status})`);
    });
    
    // Check all documents for this contract
    const allDocsResult = await pool.query(`
      SELECT document_id, entity_type, entity_id, document_type, file_name, status, uploaded_at
      FROM documents 
      WHERE status = 'active'
        AND (
          (entity_type = 'LC' AND entity_id = $1)
          OR (entity_type = 'CONTRACT' AND entity_id = $2)
        )
      ORDER BY uploaded_at DESC
    `, [lc.lc_id, lc.contract_id]);
    
    console.log(`\n=== All Documents for LC (${allDocsResult.rows.length}) ===`);
    if (allDocsResult.rows.length === 0) {
      console.log('NO DOCUMENTS FOUND!');
      console.log('\nThis means:');
      console.log('1. Documents were not uploaded during contract registration');
      console.log('2. OR documents have status != "active"');
      console.log('3. OR documents have wrong entity_type/entity_id');
    } else {
      allDocsResult.rows.forEach(doc => {
        console.log(`- [${doc.entity_type}] ${doc.document_type}: ${doc.file_name} (${doc.status})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkDocuments();
