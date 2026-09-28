require('dotenv').config();
const { Pool } = require('pg');
const ZK = require('zklib');
const { v5: uuidv5, v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const machineIp = process.env.ZKTECO_MACHINE_IP || '115.79.205.119';
const machinePort = parseInt(process.env.ZKTECO_MACHINE_PORT || '1111', 10);
const machineId = process.env.ZKTECO_MACHINE_ID || 'zkteco_ronald_jack_1';

// Tạo UUID từ employee_code bằng MD5 hash
function createPendingUserUUID(employeeCode) {
  const hash = crypto.createHash('md5').update(String(employeeCode)).digest('hex');
  // Convert hash thành UUID format (8-4-4-4-12)
  return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-4${hash.substr(12, 3)}-a${hash.substr(15, 3)}-${hash.substr(18, 12)}`;
}

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
    console.log('\n🚀 Fetching May-June 2026 data for ALL employees...\n');

    // 1. Kết nối máy
    machineClient = await connectToMachine();

    // 2. Lấy records từ máy
    const machineRecords = await getAttendanceRecords(machineClient);

    // 3. Filter chỉ tháng 5-6/2026
    const may_june_2026 = machineRecords.filter(rec => {
      const d = new Date(rec.timestamp);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      return year === 2026 && (month === 5 || month === 6);
    });

    console.log(`\n📋 Found ${may_june_2026.length} records in May-June 2026\n`);

    // 3. Load mappings
    const mappingsResult = await dbClient.query(
      `SELECT machine_id, employee_code, user_id FROM attendance_machine_mappings WHERE machine_id = $1`,
      [machineId]
    );
    const mappingMap = new Map(
      mappingsResult.rows.map(m => [m.employee_code.toString(), m.user_id])
    );
    console.log(`📌 Mappings loaded: ${mappingsResult.rows.length}\n`);

    // 4. Group by employee + date for check_in/check_out logic
    const byEmployeeDate = {};
    for (const rec of may_june_2026) {
      const employeeCode = String(rec.id || '');
      if (!employeeCode) continue;

      const recordedAt = new Date(rec.timestamp || rec.recordTime || rec.datetime || 0);
      const dateKey = recordedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const key = `${employeeCode}_${dateKey}`;

      if (!byEmployeeDate[key]) byEmployeeDate[key] = [];
      byEmployeeDate[key].push({ rec, recordedAt });
    }

    // 5. Save with time-based check_in/check_out logic
    let saved = 0;
    let skipped = 0;
    let unmapped = 0;

    for (const key in byEmployeeDate) {
      const recs = byEmployeeDate[key].sort((a, b) => a.recordedAt - b.recordedAt);
      const employeeCode = recs[0].rec.id;
      const mappedUserId = mappingMap.get(String(employeeCode));

      // Lưu tất cả records, dù mapped hay chưa
      // - Nếu mapped: user_id = mapped user_id (UUID)
      // - Nếu chưa: user_id = UUID từ MD5 hash của employee_code (pending mapping)
      const userId = mappedUserId || createPendingUserUUID(employeeCode);
      if (!mappedUserId) unmapped += recs.length;

      let hasCheckIn = false;

      for (const r of recs) {
        const hour = r.recordedAt.getHours();
        let eventType = 'check_in';

        // Logic: 04:00-10:00 = check_in, 10:00-14:00 = check_in if !hasCheckIn else check_out, 14:00+ = check_out
        if (hour >= 4 && hour < 10) {
          eventType = 'check_in';
        } else if (hour >= 10 && hour < 14) {
          eventType = hasCheckIn ? 'check_out' : 'check_in';
        } else {
          eventType = 'check_out';
        }

        await saveAttendanceRecord(dbClient, userId, String(employeeCode), eventType, r.recordedAt);
        saved++;

        if (eventType === 'check_in') hasCheckIn = true;

        if (saved % 100 === 0) {
          console.log(`  ✅ Saved ${saved} records...`);
        }
      }
    }

    console.log(`\n✅ Done!\n`);
    console.log(`   Saved:    ${saved} records for May-June 2026`);
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
