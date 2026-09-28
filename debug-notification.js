const { Pool } = require('pg');
const http = require('http');

// Get DB config from env
const dbUrl = process.env.DATABASE_URL ||
  `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}`;

console.log('📊 Database URL:', dbUrl.replace(/:[^:]*@/, ':***@'));

const pool = new Pool({ connectionString: dbUrl });

async function main() {
  try {
    // Get a pending booking
    console.log('\n🔍 Finding pending booking...');
    const bookingRes = await pool.query(`
      SELECT id, requested_by, requested_by_name, room_name, status, booking_date, start_time, end_time
      FROM room_bookings
      WHERE status = 'pending'
      LIMIT 1
    `);

    if (bookingRes.rows.length === 0) {
      console.log('❌ No pending bookings found');
      pool.end();
      return;
    }

    const booking = bookingRes.rows[0];
    console.log('✅ Found booking:', {
      id: booking.id,
      requested_by: booking.requested_by,
      requested_by_name: booking.requested_by_name,
      room_name: booking.room_name,
      status: booking.status
    });

    // Check notifications before approve
    console.log('\n📬 Checking notifications BEFORE approve...');
    const notifBefore = await pool.query(`
      SELECT id, user_id, type, title FROM notifications
      WHERE related_id = $1
      ORDER BY created_at DESC
    `, [booking.id]);
    console.log('Notifications before:', notifBefore.rows.length);

    // Approve booking via API
    console.log(`\n✅ Approving booking ${booking.id}...`);
    const data = JSON.stringify({
      status: 'approved',
      approvedBy: 'TestAdmin'
    });

    const options = {
      hostname: 'localhost',
      port: 4028,
      path: `/api/room-bookings/${booking.id}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          console.log('API Response status:', res.statusCode);
          if (res.statusCode >= 400) {
            console.error('Error:', body);
          } else {
            console.log('Success: booking approved');
          }
          resolve();
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    // Wait a moment for async operations
    await new Promise(r => setTimeout(r, 2000));

    // Check notifications after approve
    console.log('\n📬 Checking notifications AFTER approve...');
    const notifAfter = await pool.query(`
      SELECT id, user_id, type, title, read FROM notifications
      WHERE related_id = $1
      ORDER BY created_at DESC
    `, [booking.id]);
    console.log(`Notifications after: ${notifAfter.rows.length}`);
    notifAfter.rows.forEach(n => {
      console.log(`  - Type: ${n.type}, To: ${n.user_id}, Title: ${n.title}`);
    });

    // Check if notification matches current user
    if (booking.requested_by) {
      const creatorNotif = notifAfter.rows.find(n => n.user_id === booking.requested_by);
      if (creatorNotif) {
        console.log(`\n✅ Notification sent to creator: ${booking.requested_by}`);
      } else {
        console.log(`\n❌ NO notification for creator: ${booking.requested_by}`);
      }
    }

    pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    pool.end();
    process.exit(1);
  }
}

main();
