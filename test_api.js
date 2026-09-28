require('dotenv').config();
const { Pool } = require('pg');

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });

  try {
    // Test ticket_comments table
    const result = await pool.query('SELECT COUNT(*) FROM ticket_comments');
    console.log('✅ ticket_comments accessible, count:', result.rows[0].count);

    // Test ticket_comment_mentions table
    const result2 = await pool.query('SELECT COUNT(*) FROM ticket_comment_mentions');
    console.log('✅ ticket_comment_mentions accessible, count:', result2.rows[0].count);

    // Test ticket_watchers table
    const result3 = await pool.query('SELECT COUNT(*) FROM ticket_watchers');
    console.log('✅ ticket_watchers accessible, count:', result3.rows[0].count);

    // Test ticket_audit_events table
    const result4 = await pool.query('SELECT COUNT(*) FROM ticket_audit_events');
    console.log('✅ ticket_audit_events accessible, count:', result4.rows[0].count);

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  await pool.end();
}

test();
