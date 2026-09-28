# AssetFlow Pro — Bản Đồ Mã Nguồn

**Phiên bản:** 1.0  
**Cập nhật:** 2026-05-27  
**Cơ sở LOC:** ~42,000 (src/) + ~2,500 (migrations/)

---

## 📂 Cấu Trúc Thư Mục

```
assetflowpro/
├── src/
│   ├── app/                          # Next.js App Router (33K LOC)
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Home page (redirect logic)
│   │   ├── not-found.tsx             # 404 handler
│   │   ├── api/                      # API routes (24 directories)
│   │   │   ├── admin/*               # Admin endpoints (user password, migrations, config)
│   │   │   ├── auth/*                # Login, logout, forgot password, reset password
│   │   │   ├── assets/*              # Asset CRUD, search
│   │   │   ├── asset-categories/*    # Asset category CRUD
│   │   │   ├── hardware/*            # Hardware asset CRUD
│   │   │   ├── software/*            # Software asset CRUD
│   │   │   ├── zimbra/               # Zimbra mail admin (domains, groups, accounts, reset-password)
│   │   │   ├── domains/*             # Domain management CRUD
│   │   │   ├── email-accounts/*      # Email account CRUD
│   │   │   ├── organizations/*       # Company, department, org structure CRUD
│   │   │   ├── users/*               # User CRUD, search, permissions
│   │   │   ├── tickets/*             # Ticket CRUD, status history, comments
│   │   │   ├── tasks/*               # Task activity logs, code generation
│   │   │   ├── room-bookings/*       # Room booking CRUD, QR check-in
│   │   │   ├── rooms/*               # Room management CRUD
│   │   │   ├── tags/*                # Tag CRUD
│   │   │   ├── notifications/*       # Notification management
│   │   │   ├── delete-requests/*     # Delete request workflow
│   │   │   ├── dashboard/*           # Dashboard data endpoints
│   │   │   ├── history/*             # Audit log retrieval
│   │   │   ├── permissions/*         # Permission check endpoints
│   │   │   ├── setup/*               # Database setup
│   │   │   └── debug/*               # Debug endpoints
│   │   ├── asset-management/         # Asset management feature (3.5K)
│   │   │   ├── page.tsx              # Asset list page
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # Asset detail/edit page
│   │   │   ├── zimbra/               # Zimbra mail admin UI
│   │   │   │   ├── page.tsx          # Server component wrapper
│   │   │   │   └── components/
│   │   │   │       ├── ZimbraClient.tsx   # Tab navigation shell
│   │   │   │       ├── DomainsTab.tsx     # Domain list
│   │   │   │       ├── GroupsTab.tsx      # Distribution list + members
│   │   │   │       └── AccountsTab.tsx    # Account search/create/reset
│   │   │   └── components/
│   │   │       ├── AssetManagementSidebar.tsx  # Sidebar (includes Zimbra nav entry)
│   │   │       ├── AssetModal.tsx    # Create/edit asset modal
│   │   │       ├── AssetTable.tsx    # Asset table with columns
│   │   │       ├── AssetHistoryDrawer.tsx  # Asset history side panel
│   │   │       ├── AssetQRModal.tsx  # QR generation modal
│   │   │       └── AssetFilters.tsx  # Filter controls
│   │   ├── dashboard/                # Dashboard feature (2.8K)
│   │   │   ├── page.tsx              # Dashboard main page
│   │   │   └── components/
│   │   │       ├── AssetTrend.tsx    # Asset trend chart
│   │   │       ├── AssetValue.tsx    # Asset value chart
│   │   │       ├── Department.tsx    # Department distribution
│   │   │       ├── Maintenance.tsx   # Maintenance chart
│   │   │       ├── StatusPie.tsx     # Status pie chart
│   │   │       └── Alerts.tsx        # System alerts
│   │   ├── tickets/                  # Ticket feature (4.2K)
│   │   │   ├── page.tsx              # Ticket list (user view)
│   │   │   ├── admin/
│   │   │   │   └── page.tsx          # Admin ticket view with kanban
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # Ticket detail page
│   │   │   └── components/
│   │   │       ├── KanbanBoard.tsx   # Kanban board for admin
│   │   │       ├── TicketTable.tsx   # Ticket list table
│   │   │       ├── TicketModal.tsx   # Create/edit ticket modal
│   │   │       └── TicketFilters.tsx # Filter controls
│   │   ├── tasks/                    # Task feature (2.2K)
│   │   │   ├── page.tsx              # Task list
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # Task detail page
│   │   │   └── components/
│   │   │       ├── TasksClient.tsx   # Task list client component
│   │   │       ├── TaskActivityLogs.tsx  # Activity log display
│   │   │       └── CodeGenerator.tsx # Code generation modal
│   │   ├── room-bookings/            # Room booking feature (3.1K)
│   │   │   ├── page.tsx              # Booking calendar view
│   │   │   ├── day-view/
│   │   │   │   └── page.tsx          # Day view page
│   │   │   ├── list/
│   │   │   │   └── page.tsx          # List view page
│   │   │   ├── admin/
│   │   │   │   └── page.tsx          # Admin room management
│   │   │   └── components/
│   │   │       ├── CalendarView.tsx  # Calendar component
│   │   │       ├── DayView.tsx       # Day view component
│   │   │       ├── RoomBookingModal.tsx  # Booking modal
│   │   │       ├── QRCheckIn.tsx     # QR check-in flows (admin/attendee/confirm)
│   │   │       └── RoomUsageHistory.tsx  # Usage history
│   │   ├── organization/             # Organization feature (3.8K)
│   │   │   ├── page.tsx              # Org overview page
│   │   │   ├── companies/
│   │   │   │   └── page.tsx          # Company list/management
│   │   │   ├── departments/
│   │   │   │   └── page.tsx          # Department list/management
│   │   │   ├── structure/
│   │   │   │   └── page.tsx          # Org structure tree/chart
│   │   │   └── components/
│   │   │       ├── CompanyModal.tsx  # Company create/edit
│   │   │       ├── DepartmentModal.tsx  # Department create/edit
│   │   │       ├── JobTitleModal.tsx    # Job title create/edit
│   │   │       ├── PositionModal.tsx    # Position create/edit
│   │   │       └── OrgStructure.tsx     # Org structure visualization
│   │   ├── users/                    # Users management feature (3.6K)
│   │   │   ├── page.tsx              # User list page
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # User detail page
│   │   │   └── components/
│   │   │       ├── UsersClient.tsx   # User list client component
│   │   │       ├── UsersModal.tsx    # Create/edit user modal (v2)
│   │   │       ├── UsersModalTabside.tsx  # Tabbed user modal (v1)
│   │   │       ├── PermissionsPanel.tsx   # Permission matrix UI
│   │   │       ├── UserFilters.tsx   # Filter controls
│   │   │       ├── BulkActionsMenu.tsx   # Bulk action menu
│   │   │       └── AuditLogViewer.tsx    # User activity logs
│   │   ├── history/                  # History/Audit feature (2.1K)
│   │   │   ├── page.tsx              # Audit log viewer page
│   │   │   └── components/
│   │   │       └── AuditLogTable.tsx # Audit log table with filters
│   │   ├── delete-requests/          # Delete request workflow (1.8K)
│   │   │   ├── page.tsx              # Delete request list
│   │   │   └── components/
│   │   │       ├── DeleteRequestModal.tsx  # Create delete request
│   │   │       └── ApprovalWorkflow.tsx    # Approval UI
│   │   ├── settings/                 # Settings feature (1.5K)
│   │   │   ├── page.tsx              # Settings page
│   │   │   └── components/
│   │   │       ├── SystemConfig.tsx  # System configuration form
│   │   │       ├── NotificationConfig.tsx  # Notification settings
│   │   │       └── EmailConfig.tsx   # Email settings
│   │   ├── sign-up-login-screen/     # Auth pages (2.2K)
│   │   │   └── page.tsx              # Login form
│   │   └── reset-password/           # Password reset pages (1.8K)
│   │       ├── page.tsx              # Forgot password form
│   │       └── [token]/
│   │           └── page.tsx          # Reset password form
│   ├── components/                   # Shared UI components (2.8K LOC)
│   │   ├── ui/                       # Primitive UI components
│   │   │   ├── AppIcon.tsx           # Icon wrapper
│   │   │   ├── AppImage.tsx          # Image wrapper
│   │   │   ├── AppLogo.tsx           # Logo display
│   │   │   ├── ConfirmModal.tsx      # Generic confirm dialog
│   │   │   ├── LoadingSkeleton.tsx   # Loading placeholder
│   │   │   ├── StatusBadge.tsx       # Status indicator
│   │   │   └── TicketBadge.tsx       # Ticket status indicator
│   │   ├── AppLayout.tsx             # Main app layout wrapper
│   │   ├── Sidebar.tsx               # Navigation sidebar
│   │   ├── Topbar.tsx                # Top navigation bar
│   │   ├── NotificationBell.tsx      # Notification bell icon
│   │   ├── NotificationPanel.tsx     # Notification dropdown panel
│   │   ├── QRScannerModal.tsx        # QR scanner/generator
│   │   ├── AdvancedSearch.tsx        # Search box with suggestions
│   │   ├── FilterBuilder.tsx         # Dynamic filter builder
│   │   ├── SavedFilters.tsx          # Saved filter management
│   │   ├── SearchResultsIndicator.tsx # Search results header
│   │   └── AssetCategoryCombobox.tsx # Asset category dropdown
│   ├── context/                      # React Context (0.8K LOC)
│   │   └── NotificationContext.tsx   # Global notification state
│   ├── hooks/                        # Custom React hooks (0.4K LOC)
│   │   └── useUserPermissions.ts     # Permission checking hook
│   ├── lib/                          # Core utilities & services (5.8K LOC)
│   │   ├── zimbra/                   # Zimbra Admin SOAP integration
│   │   │   ├── config.ts             # getZimbraConfig() — reads ZIMBRA_* env vars
│   │   │   ├── soap-client.ts        # callAdmin() — HTTPS SOAP, admin token cache (single-flight)
│   │   │   ├── types.ts              # ZimbraConfig, ZimbraError, ZimbraDomain, ZimbraAccount, ZimbraDistributionList
│   │   │   └── require-zimbra-admin.ts  # requireZimbraAdmin() guard — role check từ DB
│   │   ├── db.ts                     # pg Pool + query/queryOne/execute/withTransaction helpers + User type
│   │   ├── authStore.ts              # Auth state management (localStorage)
│   │   ├── usersStore.ts             # User cache store
│   │   ├── modules.ts                # Module definitions (11 modules, permission types)
│   │   ├── permissions.ts            # Permission checking functions
│   │   ├── api-permissions.ts        # API-level permission checks
│   │   ├── cache.ts                  # Simple caching utilities
│   │   ├── notificationHelper.ts     # Notification creation helpers
│   │   ├── slug-utils.ts             # Slug generation utilities
│   │   ├── task-utils.ts             # Task-related utilities
│   │   ├── archive-utils.ts          # Archive operation helpers
│   │   ├── api-client.ts             # Axios-like API client wrapper
│   │   ├── mockData.ts               # Mock data for testing
│   │   └── services/                 # Business logic services (5K LOC)
│   │       ├── zimbra-service.ts     # Zimbra business logic: listDomains, listGroups, searchAccounts, createAccount, resetPassword, addGroupMember, removeGroupMember
│   │       ├── zimbraService.ts      # Barrel re-export shim (legacy name used by API routes → zimbra-service.ts)
│   │       ├── auditService.ts       # Audit log operations
│   │       ├── usersService.ts       # User CRUD + bulk operations
│   │       ├── companiesService.ts   # Company management
│   │       ├── departmentsService.ts # Department management
│   │       ├── subDepartmentsService.ts  # Sub-department management
│   │       ├── jobTitlesService.ts   # Job title management
│   │       ├── positionsService.ts   # Position management
│   │       ├── tagsService.ts        # Tag management
│   │       ├── domainsService.ts     # Domain management
│   │       ├── softwareService.ts    # Software asset management
│   │       ├── emailAccountsService.ts   # Email account management
│   │       ├── notificationsService.ts   # Notification operations
│   │       ├── dashboardService.ts   # Dashboard data aggregation
│   │       ├── configService.ts      # System config operations
│   │       └── emailService.ts       # Email sending via AWS SES/Nodemailer
│   └── styles/                       # Global styles (inherited from Tailwind)
├── migrations/                       # Database schema migrations (~2.5K LOC, 28 files)
│   ├── 001_create_users_tables.sql
│   ├── 002-023_*.sql                 # Incremental schema updates
│   ├── create_asset_categories.sql
│   ├── add_company_department_to_assets.sql
│   └── ...
├── public/
│   ├── assets/
│   │   └── images/
│   │       └── app_logo.png          # Brand logo (316 KB)
│   └── ...
├── next.config.mjs                   # Next.js configuration (Netlify plugin)
├── tailwind.config.js                # Tailwind CSS theme (navy #0B1F3B, red #C62828)
├── tsconfig.json                     # TypeScript config
├── package.json                      # Dependencies: Next.js 13.5.6, React 19, pg, etc.
├── Dockerfile                        # Multi-stage build (node:20-alpine, Next.js standalone)
├── docker-compose.yml                # Services: app (port 4028) + db postgres:16-alpine (port 5432)
├── .env.local.example                # Environment variables template
├── eslintrc.json                     # ESLint rules
├── .prettierrc                       # Prettier formatting
├── README.md                         # Quick start guide
└── docs/                             # Documentation folder
    ├── project-overview-pdr.md       # Project overview & PDR
    ├── codebase-summary.md           # This file
    ├── code-standards.md             # Coding standards & conventions
    ├── system-architecture.md        # System architecture diagrams
    ├── project-roadmap.md            # Development roadmap & milestones
    ├── deployment-guide.md           # Docker self-hosted deployment guide
    ├── brand-identity.md             # Brand colors, logo, typography
    ├── feature-permissions.md        # Module permission system
    ├── feature-notifications.md      # In-app notification system
    ├── feature-history.md            # Audit log & history system
    ├── feature-tasks.md              # Tasks, task codes, activity log, archive
    ├── feature-password-reset.md     # Password reset via AWS SES
    └── feature-zimbra.md             # Zimbra mail admin integration
```

