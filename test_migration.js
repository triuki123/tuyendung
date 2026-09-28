const { Pool } = require('pg');
const fs = require('fs');

async function test() {
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'fado_assetflowpro',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
  });

  const sql = fs.readFileSync('./migrations/046_create_ticket_comments.sql', 'utf8');
  console.log('SQL:', sql);
  console.log('---');

  try {
    const result = await pool.query(sql);
    console.log('Success:', result);
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Code:', err.code);
    console.error('Detail:', err.detail);
  }

  await pool.end();
}

test();
