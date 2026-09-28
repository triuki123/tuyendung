require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
});

async function check() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        user_id,
        COUNT(*) as count,
        MIN(recorded_at) as first_date,
        MAX(recorded_at) as last_date
      FROM attendance_records
      WHERE type = 'machine'
      GROUP BY user_id
      ORDER BY count DESC
    `);

    console.log('📋 Machine records by user_id:\n');
    result.rows.forEach(r => {
      const minDate = new Date(r.first_date).toLocaleDateString('vi-VN');
      const maxDate = new Date(r.last_date).toLocaleDateString('vi-VN');
      console.log(`  ${r.user_id}`);
      console.log(`    Count: ${r.count}`);
      console.log(`    Range: ${minDate} → ${maxDate}\n`);
    });
  } finally {
    client.release();
    await pool.end();
  }
}

check();
