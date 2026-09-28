#!/usr/bin/env node
/**
 * Attendance Proxy Server — TCP relay giữa máy chấm công và Odoo
 *
 * Usage:
 *   node scripts/start-attendance-proxy.js <listenPort> <odooHost> <odooPort>
 *   node scripts/start-attendance-proxy.js 1111 192.168.1.100 1111
 *
 * Cấu hình trong package.json:
 *   "scripts": {
 *     "start:proxy": "node scripts/start-attendance-proxy.js 1111 192.168.1.100 1111"
 *   }
 */

const net = require('net');
const path = require('path');

// Import services (đã compiled sang .js)
const attendanceService = require('../dist/lib/services/attendanceService');
const mappingService = require('../dist/lib/services/machineMappingService');

const listenPort = process.argv[2] || 1111;
const odooHost = process.argv[3] || 'localhost';
const odooPort = parseInt(process.argv[4] || '1111', 10);

class AttendanceProxy {
  constructor() {
    this.server = null;
    this.odooHost = odooHost;
    this.odooPort = odooPort;
  }

  start() {
    this.server = net.createServer((clientSocket) => {
      this.handleClient(clientSocket);
    });

    this.server.listen(listenPort, () => {
      console.log(`[Proxy] ✅ Listening on port ${listenPort}`);
      console.log(`[Proxy] 📤 Forwarding to ${this.odooHost}:${this.odooPort}`);
      console.log(`[Proxy] Waiting for machine to connect...`);
    });

    this.server.on('error', (err) => {
      console.error('[Proxy] ❌ Server error:', err.message);
      process.exit(1);
    });

    process.on('SIGINT', () => {
      console.log('\n[Proxy] Shutting down...');
      this.server?.close();
      process.exit(0);
    });
  }

  handleClient(clientSocket) {
    const clientAddr = clientSocket.remoteAddress;
    console.log(`[Proxy] 🔗 Machine connected: ${clientAddr}`);

    const odooSocket = net.createConnection(this.odooPort, this.odooHost, () => {
      console.log(`[Proxy] ✓ Connected to Odoo ${this.odooHost}:${this.odooPort}`);
    });

    let buffer = '';

    // ─── Dữ liệu từ máy → proxy ───
    clientSocket.on('data', (data) => {
      const chunk = data.toString('utf-8');
      console.log(`[Proxy] 📥 Machine → ${chunk.length} bytes`);

      buffer += chunk;
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          this.processRecord(line, clientAddr).catch((e) =>
            console.error('[Proxy] Error:', e.message)
          );
        }
      }
      buffer = lines[lines.length - 1];

      // Forward tới Odoo
      odooSocket.write(data);
    });

    clientSocket.on('end', () => {
      console.log(`[Proxy] 🔌 Machine disconnected`);
      odooSocket.end();
    });

    clientSocket.on('error', (err) => {
      console.error(`[Proxy] ❌ Client error: ${err.message}`);
      odooSocket.destroy();
    });

    // ─── Dữ liệu từ Odoo → máy ───
    odooSocket.on('data', (data) => {
      console.log(`[Proxy] 📤 Odoo → ${data.length} bytes`);
      clientSocket.write(data);
    });

    odooSocket.on('end', () => {
      console.log(`[Proxy] Odoo connection closed`);
      clientSocket.end();
    });

    odooSocket.on('error', (err) => {
      console.error(`[Proxy] ❌ Odoo error: ${err.message}`);
      clientSocket.destroy();
    });
  }

  async processRecord(line, machineId = 'default') {
    try {
      const parts = line.split('\t');
      if (parts.length < 2) return;

      const employeeCode = parts[0].trim();
      const datetimeStr = parts[1].trim();
      const attStatus = parseInt(parts[2] ?? '0', 10);

      const statusMap = { 0: 'check_in', 1: 'check_out', 2: 'check_out', 3: 'check_in', 4: 'check_in', 5: 'check_out' };
      const eventType = statusMap[attStatus] || 'check_in';

      const recordedAt = this.parseDateTime(datetimeStr);

      // Tra mapping
      const userId = await mappingService.lookupUserId(machineId, employeeCode);

      if (!userId) {
        await mappingService.saveUnmatched({
          machine_id: machineId,
          employee_code: employeeCode,
          event_type: eventType,
          recorded_at: recordedAt,
        });
        console.log(`[Proxy] ⚠️  Unmatched: ${employeeCode}`);
        return;
      }

      // Ghi attendance
      await attendanceService.recordAttendance({
        user_id: userId,
        event_type: eventType,
        type: 'machine',
        machine_id: machineId,
      });

      console.log(`[Proxy] ✓ ${employeeCode} (${eventType})`);
    } catch (err) {
      console.error(`[Proxy] ❌ Process error: ${err.message}`);
    }
  }

  parseDateTime(str) {
    try {
      const [date, time] = str.split(' ');
      return new Date(`${date}T${time}+07:00`).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
}

// Start
const proxy = new AttendanceProxy();
proxy.start();