---

## 🔧 Thư Viện & Công Cụ Chính

### Frontend Libraries
| Thư viện | Phiên bản | Mục đích |
|---------|---------|---------|
| `next` | 13.5.6 | Web framework (App Router) |
| `react` | 19.0.3 | UI library |
| `typescript` | ^5 | Type checking |
| `tailwindcss` | 3.4.6 | Utility CSS framework |
| `lucide-react` | 1.7.0 | Icon library |
| `@heroicons/react` | 2.2.0 | SVG icons |
| `recharts` | 2.15.2 | Charts & graphs |
| `react-hook-form` | 7.75.0 | Form state management |
| `react-beautiful-dnd` | 13.1.1 | Drag-and-drop (kanban) |

### Backend & Data
| Thư viện | Phiên bản | Mục đích |
|---------|---------|---------|
| `pg` | 8.20.0 | PostgreSQL driver — Pool + parameterised queries |

### QR Code Management
| Thư viện | Phiên bản | Mục đích |
|---------|---------|---------|
| `qrcode.react` | 4.2.0 | Generate QR codes |
| `html5-qrcode` | 2.3.8 | Scan QR codes (camera) |
| `jsqr` | 1.4.0 | Parse QR code data |

### Email & Notifications
| Thư viện | Phiên bản | Mục đích |
|---------|---------|---------|
| `@aws-sdk/client-ses` | 3.1047.0 | AWS SES email sending |
| `nodemailer` | 6.9.7 | SMTP email sending alternative |

