require('dotenv').config();
const { Pool } = require('pg');

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });

  try {
    // Get users and ticket
    const usersRes = await pool.query('SELECT id, name FROM users LIMIT 2');
    const ticket = await pool.query('SELECT id, code, title FROM tickets LIMIT 1');

    const userId = usersRes.rows[0].id;
    const mentionedUserId = usersRes.rows[1].id;
    const ticketId = ticket.rows[0].id;

    const payload = {
      content: `Testing @${usersRes.rows[1].name} mention for Phase 4 Telegram notifications`,
      mentions: [mentionedUserId],
      is_internal: false,
      userId: userId
    };

    console.log('POST /api/tickets/' + ticketId + '/comments');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(`http://localhost:4028/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-user-permissions': 'ticket_create,ticket_edit',
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('\nResponse status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('\n✅ Comment with mention created successfully!');
      console.log('Check server log for Telegram notification sent to:', usersRes.rows[1].name);
    }

  } catch (err) {
    console.error('Error:', err.message);
  }

  await pool.end();
}

test();
