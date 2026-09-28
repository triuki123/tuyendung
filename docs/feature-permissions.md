# Hệ Thống Phân Quyền Module

**Cập nhật:** 2026-05-27

---

## Tổng Quan

Hệ thống phân quyền module cho phép kiểm soát truy cập chi tiết tới các tính năng dựa trên quyền người dùng. Mỗi người dùng có thể được gán quyền cụ thể cho từng module, lưu trữ trong cột `module_permissions` (JSONB) của bảng `users`.

---

## Kiến Trúc

```
Browser
  └─ Component (PermissionsPanel)
       └─ Hook (useUserPermissions)
            └─ API /api/users/[id] (PUT)
                 └─ Middleware (checkPermission)
                      └─ Service (usersService)
                           └─ pg Pool (src/lib/db.ts)
                                └─ PostgreSQL users.module_permissions (JSONB)
```

---

## Các Module & Quyền Hỗ Trợ

Định nghĩa trong `src/lib/modules.ts`:

| Module | ID | view | create | edit | delete | approve | export |
|--------|----|:----:|:------:|:----:|:------:|:-------:|:------:|
| Bảng Điều Khiển | `dashboard` | ✓ | | | | | ✓ |
| Quản Lý Tài Sản | `asset-management` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| Phần Cứng | `hardware` | ✓ | ✓ | ✓ | ✓ | | |
| Phần Mềm | `software` | ✓ | ✓ | ✓ | ✓ | | |
| Ticket Hỗ Trợ | `tickets` | ✓ | ✓ | ✓ | | ✓ | |
| Nhiệm Vụ | `tasks` | ✓ | ✓ | ✓ | ✓ | | |
| Đặt Phòng | `room-bookings` | ✓ | ✓ | ✓ | | ✓ | |
| Tổ Chức | `organization` | ✓ | ✓ | ✓ | ✓ | | |
| Người Dùng | `users` | ✓ | ✓ | ✓ | ✓ | | |
| Cài Đặt | `settings` | ✓ | | ✓ | | | |
| Lịch Sử | `history` | ✓ | | | | | ✓ |

---

## Database Schema

Cột `module_permissions` được thêm vào bảng `users`:

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS module_permissions JSONB DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_users_module_permissions
  ON users USING GIN (module_permissions);
```

File migration: `migrations/023_add_module_permissions_to_users.sql`

Để áp dụng migration trên Postgres tự-host:
```bash
psql "$DATABASE_URL" -f migrations/023_add_module_permissions_to_users.sql
```

---

## Cấu Trúc Dữ Liệu

```json
{
  "dashboard": ["view", "export"],
  "asset-management": ["view", "create", "edit", "export"],
  "hardware": ["view", "create", "edit"],
  "software": ["view"],
  "tickets": ["view", "create", "edit", "approve"],
  "tasks": ["view", "create", "edit"],
  "room-bookings": ["view", "create", "edit", "approve"],
  "organization": ["view", "create", "edit"],
  "users": ["view", "create", "edit"],
  "settings": ["view"],
  "history": ["view", "export"]
}
```

---

## Quyền Mặc Định Theo Role

| Role | Mô tả |
|------|-------|
| `super_admin` | Tất cả quyền cho tất cả modules |
| `admin` | Tất cả quyền TRỪ `delete` trên hầu hết modules; `settings` chỉ `view` |
| `manager` | Xem + tạo + sửa cho hầu hết modules |
| `user` | Chỉ `view` cho tất cả modules |

Hàm lấy quyền mặc định: `getDefaultPermissions(role)` trong `src/lib/permissions.ts`.

---

## Utility Functions (`src/lib/permissions.ts`)

```typescript
canAccess(permissions, 'users', 'edit')              // boolean
hasModuleAccess(permissions, 'users')                 // boolean
getModulePermissions(permissions, 'users')            // PermissionAction[]
hasAllActions(permissions, 'users', ['view', 'edit']) // boolean
hasAnyAction(permissions, 'users', ['create', 'edit'])// boolean
getAccessibleModules(permissions)                      // string[]
countPermissions(permissions)                          // number
getDefaultPermissions(role)                            // UserModulePermissions
```

---

## Sử Dụng Trên Frontend

```typescript
'use client';
import { useUserPermissions } from '@/hooks/useUserPermissions';

export default function MyComponent({ user }) {
  const perms = useUserPermissions(user.module_permissions);

  return (
    <div>
      {perms.canAccess('users', 'edit') && (
        <button onClick={handleEdit}>Sửa Người Dùng</button>
      )}
      <button disabled={!perms.canAccess('users', 'delete')}>Xóa</button>
    </div>
  );
}
```

---

## Bảo Vệ API Route (`src/lib/api-permissions.ts`)

```typescript
import { checkPermission } from '@/lib/api-permissions';

export async function PUT(request, { params }) {
  const { id } = await params;

  const hasPermission = await checkPermission(request, {
    moduleId: 'users',
    requiredAction: 'edit'
  });

  if (!hasPermission) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const updated = await updateUser(id, body);
  return NextResponse.json(updated);
}
```

Permissions được đọc từ header `x-user-permissions` (JSON string) do client gửi lên.

---

## API Endpoint Kiểm Tra Quyền

**GET** `/api/permissions/check?moduleId=users&action=edit&permissions=<encoded_json>`

**POST** `/api/permissions/check`
```json
{
  "moduleId": "users",
  "action": "edit",
  "permissions": { "users": ["view", "edit"] }
}
```

Cả hai trả về: `{ "hasPermission": true | false }`

---

## Quản Lý Quyền Trong UI

**File:** `src/app/users/components/UsersModalTabside.tsx`

Form tạo/sửa người dùng có 3 tab:
- **Thông Tin** — thông tin cơ bản
- **Phân Quyền** — `PermissionsPanel.tsx` (checkbox từng module/action)
- **Mật Khẩu** — đổi mật khẩu

Tự động cập nhật quyền mặc định khi thay đổi role.

---

## Thêm Module Mới

Thêm vào mảng `MODULES` trong `src/lib/modules.ts`:

```typescript
{
  id: 'my-new-module',
  name: 'Module Mới',
  icon: '🆕',
  color: '#FF5733',
  description: 'Mô tả module',
  permissions: [
    { action: 'view',   label: 'Xem',  description: 'Xem module' },
    { action: 'create', label: 'Thêm', description: 'Tạo mục mới' },
    { action: 'edit',   label: 'Sửa',  description: 'Chỉnh sửa mục' },
    { action: 'delete', label: 'Xóa',  description: 'Xóa mục' },
  ],
  order: 12,
}
```

---

## Danh Sách File Liên Quan

| File | Mô tả |
|------|-------|
| `src/lib/modules.ts` | Định nghĩa 11 modules |
| `src/lib/permissions.ts` | Utility functions |
| `src/lib/api-permissions.ts` | Middleware bảo vệ API |
| `src/hooks/useUserPermissions.ts` | React hook |
| `src/lib/services/usersService.ts` | Service layer |
| `src/app/users/components/PermissionsPanel.tsx` | UI panel |
| `src/app/users/components/UsersModalTabside.tsx` | Form 3-tab |
| `src/app/api/permissions/check/route.ts` | Endpoint kiểm tra |
| `migrations/023_add_module_permissions_to_users.sql` | Migration |
