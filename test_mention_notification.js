require('dotenv').config();
const { Pool } = require('pg');

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });

  try {
    // Get first ticket
    const ticket = await pool.query('SELECT id, code, title FROM tickets LIMIT 1');
    if (ticket.rows.length === 0) {
      console.log('No tickets found, please create one first');
      process.exit(0);
    }

    const ticketId = ticket.rows[0].id;
    console.log('Using ticket:', ticketId, ticket.rows[0].code);

    // Get first user to mention
    const users = await pool.query(`
      SELECT id, name FROM users WHERE id != $1 LIMIT 2
    `, [process.env.TEST_USER_ID || 'demo-user']);
    
    if (users.rows.length === 0) {
      console.log('No users to mention');
      process.exit(0);
    }

    const mentionedUserId = users.rows[0].id;
    console.log('Mentioning user:', mentionedUserId, users.rows[0].name);

    // Create test comment
    const commentRes = await pool.query(`
      INSERT INTO ticket_comments (ticket_id, user_id, user_name, content, is_internal)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, ticket_id, user_id, user_name, content, created_at
    `, [ticketId, process.env.TEST_USER_ID || 'demo-user', 'Test User', `@${users.rows[0].name} needs to review this`, false]);

    console.log('\n✅ Comment created:', commentRes.rows[0].id);

    // Add mention
    const mentionRes = await pool.query(`
      INSERT INTO ticket_comment_mentions (comment_id, mentioned_user_id, created_at)
      VALUES ($1, $2, NOW())
      RETURNING *
    `, [commentRes.rows[0].id, mentionedUserId]);

    console.log('✅ Mention recorded:', mentionRes.rows[0].id);
    console.log('\nTest data created. Check server log for Telegram notification...');

  } catch (err) {
    console.error('Error:', err.message);
  }

  await pool.end();
}

test();
