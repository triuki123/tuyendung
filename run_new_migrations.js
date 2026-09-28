const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fado_assetflowpro',
  user: 'postgres',
});

async function runMigrations() {
  const migrations = [046, 047, 048, 049, 050];
  const migrationDir = './migrations';

  for (const num of migrations) {
    const files = fs.readdirSync(migrationDir)
      .filter(f => f.startsWith(`${num}_`) && f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        console.log(`▶ Running ${file}...`);
        await pool.query(sql);
        console.log(`✅ ${file} completed\n`);
      } catch (err) {
        console.error(`❌ ${file} failed:`, err.message);
      }
    }
  }

  await pool.end();
}

runMigrations().catch(console.error);
