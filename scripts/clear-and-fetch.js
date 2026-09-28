require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
});

async function clearAndFetch() {
  const client = await pool.connect();
  try {
    console.log('🗑️  Clearing old attendance records from machine...\n');

    // Xóa records từ máy
    const result = await client.query(
      `DELETE FROM attendance_records WHERE type = 'machine' AND machine_id = 'zkteco_ronald_jack_1'`
    );

    console.log(`✅ Deleted ${result.rowCount} old records\n`);
  } finally {
    client.release();
    await pool.end();
  }

  // Chạy fetch script
  console.log('📥 Now fetching tháng 5-6/2026 data...\n');
  require('./fetch-machine-history.js');
}

clearAndFetch().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
