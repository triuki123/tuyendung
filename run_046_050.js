const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrations() {
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'fado_assetflowpro',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
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
        process.exit(1);
      }
    }
  }

  await pool.end();
  console.log('✅ All migrations completed successfully!');
}

runMigrations().catch(console.error);
