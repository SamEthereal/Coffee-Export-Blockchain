// Quick script to sync database with blockchain for the utilized forex
const { Pool } = require('pg');

async function fixUtilizedForex() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'coffeedb',
    user: process.env.DB_USER || 'coffeeuser',
    password: process.env.DB_PASSWORD || 'coffeepass',
  });

  try {
    console.log('Fixing utilized forex record...');
    
    const result = await pool.query(
      `UPDATE forex_allocations 
       SET status = $1,
           utilized_amount = allocated_amount,
           utilization_date = NOW(),
           updated_at = NOW()
       WHERE forex_id = $2
         AND status = 'ALLOCATED'
       RETURNING forex_id, status, allocated_amount, utilized_amount, utilization_date`,
      ['UTILIZED', 'FOREX_LC-CONTRACT1794809015706_REQUEST']
    );

    if (result.rowCount > 0) {
      console.log('✅ Fixed forex record:', result.rows[0]);
    } else {
      console.log('⚠️  No records updated. Either already UTILIZED or forex_id not found.');
      
      // Check current status
      const check = await pool.query(
        'SELECT forex_id, status FROM forex_allocations WHERE forex_id = $1',
        ['FOREX_LC-CONTRACT1794809015706_REQUEST']
      );
      console.log('Current status:', check.rows[0]);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixUtilizedForex();
