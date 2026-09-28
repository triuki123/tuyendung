const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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
        await pool.query(sql);
        console.log(`✅ ${file} completed\n`);
      } catch (err) {
        console.error(`❌ ${file} failed:`, err.message, '\n');
        if (err.detail) console.error('Detail:', err.detail);
      }
    }
  }

  await pool.end();
  console.log('\n✅ Migration batch complete!');
}

runMigrations().catch(console.error);