### Dev Tools
| Công cụ | Phiên bản | Mục đích |
|--------|---------|---------|
| `eslint` | 9 | Code linting |
| `prettier` | 3.5.3 | Code formatting |
| `@typescript-eslint/parser` | 8.29.0 | TypeScript linting |
| `@netlify/plugin-nextjs` | 5.11.1 | Netlify deployment plugin |

---

## 📦 Tệp & Module Chính

### db.ts
**Vị trí:** `src/lib/db.ts`  
**Mục đích:** Khởi tạo pg connection pool và cung cấp helper functions cho toàn bộ data layer  
**Key Exports:**
- `pool` — `pg.Pool` instance (DATABASE_URL hoặc biến PG* rời)
- `query<T>(text, params)` — SELECT nhiều hàng → `T[]`
- `queryOne<T>(text, params)` — SELECT một hàng → `T | null`
- `execute(text, params)` — INSERT/UPDATE/DELETE → `rowCount`
- `withTransaction(fn)` — Chạy trong transaction, tự COMMIT/ROLLBACK
- `buildInsert(table, data)` — Tạo INSERT parameterised query
- `buildUpdateById(table, id, data)` — Tạo UPDATE parameterised query
- `type User` — User object type (role: super_admin | admin | manager | user)

### authStore.ts
**Vị trí:** `src/lib/authStore.ts`  
**Mục đích:** Quản lý auth state trong localStorage (client-side)  
**Key Functions:**
- `login(email, password)` — Xác thực người dùng
- `logout()` — Đăng xuất
- `getCurrentUser()` — Lấy user hiện tại từ localStorage
- `isSuperAdmin/isAdmin/isManager/isUser()` — Kiểm tra role

