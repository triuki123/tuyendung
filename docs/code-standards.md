# AssetFlow Pro — Quy Chuẩn Code & Cấu Trúc Dự Án

**Phiên bản:** 1.0  
**Cập nhật:** 2026-05-27  
**Áp dụng cho:** src/ codebase

---

## 📂 Cấu Trúc Thư Mục & Tệp

### File Naming Conventions

| Loại File | Quy Tắc | Ví Dụ |
|-----------|--------|------|
| **Component React** | PascalCase (.tsx) | `AssetModal.tsx`, `UserPermissionsPanel.tsx` |
| **Service/Utility** | camelCase (.ts) | `usersService.ts`, `emailService.ts`, `cache.ts` |
| **Hook Custom** | camelCase + use prefix (.ts) | `useUserPermissions.ts` |
| **API Route Handler** | route.ts in directory | `src/app/api/users/route.ts` |
| **Page Component** | page.tsx (Next.js convention) | `src/app/dashboard/page.tsx` |
| **Context** | PascalCase + Context suffix (.tsx) | `NotificationContext.tsx` |
| **Type/Interface** | PascalCase (.ts in same file) | Định nghĩa trong file sử dụng |
| **Database Migration** | numbered_snake_case.sql | `023_add_module_permissions_to_users.sql` |

### Directory Organization

```
src/
├── app/
│   ├── {feature-name}/                # Feature folder
│   │   ├── page.tsx                   # Feature main page
│   │   ├── [id]/
│   │   │   └── page.tsx               # Detail/edit page
│   │   ├── admin/
│   │   │   └── page.tsx               # Admin-specific view (if needed)
│   │   └── components/
│   │       ├── {Feature}Modal.tsx     # Feature modal (create/edit)
│   │       ├── {Feature}Table.tsx     # Feature list table
│   │       ├── {Feature}Filters.tsx   # Filter controls
│   │       └── ...                    # Other feature-specific components
│   └── api/
│       └── {feature-name}/
│           ├── route.ts               # GET, POST (collection)
│           └── [id]/
│               └── route.ts           # GET, PUT, DELETE (item)
├── components/
│   ├── ui/                            # Primitive UI components
│   │   ├── AppIcon.tsx                # Icon wrapper
│   │   ├── AppImage.tsx               # Image wrapper
│   │   ├── ConfirmModal.tsx           # Reusable confirm dialog
│   │   └── ...
│   ├── AppLayout.tsx                  # Main app layout
│   ├── Sidebar.tsx                    # Navigation sidebar
│   └── ...                            # Other shared components
├── context/
│   └── NotificationContext.tsx        # Global state (if any)
├── hooks/
│   └── useUserPermissions.ts          # Custom hooks
├── lib/
│   ├── db.ts                          # pg Pool + query/queryOne/execute helpers
│   ├── modules.ts                     # Module definitions
│   ├── permissions.ts                 # Permission checking
│   ├── api-permissions.ts             # API middleware
│   ├── authStore.ts                   # Auth state
│   ├── usersStore.ts                  # User cache
│   ├── cache.ts                       # Caching utilities
│   ├── slug-utils.ts                  # Slug helpers
│   ├── task-utils.ts                  # Task utilities
│   ├── archive-utils.ts               # Archive operations
│   ├── notificationHelper.ts          # Notification creation
│   ├── api-client.ts                  # API wrapper
│   ├── mockData.ts                    # Test data
│   ├── zimbra/                        # External service: Zimbra Admin SOAP integration
│   │   ├── config.ts                  # Configuration loader (validates env vars)
│   │   ├── types.ts                   # Type definitions (ZimbraConfig, ZimbraError, etc.)
│   │   ├── soap-client.ts             # HTTPS client with token cache (single-flight pattern)
│   │   └── require-zimbra-admin.ts    # Permission guard (role check + header validation)
│   └── services/
│       ├── usersService.ts            # User CRUD + operations
│       ├── auditService.ts            # Audit logging
│       ├── emailService.ts            # Email delivery
│       ├── zimbra-service.ts          # Zimbra business logic (8 exported functions)
│       ├── zimbraService.ts           # Barrel re-export shim (legacy naming)
│       ├── companiesService.ts        # Company management
│       ├── departmentsService.ts      # Department management
│       └── ...                        # Other domain services
└── styles/                            # Global styles (via Tailwind)
```

