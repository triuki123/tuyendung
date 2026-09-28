// Test Supabase connection
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

console.log('Testing Supabase connection...');
console.log('Connection string:', connectionString.replace(/:[^:]*@/, ':****@')); // Hide password

const pool = new Pool({ connectionString });

pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('❌ Connection FAILED:');
    console.error(`Error: ${err.message}`);
    console.error(`Code: ${err.code}`);
  } else {
    console.log('✅ Connection SUCCESS!');
    console.log('Current time from DB:', result.rows[0]);
  }

  pool.end();
  process.exit(err ? 1 : 0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('⏱️ Timeout - không kết nối được sau 10s');
  pool.end();
  process.exit(1);
}, 10000);
