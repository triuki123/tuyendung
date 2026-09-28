require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
});

async function deleteOldData() {
  const client = await pool.connect();
  try {
    console.log('🗑️  Deleting old attendance records...\n');

    const result = await client.query(
      `DELETE FROM attendance_records WHERE type = 'machine' AND machine_id = 'zkteco_ronald_jack_1'`
    );

    console.log(`✅ Deleted ${result.rowCount} old records\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

deleteOldData().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
