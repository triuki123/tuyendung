require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrations() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'loaded' : 'not found');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });

  const migrations = ['046', '047', '048', '049', '050'];

  for (const num of migrations) {
    const files = fs.readdirSync('./migrations')
      .filter(f => f.startsWith(num + '_') && f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join('./migrations', file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        console.log(`▶ Running ${file}...`);
        const result = await pool.query(sql);
        console.log(`✅ ${file} completed (rows: ${result.rowCount || 'command ok'})\n`);
      } catch (err) {
        console.error(`❌ ${file} failed:`, err.message);
        if (err.detail) console.error('   Detail:', err.detail);
        console.error('');
      }
    }
  }

  await pool.end();
  console.log('✅ Done');
}

runMigrations().catch(console.error);
