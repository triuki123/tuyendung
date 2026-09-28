/**
 * PollerManager — quản lý nhiều ZKAttendancePoller (mỗi máy 1 poller).
 *
 * Nguồn cấu hình: bảng attendance_machines (DB-driven), KHÔNG còn đọc env đơn lẻ.
 * Chỉ poll máy: polling_enabled = true, status <> 'disabled', connection_mode = 'pull'.
 * Máy 'push' (ADMS) tự gửi dữ liệu ra → không cần poll.
 *
 * reconcile() được gọi lúc khởi động và sau mỗi lần thêm/sửa/xóa máy.
 */

import { ZKAttendancePoller, PollStats } from './zkAttendancePoller';
import * as machineService from '@/lib/services/machineService';

interface RunningEntry {
  poller: ZKAttendancePoller;
  host: string;
  port: number;
  intervalMs: number;
  parser: string;
}

class PollerManager {
  private running = new Map<string, RunningEntry>();
  private reconciling = false;
  private watchdogTimer: NodeJS.Timeout | null = null;

  /** Khởi động lần đầu — reconcile từ trạng thái rỗng + watchdog tự phục hồi. */
  async start(): Promise<void> {
    await this.reconcile();

    // Watchdog: máy offline lúc startup → poller start fail → entry bị xóa.
    // Reconcile định kỳ để tự tạo lại poller khi máy online trở lại.
    // reconcile() bỏ qua máy đang chạy không đổi cấu hình → chi phí chỉ là 1 query DB.
    if (!this.watchdogTimer) {
      this.watchdogTimer = setInterval(() => {
        this.reconcile().catch((err) =>
          console.error('[PollerManager] Watchdog reconcile error:', err?.message ?? err)
        );
      }, 60_000);
    }
  }

  /**
   * Đồng bộ tập poller đang chạy với DB:
   * - Máy mới / bật lại → tạo + start poller.
   * - Máy đổi host/port/chu kỳ → stop poller cũ, start poller mới.
   * - Máy bị xóa / tắt polling / chuyển push → stop + gỡ poller.
   */
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const machines = await machineService.getAllMachines().catch(() => []);
      const desired = machines.filter(
        (m) => m.polling_enabled && m.status !== 'disabled' && m.connection_mode === 'pull'
      );
      const desiredIds = new Set(desired.map((m) => m.id));

      // Stop những poller không còn mong muốn
      for (const [id, entry] of this.running) {
        if (!desiredIds.has(id)) {
          console.log(`[PollerManager] Dừng poller máy ${id} (bị xóa/tắt/chuyển push)`);
          entry.poller.stop();
          this.running.delete(id);
        }
      }

      // Start / restart theo cấu hình mong muốn
      for (const m of desired) {
        const intervalMs = (m.poll_interval_seconds ?? 30) * 1000;
        const parser = (m as any).attendance_parser || 'legacy';
        const cur = this.running.get(m.id);
        const changed =
          cur &&
          (cur.host !== m.host || cur.port !== m.port || cur.intervalMs !== intervalMs || cur.parser !== parser);

        if (cur && !changed) continue; // đang chạy, không đổi

        if (cur && changed) {
          console.log(`[PollerManager] Cấu hình máy ${m.id} thay đổi → restart poller`);
          cur.poller.stop();
          this.running.delete(m.id);
        }

        const poller = new ZKAttendancePoller(m.id, m.host, m.port, intervalMs, parser);
        this.running.set(m.id, { poller, host: m.host, port: m.port, intervalMs, parser });
        // start() tự test kết nối + bắt đầu interval; lỗi 1 máy không ảnh hưởng máy khác
        poller.start().catch((err) => {
          console.error(`[PollerManager] Không start được poller máy ${m.id}:`, err?.message ?? err);
          // Xóa entry khỏi running để reconcile() có thể restart lần sau
          this.running.delete(m.id);
          machineService.updateLastError(m.id, err instanceof Error ? err.message : String(err)).catch(() => {});
        });
        console.log(`[PollerManager] ▶ Poller máy ${m.id} (${m.host}:${m.port}, ${intervalMs}ms)`);
      }

      console.log(`[PollerManager] Đang chạy ${this.running.size} poller (pull). Tổng máy DB: ${machines.length}`);
    } finally {
      this.reconciling = false;
    }
  }

  /**
   * Kích hoạt sync ngay cho 1 máy — dùng cho nút "Đồng bộ ngay" trên UI.
   * Nếu máy đang chạy poller → pollNow(). Nếu chưa có poller → reconcile trước rồi pollNow.
   */
  async syncNow(machineId: string): Promise<void> {
    const cur = this.running.get(machineId);
    if (cur) {
      cur.poller.pollNow();
    } else {
      // Poller chưa chạy (máy chưa được start hoặc đã bị xóa) → reconcile rồi sync
      await this.reconcile();
      this.running.get(machineId)?.poller.pollNow();
    }
  }

  /**
   * Đồng bộ ngay và CHỜ kết quả — cho nút "Đồng bộ ngay" báo kết quả thật
   * (giống cách "Kiểm tra kết nối" chờ kết nối xong mới trả lời).
   * Poller đang chạy → join/poll trực tiếp. Chưa có poller → tạo poller một lần
   * (không interval) để kéo dữ liệu, không đụng độ với poller định kỳ.
   */
  async syncNowAndWait(machineId: string): Promise<PollStats> {
    const cur = this.running.get(machineId);
    if (cur) return cur.poller.pollOnceAndWait();

    const m = await machineService.getMachineById(machineId);
    if (!m) throw new Error('Máy không tồn tại');
    const parser = (m as any).attendance_parser || 'legacy';
    const oneOff = new ZKAttendancePoller(m.id, m.host, m.port, undefined, parser);
    const stats = await oneOff.pollOnceAndWait();
    // Máy kéo được dữ liệu chứng tỏ online → reconcile để poller định kỳ sống lại
    this.reconcile().catch(() => {});
    return stats;
  }

  /**
   * Bắt buộc khởi động lại 1 máy cụ thể (dùng sau khi test kết nối thành công).
   * Xóa poller cũ (nếu có) rồi gọi reconcile để tạo lại.
   */
  async restartMachine(machineId: string): Promise<void> {
    const cur = this.running.get(machineId);
    if (cur) {
      cur.poller.stop();
      this.running.delete(machineId);
    }
    await this.reconcile();
  }

  stopAll(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    for (const [, entry] of this.running) entry.poller.stop();
    this.running.clear();
  }

  getRunningIds(): string[] {
    return [...this.running.keys()];
  }
}

// Singleton dùng chung toàn tiến trình Node
export const pollerManager = new PollerManager();
