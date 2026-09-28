import dotenv from 'dotenv';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local database only');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'room_bookings'");
  console.log('Room booking columns:', columns.rows.map(row => row.column_name).join(', '));
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query('ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS num_participants INT DEFAULT 1');
  await client.query('COMMIT');
  console.log('Room participant count column ready.');
  await client.query('BEGIN');
  await client.query(`INSERT INTO room_bookings
    (id, room_name, booking_date, start_time, end_time, purpose, status,
     requested_by, requested_by_name, num_participants, created_at, updated_at)
    VALUES ($1,$2,CURRENT_DATE,'09:00','10:00',$3,'approved',NULL,$4,2,NOW(),NOW())`,
    [randomUUID(), 'Phòng họp lầu 4', 'Schema verification', 'Schema verification']);
  await client.query('ROLLBACK');
  console.log('PASS: interview room booking insert; test booking rolled back.');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
