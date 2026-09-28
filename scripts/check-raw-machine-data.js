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
    console.log('🔍 Checking raw machine data...\n');
    client = await connectToMachine();
    const records = await getAttendanceRecords(client);

    // Filter for employee 4 (id === 4)
    const emp4 = records.filter(r => r.id === 4);
    console.log(`👤 Employee 4 records: ${emp4.length}\n`);

    // Count by state
    const byState = {};
    emp4.forEach(r => {
      byState[r.state] = (byState[r.state] || 0) + 1;
    });

    console.log('📊 By state:');
    Object.entries(byState).forEach(([state, count]) => {
      const label = state === '0' ? 'check_out' : state === '1' ? 'check_in' : 'unknown';
      console.log(`  state=${state} (${label}): ${count}`);
    });

    console.log('\n🔎 First 10 employee 4 records:');
    emp4.slice(0, 10).forEach((r, i) => {
      const eventType = r.state === 0 ? 'checkout' : r.state === 1 ? 'checkin' : 'unknown';
      const date = new Date(r.timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      console.log(`  ${i+1}. ${date} | state=${r.state} (${eventType})`);
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
