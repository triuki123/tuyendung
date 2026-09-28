# Hệ Thống Lịch Sử Hoạt Động

**Cập nhật:** 2026-05-27

---

## Tổng Quan

Module lịch sử ghi lại tất cả hoạt động tài sản và người dùng vào bảng `audit_logs`. Trang `/history` tổng hợp dữ liệu từ `audit_logs` và `delete_requests` thành một timeline thống nhất.

---

## Database Schema

### Bảng `audit_logs`

```sql
id           UUID PRIMARY KEY
admin_id     TEXT              -- người thực hiện hành động
target_user_id TEXT            -- người dùng mục tiêu (nếu có)
action       TEXT              -- loại hành động (asset_created, asset_updated, v.v.)
details      TEXT              -- mô tả chi tiết
asset_id     UUID              -- ID tài sản (nếu liên quan)
asset_code   VARCHAR           -- mã tài sản
asset_name   VARCHAR           -- tên tài sản
asset_type   VARCHAR           -- loại tài sản (hardware, software, v.v.)
timestamp    TIMESTAMP
created_at   TIMESTAMP
```

Migration: `migrations/004_create_audit_logs.sql` + `migrations/010_enhance_audit_logs.sql`

### Bảng `delete_requests`

Ghi lại yêu cầu xóa tài sản theo workflow phê duyệt:

```sql
id           UUID PRIMARY KEY
entity_type  TEXT
entity_id    UUID
reason       TEXT
status       TEXT  -- 'pending' | 'approved' | 'rejected'
requested_by TEXT  -- FK → users
approved_by  TEXT  -- FK → users
created_at   TIMESTAMP
```

---

## API Endpoints

### GET `/api/history`

Tổng hợp lịch sử từ `audit_logs` và `delete_requests`.

**Query params:**
- `limit` (mặc định: 500)
- `offset` (mặc định: 0)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "assetId": "uuid",
      "assetCode": "HW-001",
      "assetName": "Laptop Dell",
      "date": "2026-05-19T10:30:00Z",
      "action": "Nhập kho",
      "performedBy": "Admin User",
      "note": "Chi tiết hành động",
      "type": "audit|delete_request|asset_operation",
      "status": "approved|rejected|pending"
    }
  ],
  "count": 150,
  "offset": 0,
  "limit": 500
}
```

### GET `/api/assets/{id}/history`

Lịch sử chi tiết của một tài sản.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "date": "2026-05-19T10:30:00Z",
      "action": "Nhập kho",
      "performedBy": "Admin User",
      "note": "Tải tài sản từ nhà cung cấp"
    }
  ],
  "count": 5
}
```

---

## Ghi Log Hoạt Động

Helper service: `src/lib/services/auditService.ts`

```typescript
// Tạo tài sản
logActivity({
  admin_id: performedBy,
  action: 'asset_created',
  details: `Created asset: ${name} (${code})`,
  asset_id, asset_code, asset_name, asset_type,
  timestamp: new Date().toISOString(),
});

// Cập nhật tài sản
logActivity({
  admin_id: performedBy,
  action: 'asset_updated',
  details: `Updated asset ${code}: status: active → maintenance`,
  asset_id, asset_code, asset_name, asset_type,
  timestamp: new Date().toISOString(),
});
```

Các hàm helper có sẵn:

| Hàm | Mô tả |
|-----|-------|
| `createAssetLog()` | Log tạo tài sản |
| `updateAssetLog()` | Log cập nhật tài sản |
| `deleteAssetLog()` | Log xóa tài sản |
| `deleteAssetApprovedLog()` | Log duyệt xóa |
| `getActionColor()` | Màu hiển thị theo action |
| `getActionDisplayName()` | Tên hiển thị theo action |

---

## Workflow Xóa Tài Sản

```
Admin yêu cầu xóa → POST /api/delete-requests
  └─ status = 'pending', ghi delete_request

Super Admin xem xét → PUT /api/delete-requests/{id}
  ├─ Duyệt: status → 'approved'
  │    ├─ Ghi audit_log: action = 'asset_deleted_approved'
  │    ├─ Xóa tài sản khỏi bảng assets
  │    └─ Hiển thị trong /history
  └─ Từ chối: status → 'rejected'
       └─ Hiển thị trong /history
```

---

## Màu Sắc Theo Action

| Action | Màu | Hex |
|--------|-----|-----|
| Nhập kho | Emerald | `#10b981` |
| Cập nhật tài sản | Blue | `#3b82f6` |
| Xóa tài sản | Red | `#ef4444` |
| Xóa (Phê duyệt) | Red | `#ef4444` |
| Xóa (Từ chối) | Amber | `#f59e0b` |
| Tạo người dùng | Purple | `#a855f7` |
| Cập nhật người dùng | Violet | `#8b5cf6` |
| Zimbra: Tạo tài khoản | Purple | `#a855f7` |
| Zimbra: Đặt lại mật khẩu | Blue | `#3b82f6` |
| Zimbra: Thêm thành viên | Emerald | `#10b981` |
| Zimbra: Xóa thành viên | Amber | `#f59e0b` |

---

## UI Components

### Trang Lịch Sử (`/history`)

**Component:** `src/app/history/components/HistoryClient.tsx`

Tính năng:
- Hiển thị tất cả hoạt động theo timeline
- Tìm kiếm theo mã tài sản, tên, người thực hiện
- Lọc theo loại hành động
- Bộ lọc nâng cao (Advanced Filters)
- Stats Cards thống kê nhanh
- Responsive: mobile (card list) / desktop (table view)

### Drawer Lịch Sử Asset

**Component:** `src/app/asset-management/components/AssetHistoryDrawer.tsx`

Tính năng:
- Mở từ trang quản lý tài sản (Sidebar/Drawer)
- Timeline visualization cho từng tài sản
- Loading state và error handling

---

## Danh Sách File Liên Quan

| File | Mô tả |
|------|-------|
| `src/app/api/history/route.ts` | Endpoint lịch sử tổng hợp |
| `src/app/api/assets/[id]/history/route.ts` | Endpoint lịch sử tài sản |
| `src/lib/services/auditService.ts` | Helper ghi log |
| `src/app/history/components/HistoryClient.tsx` | Trang lịch sử |
| `src/app/asset-management/components/AssetHistoryDrawer.tsx` | Drawer lịch sử |
| `migrations/004_create_audit_logs.sql` | Tạo bảng audit_logs |
| `migrations/010_enhance_audit_logs.sql` | Mở rộng audit_logs |
| `migrations/001_create_delete_requests_table.sql` | Bảng delete_requests |

---

## Ghi Chú Bảo Mật

- Bảng `audit_logs` là **immutable** — không cho phép UPDATE hoặc DELETE
- Chỉ API routes (server-side) được phép ghi log
- Endpoint `/api/delete-requests` yêu cầu role `super_admin`
