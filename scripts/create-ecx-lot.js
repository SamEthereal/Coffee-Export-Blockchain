#!/usr/bin/env node
/**
 * Create ECX lot ECX-2026-1703 for testing
 */

const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../api/.env') });

async function createECXLot() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'gocbc_db',
    user: process.env.DB_USER || 'gocbc_user',
    password: process.env.DB_PASSWORD || 'secure_password_2024',
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check if lot already exists
    const checkResult = await client.query(
      'SELECT lot_number FROM ecx_lots WHERE lot_number = $1',
      ['ECX-2026-1703']
    );

    if (checkResult.rows.length > 0) {
      console.log('ℹ️  Lot ECX-2026-1703 already exists');
      
      // Update to GRADED status
      await client.query(
        `UPDATE ecx_lots 
         SET status = 'GRADED', 
             grade = 'Grade 2',
             moisture_content = 11.5,
             cupping_score = 85.0
         WHERE lot_number = $1`,
        ['ECX-2026-1703']
      );
      console.log('✅ Updated lot to GRADED status');
    } else {
      // Insert new lot
      await client.query(
        `INSERT INTO ecx_lots (
          lot_number, 
          exporter_id, 
          quantity, 
          coffee_type, 
          origin, 
          status,
          grade,
          moisture_content,
          cupping_score,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          'ECX-2026-1703',
          'EXP3424010', // Default exporter
          1000, // 1000 kg
          'Arabica',
          'Sidama',
          'GRADED',
          'Grade 2',
          11.5,
          85.0
        ]
      );
      console.log('✅ Created ECX lot ECX-2026-1703');
    }

    // Show the created lot
    const result = await client.query(
      'SELECT lot_number, exporter_id, status, grade FROM ecx_lots WHERE lot_number = $1',
      ['ECX-2026-1703']
    );
    console.log('\n📋 Lot details:', result.rows[0]);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createECXLot();
