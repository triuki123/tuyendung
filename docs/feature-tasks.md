# Hệ Thống Nhiệm Vụ (Tasks)

**Cập nhật:** 2026-05-27

---

## Tổng Quan

Module Tasks cung cấp bảng Kanban để quản lý công việc, với mã nhiệm vụ tự động sinh, nhật ký hoạt động (activity log), và tính năng lưu trữ (archive).

---

## Database Schema

### Bảng `tasks`

Các cột liên quan đến tính năng mới:

```sql
task_code   VARCHAR(20) UNIQUE   -- định dạng Task-ddmmyyyy-0001
archived_at TIMESTAMP NULL       -- NULL = đang hoạt động; có giá trị = đã lưu trữ
```

### Bảng `task_activities`

```sql
id                   BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY
task_id              VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
user_id              VARCHAR(255)
action               VARCHAR(50) NOT NULL    -- xem bảng action types bên dưới
old_value            TEXT
new_value            TEXT
description          TEXT
created_at           TIMESTAMP DEFAULT NOW()
created_by_user_id   VARCHAR(255)
created_by_user_name VARCHAR(255)

CONSTRAINT valid_action CHECK (action IN (
  'created', 'status_changed', 'archived', 'restored',
  'commented', 'assigned', 'title_changed', 'description_changed'
))
```

Indexes: `task_id`, `created_at`, `action`, `tasks.task_code`, `tasks.created_at`

Migration files:
- `src/migrations/add_task_activity_logs.sql`
- `src/migrations/add_archived_at_to_tasks.sql`

Để áp dụng trên Postgres tự-host:
```bash
psql "$DATABASE_URL" -f src/migrations/add_task_activity_logs.sql
psql "$DATABASE_URL" -f src/migrations/add_archived_at_to_tasks.sql
```

---

## Mã Nhiệm Vụ (Task Code)

**Định dạng:** `Task-ddmmyyyy-0001`

- Prefix `Task-` cố định
- `ddmmyyyy` = ngày tạo (ví dụ: `18052026` = 18/05/2026)
- Số thứ tự 4 chữ số, tự động tăng trong ngày, reset về `0001` mỗi ngày mới

**Ví dụ cùng ngày:**
```
Task-18052026-0001
Task-18052026-0002
Task-18052026-0003
```

### Utilities (`src/lib/task-utils.ts`)

```typescript
generateTaskCode(sequenceNumber: number, date?: Date): string
  // → "Task-18052026-0001"

formatDateForTaskCode(date?: Date): string
  // → "18052026"

parseTaskCode(taskCode: string): { date: Date; sequence: number }

formatActivityLog(activity: TaskActivity): string
getActivityIcon(action: TaskActivityAction): string    // emoji icon
getActivityBadgeColor(action: TaskActivityAction): string  // Tailwind classes
```

---

## API Endpoints

### Task Code

**POST** `/api/tasks/generate-code`

Tự động tính sequence dựa trên số task đã tạo trong ngày.

Response:
```json
{ "task_code": "Task-18052026-0001", "sequence": 1, "date": "2026-05-18T..." }
```

### Activity Log

**GET** `/api/tasks/{id}/activities`

Trả về mảng `TaskActivity[]` sắp xếp mới nhất trước.

**POST** `/api/tasks/{id}/activities`

Body:
```json
{
  "action": "status_changed",
  "old_value": "todo",
  "new_value": "in_progress",
  "created_by_user_id": "user-id",
  "created_by_user_name": "Nguyễn Văn A"
}
```

### Archive / Restore

**PUT** `/api/tasks/{id}` — truyền `{ archived_at: <timestamp> }` để archive, `{ archived_at: null }` để restore.

---

## Các Loại Hoạt Động

| Action | Icon | Badge | Mô tả |
|--------|------|-------|-------|
| `created` | ✨ | emerald | Task được tạo |
| `status_changed` | 📝 | blue | Trạng thái thay đổi |
| `archived` | 📦 | orange | Đã lưu trữ |
| `restored` | ↻ | green | Khôi phục từ archive |
| `commented` | 💬 | purple | Thêm bình luận |
| `assigned` | 👤 | indigo | Giao cho người khác |
| `title_changed` | ✏️ | yellow | Tiêu đề thay đổi |
| `description_changed` | 📄 | cyan | Mô tả thay đổi |

---

## TypeScript Interfaces

```typescript
interface Task {
  id: string;
  code: string;
  task_code?: string;   // định dạng mới; fallback về 'code' nếu chưa có
  title: string;
  archived_at?: string; // null = đang hoạt động
  // ... các trường khác
}

interface TaskActivity {
  id?: number;
  task_id: string;
  user_id?: string;
  action: TaskActivityAction;
  old_value?: string;
  new_value?: string;
  description?: string;
  created_at?: string;
  created_by_user_id?: string;
  created_by_user_name?: string;
}

type TaskActivityAction =
  | 'created' | 'status_changed' | 'archived' | 'restored'
  | 'commented' | 'assigned' | 'title_changed' | 'description_changed';
```

---

## Tính Năng Archive

### Tab Navigation

Trang `/tasks` có 3 tab:
- **Đang Hoạt Động** — tasks chưa archive (`archived_at IS NULL`)
- **Đã Lưu Trữ** — tasks đã archive (list view)
- **Tất Cả** — cả hai nhóm

### Thao Tác

| Nút | Hành động |
|-----|-----------|
| 📦 (xanh) | Archive task |
| ↻ (xanh lá) | Restore từ archive |
| 🗑️ | Xóa task đã archive |

### Auto-Archive (tương lai)

Utility `shouldAutoArchive(task)` trong `src/lib/archive-utils.ts` đã sẵn sàng — kiểm tra task `done` sau 3 ngày. Cần server-side trigger (cron job hoặc API endpoint `/api/tasks/auto-archive`) để tự động hóa.

---

## API Client (`src/lib/api-client.ts`)

```typescript
fetchTaskActivities(taskId: string)     // GET activity logs
recordTaskActivity(taskId: string, data) // POST activity log
generateTaskCode()                       // POST generate code
archiveTask(id: string)                  // PUT archived_at = now
restoreTask(id: string)                  // PUT archived_at = null
```

---

## UI Components

| Component | File | Mô tả |
|-----------|------|-------|
| `TasksClient` | `src/app/tasks/components/TasksClient.tsx` | Kanban chính + tab archive |
| `ActivityLogModal` | `src/app/tasks/components/ActivityLogModal.tsx` | Modal timeline hoạt động |

### Eye Icon (👁️)

Hiển thị trên mỗi task card (cả kanban và list view). Click mở `ActivityLogModal` với đầy đủ timeline.

---

## Danh Sách File Liên Quan

| File | Mô tả |
|------|-------|
| `src/lib/task-utils.ts` | Task code + activity utilities |
| `src/lib/archive-utils.ts` | Archive helper functions |
| `src/lib/api-client.ts` | API client functions |
| `src/app/api/tasks/[id]/activities/route.ts` | Activity log endpoints |
| `src/app/api/tasks/generate-code/route.ts` | Task code generation |
| `src/app/tasks/components/ActivityLogModal.tsx` | Modal timeline |
| `src/migrations/add_task_activity_logs.sql` | Migration activities |
| `src/migrations/add_archived_at_to_tasks.sql` | Migration archive |
