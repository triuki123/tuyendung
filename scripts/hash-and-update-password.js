if (!process.env.ADMIN_INITIAL_PASSWORD) throw new Error('Set ADMIN_INITIAL_PASSWORD before running this script');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updatePassword() {
  try {
    const plainPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const email = 'namtp@fadogroup.com.au';

    console.log(`🔄 Hashing password for ${email}...`);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log(`✅ Hashed password: ${hashedPassword}`);

    console.log(`\n📝 Updating database...`);
    const result = await pool.query(
      `UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2 RETURNING id, email`,
      [hashedPassword, email]
    );

    if (result.rowCount === 0) {
      console.error(`❌ User not found: ${email}`);
    } else {
      console.log(`✅ Password updated successfully for:`);
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Email: ${result.rows[0].email}`);
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

updatePassword();