---

## 🔤 Naming & Case Conventions

### TypeScript/JavaScript Files

| Element | Convention | Example |
|---------|-----------|---------|
| Component | PascalCase | `AssetModal`, `UserFilters` |
| Function | camelCase | `getAssetById()`, `createUser()` |
| Constant | UPPER_SNAKE_CASE | `MAX_ASSET_VALUE`, `DEFAULT_ROLE` |
| Variable | camelCase | `currentUser`, `assetList` |
| Hook | useXxx format | `useUserPermissions`, `useFetchAssets` |
| Service | xxxService format | `usersService`, `emailService` |
| Type/Interface | PascalCase | `User`, `Asset`, `AssetModalProps` |
| Enum | PascalCase | `AssetStatus`, `UserRole` |

### CSS & Tailwind

- Use Tailwind utility classes directly in JSX
- No inline CSS objects (use `className` string)
- Responsive prefixes: `md:`, `lg:`, `sm:` (mobile-first)
- Custom CSS variables: `var(--primary)` (Navy), `var(--accent)` (Red)

### Database & SQL

- Table names: plural_snake_case → `users`, `asset_categories`, `room_bookings`
- Column names: snake_case → `user_id`, `created_at`, `module_permissions`
- Migration files: numbered_descriptive_snake_case.sql → `023_add_module_permissions_to_users.sql`
- Index names: idx_{table}_{columns} → `idx_users_module_permissions`
- Constraint names: Implicit (auto-generated by PostgreSQL)

---

## 🏗️ Next.js App Router Pattern

### Page Structure
```tsx
// src/app/users/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { User } from '@/lib/db';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import UsersClient from './components/UsersClient';
import AppLayout from '@/components/AppLayout';

export default function UsersPage() {
  const { hasPermission } = useUserPermissions();
  
  // Check permission
  if (!hasPermission('users', 'view')) {
    return <div>Không có quyền truy cập</div>;
  }
  
  return (
    <AppLayout>
      <UsersClient />
    </AppLayout>
  );
}
```

### Layout Structure
```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AssetFlow Pro',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        {children}
      </body>
    </html>
  );
}
```

### API Route Handler Pattern
```tsx
// src/app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkPermission } from '@/lib/api-permissions';

export async function GET(request: NextRequest) {
  try {
    // 1. Check permission
    const permissionCheck = await checkPermission(request, 'users', 'view');
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { error: 'Không có quyền' },
        { status: 403 }
      );
    }

    // 2. Query database
    const data = await query('SELECT * FROM users ORDER BY created_at DESC');

    // 3. Return response
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/users error:', err);
    return NextResponse.json(
      { error: 'Lỗi server' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Check permission
    const permissionCheck = await checkPermission(request, 'users', 'create');
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { error: 'Không có quyền' },
        { status: 403 }
      );
    }

    // 2. Parse body
    const body = await request.json();

    // 3. Validate input
    if (!body.email || !body.name) {
      return NextResponse.json(
        { error: 'Email và tên không được để trống' },
        { status: 400 }
      );
    }

    // 4. Call service layer
    const newUser = await usersService.createUser(body);

    // 5. Return response
    return NextResponse.json({ success: true, data: newUser });
  } catch (err) {
    console.error('POST /api/users error:', err);
    return NextResponse.json(
      { error: 'Lỗi server' },
      { status: 500 }
    );
  }
}
```

### API Route with ID Pattern
```tsx
// src/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await queryOne('SELECT * FROM users WHERE id = $1', [params.id]);

    if (!data) {
      return NextResponse.json(
        { error: 'Không tìm thấy' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(`GET /api/users/${params.id} error:`, err);
    return NextResponse.json(
      { error: 'Lỗi server' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Similar structure to POST, but updates existing record
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Similar structure, deletes record
}
```

---

## 🎯 Service Layer Pattern