### modules.ts
**Vị trị:** `src/lib/modules.ts`  
**Mục đích:** Định nghĩa 11 module và các action của mỗi module  
**Modules:** Dashboard, Asset Management, Hardware, Software, Tickets, Tasks, Room Bookings, Organization, Users, Settings, History  
**Actions:** view, create, edit, delete, approve, export

### permissions.ts
**Vị trí:** `src/lib/permissions.ts`  
**Mục đích:** Hàm kiểm tra quyền client-side  
**Key Functions:**
- `hasModulePermission(user, module, action)` — Kiểm tra quyền module
- `canAccessModule(user, module)` — Kiểm tra quyền truy cập module
- `getDefaultPermissionsForRole(role)` — Lấy quyền mặc định theo role

### api-permissions.ts
**Vị trí:** `src/lib/api-permissions.ts`  
**Mục đích:** Middleware kiểm tra quyền API (server-side)  
**Key Functions:**
- `checkPermission(req, requiredModule, requiredAction)` — Middleware bảo vệ endpoint
- Kết hợp với route handlers để protect API

### useUserPermissions.ts
**Vị trí:** `src/hooks/useUserPermissions.ts`  
**Mục đích:** Custom React hook để kiểm tra quyền trong components  
**Usage:** Lấy user hiện tại + check module permissions

