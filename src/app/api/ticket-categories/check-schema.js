const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const client = await pool.connect();
  try {
    // Check if tables exist
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'ticket%'
    `);
    console.log('Ticket-related tables:');
    tables.rows.forEach(r => console.log('  -', r.table_name));
    
    // Check tickets table columns
    const cols = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'tickets'
      ORDER BY ordinal_position
    `);
    console.log('\nTickets table columns:');
    cols.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));
    
    // Check if any categories exist
    const cats = await client.query('SELECT COUNT(*) as count FROM ticket_categories');
    console.log(`\nCategories count: ${cats.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(err => {
  console.error('Check error:', err.message);
  process.exit(1);
});
