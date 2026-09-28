# Attendance Realtime — Dữ liệu bấm vân tay từ ZKTeco machine

## Tổng quan

Hệ thống realtime kéo dữ liệu từ máy chấm công ZKTeco (115.79.205.119:1111), đồng bộ lên webapp theo thời gian thực.
- **Polling**: Mỗi 30 giây pull attendance records từ máy
- **Realtime**: Events broadcast tức thì lên connected clients via SSE
- **Smart**: Duplicate check + machine mapping (employee code → user)

**Flow:**
```
Polling (mỗi 30s)
    ↓
ZKTeco Machine (115.79.205.119:1111)
    ↓ (zklib query)
Attendance Records
    ↓
Parse + Mapping (employee_code → user_id)
    ↓
Duplicate Check (5 phút gần nhất)
    ↓
Ghi DB + Broadcast realtime
    /         \
 DB        SSE Endpoint
              ↓
        Webapp clients (realtime)
```

## Kiến trúc

### 1. ZKTeco Polling Service (`src/lib/zkteco/zkAttendancePoller.ts`)
- **Polling interval**: Mỗi 30 giây (configurable)
- **ZK Client**: Kết nối tới máy (115.79.205.119:1111) qua zklib
- **Query**: `getAttendanceRecords()` — lấy tất cả attendance records
- **Duplicate Check**: Tránh lưu duplicate trong 5 phút
- **Machine Mapping**: Map employee_code (từ máy) → user_id (hệ thống)
- **Save DB**: Lưu vào `attendance_records` table
- **Broadcast**: Realtime push events tới connected clients via SSE

### 2. ZKTeco Client (`src/lib/zkteco/zkClient.ts`)
- Wrapper around `zklib` npm package
- Methods:
  - `connect()` — kết nối tới máy
  - `getUsers()` — lấy danh sách users trên máy
  - `getAttendanceRecords()` — lấy attendance log
  - `disconnect()` — ngắt kết nối

### 2. Event Broadcaster (`src/lib/attendanceBroadcaster.ts`)
- In-memory event manager
- Giữ danh sách clients đang subscribe (qua SSE)
- Khi TCP proxy ghi record → broadcast tới tất cả clients
- Lưu history 100 events gần nhất (30 giây gần đây gửi cho client mới)

### 3. SSE Endpoint (`src/app/api/events/attendance/route.ts`)
- GET `/api/events/attendance` — clients subscribe
- Server-Sent Events (SSE) — long-lived HTTP connection
- Gửi events JSON real-time
- Auto-reconnect khi disconnect

### 4. Client Hook (`src/hooks/useAttendanceRealtime.ts`)
- `useAttendanceRealtime()` — hook to subscribe & manage state
- State: `{ connected, lastEvent, recentEvents, error }`
- Auto-reconnect nếu connection mất
- Buffer 50 events gần nhất

### 5. Context Provider (`src/context/AttendanceRealtimeContext.tsx`)
- Optional, nếu muốn chia sẻ state qua nhiều components
- `useAttendanceRealtimeContext()` — dùng state ở bất cứ đâu

## Cách sử dụng

### A. Simple Hook (không cần context)

```tsx
'use client';

import { useAttendanceRealtime } from '@/hooks/useAttendanceRealtime';

export function MyAttendanceMonitor() {
  const { connected, lastEvent, recentEvents } = useAttendanceRealtime();

  return (
    <div>
      <p>Status: {connected ? '✅ Connected' : '❌ Disconnected'}</p>
      {lastEvent && (
        <p>
          {lastEvent.user_name} just {lastEvent.type} at{' '}
          {new Date(lastEvent.recorded_at).toLocaleTimeString()}
        </p>
      )}
      <ul>
        {recentEvents.map((e) => (
          <li key={e.timestamp}>
            {e.user_name} — {e.type}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### B. Với Context (chia sẻ state)

#### 1. Wrap ở layout top-level

```tsx
// src/app/layout.tsx
import { AttendanceRealtimeProvider } from '@/context/AttendanceRealtimeContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <AttendanceRealtimeProvider>
          {children}
        </AttendanceRealtimeProvider>
      </body>
    </html>
  );
}
```

#### 2. Dùng ở bất cứ component nào

```tsx
'use client';

import { useAttendanceRealtimeContext } from '@/context/AttendanceRealtimeContext';

