const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://gocbc_user:gocbc_password@localhost:5432/gocbc_db'
});

async function createLot() {
  try {
    const result = await pool.query(`
      INSERT INTO ecx_lots (
        lot_number, exporter_id, quantity, coffee_type, origin, 
        status, grade, moisture_content, cupping_score, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (lot_number) 
      DO UPDATE SET status = 'GRADED', grade = 'Grade 2'
      RETURNING lot_number, status, grade
    `, ['ECX-2026-1703', 'EXP3424010', 1000, 'Arabica', 'Sidama', 'GRADED', 'Grade 2', 11.5, 85.0]);
    
    console.log('✅ Created/Updated ECX lot:', result.rows[0]);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

createLot();
