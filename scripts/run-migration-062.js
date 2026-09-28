require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🚀 Running migration 062...\n');

    const migrationFile = path.join(__dirname, '../migrations/062_add_total_hours_to_attendance.sql');
    const sql = fs.readFileSync(migrationFile, 'utf-8');

    await client.query(sql);
    console.log('✅ Migration 062 completed!\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