export function AttendanceMonitor() {
  const { connected, lastEvent } = useAttendanceRealtimeContext();

  return (
    <div>
      Status: {connected ? '✅' : '❌'}
      {lastEvent && <p>{lastEvent.user_name} — {lastEvent.type}</p>}
    </div>
  );
}
```

### C. Ready-made Component

```tsx
import { AttendanceRealtimeDisplay } from '@/components/AttendanceRealtimeDisplay';

// (trong page hoặc layout đã wrap với AttendanceRealtimeProvider)
export default function Dashboard() {
  return (
    <div>
      <AttendanceRealtimeDisplay />
    </div>
  );
}
```

## Event Interface

```typescript
interface AttendanceEvent {
  type: 'check_in' | 'check_out';
  user_id: string;
  user_name?: string;
  recorded_at: string; // ISO datetime
  machine_id?: string;
  timestamp: number; // ms, client-side only
}
```

## Setup & Khởi động

### Environment Variables

```bash
# .env
ZKTECO_MACHINE_IP=115.79.205.119      # IP máy chấm công
ZKTECO_MACHINE_PORT=1111               # Port (mặc định ZKTeco)
```

### Tự động khởi động

```bash
# Tự động khởi động khi app start (via src/server.ts)
- File `src/server.ts` tự động import ở `src/app/layout.tsx`
- `startAttendanceServices()` được gọi on server startup
- ZKAttendancePoller khởi động, polling mỗi 30 giây
- SSE endpoint ready để clients subscribe
```

### Test ZKTeco Connection

```bash
# API endpoint để test kết nối
curl http://localhost:4028/api/zkteco/test

# Hoặc với custom IP/port
curl "http://localhost:4028/api/zkteco/test?ip=115.79.205.119&port=1111"

# Response (success):
{
  "success": true,
  "message": "Connected to ZKTeco machine at 115.79.205.119:1111",
  "users": 50,
  "attendanceRecords": 1200,
  "details": {...}
}
```

## Troubleshooting

### Webapp không nhận events?

1. **Check ZKTeco polling:**
   ```bash
   npm run dev
   # Logs sẽ show:
   # ✅ ZKTeco polling started (115.79.205.119:1111)
   # [ZKPoller] Fetching attendance records...
   # [ZKPoller] Processed 10/10 records
   ```

2. **Check machine connectivity:**
   ```bash
   # Test endpoint
   curl http://localhost:4028/api/zkteco/test
   ```
   Nếu fail → máy không reach được, check:
   - IP 115.79.205.119 có đúng không?
   - Port 1111 có mở không?
   - Firewall có chặn không?
   - Máy ZKTeco có online không?

3. **Check machine mapping:**
   - DB: `SELECT * FROM attendance_machine_mappings`
   - Machine ID: `zkteco_ronald_jack`
   - Máy gửi employee_code, phải map với user_id trong DB
   - Nếu không match → records lưu vào `attendance_unmatched` table

4. **Check SSE endpoint:**
   ```bash
   curl -N http://localhost:4028/api/events/attendance
   ```
   Nếu thấy `: SSE connected` → endpoint OK

5. **Check broadcaster:**
   ```bash
   curl -X POST http://localhost:4028/api/events/attendance \
     -H "X-Debug: true"
   ```
   Trả về số subscribers + events history

### Events không đến client?

- Kiểm tra app logs: có message `[ZKPoller] Processed ...` không?
- Kiểm tra `[Broadcaster] Broadcast ...` — có broadcast tới clients không?
- Browser DevTools → Console/Network → check SSE connection status
- Kiểm tra machine mapping: employee_code có đúng không?

## Performance & Limits

- **Max events buffered**: 100 (configurable via `maxHistory`)
- **Max subscribers**: ~1000 (Node.js memory limit)
- **Event format**: JSON (efficient)
- **Reconnect delay**: 3-5 seconds (exponential backoff trong hook)

Nếu có >1000 concurrent clients, cần upgrade lên Redis-based broadcaster (pub/sub).

## Future improvements

- [ ] Authenticate SSE connections (token-based)
- [ ] Filter events by machine_id hoặc user_id
- [ ] Persist events to DB (audit trail)
- [ ] Redis-based broadcaster cho multi-server setup
- [ ] Message queue (Bull, RabbitMQ) nếu traffic cao
