# AssetFlow Pro — Kiến Trúc Hệ Thống

**Phiên bản:** 2.0
**Cập nhật:** 2026-05-27

---

## Tổng Quan Kiến Trúc

AssetFlow Pro được xây dựng theo kiến trúc **3-tier** với Next.js App Router:

1. **Presentation Layer** — React Components (Next.js App Router, client + server components)
2. **Application/API Layer** — Next.js Route Handlers (`/app/api/*`)
3. **Data Layer** — PostgreSQL 16 qua `pg` Pool (`src/lib/db.ts`)

```
┌─────────────────────────────────────────────┐
│           Browser (Web Client)              │
│  React Components (App Router)              │
│  Pages, Forms, Tables, Modals               │
└──────────────────┬──────────────────────────┘
                   │ HTTPS / fetch()
        ┌──────────▼──────────┐
        │   Next.js Server    │
        │  ┌───────────────┐  │
        │  │ Route Handlers│  │
        │  │   /api/*      │  │
        │  └──────┬────────┘  │
        │         │           │
        │  ┌──────▼────────┐  │
        │  │ Service Layer │  │
        │  │ src/lib/      │  │
        │  │ services/     │  │
        │  └──────┬────────┘  │
        │         │           │
        │  ┌──────▼────────┐  │
        │  │  pg Pool      │  │
        │  │ src/lib/db.ts │  │
        └──┴──────┬─────────┘
                  │ TCP (DATABASE_URL)
        ┌─────────▼───────────┐
        │  PostgreSQL 16      │
        │  (Docker container  │
        │   assetflow-db)     │
        │  Tables, Indexes    │
        └─────────────────────┘
```

---

## Stack Kỹ Thuật

| Thành phần | Công nghệ | Ghi chú |
|-----------|-----------|---------|
| Framework | Next.js 13.5.6 (App Router) | |
| Language | TypeScript | strict mode |
| Database | PostgreSQL 16 | Docker `postgres:16-alpine` |
| DB Client | `pg` (node-postgres) | Pool + helpers tại `src/lib/db.ts` |
| Auth | Custom session (localStorage) | Mật khẩu so sánh plain-text hiện tại |
| Email | AWS SES (`@aws-sdk/client-ses`) | Tùy chọn, dùng cho password reset |
| Mail Admin | Zimbra Admin SOAP API (HTTPS :7071) | Tùy chọn, quản trị domain/group/account |
| Styling | Tailwind CSS + CSS variables | |
| Container | Docker Compose | 2 services: `app` + `db` |
| QR | qrcode.react + html5-qrcode + jsqr | |
| State | React Context + localStorage | |

---

## Data Layer — `src/lib/db.ts`

Module trung tâm cho tất cả truy vấn database. Không dùng ORM.

### Connection Pool

```typescript
// Ưu tiên DATABASE_URL; fallback về biến PG* rời
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
```

### Helper Functions

| Hàm | Mô tả |
|-----|-------|
| `query<T>(text, params)` | Trả về `T[]` — dùng cho SELECT nhiều hàng |
| `queryOne<T>(text, params)` | Trả về `T \| null` — dùng cho SELECT một hàng |
| `execute(text, params)` | Trả về `rowCount` — dùng cho INSERT/UPDATE/DELETE không cần RETURNING |
| `withTransaction(fn)` | Chạy nhiều câu lệnh trong một transaction, tự động COMMIT/ROLLBACK |
| `buildInsert(table, data)` | Tạo `INSERT ... RETURNING *` từ object |
| `buildUpdateById(table, id, data)` | Tạo `UPDATE ... WHERE id = $n RETURNING *` từ object |

---

## Data Flow — Authentication

Xác thực hiện tại dùng so sánh mật khẩu plain-text. Chưa có bcrypt.

```
User nhập email + password
  └─ POST /api/auth/login { email, password }
       └─ getUserByEmail(email)  →  SELECT * FROM users WHERE email = $1
       └─ user.password !== password  →  401
       └─ user.status === 'inactive'  →  401
       └─ updateLastLogin(user.id)
       └─ Trả về user object
            └─ Frontend lưu vào localStorage (key: 'assetflow_auth')
```

> Mật khẩu hiện lưu plain-text trong cột `users.password`. Migration sang bcrypt là việc cần làm trước khi production.

---

## Data Flow — CRUD Tài Sản