### Services Layer (src/lib/services/)
Các service file cung cấp business logic CRUD + utilities:

- **zimbra-service.ts** (136 LOC) — Zimbra Admin SOAP integration: listDomains, listGroups, searchAccounts, createAccount, resetPassword, addGroupMember, removeGroupMember, defaultPassword, escapeLdap
- **zimbraService.ts** (4 LOC) — Barrel shim; re-exports tất cả từ `zimbra-service.ts`. API routes import từ đây (tên cũ từ Phase 3).
- **usersService.ts** (16KB) — User CRUD, search, bulk update, password reset
- **auditService.ts** — Audit log creation & retrieval (writes 4 Zimbra actions: zimbra_account_created, zimbra_password_reset, zimbra_member_added, zimbra_member_removed)
- **companiesService.ts** — Company CRUD
- **departmentsService.ts** — Department CRUD
- **notificationsService.ts** (12.7KB) — Notification creation, retrieval, update
- **emailService.ts** — Send email via SES/Nodemailer
- **dashboardService.ts** — Aggregate dashboard data
- Các service khác: positionsService, tagsService, jobTitlesService, softwareService, domainsService, emailAccountsService, configService, subDepartmentsService

---

## 🗄️ Database Schema

### Bảng Chính
| Bảng | Mục đích | Columns chính |
|------|---------|--------------|
| `users` | Tài khoản người dùng | id, email, name, role, module_permissions (JSONB), company, department, position, manager_id, tags, password_hash, status, last_login, created_at, updated_at |
| `assets` | Tài sản (phần cứng, phần mềm, domain, email) | id, name, type, status, company, department, assigned_to, purchase_date, value, warranty_end, created_at, updated_at |
| `companies` | Công ty/Tổ chức | id, name, slug, phone, email, address, city, tax_id, created_at |
| `departments` | Phòng ban | id, company_id, name, description, manager_id, created_at |
| `sub_departments` | Phòng ban con | id, department_id, name, created_at |
| `job_titles` | Chức danh công việc | id, company_id, name, created_at |
| `positions` | Chức vụ | id, company_id, name, level, created_at |
| `tickets` | Ticket hỗ trợ | id, title, description, status, priority, assigned_to, reporter, created_at, updated_at |
| `ticket_status_history` | Lịch sử trạng thái ticket | id, ticket_id, old_status, new_status, changed_by, changed_at |
| `room_bookings` | Đặt phòng | id, room_id, date, start_time, end_time, booked_by, checkin_time, checkout_time, status |
| `notifications` | Thông báo | id, user_id, type, title, message, action_url, is_read, created_at |
| `audit_logs` | Lịch sử hoạt động | id, action, user_id, table_name, record_id, changes, timestamp |
| `tags` | Thẻ/Tag | id, name, color, created_by, created_at |
| `user_tags` | Gán tag cho user | id, user_id, tag_id |
| `delete_requests` | Yêu cầu xóa | id, entity_type, entity_id, reason, status, requested_by, approved_by, created_at |
| `system_configs` | Cấu hình hệ thống | id, key, value, updated_at |

