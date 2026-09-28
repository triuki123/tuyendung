/**
 * Event Broadcaster cho Attendance Realtime
 * Giữ danh sách clients subscribe qua SSE
 * Khi TCP proxy ghi attendance record → broadcast tới tất cả clients
 */

export interface AttendanceEvent {
  type: 'check_in' | 'check_out';
  user_id: string;
  user_name?: string;
  recorded_at: string;
  machine_id?: string;
  timestamp: number; // ms, dùng cho client
}

type ResponseWriter = (data: string) => void;

interface Subscriber {
  id: string;
  write: ResponseWriter;
  createdAt: number;
}

class AttendanceBroadcaster {
  private subscribers: Map<string, Subscriber> = new Map();
  private eventHistory: AttendanceEvent[] = [];
  private maxHistory = 100;

  /**
   * Đăng ký client (gọi từ SSE endpoint)
   */
  subscribe(id: string, write: ResponseWriter): () => void {
    const subscriber: Subscriber = {
      id,
      write,
      createdAt: Date.now(),
    };

    this.subscribers.set(id, subscriber);
    console.log(`[Broadcaster] Client subscribed: ${id} (total: ${this.subscribers.size})`);

    // Gửi lịch sử events (30 giây gần nhất)
    const thirtySecsAgo = Date.now() - 30000;
    const recentEvents = this.eventHistory.filter((e) => e.timestamp > thirtySecsAgo);
    if (recentEvents.length > 0) {
      this.sendToClient(id, { type: 'history', data: recentEvents });
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(id);
      console.log(`[Broadcaster] Client unsubscribed: ${id} (total: ${this.subscribers.size})`);
    };
  }

  /**
   * Broadcast event tới tất cả clients
   */
  broadcast(event: AttendanceEvent): void {
    const eventWithTimestamp = { ...event, timestamp: Date.now() };

    // Lưu history
    this.eventHistory.push(eventWithTimestamp);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    // Gửi tới tất cả subscribers
    this.subscribers.forEach((subscriber) => {
      this.sendToClient(subscriber.id, { type: 'event', data: eventWithTimestamp });
    });

    console.log(
      `[Broadcaster] Broadcast ${event.type} for ${event.user_id} to ${this.subscribers.size} clients`
    );
  }

  /**
   * Gửi message tới 1 client
   */
  private sendToClient(id: string, message: unknown): void {
    const subscriber = this.subscribers.get(id);
    if (!subscriber) return;

    try {
      const data = JSON.stringify(message);
      subscriber.write(`data: ${data}\n\n`);
    } catch (err) {
      console.error(`[Broadcaster] Error sending to ${id}:`, err);
      this.subscribers.delete(id);
    }
  }

  /**
   * Lấy số clients hiện tại (debug)
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Lấy event history (debug)
   */
  getHistory(limitMs = 60000): AttendanceEvent[] {
    const since = Date.now() - limitMs;
    return this.eventHistory.filter((e) => e.timestamp > since);
  }
}

export const attendanceBroadcaster = new AttendanceBroadcaster();
