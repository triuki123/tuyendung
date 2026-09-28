#!/usr/bin/env node

/**
 * Script to run the real-time notifications migration
 * Usage: node scripts/run-realtime-migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🚀 Starting real-time triggers migration...');

    // Read the migration file
    const migrationPath = path.join(__dirname, '../migrations/add-realtime-triggers.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Connect and run migration
    const client = await pool.connect();

    try {
      // Execute the migration
      await client.query(migrationSQL);
      console.log('✅ Migration completed successfully!');

      // Verify triggers were created
      const result = await client.query(
        `SELECT trigger_name FROM information_schema.triggers
         WHERE trigger_schema = 'public' AND trigger_name LIKE 'tr_%_notify'
         ORDER BY trigger_name`
      );

      console.log(`\n📊 Created ${result.rows.length} triggers:`);
      result.rows.forEach(row => {
        console.log(`  - ${row.trigger_name}`);
      });

      console.log('\n✨ Real-time notifications are now active!');
      console.log('   Changes to any tracked table will automatically notify connected clients.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
