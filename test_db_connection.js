const { Pool } = require('pg');

async function test() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'set' : 'not set');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log('Attempting connection...');
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Connection successful!', res.rows[0]);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }

  await pool.end();
}

test();
