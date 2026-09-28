require('dotenv').config();
const { Pool } = require('pg');

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });

  try {
    // Get first two users
    const usersRes = await pool.query('SELECT id, name FROM users LIMIT 2');
    if (usersRes.rows.length < 2) {
      console.log('Need at least 2 users');
      process.exit(0);
    }

    const userId = usersRes.rows[0].id;
    const mentionedUserId = usersRes.rows[1].id;
    
    console.log('User 1:', userId, usersRes.rows[0].name);
    console.log('User 2 (to mention):', mentionedUserId, usersRes.rows[1].name);

    // Get first ticket
    const ticket = await pool.query('SELECT id, code, title FROM tickets LIMIT 1');
    const ticketId = ticket.rows[0].id;
    console.log('Ticket:', ticket.rows[0].code);

    // Create comment with mention
    const commentRes = await pool.query(`
      INSERT INTO ticket_comments (ticket_id, user_id, user_name, content)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [ticketId, userId, usersRes.rows[0].name, `Please check @${usersRes.rows[1].name}`]);

    const commentId = commentRes.rows[0].id;
    console.log('✅ Comment created:', commentId);

    // Add mention
    await pool.query(`
      INSERT INTO ticket_comment_mentions (comment_id, mentioned_user_id)
      VALUES ($1, $2)
    `, [commentId, mentionedUserId]);

    console.log('✅ Mention recorded');
    console.log('\nTest complete. Telegram notification should have been triggered.');

  } catch (err) {
    console.error('Error:', err.message);
  }

  await pool.end();
}

test();
