/**
 * ZKTeco Client — Kết nối tới máy chấm công ZKTeco qua TCP/IP
 * Protocol: ZKTeco binary protocol (port 1111)
 *
 * Sử dụng thư viện zklib npm (callback-based API)
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ZK = require('zklib');

export interface ZKAttendanceRecord {
  user_id: number;
  employee_code: string;
  timestamp: number;
  status: number;
  /** Raw uid field từ zklib (v6.60: employee code; legacy: attendance counter) */
  raw_uid?: number;
  /** Raw id field từ zklib (v6.60: sequence; legacy: employee code) */
  raw_id?: number;
}

export interface ZKUser {
  user_id: number;
  employee_code: string;
  name: string;
}

export class ZKTecoClient {
  private client: any = null;
  private host: string;
  private port: number;
  private connected: boolean = false;
  private attendanceParser: string;

  /**
   * @param attendanceParser 'legacy' (mặc định) hoặc 'v6.60' cho firmware ZKTeco mới
   * Legacy:  uid=counter, id=employee_code
   * v6.60:   uid=employee_code, id=sequence
   */
  constructor(host: string, port: number = 1111, attendanceParser: string = 'legacy') {
    this.host = host;
    this.port = port;
    this.attendanceParser = attendanceParser;
  }

  /**
   * Kết nối tới máy
   */
  async connect(): Promise<void> {
    try {
      this.client = new ZK({
        ip: this.host,
        port: this.port,
        inport: 5000 + Math.floor(Math.random() * 60000), // Random local port để tránh conflict
        timeout: 30000, // 30s — tăng từ 15s để chống timeout
        printQueueSize: false,
        connectionType: 'tcp', // Dùng TCP
        attendanceParser: this.attendanceParser,
      });

      console.log(`[ZKTeco] Connecting to ${this.host}:${this.port}...`);

      // createSocket uses callback (error-first).
      // Bọc timeout 60s để chống callback không bao giờ fire (zklib hang) → poller tự phục hồi.
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Connect timeout 60s tới ${this.host}:${this.port}`));
        }, 60_000);

        this.client.createSocket((err: any) => {
          if (err) {
            clearTimeout(timeoutId);
            console.error(`[ZKTeco] Socket creation error:`, err);
            reject(err);
          } else {
            console.log(`[ZKTeco] Socket created successfully`);

            // Now establish connection
            this.client.connect((connErr: any) => {
              clearTimeout(timeoutId);
              if (connErr) {
                console.error(`[ZKTeco] Connection error:`, connErr);
                reject(connErr);
              } else {
                console.log(`[ZKTeco] Connection established`);
                resolve();
              }
            });
          }
        });
      });

      console.log(`[ZKTeco] Connected to ${this.host}:${this.port}`);
      this.connected = true;
    } catch (err) {
      console.error(`[ZKTeco] Connection failed:`, err);
      this.connected = false;
      throw err;
    }
  }

  /**
   * Disconnect từ máy
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await new Promise<void>((resolve) => {
          this.client.closeSocket((err: any) => {
            if (err) {
              console.error(`[ZKTeco] Close error:`, err);
            }
            resolve();
          });
        });
        console.log(`[ZKTeco] Disconnected`);
      } catch (err) {
        console.error(`[ZKTeco] Disconnect error:`, err);
      }
    }
    this.connected = false;
  }

  /**
   * Gọi zklib getAttendance với timeout 90s.
   * Bug zklib: nếu attendancesBuffer.length !== total_bytes, callback không bao giờ được gọi
   * → isPolling = true mãi mãi → poller bị block hoàn toàn.
   */
  private getAttendanceRaw(): Promise<any[]> {
    return new Promise<any[]>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('getAttendance timeout 90s — zklib strict-equality bug hoặc máy stall mid-transfer'));
      }, 90_000);

      this.client.getAttendance((err: any, data: any) => {
        clearTimeout(timeoutId);
        if (err) {
          reject(err);
        } else {
          resolve(data || []);
        }
      });
    });
  }

  /**
   * Lấy danh sách attendance records
   */
  async getAttendanceRecords(): Promise<ZKAttendanceRecord[]> {
    if (!this.client || !this.connected) {
      throw new Error('ZKTeco client not connected');
    }

    try {
      console.log(`[ZKTeco] Fetching attendance records...`);

      const records = await this.getAttendanceRaw();

      // Log raw fields của record đầu tiên và cuối cùng để debug parser
      if (records.length > 0) {
        const logRecord = (label: string, r: any) => {
          const ts = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp || 0);
          console.log(`[ZKTeco] ${label} raw: uid=${r.uid} id=${r.id} state=${r.state} ts=${ts.toISOString()} parser=${this.attendanceParser}`);
        };
        logRecord('FIRST', records[0]);
        if (records.length > 1) {
          // Sort để tìm record mới nhất
          const sorted = [...records].sort((a: any, b: any) => {
            const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp || 0).getTime();
            const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp || 0).getTime();
            return tb - ta;
          });
          logRecord('LATEST', sorted[0]);
          logRecord('OLDEST', sorted[sorted.length - 1]);
        }
      }

      // v6.60: uid = employee_code, id = sequence
      // legacy: id = employee_code, uid = attendance_counter
      const isV660 = this.attendanceParser === 'v6.60';

      // Parse response từ máy
      const attendanceData: ZKAttendanceRecord[] = (records || []).map(
        (r: any) => {
          const empCode = isV660
            ? String(r.uid || r.id || '')
            : String(r.id || r.uid || r.employee_code || r.user_id || r.userId || '');
          return {
            user_id: parseInt(empCode, 10) || 0,
            employee_code: empCode,
            timestamp: Math.floor(
              new Date(r.timestamp || r.recordTime || r.datetime || 0).getTime() / 1000
            ),
            status: r.state || r.status || r.punch || r.attendanceStatus || 0,
            raw_uid: r.uid,
            raw_id: r.id,
          };
        }
      );

      console.log(`[ZKTeco] Retrieved ${attendanceData.length} records (parser: ${this.attendanceParser})`);
      return attendanceData;
    } catch (err) {
      console.error(`[ZKTeco] Error fetching attendance:`, err);
      throw err;
    }
  }

  /**
   * Lấy danh sách users trên máy
   */
  async getUsers(): Promise<ZKUser[]> {
    if (!this.client || !this.connected) {
      throw new Error('ZKTeco client not connected');
    }

    try {
      console.log(`[ZKTeco] Fetching user list...`);

      // Try to get attendance which includes user info (có timeout 90s chống zklib hang)
      const records = await this.getAttendanceRaw();

      // Extract unique users from attendance records
      const userMap = new Map<number, ZKUser>();
      for (const record of records || []) {
        const userId = record.user_id || record.userId || 0;
        if (userId > 0 && !userMap.has(userId)) {
          userMap.set(userId, {
            user_id: userId,
            employee_code: String(userId),
            name: `User ${userId}`,
          });
        }
      }

      const userData: ZKUser[] = Array.from(userMap.values());
      console.log(`[ZKTeco] Retrieved ${userData.length} users`);
      return userData;
    } catch (err) {
      console.error(`[ZKTeco] Error fetching users:`, err);
      // Return empty array instead of throwing
      return [];
    }
  }

  /**
   * Test kết nối
   */
  async test(): Promise<boolean> {
    try {
      await this.connect();
      const records = await this.getAttendanceRecords();
      const users = await this.getUsers();
      await this.disconnect();

      console.log(
        `[ZKTeco] Test passed. Found ${users.length} users and ${records.length} records.`
      );
      return true;
    } catch (err) {
      console.error(`[ZKTeco] Test failed:`, err);
      return false;
    }
  }

  /**
   * Check status kết nối
   */
  isConnected(): boolean {
    return this.connected;
  }
}
