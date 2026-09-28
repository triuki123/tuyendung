const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Load environment
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    const migrationsDir = './migrations';
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.match(/^02[6-9]_.*\.sql$/))
      .sort();
    
    console.log(`Found ${files.length} migrations to run:`, files);
    
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`\n▶ Running ${file}...`);
      try {
        await client.query(sql);
        console.log(`✅ ${file} completed`);
      } catch (err) {
        console.error(`❌ ${file} failed:`, err.message);
        if (err.detail) console.error('  Detail:', err.detail);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