### Service File Structure
```typescript
// src/lib/services/usersService.ts
import { query, queryOne, execute, buildInsert, buildUpdateById, User } from '@/lib/db';

/**
 * Get all users with optional filters
 */
export async function getUsers(filters?: {
  role?: string;
  status?: string;
  search?: string;
}): Promise<User[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters?.role) {
    conditions.push(`role = $${idx++}`);
    params.push(filters.role);
  }
  if (filters?.search) {
    conditions.push(`name ILIKE $${idx++}`);
    params.push(`%${filters.search}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return query<User>(`SELECT * FROM users ${where} ORDER BY created_at DESC`, params);
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
}

/**
 * Create new user
 */
export async function createUser(userData: Partial<User>): Promise<User> {
  const { text, params } = buildInsert('users', userData);
  const rows = await query<User>(text, params);
  return rows[0];
}

/**
 * Update user
 */
export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
  const { text, params } = buildUpdateById('users', id, updates);
  const rows = await query<User>(text, params);
  return rows[0];
}

/**
 * Delete user
 */
export async function deleteUser(id: string): Promise<void> {
  await execute('DELETE FROM users WHERE id = $1', [id]);
}
```

---

## 🔐 RBAC & Permission Checking

### Client-Side Permission Check
```typescript
// src/hooks/useUserPermissions.ts
import { getCurrentUser } from '@/lib/authStore';
import { hasModulePermission } from '@/lib/permissions';

export function useUserPermissions() {
  const user = getCurrentUser();

  const hasPermission = (module: string, action: string): boolean => {
    if (!user) return false;
    return hasModulePermission(user, module, action);
  };

  return { hasPermission, user };
}

// Usage in component
function AssetList() {
  const { hasPermission } = useUserPermissions();

  if (!hasPermission('asset_management', 'view')) {
    return <div>Không có quyền</div>;
  }

  return <div>Asset list...</div>;
}
```

### Server-Side Permission Check
```typescript
// src/lib/api-permissions.ts
import { NextRequest } from 'next/server';
import { queryOne, User } from '@/lib/db';
import { hasModulePermission } from '@/lib/permissions';

export async function checkPermission(
  request: NextRequest,
  module: string,
  action: string
) {
  try {
    // 1. Get user ID from auth header or session
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return { allowed: false, error: 'Không được phép' };
    }

    // 2. Fetch user from database
    const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [userId]);

    if (!user) {
      return { allowed: false, error: 'Không tìm thấy người dùng' };
    }

    // 3. Check permission
    const allowed = hasModulePermission(user, module, action);

    return { allowed, user };
  } catch (err) {
    console.error('Permission check error:', err);
    return { allowed: false, error: 'Lỗi kiểm tra quyền' };
  }
}
```

### Module Permission Matrix (src/lib/modules.ts)
```typescript
export const MODULES = {
  dashboard: {
    name: 'Bảng Điều Khiển',
    actions: ['view', 'export'],
  },
  asset_management: {
    name: 'Quản Lý Tài Sản',
    actions: ['view', 'create', 'edit', 'delete', 'export'],
  },
  // ... 9 more modules
};

export type UserModulePermissions = {
  [module: string]: string[]; // array of actions
};
```

---

## 🎨 Component Best Practices

### Functional Component with Props
```tsx
// src/app/users/components/UserModal.tsx
'use client';

import { useState } from 'react';
import { User } from '@/lib/db';

interface UserModalProps {
  isOpen: boolean;
  user?: User;
  onClose: () => void;
  onSave: (user: User) => Promise<void>;
}

