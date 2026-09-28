/**
 * ZKTeco Attendance Poller
 * Pull attendance data từ máy định kỳ
 * Lưu vào DB + Broadcast realtime lên webapp
 */

import { ZKTecoClient, ZKAttendanceRecord } from './zkClient';
import * as attendanceService from '@/lib/services/attendanceService';
import { bulkRecordDevicePunches } from '@/lib/services/attendanceService';
import * as mappingService from '@/lib/services/machineMappingService';
import * as adjustmentService from '@/lib/services/attendanceAdjustmentService';
import * as machineService from '@/lib/services/machineService';
import { attendanceBroadcaster } from '@/lib/attendanceBroadcaster';
import { queryOne as queryOneDb } from '@/lib/db';
import {
  sendAttendanceCheckinNotification,
  sendAttendanceCheckoutNotification,
} from '@/lib/services/notificationsService';

/** Kết quả 1 lần poll — dùng cho "Đồng bộ ngay" để báo kết quả thật về UI */
export interface PollStats {
  received: number;
  newCount: number;
  skipped?: boolean;
}

export class ZKAttendancePoller {
  private zkClient: ZKTecoClient;
  private lastSyncTime: number = 0;
  private pollInterval: number = 30 * 1000; // 30 giây (ms)
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private currentPoll: Promise<PollStats> | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private machineId: string;
  readonly host: string;
  readonly port: number;

  constructor(
    machineId: string,
    machineIp: string,
    machinePort: number = 1111,
    pollIntervalMs?: number,
    attendanceParser: string = 'legacy'
  ) {
    this.machineId = machineId;
    this.host = machineIp;
    this.port = machinePort;
    if (pollIntervalMs && pollIntervalMs > 0) this.pollInterval = pollIntervalMs;
    this.zkClient = new ZKTecoClient(machineIp, machinePort, attendanceParser);
  }

  /**
   * Khởi động polling with retry logic
   */
  async start(): Promise<void> {
    console.log(`[ZKPoller] Starting attendance poller (machine: ${this.machineId}, interval: ${this.pollInterval}ms)`);

    try {
      // Test kết nối trước (với retry)
      await this.connectWithRetry();
      console.log(`[ZKPoller] ✅ Connected to ZKTeco machine ${this.machineId}`);
      await this.zkClient.disconnect();

      // Reset retry count sau khi connect thành công
      this.retryCount = 0;

      // Bắt đầu polling định kỳ
      this.poll().catch(console.error);
      this.pollTimer = setInterval(() => {
        this.poll().catch(console.error);
      }, this.pollInterval);

      console.log(`[ZKPoller] Polling started for ${this.machineId}`);
    } catch (err) {
      console.error(`[ZKPoller] Failed to start ${this.machineId}:`, err);
      throw err;
    }
  }

