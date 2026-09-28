#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Load .env file
require('dotenv').config();

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log('📡 Connecting to database...');
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'src/migrations/add_room_booking_participants_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('✓ Migration file loaded');
    console.log('⏳ Executing migration SQL...\n');
    
    // Execute SQL
    await pool.query(sql);
    
    console.log('✅ Migration executed successfully!\n');
    
    // Verify
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'room_booking_participants'
      );
    `);
    
    if (checkResult.rows[0].exists) {
      console.log('✓ room_booking_participants table verified');
      
      const colResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'room_bookings'
        AND column_name IN ('num_participants', 'has_online_meeting', 'needs_room_setup')
        ORDER BY column_name;
      `);
      
      console.log('✓ New columns in room_bookings:', colResult.rows.map(r => r.column_name).join(', '));
      console.log('\n🎉 All migration checks passed!');
    }
    
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.code) console.error('   Code:', err.code);
    console.error('\nFull error:');
    console.error(err);
    process.exit(1);
  }
})();
