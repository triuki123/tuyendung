const fs = require('fs');
const { Pool } = require('pg');

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const sql = fs.readFileSync('./migrations/046_create_ticket_comments.sql', 'utf8');
  
  try {
    const result = await pool.query(sql);
    console.log('Success!');
  } catch (err) {
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error detail:', err.detail);
    console.error('Full error:', JSON.stringify(err, null, 2));
  }

  await pool.end();
}

test();