  /**
   * Connect with exponential backoff retry
   */
  private async connectWithRetry(attempt: number = 0): Promise<void> {
    try {
      await this.zkClient.connect();
    } catch (err) {
      if (attempt < this.maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`[ZKPoller] Retry ${attempt + 1}/${this.maxRetries} after ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.connectWithRetry(attempt + 1);
      }
      throw err;
    }
  }

  /**
   * Kích hoạt sync ngay lập tức (fire-and-forget).
   */
  pollNow(): void {
    this.pollOnceAndWait().catch(console.error);
  }

  /**
   * Poll 1 lần và CHỜ kết quả — dùng cho nút "Đồng bộ ngay".
   * Nếu đang có poll chạy dở thì join vào poll đó thay vì mở kết nối thứ hai
   * (máy chấm công chỉ nhận 1 kết nối một lúc).
   */
  async pollOnceAndWait(): Promise<PollStats> {
    if (this.isPolling && this.currentPoll) return this.currentPoll;
    this.currentPoll = this.poll();
    return this.currentPoll;
  }

  /**
   * Dừng polling
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log(`[ZKPoller] Polling stopped`);
  }

  /**
   * Pull attendance data từ máy một lần (với retry)
   */
  private async poll(): Promise<PollStats> {
    if (this.isPolling) {
      console.log(`[ZKPoller] Poll already in progress for ${this.machineId}, skipping`);
      return { received: 0, newCount: 0, skipped: true };
    }

    this.isPolling = true;

    try {
      // Kết nối (với retry)
      try {
        await this.connectWithRetry();
      } catch (err) {
        this.retryCount++;
        console.error(`[ZKPoller] Connection failed for ${this.machineId} (attempt ${this.retryCount}):`, err);
        if (this.retryCount >= this.maxRetries) {
          console.error(`[ZKPoller] Max retries reached for ${this.machineId}, will retry on next poll cycle`);
          this.retryCount = 0;
        }
        throw err;
      }

      // Lấy attendance records từ máy
      const records = await this.zkClient.getAttendanceRecords();
      console.log(`[ZKPoller] ${this.machineId}: Nhận ${records.length} records từ máy`);

      // ── Bước 1: Bulk insert TẤT CẢ punches, chỉ nhận lại những cái MỚI ──
      // Nhanh hơn N lần so với insert từng cái (79,000+ records → ~1 giây thay vì 13 phút)
      const punches = records
        .map((r) => ({
          employee_code: r.employee_code,
          punch_time: new Date(r.timestamp * 1000).toISOString(),
          raw_status: r.status ?? null,
        }))
        .filter((p) => p.employee_code && !isNaN(new Date(p.punch_time).getTime()));

      const newPunches = await bulkRecordDevicePunches(this.machineId, punches).catch((err) => {
        console.error(`[ZKPoller] Bulk insert error for ${this.machineId}:`, err);
        return [] as { employee_code: string; punch_time: string }[];
      });

      // ── Bước 2: Side-effects CHỈ cho punches thực sự mới ──
      const newSet = new Set(newPunches.map((p) => `${p.employee_code}|${p.punch_time}`));
      let sideEffects = 0;
      for (const record of records) {
        const punchTime = new Date(record.timestamp * 1000).toISOString();
        if (!newSet.has(`${record.employee_code}|${punchTime}`)) continue;
        try {
          await this.runSideEffects(record.employee_code, punchTime);
          sideEffects++;
        } catch (err) {
          console.error(`[ZKPoller] Side-effect error for ${record.employee_code}:`, err);
        }
      }

      console.log(`[ZKPoller] ✅ ${this.machineId}: ${records.length} records, ${newPunches.length} mới, ${sideEffects} side-effects`);
      this.lastSyncTime = Date.now();
      this.retryCount = 0;
      machineService.updateLastSync(this.machineId).catch(() => {});
      return { received: records.length, newCount: newPunches.length };
    } catch (err) {
      console.error(`[ZKPoller] Poll error for ${this.machineId}:`, err);
      machineService.updateLastError(this.machineId, err instanceof Error ? err.message : String(err)).catch(() => {});
      // Rethrow để "Đồng bộ ngay" (pollOnceAndWait) báo lỗi thật về UI;
      // interval polling đã có .catch(console.error) nên không ảnh hưởng.
      throw err;
    } finally {
      try {
        await this.zkClient.disconnect();
      } catch (e) {
        // ignore disconnect error
      }
      this.isPolling = false;
    }
  }

  /**
   * Side-effects cho 1 punch MỚI (đã được ghi vào DB bởi bulkRecordDevicePunches).
   * Broadcast realtime, notify Telegram, refresh stats, auto-resolve Bù Công.
   */
  private async runSideEffects(employee_code: string, punchTime: string): Promise<void> {
    if (!employee_code) return;

    // Tra mapping (CHỈ ĐỌC — không ảnh hưởng nguồn sự thật)
    const userId = await mappingService
      .lookupUserId(this.machineId, employee_code, punchTime)
      .catch(() => null);

    if (!userId) {
      // Chưa map → punch vẫn nằm trong device_punches, sẽ hiện khi admin map sau. Không notify.
      console.log(`[ZKPoller] Punch mới chưa map: ${employee_code} @ ${punchTime}`);
      return;
    }

    // Nhãn vào/ra dùng CHUNG bộ não với bảng công (classifyDayRecords day-aware),
    // KHÔNG đoán theo mốc 12h. Punch đã được ghi vào DB ở bước bulk insert nên có
    // mặt trong tập ngày → nhãn khớp với những gì bảng công hiển thị.
    const eventType = await attendanceService.classifyPunchForUser(userId, punchTime);

    // Refresh sheet stats (fire-and-forget)
    attendanceService.refreshSheetStatsAsync(userId, punchTime).catch(console.error);

    // Lấy user name để broadcast
    const userInfo = await queryOneDb<{ name: string }>(
      `SELECT name FROM users WHERE id = $1`,
      [userId]
    ).catch(() => null);
    const userName = userInfo?.name;

    // Broadcast realtime
    attendanceBroadcaster.broadcast({
      type: eventType,
      user_id: userId,
      user_name: userName,
      recorded_at: punchTime,
      machine_id: this.machineId,
      timestamp: Date.now(),
    });

    // Auto-resolve Bù Công nếu vân tay đã về
    const workDateStr = new Date(punchTime)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    adjustmentService
      .autoResolveAdjustments(userId, workDateStr, eventType)
      .catch((err) => console.error('[ZKPoller] autoResolve error:', err));

    // In-app + Telegram qua engine (nội dung cá nhân hoá trong templates.ts)
    if (eventType === 'check_in') sendAttendanceCheckinNotification(userId, 'machine', userName ?? undefined, new Date(punchTime)).catch(console.error);
    else sendAttendanceCheckoutNotification(userId, 'machine', userName ?? undefined, new Date(punchTime)).catch(console.error);

    console.log(`[ZKPoller] ✅ Punch mới: ${userName || userId} - ${eventType} @ ${punchTime}`);
  }


  /**
   * Debug: lấy last sync time
   */
  getLastSyncTime(): number {
    return this.lastSyncTime;
  }

  /**
   * Debug: check polling status
   */
  getStatus(): { isPolling: boolean; lastSyncTime: number; isConnected: boolean } {
    return {
      isPolling: this.isPolling,
      lastSyncTime: this.lastSyncTime,
      isConnected: this.zkClient.isConnected(),
    };
  }

}
