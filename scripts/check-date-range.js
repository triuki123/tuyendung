require('dotenv').config();
const ZK = require('zklib');

const machineIp = process.env.ZKTECO_MACHINE_IP || '115.79.205.119';
const machinePort = parseInt(process.env.ZKTECO_MACHINE_PORT || '1111', 10);

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
        resolve(client);
      });
    });
  });
}

async function getAttendanceRecords(client) {
  return new Promise((resolve, reject) => {
    client.getAttendance((err, data) => {
      if (err) return reject(err);
      resolve(data || []);
    });
  });
}

async function main() {
  let client;
  try {
    console.log('🔍 Checking date range of machine data...\n');
    client = await connectToMachine();
    const records = await getAttendanceRecords(client);

    if (records.length === 0) {
      console.log('❌ No records found');
      return;
    }

    // Parse dates
    const dates = records.map(r => {
      const ts = r.timestamp || r.recordTime || r.datetime || 0;
      return new Date(ts);
    }).filter(d => !isNaN(d.getTime()));

    // Sort to find min/max
    dates.sort((a, b) => a - b);
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    console.log(`📊 Total records: ${records.length}`);
    console.log(`📅 Date range: ${minDate.toLocaleString('vi-VN')} → ${maxDate.toLocaleString('vi-VN')}\n`);

    // Count by month
    const byMonth = {};
    records.forEach(r => {
      const ts = r.timestamp || r.recordTime || r.datetime || 0;
      const d = new Date(ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = (byMonth[key] || 0) + 1;
    });

    console.log('📈 Records by month:');
    Object.keys(byMonth).sort().forEach(month => {
      console.log(`   ${month}: ${byMonth[month]} records`);
    });

  } finally {
    if (client) {
      client.closeSocket(() => {});
    }
    process.exit(0);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