export default function UserModal({
  isOpen,
  user,
  onClose,
  onSave,
}: UserModalProps) {
  const [formData, setFormData] = useState<Partial<User>>(
    user || {
      email: '',
      name: '',
      role: 'user',
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await onSave(formData as User);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-lg w-96"
      >
        <h2 className="text-xl font-bold mb-4">
          {user ? 'Sửa Người Dùng' : 'Tạo Người Dùng'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={formData.email || ''}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Tên</label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Đang lưu...' : 'Lưu'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-200 py-2 rounded"
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## ✅ Error Handling & Validation

### API Route Error Handling
```typescript
export async function POST(request: NextRequest) {
  try {
    // ... implementation

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/endpoint error:', err);
    
    // Type-safe error handling
    if (err instanceof TypeError) {
      return NextResponse.json(
        { error: 'Dữ liệu không hợp lệ' },
        { status: 400 }
      );
    }

    if (err instanceof Error && err.message.includes('permission')) {
      return NextResponse.json(
        { error: 'Không có quyền' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Lỗi server' },
      { status: 500 }
    );
  }
}
```

### Client-Side Error Handling
```typescript
async function saveUser(user: User) {
  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Lỗi không xác định');
    }

    const result = await response.json();
    return result.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Có lỗi xảy ra';
    console.error('Save user error:', message);
    throw err;
  }
}
```

---

## 📋 TypeScript Best Practices

### Type Definitions
```typescript
// Define in same file as usage or in types.ts if shared
interface User {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'manager' | 'user';
  module_permissions?: Record<string, string[]>;
  created_at: string;
  updated_at: string;
}

// Readonly for immutable data
interface Asset {
  readonly id: string;
  readonly name: string;
  value: number; // Mutable
}

// Utility types
type UserPreview = Omit<User, 'password_hash' | 'module_permissions'>;
type CreateUserInput = Pick<User, 'email' | 'name' | 'role'>;
```

### Function Signatures
```typescript
// Always specify return type
export function getUser(id: string): Promise<User | null> {
  // ...
}

// Use union types for alternatives
export function processRequest(
  data: string | Buffer
): Promise<string | Error> {
  // ...
}

// Generics for reusable functions
export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number
): { items: T[]; total: number } {
  // ...
}
```

---

## 🧪 Testing & Debugging

### Logging Standards
```typescript
// Use descriptive context
console.error('GET /api/users error:', err);
console.log('User created:', { id: newUser.id, email: newUser.email });
console.warn('Slow query detected:', { duration: 2000, query: 'SELECT ...' });

// Never log sensitive data
// ❌ WRONG: console.log('Password:', password);
// ✅ RIGHT: console.log('User authenticated:', userId);
```

### Debug Mode (Optional)
```typescript
// Prefix debug logs with [DEBUG]
if (process.env.DEBUG === 'true') {
  console.log('[DEBUG] Permission check:', { userId, module, action });
}
```

---

## 🚀 Performance Optimization

### Data Fetching
- Use pagination for large datasets (50 items per page typical)
- Implement lazy loading for tables
- Cache frequent queries in memory (cache.ts utilities)
- Use indexes on frequently filtered columns (see migrations)

### Component Optimization
- Use `React.memo()` for expensive components
- Avoid inline function definitions in render
- Use `useCallback` for event handlers passed as props
- Split large components (>300 LOC) into smaller ones

### Bundle Size
- Import only needed utilities: `import { getUser } from '@/lib/services/usersService'`
- Lazy load routes with `dynamic()` if needed
- Use tree-shaking: export named exports, not default

---

## 🔌 External Service Integration Pattern

For integrating third-party services (e.g., mail servers, payment APIs), use this layered structure:

```
src/lib/{service}/
├── config.ts              # Load & validate env vars (throw early)
├── types.ts               # Type definitions & error classes
├── {service}-client.ts    # Protocol client (HTTPS, token cache, retry)
└── require-{service}-auth.ts  # Permission guard (role check from DB)

src/lib/services/
├── {service}-service.ts   # Business logic (LDAP escaping, hashing, etc.)
└── {service}Service.ts    # Barrel re-export (legacy naming)
```

**See `docs/feature-zimbra.md` for Zimbra SOAP integration example** — demonstrates two-variable single-flight token cache pattern, LDAP escaping, and audit logging.

---

## 📝 Code Review Checklist

Before pushing, verify:

- [ ] No hardcoded credentials or API keys in code
- [ ] All error cases have try/catch
- [ ] Permission checks on sensitive endpoints
- [ ] Logging doesn't expose sensitive data
- [ ] TypeScript types are explicit (no `any` without comment)
- [ ] Component files < 300 lines (consider splitting)
- [ ] Service files properly documented with JSDoc
- [ ] No console.log remaining (use proper logging)
- [ ] Tests pass locally (if applicable)
- [ ] No linting errors: `npm run lint`
- [ ] Code formatted: `npm run format`

---

## 🔗 Related Documentation

- **System Architecture** → `/docs/system-architecture.md`
- **RBAC/Permissions** → `/docs/project-overview-pdr.md` (Module Permissions section)
- **Codebase Structure** → `/docs/codebase-summary.md`
- **Deployment** → `/docs/deployment-guide.md`