---

## 🎯 API Route Patterns

### CRUD Pattern
```
GET /api/{resource}              → List (with pagination, filters)
POST /api/{resource}             → Create
GET /api/{resource}/[id]         → Read (detail)
PUT /api/{resource}/[id]         → Update
DELETE /api/{resource}/[id]      → Delete
```

### Admin Routes
```
/api/admin/change-user-password
/api/admin/migrate-manager-id
/api/admin/run-migrations
/api/admin/setup-database
/api/admin/system-config
```

### Special Routes
```
/api/permissions/check                        → Check if user has permission
/api/auth/login
/api/auth/logout
/api/auth/forgot-password
/api/auth/reset-password
/api/notifications/read
/api/dashboard/*                               → Dashboard data aggregation
/api/history                                  → Audit log retrieval (both audit_logs + delete_requests)
/api/assets/[id]/history                      → Asset-specific history
/api/zimbra/domains                           → GET list Zimbra domains (admin/super_admin only)
/api/zimbra/groups                            → GET list Zimbra distribution lists (admin/super_admin only)
/api/zimbra/groups/members                    → POST/DELETE add/remove group member (audit logged)
/api/zimbra/accounts                          → GET search accounts, POST create account (audit logged)
/api/zimbra/accounts/reset-password           → POST reset account password (audit logged)
```

---

## 🔒 RBAC (Role-Based Access Control) System

