const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function applyMigration() {
  const client = await pool.connect();
  try {
    console.log('📋 Applying migration: 025_add_notification_navigation_fields.sql\n');
    
    const migrationPath = path.join(__dirname, 'migrations', '025_add_notification_navigation_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Migration SQL:');
    console.log(migrationSQL);
    console.log('\n---\n');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 60).replace(/\n/g, ' ') + '...');
        try {
          await client.query(statement);
          console.log('✅ Statement executed\n');
        } catch (err) {
          console.error('❌ Error:', err.message, '\n');
          throw err;
        }
      }
    }
    
    console.log('\n✅ Migration applied successfully!\n');
    
    // Verify columns exist
    console.log('🔍 Verifying columns were added...\n');
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Notifications Table Columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    throw error;
  } finally {
    await client.end();
    await pool.end();
  }
}

applyMigration().catch(err => {
  console.error('Failed');
  process.exit(1);
});
