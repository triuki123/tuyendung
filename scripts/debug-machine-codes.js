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
    console.log('🔍 Debugging machine employee codes...\n');
    client = await connectToMachine();
    const records = await getAttendanceRecords(client);

    console.log(`📊 Total records: ${records.length}\n`);
    console.log('🔎 First 20 records structure:\n');

    records.slice(0, 5).forEach((rec, idx) => {
      console.log(`Record ${idx}:`);
      console.log(JSON.stringify(rec, null, 2));
      console.log('');
    });

    // Get unique id values
    const uniqueIds = [...new Set(records.map(r => r.id).filter(Boolean))].sort((a, b) => a - b);
    console.log(`\n📌 Unique employee IDs found (${uniqueIds.length} total):`);
    console.log(uniqueIds.slice(0, 50).join(', '));
    if (uniqueIds.length > 50) {
      console.log(`   ... and ${uniqueIds.length - 50} more`);
    }
    console.log(`\n❓ Your mappings are: 1, 4, 9`);

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
