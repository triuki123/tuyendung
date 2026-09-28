/**
 * TCP Server — Nhận dữ liệu trực tiếp từ Máy chấm công
 *
 * Máy → Server (port 1111)
 *   └→ Parse dữ liệu → xử lý realtime → DB → Broadcast SSE
 *
 * Usage:
 *   const server = new AttendanceProxyServer()
 *   server.start(1111)  // listen port 1111, không forward
 */

import * as net from 'net';
import * as attendanceService from '@/lib/services/attendanceService';
import * as mappingService from '@/lib/services/machineMappingService';
import { attendanceBroadcaster } from '@/lib/attendanceBroadcaster';
import { queryOne } from '@/lib/db';

export class AttendanceProxyServer {
  private server: net.Server | null = null;

  /**
   * Khởi động TCP server
   * @param listenPort - port server lắng nghe (thường 1111)
   */
  async start(listenPort: number): Promise<void> {
    this.server = net.createServer((clientSocket) => {
      this.handleClientConnection(clientSocket);
    });

    this.server.listen(listenPort, () => {
      console.log(`[AttendanceServer] Listening on port ${listenPort}`);
      console.log(`[AttendanceServer] Waiting for attendance machine data...`);
    });

    this.server.on('error', (err) => {
      console.error('[AttendanceServer] Server error:', err);
    });
  }

  /**
   * Xử lý connection từ máy chấm công
   */
  private handleClientConnection(clientSocket: net.Socket) {
    const clientAddr = clientSocket.remoteAddress || 'unknown';
    console.log(`[AttendanceServer] Machine connected: ${clientAddr}`);

    let buffer = '';

    clientSocket.on('data', (data) => {
      const chunk = data.toString('utf-8');
      console.log(`[AttendanceServer] Received from machine: ${chunk.length} bytes`);

      // Accumulate data (máy có thể gửi nhiều lần)
      buffer += chunk;

      // Parse ADMS format: PIN\tDATETIME\tSTATUS\tVERIFY\n
      const lines = buffer.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          this.processAttendanceRecord(line, clientAddr).catch(console.error);
        }
      }
      // Giữ lại dòng cuối chưa hoàn chỉnh (nếu có)
      buffer = lines[lines.length - 1];
    });

    clientSocket.on('end', () => {
      console.log(`[AttendanceServer] Machine disconnected: ${clientAddr}`);
      clientSocket.end();
    });

    clientSocket.on('error', (err) => {
      console.error(`[AttendanceServer] Connection error: ${err.message}`);
      clientSocket.destroy();
    });
  }

  /**
   * Parse và xử lý bản ghi chấm công
   * Format: PIN\tDATETIME\tSTATUS\tVERIFY\n
   */
  private async processAttendanceRecord(line: string, machineId?: string) {
    try {
      const parts = line.split('\t');
      if (parts.length < 2) return;

      const employeeCode = parts[0].trim();
      const datetimeStr = parts[1].trim();
      const attStatus = parseInt(parts[2] ?? '0', 10);

      const ATT_STATUS_MAP: Record<number, 'check_in' | 'check_out'> = {
        0: 'check_in',
        1: 'check_out',
        2: 'check_out',
        3: 'check_in',
        4: 'check_in',
        5: 'check_out',
      };
      const eventType = ATT_STATUS_MAP[attStatus] ?? 'check_in'; // chỉ dùng cho notify
      const punchTime = this.parseDateTime(datetimeStr);
      const machine = machineId || attendanceService.CANONICAL_MACHINE_ID;

      // Ghi punch THÔ vào device_punches (Projection Model)
      const isNew = await attendanceService.recordDevicePunch({
        machine_id:    machine,
        employee_code: employeeCode,
        punch_time:    punchTime,
        raw_status:    attStatus,
      });

      if (!isNew) return; // đã có → bỏ qua side-effects

      // Tra mapping (chỉ ĐỌC) để quyết định side-effects
      const userId = await mappingService
        .lookupUserId(machine, employeeCode, punchTime)
        .catch(() => null);

      if (!userId) {
        console.log(`[Proxy] Punch mới chưa map: ${employeeCode} @ ${punchTime}`);
        return;
      }

      attendanceService.refreshSheetStatsAsync(userId, punchTime).catch(console.error);

      const userInfo = await queryOne<{ name: string }>(
        `SELECT name FROM users WHERE id = $1`,
        [userId]
      ).catch(() => null);
      const userName = userInfo?.name;

      attendanceBroadcaster.broadcast({
        type: eventType,
        user_id: userId,
        user_name: userName,
        recorded_at: punchTime,
        machine_id: machine,
        timestamp: Date.now(),
      });

      // In-app + Telegram qua engine (nội dung cá nhân hoá trong templates.ts).
      // Dùng giờ chấm THẬT tại máy (punchTime).
      {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { sendAttendanceCheckinNotification, sendAttendanceCheckoutNotification } = require('@/lib/services/notificationsService');
        const punchAt = new Date(punchTime);
        const fn = eventType === 'check_in' ? sendAttendanceCheckinNotification : sendAttendanceCheckoutNotification;
        fn(userId, 'machine', userName, punchAt).catch(console.error);
      }

      console.log(`[Proxy] Punch mới: ${employeeCode} (${eventType}) → ${userId}`);
    } catch (err) {
      console.error(`[Proxy] Error processing record: ${err}`);
    }
  }

  private parseDateTime(str: string): string {
    try {
      const [datePart, timePart] = str.split(' ');
      return new Date(`${datePart}T${timePart}+07:00`).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('[Proxy] Server stopped');
    }
  }
}
