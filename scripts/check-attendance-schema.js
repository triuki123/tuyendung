require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
});

async function check() {
  const client = await pool.connect();
  try {
    const cols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'attendance_records'
      ORDER BY ordinal_position
    `);

    console.log('📋 attendance_records columns:');
    cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
  } finally {
    client.release();
    await pool.end();
  }
}

check();
