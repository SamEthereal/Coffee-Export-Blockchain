#!/usr/bin/env node
/**
 * Backfill Migration: Link existing contract documents to entity_type='CONTRACT'
 * 
 * Problem: Documents uploaded during contract registration were not being linked
 * to contracts in the database (entity_type and entity_id were not set).
 * 
 * Solution: Find documents referenced in blockchain contracts and update their
 * entity_type and entity_id to link them properly.
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'cecbsdb',
  user: 'cecbsuser',
  password: 'cecbspass',
});

async function backfillContractDocuments() {
  const client = await pool.connect();
  
  try {
    console.log('\n=== Starting Contract Document Backfill ===\n');
    
    // Get all contracts
    const contractsResult = await client.query(`
      SELECT contract_id, exporter_id, status, created_at
      FROM contracts
      WHERE status IN ('REGISTERED', 'APPROVED', 'COMPLETED')
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${contractsResult.rows.length} contracts to check\n`);
    
    let totalFixed = 0;
    let totalAlreadyLinked = 0;
    
    for (const contract of contractsResult.rows) {
      // Find documents that might belong to this contract
      // Strategy 1: Documents uploaded by the exporter around the contract creation time
      const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
      const contractTime = new Date(contract.created_at).getTime();
      const startTime = new Date(contractTime - timeWindow).toISOString();
      const endTime = new Date(contractTime + timeWindow).toISOString();
      
      // Find candidate documents:
      // 1. Uploaded by this exporter
      // 2. Within 24 hours of contract creation
      // 3. Not already linked to another contract
      // 4. Document type suggests it's a contract document
      const docsResult = await client.query(`
        SELECT document_id, entity_type, entity_id, document_type, file_name, uploaded_at
        FROM documents
        WHERE exporter_id = $1
          AND uploaded_at >= $2
          AND uploaded_at <= $3
          AND (entity_type IS NULL OR entity_type = '' OR entity_type = 'EXPORTER_APPLICATION')
          AND document_type IN ('SALES_CONTRACT', 'CONTRACT_SIGNED', 'PROFORMA_INVOICE', 'COMMERCIAL_INVOICE', 'ICO_CERTIFICATE', 'CERTIFICATE_OF_ORIGIN', 'QUALITY_CERTIFICATE', 'OTHER')
        ORDER BY uploaded_at ASC
      `, [contract.exporter_id, startTime, endTime]);
      
      if (docsResult.rows.length > 0) {
        console.log(`Contract ${contract.contract_id}: Found ${docsResult.rows.length} candidate document(s)`);
        
        for (const doc of docsResult.rows) {
          // Update the document to link it to the contract
          await client.query(`
            UPDATE documents
            SET entity_type = 'CONTRACT',
                entity_id = $1,
                contract_id = $1,
                updated_at = NOW()
            WHERE document_id = $2
          `, [contract.contract_id, doc.document_id]);
          
          console.log(`  ✅ Linked document ${doc.document_id} (${doc.document_type}) to contract ${contract.contract_id}`);
          totalFixed++;
        }
      }
      
      // Check if contract already has linked documents
      const linkedDocsResult = await client.query(`
        SELECT COUNT(*) as count
        FROM documents
        WHERE entity_type = 'CONTRACT' AND entity_id = $1
      `, [contract.contract_id]);
      
      if (parseInt(linkedDocsResult.rows[0].count) > 0) {
        totalAlreadyLinked++;
      }
    }
    
    console.log('\n=== Backfill Complete ===');
    console.log(`Contracts checked: ${contractsResult.rows.length}`);
    console.log(`Documents linked: ${totalFixed}`);
    console.log(`Contracts with existing links: ${totalAlreadyLinked}`);
    console.log('\n');
    
  } catch (error) {
    console.error('Error during backfill:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

backfillContractDocuments()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
