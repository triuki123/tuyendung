require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
});

async function check() {
  const client = await pool.connect();
  try {
    console.log('📋 Checking mappings in database...\n');

    const result = await client.query(
      `SELECT machine_id, employee_code, user_id FROM attendance_machine_mappings ORDER BY machine_id, employee_code`
    );

    if (result.rows.length === 0) {
      console.log('❌ No mappings found!');
    } else {
      console.log(`✅ Found ${result.rows.length} mappings:\n`);
      result.rows.forEach(row => {
        console.log(`  Machine: ${row.machine_id} | Code: ${row.employee_code} | User: ${row.user_id}`);
      });
    }
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