```
GET /api/assets
  └─ checkPermission(request, 'asset-management', 'view')
  └─ assetService.searchAssets(filters)
       └─ query<Asset>('SELECT * FROM assets WHERE ... LIMIT $n OFFSET $m', [...])
  └─ Trả về { data: Asset[], total, page, pageSize }

POST /api/assets
  └─ checkPermission(request, 'asset-management', 'create')
  └─ assetService.createAsset(body)
       └─ buildInsert('assets', data) → INSERT ... RETURNING *
       └─ auditService.createAssetLog(...)
  └─ Trả về asset mới
```

---

## Data Flow — Kiểm Tra Quyền

```
Client-side (UI):
  useUserPermissions(user.module_permissions)
    → canAccess('assets', 'delete')  →  ẩn/hiện nút

Server-side (API Middleware):
  checkPermission(request, { moduleId: 'assets', requiredAction: 'delete' })
    → Đọc header 'x-user-permissions'
    → canAccess(permissions, moduleId, action)
    → false  →  403 Forbidden
    → true   →  tiếp tục handler
```

---

## Authentication & Authorization

### Authentication
- **Phương thức:** Custom — so sánh password trong bảng `users`
- **Session:** User object lưu trong `localStorage` (key: `assetflow_auth`), đọc bởi `src/lib/authStore.ts`
- **Lưu ý:** Mật khẩu hiện plain-text. Chưa có JWT hay session token phía server.

### Authorization
- **Model:** RBAC + Module Permissions
- **Roles:** `super_admin`, `admin`, `manager`, `user`
- **Module Permissions:** Granular per-module actions lưu trong `users.module_permissions` (JSONB)
- **Chi tiết:** xem `docs/feature-permissions.md`

---

## Database Schema — Bảng Chính

```
users
├── id, email, name, password (plain-text hiện tại)
├── role: super_admin|admin|manager|user
├── module_permissions JSONB
├── company_id, department_id, position_id (FK)
├── manager_id (self-ref FK)
├── status: active|inactive
└── tags JSONB

assets
├── id, name, type, status, value
├── assigned_to FK→users
├── company_id, department_id FK
└── created_at, updated_at

companies ←→ departments ←→ sub_departments
                          ←→ job_titles

tickets
├── id, title, description, status, priority
├── assigned_to FK→users, reporter FK→users
└── ticket_status_history (1:N)

tasks
├── id, title, status, priority
├── task_code VARCHAR(20) UNIQUE    -- Task-ddmmyyyy-0001
├── archived_at TIMESTAMP NULL
└── task_activities (1:N)

task_activities
├── task_id FK→tasks, action, old_value, new_value
└── created_by_user_id, created_by_user_name

room_bookings
├── room_id FK→rooms, booked_by FK→users
├── date, start_time, end_time
└── checkin_time, checkout_time, status

audit_logs
├── admin_id, target_user_id, action, details
├── asset_id, asset_code, asset_name, asset_type
└── timestamp (immutable — không UPDATE/DELETE)

delete_requests
├── entity_type, entity_id, reason
├── status: pending|approved|rejected
└── requested_by FK→users, approved_by FK→users

notifications
├── user_id FK→users, type, title, message
├── action_url, is_read
└── created_at

password_reset_tokens
├── user_id FK→users, email, token (UNIQUE)
├── expires_at (24h), used BOOLEAN
└── created_at
```

---

## Email Service

- **File:** `src/lib/services/emailService.ts`
- **Provider:** AWS SES (`@aws-sdk/client-ses`)
- **Use case hiện tại:** Password reset (route này còn dùng Supabase — xem `docs/feature-password-reset.md`)
- **Env vars:** `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`

---

## Zimbra Mail Administration

Tích hợp ngoài thứ hai bên cạnh AWS SES. Kết nối **Zimbra Admin SOAP API** qua HTTPS (cổng 7071).

### Data Flow

```
API Route /api/zimbra/*
  └── requireZimbraAdmin(req)
        ├── Đọc header x-current-user-id
        ├── SELECT role FROM users WHERE id=$1 AND status='active'
        └── role NOT IN (super_admin, admin)  →  403

  └── zimbra-service.ts (listDomains / searchAccounts / resetPassword / ...)
        └── callAdmin(op, payload)  [soap-client.ts]
              ├── getToken()
              │     ├── tokenPromise đang chờ?  →  await (single-flight)
              │     ├── token còn hạn?          →  return cached
              │     └── AuthRequest HTTPS POST  →  lấy authToken mới
              └── POST HTTPS  →  Zimbra Server (:7071)
                    └── lỗi AUTH_EXPIRED?  →  xóa cache, retry 1 lần
```

### Module Structure

