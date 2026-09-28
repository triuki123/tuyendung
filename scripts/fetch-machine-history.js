/**
 * Script: Lấy attendance history từ máy chấm công
 * Kết nối → Lấy records cũ → Map employee_code → user_id → Lưu DB
 *
 * Usage: node scripts/fetch-machine-history.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const ZK = require('zklib');

const machineIp = process.env.ZKTECO_MACHINE_IP || '115.79.205.119';
const machinePort = parseInt(process.env.ZKTECO_MACHINE_PORT || '1111', 10);
const machineId = process.env.ZKTECO_MACHINE_ID || 'zkteco_ronald_jack_1';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
});

async function connectToMachine() {
  return new Promise((resolve, reject) => {
    const client = new ZK({
      ip: machineIp,
      port: machinePort,
      inport: 5000 + Math.floor(Math.random() * 60000),
      timeout: 30000,
      printQueueSize: false,
      connectionType: 'tcp',
    });

    client.createSocket((err) => {
      if (err) return reject(err);
      client.connect((connErr) => {
        if (connErr) return reject(connErr);
        console.log(`✅ Connected to machine ${machineIp}:${machinePort}`);
        resolve(client);
      });
    });
  });
}

async function getAttendanceRecords(client) {
  return new Promise((resolve, reject) => {
    client.getAttendance((err, data) => {
      if (err) return reject(err);
      console.log(`📊 Fetched ${(data || []).length} records from machine`);
      resolve(data || []);
    });
  });
}

async function disconnectMachine(client) {
  return new Promise((resolve) => {
    client.closeSocket((err) => {
      if (err) console.error('Disconnect error:', err);
      console.log('🔌 Disconnected from machine');
      resolve();
    });
  });
}

async function getMappings(dbClient) {
  const result = await dbClient.query(
    `SELECT machine_id, employee_code, user_id FROM attendance_machine_mappings WHERE machine_id = $1`,
    [machineId]
  );
  return result.rows;
}

async function getExistingRecords(dbClient) {
  const result = await dbClient.query(
    `SELECT id, recorded_at FROM attendance_records WHERE type = 'machine' AND machine_id = $1`,
    [machineId]
  );
  const set = new Set(result.rows.map(r => r.recorded_at.getTime()));
  console.log(`📋 Found ${set.size} existing records in DB`);
  return set;
}

async function saveAttendanceRecord(dbClient, userId, employeeCode, eventType, recordedAt) {
  try {
    await dbClient.query(
      `INSERT INTO attendance_records (user_id, type, event_type, recorded_at, machine_id)
       VALUES ($1, 'machine', $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [userId, eventType, recordedAt, machineId]
    );
  } catch (err) {
    console.error('Error saving record:', err.message);
  }
}

async function main() {
  const dbClient = await pool.connect();
  let machineClient;

  try {
    console.log('\n🚀 Starting attendance history fetch...\n');

    // 1. Kết nối máy
    machineClient = await connectToMachine();

    // 2. Lấy attendance records từ máy
    const machineRecords = await getAttendanceRecords(machineClient);

    // 3. Lấy mapping employee_code → user_id
    const mappings = await getMappings(dbClient);
    const mappingMap = new Map(
      mappings.map(m => [m.employee_code.toString(), m.user_id])
    );

    console.log(`\n📌 Mappings loaded: ${mappings.length} mappings`);
    console.log('Available mappings:');
    mappings.forEach(m => {
      console.log(`  ${m.employee_code} → ${m.user_id}`);
    });

    // 4. Lấy existing records để tránh duplicate
    const existingRecordTimes = await getExistingRecords(dbClient);

    // 5. Parse + lưu records
    let saved = 0;
    let skipped = 0;
    let unmapped = 0;

    console.log(`\n📥 Processing ${machineRecords.length} records from machine...\n`);

    // Group records by employee_code + date to infer check_in/check_out
    const byEmployeeDate = {};
    for (const rec of machineRecords) {
      const employeeCode = String(rec.id || '');
      if (!employeeCode) continue;

      const recordedAt = new Date(rec.timestamp || rec.recordTime || rec.datetime || 0);
      const dateKey = recordedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const key = `${employeeCode}_${dateKey}`;

      if (!byEmployeeDate[key]) byEmployeeDate[key] = [];
      byEmployeeDate[key].push({ rec, recordedAt });
    }

    // Save records with logic-based check_in/check_out inference
    for (const key in byEmployeeDate) {
      const recs = byEmployeeDate[key].sort((a, b) => a.recordedAt - b.recordedAt);
      const employeeCode = recs[0].rec.id;
      const userId = mappingMap.get(String(employeeCode));

      if (!userId) {
        unmapped += recs.length;
        continue;
      }

      let hasCheckIn = false;

      // Infer event type based on time logic
      for (const r of recs) {
        const hour = r.recordedAt.getHours();
        let eventType = 'check_in';

        // Logic:
        // 04:00-10:00: check_in
        // 10:00-14:00: check_in if !hasCheckIn, else check_out
        // 14:00-03:00+1: check_out
        if (hour >= 4 && hour < 10) {
          eventType = 'check_in';
        } else if (hour >= 10 && hour < 14) {
          eventType = hasCheckIn ? 'check_out' : 'check_in';
        } else {
          // 14:00-23:59 or 00:00-03:59
          eventType = 'check_out';
        }

        const timestamp = Math.floor(r.recordedAt.getTime());

        if (existingRecordTimes.has(timestamp)) {
          skipped++;
          continue;
        }

        await saveAttendanceRecord(dbClient, userId, String(employeeCode), eventType, r.recordedAt);
        saved++;

        if (eventType === 'check_in') hasCheckIn = true;

        if (saved % 10 === 0) {
          console.log(`  ✅ Saved ${saved} records...`);
        }
      }
    }

    console.log(`\n✅ Done!\n`);
    console.log(`   Saved:    ${saved} new records`);
    console.log(`   Skipped:  ${skipped} duplicates`);
    console.log(`   Unmapped: ${unmapped} (no mapping found)\n`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    if (machineClient) await disconnectMachine(machineClient);
    dbClient.release();
    await pool.end();
  }
}

main();