### Roles
1. **super_admin** — Full system access
2. **admin** — Manage users, assets, tickets, organization
3. **manager** — View reports, approve requests, manage team
4. **user** — View assigned assets, book rooms, create tickets

### Module Permissions (11 modules)
Each user can have granular permissions per module:
- `dashboard` — view, export
- `asset_management` — view, create, edit, delete, export
- `hardware` — view, create, edit, delete
- `software` — view, create, edit, delete
- `tickets` — view, create, edit, delete, approve
- `tasks` — view, create, edit, delete
- `room_bookings` — view, create, edit, delete
- `organization` — view, create, edit, delete
- `users` — view, create, edit, delete, approve
- `settings` — view, edit
- `history` — view, export

### Permission Actions
- `view` — Read access
- `create` — Create new records
- `edit` — Update records
- `delete` — Delete records
- `approve` — Approve workflows
- `export` — Export data

---

## 🚀 Development Conventions

### Component File Naming
- PascalCase: `AssetModal.tsx`, `PermissionsPanel.tsx`
- Located in feature directories: `src/app/{feature}/components/`

### Service File Naming
- camelCase + Service suffix: `usersService.ts`, `emailService.ts`
- Located in: `src/lib/services/`

### API Route Structure
- Feature-based organization: `/api/{feature}/{action}`
- Handler pattern: `route.ts` for collection, `[id]/route.ts` for items

### TypeScript Usage
- Strict mode enabled
- Interfaces over types (preferred)
- Explicit return types for functions
- No `any` types without // @ts-ignore comments (document reasoning)

### Styling
- Tailwind CSS utility classes
- No inline CSS; use className prop
- Responsive first (mobile-first)
- Color palette: Navy (#0B1F3B) primary, Red (#C62828) accent

### Error Handling
- try/catch in async operations
- Graceful error messages to users
- Detailed logging on server
- No password/token exposure in error messages

---

## 📝 Notes

- **Version Mismatch Alert:** package.json lists `next: ^13.5.6` but README claims "Next.js 15" — this documentation reflects the actual dependency version (13.5.6).
- **Auth Pattern:** Custom session — password so sánh plain-text hiện tại (chưa có bcrypt). Session lưu trong localStorage (key: `assetflow_auth`).
- **Database:** PostgreSQL 16 qua `pg` Pool. Không dùng ORM. Tất cả queries parameterised qua helpers trong `src/lib/db.ts`.
- **Email Delivery:** AWS SES (`@aws-sdk/client-ses`). Dùng cho password reset. Biến: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`.
- **Zimbra Mail Admin:** Module `src/lib/zimbra/` kết nối Zimbra Admin SOAP API (HTTPS, cổng mặc định 7071). Biến: `ZIMBRA_ADMIN_URL`, `ZIMBRA_ADMIN_USER`, `ZIMBRA_ADMIN_PASSWORD` (bắt buộc); `ZIMBRA_TLS_REJECT_UNAUTHORIZED`, `ZIMBRA_CA_CERT`, `ZIMBRA_DEFAULT_PASSWORD_SUFFIX` (tùy chọn). Barrel pattern: `zimbraService.ts` re-exports `zimbra-service.ts`.
- **Barrel File Pattern:** `zimbraService.ts` là shim re-export để các API route từ Phase 3 không cần đổi import path. Logic thực tế nằm trong `zimbra-service.ts` (kebab-case, theo naming rules).
- **QR Codes:** Ba thư viện cho các use case khác nhau:
  - Tạo: `qrcode.react`
  - Quét: `html5-qrcode` (camera input)
  - Parse: `jsqr` (data extraction)
- **Deployment:** Docker Compose self-hosted (app port 4028 + postgres port 5432). Xem `docs/deployment-guide.md`.
- **Migration còn dở:** 56 file vẫn còn import `src/lib/supabase.ts`. Các API routes forgot-password/reset-password/verify-reset-token chưa rewrite sang pg.