| File | Vai trò | LOC |
|------|---------|-----|
| `src/lib/zimbra/config.ts` | Đọc và validate `ZIMBRA_*` env vars | 23 |
| `src/lib/zimbra/types.ts` | `ZimbraConfig`, `ZimbraError`, `ZimbraDomain`, `ZimbraAccount`, `ZimbraDistributionList` | 34 |
| `src/lib/zimbra/soap-client.ts` | HTTPS POST + token cache (two-variable single-flight: `inflight` + `cached`) | 151 |
| `src/lib/zimbra/require-zimbra-admin.ts` | Guard: kiểm tra header x-current-user-id + role từ DB (super_admin/admin) | 23 |
| `src/lib/services/zimbra-service.ts` | Business logic — 8 hàm exported (listDomains, listGroups, searchAccounts, createAccount, resetPassword, addGroupMember, removeGroupMember, helpers) | 136 |
| `src/lib/services/zimbraService.ts` | Barrel shim: `export * from './zimbra-service'` | 4 |

**Biến môi trường:**
- **Bắt buộc:** `ZIMBRA_ADMIN_URL`, `ZIMBRA_ADMIN_USER`, `ZIMBRA_ADMIN_PASSWORD`
- **Tùy chọn:** `ZIMBRA_TLS_REJECT_UNAUTHORIZED` (mặc định true), `ZIMBRA_CA_CERT`, `ZIMBRA_DEFAULT_PASSWORD_SUFFIX` (mặc định @123)

**Audit Log Actions** (4 action types được ghi vào audit_logs):
- `zimbra_account_created` — Khi tạo tài khoản mới
- `zimbra_password_reset` — Khi đặt lại mật khẩu
- `zimbra_member_added` — Khi thêm thành viên vào nhóm
- `zimbra_member_removed` — Khi xóa thành viên khỏi nhóm

Chi tiết đầy đủ: `docs/feature-zimbra.md`

---

## Notification System

Thông báo in-app quản lý qua React Context (in-memory, reset khi reload).

```
Action xảy ra → addNotification() → NotificationContext
  → NotificationPanel (dropdown)
  → Topbar Bell icon (badge unread count)
```

Bảng `notifications` trong database đã có — persistent storage là bước tiếp theo. Chi tiết: `docs/feature-notifications.md`.

---

## QR Code System

| Thư viện | Mục đích |
|---------|---------|
| `qrcode.react` | Tạo QR code (asset ID, room check-in) |
| `html5-qrcode` | Quét QR qua webcam |
| `jsqr` | Parse dữ liệu QR |

Flow: Scan QR → parse asset ID → redirect `/asset-management/[asset-id]`

---

## Deployment Architecture

```
docker compose up -d --build
  ├── assetflow-db (postgres:16-alpine, port 5432)
  │     └── Volume db-data (persistent)
  │     └── Init: docker/postgres/init/*.sql (lần đầu)
  └── assetflow-app (Next.js standalone, port 4028)
        └── depends_on: db (healthy)
        └── DATABASE_URL → db:5432
```

App build: Next.js standalone (`node server.js`), image `node:20-alpine`.

Chi tiết deployment: `docs/deployment-guide.md`.

---

## Observability

- **Client-side:** Browser console
- **Server-side:** `docker compose logs -f app`
- **Database:** `docker compose logs -f db`; query trực tiếp qua `psql "$DATABASE_URL"`
- **Audit trail:** Bảng `audit_logs` (immutable)

---

## API Convention

```
GET    /api/{resource}          List (paginated)
POST   /api/{resource}          Create
GET    /api/{resource}/[id]     Read detail
PUT    /api/{resource}/[id]     Update
DELETE /api/{resource}/[id]     Delete
```

Response format chuẩn:
```json
{
  "success": true,
  "data": {},
  "error": "message nếu lỗi",
  "total": 100,
  "page": 1,
  "pageSize": 50
}
```

HTTP status codes: `200` OK, `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `500` Server Error.

---

## Tài Liệu Liên Quan

| Tài liệu | Đường dẫn |
|---------|-----------|
| Hướng dẫn triển khai | `docs/deployment-guide.md` |
| Tóm tắt codebase | `docs/codebase-summary.md` |
| Chuẩn code | `docs/code-standards.md` |
| Project overview | `docs/project-overview-pdr.md` |
| Hệ thống phân quyền | `docs/feature-permissions.md` |
| Thông báo | `docs/feature-notifications.md` |
| Lịch sử hoạt động | `docs/feature-history.md` |
| Nhiệm vụ (Tasks) | `docs/feature-tasks.md` |
| Quên mật khẩu | `docs/feature-password-reset.md` |
| Quản trị Zimbra | `docs/feature-zimbra.md` |
| Nhận diện thương hiệu | `docs/brand-identity.md` |
