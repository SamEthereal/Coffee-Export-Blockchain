const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: 'cecbs-postgres',
  port: 5432,
  database: 'cecbs',
  user: 'cecbs',
  password: 'cecbs123'
});

async function resetPassword() {
  try {
    const username = 'EXP3424010';
    const newPassword = 'Welcome123!';
    
    console.log('Generating password hash...');
    const hash = await bcrypt.hash(newPassword, 10);
    
    console.log('Updating user password...');
    const updateResult = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE username = $2',
      [hash, username]
    );
    
    console.log('Update result:', updateResult.rowCount, 'row(s) updated');
    
    const userResult = await pool.query(
      'SELECT username, email, role, status FROM users WHERE username = $1',
      [username]
    );
    
    if (userResult.rows.length > 0) {
      console.log('\n✅ Password reset successful!');
      console.log('───────────────────────────────');
      console.log('Username:', username);
      console.log('Password:', newPassword);
      console.log('Email:', userResult.rows[0].email);
      console.log('Role:', userResult.rows[0].role);
      console.log('Status:', userResult.rows[0].status);
      console.log('───────────────────────────────');
    } else {
      console.log('❌ User not found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

resetPassword();
