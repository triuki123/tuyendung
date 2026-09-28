/**
 * Complete Migration Runner - Executes all migrations in correct order
 */
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL not found in .env file');
  process.exit(1);
}

console.log('🔗 Connecting to database...');
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  {
    name: '011 - Confirmation Fields Migration',
    file: './migrations/011_add_confirmation_to_room_bookings.sql',
  },
  {
    name: '012 - Cancellation Fields Migration',
    file: './migrations/012_add_cancellation_fields_to_room_bookings.sql',
  },
  {
    name: 'Phase 1 - Participants Schema Migration',
    file: './src/migrations/add_room_booking_participants_schema.sql',
  },
  {
    name: '008 - History Test Data Migration',
    file: './migrations/008_add_old_bookings_for_history_test.sql',
  },
  {
    name: '032 - Add Telegram Chat ID to Users',
    file: './migrations/032_add_telegram_chat_id_to_users.sql',
  },
  {
    name: '033 - Add Telegram Enabled to Users',
    file: './migrations/033_add_telegram_enabled_to_users.sql',
  },
  {
    name: '034 - Add Code Sequence to Tickets',
    file: './migrations/034_add_code_sequence_to_tickets.sql',
  },
];

async function runMigrations() {
  const client = await pool.connect();

  try {
    for (const migration of migrations) {
      console.log(`\n📋 Running: ${migration.name}`);
      console.log(`   File: ${migration.file}`);

      if (!fs.existsSync(migration.file)) {
        console.warn(`⚠️  File not found: ${migration.file}`);
        continue;
      }

      const sql = fs.readFileSync(migration.file, 'utf-8');

      try {
        await client.query(sql);
        console.log(`✅ ${migration.name} - SUCCESS`);
      } catch (error) {
        console.error(`❌ ${migration.name} - FAILED`);
        console.error(`   Error: ${error.message}`);
        if (error.detail) console.error(`   Detail: ${error.detail}`);
      }
    }

    // Verify migrations
    console.log('\n\n🔍 Verifying migrations...\n');

    const cancelFields = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='room_bookings'
      AND column_name IN ('cancellation_reason', 'cancelled_by', 'cancelled_at')
    `);
    console.log(`✅ Cancellation fields: ${cancelFields.rows.length}/3 found`);

    const confirmFields = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='room_bookings'
      AND column_name IN ('confirmed_at', 'confirmed_by', 'confirmation_note')
    `);
    console.log(`✅ Confirmation fields: ${confirmFields.rows.length}/3 found`);

    const phase1Fields = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='room_bookings'
      AND column_name IN ('num_participants', 'has_online_meeting', 'needs_room_setup')
    `);
    console.log(`✅ Phase 1 fields: ${phase1Fields.rows.length}/3 found`);

    const participantsTable = await client.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='room_booking_participants')
    `);
    console.log(`✅ Participants table: ${participantsTable.rows[0].exists ? 'EXISTS' : 'NOT FOUND'}`);

    try {
      const oldBookings = await client.query(`
        SELECT COUNT(*) as count FROM room_bookings
        WHERE booking_date::date < CURRENT_DATE - INTERVAL '7 days'
      `);
      console.log(`✅ Old bookings (>7 days): ${oldBookings.rows[0].count} found`);
    } catch (e) {
      console.log(`ℹ️  Could not verify old bookings (table may be empty)`);
    }

    const telegramFields = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='users'
      AND column_name IN ('telegram_chat_id', 'telegram_enabled')
    `);
    console.log(`✅ Telegram fields: ${telegramFields.rows.length}/2 found`);

    console.log('\n✨ All migrations completed!\n');
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await client.end();
    await pool.end();
  }
}

runMigrations().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
