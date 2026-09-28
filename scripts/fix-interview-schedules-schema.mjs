import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local database only');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  for (const file of ['215_create_interview_scorecards.sql', '216_create_interview_schedules.sql', '217_add_room_booking_to_interviews.sql']) {
    await client.query(await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8'));
    console.log('Applied:', file);
  }
  await client.query('COMMIT');
  await client.query('BEGIN');
  const app = (await client.query('SELECT id, cv_id, requisition_id FROM hr_applications LIMIT 1')).rows[0];
  if (!app) throw new Error('Schema installed; no application available for insert verification');
  const bookingId = randomUUID();
  await client.query(`INSERT INTO room_bookings
    (id, room_name, booking_date, start_time, end_time, purpose, status, requested_by_name, num_participants)
    VALUES ($1,'Phòng họp lầu 4',CURRENT_DATE,'09:00','10:00','Schema verification','approved','Schema verification',2)`, [bookingId]);
  const id = 'schema_check_' + randomUUID();
  await client.query(`INSERT INTO hr_interview_schedules
    (id, application_id, cv_id, requisition_id, scheduled_at, room_booking_id)
    VALUES ($1,$2,$3,$4,NOW(),$5)`, [id, app.id, app.cv_id, app.requisition_id, bookingId]);
  const saved = (await client.query('SELECT id, room_booking_id FROM hr_interview_schedules WHERE id=$1', [id])).rows[0];
  if (saved?.room_booking_id !== bookingId) throw new Error('Booking link verification failed');
  await client.query('ROLLBACK');
  console.log('PASS: room reservation + interview save + read; test data rolled back.');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
