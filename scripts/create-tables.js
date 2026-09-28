require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
});

async function createTables() {
  const client = await pool.connect();
  try {
    console.log('📦 Creating attendance tables...\n');

    // 060 - attendance_records
    const sql060 = fs.readFileSync(path.join(__dirname, '../migrations/060_create_attendance_records.sql'), 'utf-8');
    try {
      await client.query(sql060);
      console.log('✅ 060_create_attendance_records.sql');
    } catch (err) {
      console.log('⚠️  060_create_attendance_records.sql (already exists or error)');
    }

    // 063 - machine_mappings
    const sql063 = fs.readFileSync(path.join(__dirname, '../migrations/063_create_machine_mappings.sql'), 'utf-8');
    try {
      await client.query(sql063);
      console.log('✅ 063_create_machine_mappings.sql');
    } catch (err) {
      console.log('⚠️  063_create_machine_mappings.sql (already exists or error)');
    }

    // 064 - attendance_machines
    const sql064 = fs.readFileSync(path.join(__dirname, '../migrations/064_create_attendance_machines.sql'), 'utf-8');
    try {
      await client.query(sql064);
      console.log('✅ 064_create_attendance_machines.sql');
    } catch (err) {
      console.log('⚠️  064_create_attendance_machines.sql (already exists or error)');
    }

    console.log('\n✅ Tables ready!\n');
  } finally {
    client.release();
    await pool.end();
  }
}

createTables().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
