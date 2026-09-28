# AssetFlow Pro — Lộ Trình Phát Triển & Milestone

**Phiên bản:** 1.0  
**Cập nhật:** 2026-05-27  
**Trạng thái:** Phase 2 (nearing completion)

---

## 📅 Tổng Quan Lộ Trình

```
Phase 1: Foundation & Core Features
├─ ✅ COMPLETE (Mar 2026)

Phase 2: Module Permissions & UI Enhancement
├─ 🔄 IN PROGRESS (May 2026)
├─ Target completion: Jun 2026

Phase 3: Mobile & Advanced Features
├─ 📅 PLANNED (Jul-Dec 2026)

Phase 4: Scale & Performance
├─ 📅 FUTURE (2027+)
```

---

## ✅ Phase 1: Foundation & Core Features (COMPLETE)

**Duration:** December 2025 - March 2026  
**Status:** ✅ COMPLETE  
**Git:** commit e220c81 (first commit) → 4b7e6ba (last Phase 1 commit)

### Completed Modules

#### 1. Project Setup & Infrastructure
- [x] Next.js 13 + TypeScript + Tailwind CSS
- [x] PostgreSQL 16 via pg Pool (`src/lib/db.ts`) + Docker Compose
- [x] Custom authentication (plain-text password, sessions via localStorage)
- [x] Environment variable setup (.env.local.example)
- [x] Dockerfile + docker-compose.yml (app port 4028 + postgres port 5432)
- [x] ESLint + Prettier + TypeScript strict mode

#### 2. Core User Management
- [x] User registration & login system
- [x] Password hashing (bcryptjs)
- [x] User CRUD (create, read, update, delete)
- [x] User roles (super_admin, admin, user)
- [x] User search & filtering
- [x] User dropdown cache (usersStore.ts)

#### 3. Asset Management
- [x] Asset CRUD (create, read, update, delete)
- [x] Asset types: Hardware, Software, Domain, Email Account
- [x] Asset table with pagination & sorting
- [x] Asset filters (by type, status, department)
- [x] Asset status tracking (active, maintenance, retired)
- [x] Asset QR code generation
- [x] Asset history & change tracking

#### 4. Dashboard & Analytics
- [x] Dashboard main page with overview
- [x] Charts: Asset Trend, Asset Value, Department Distribution
- [x] Maintenance schedule chart
- [x] Status pie chart (active/inactive/maintenance)
- [x] Recent activity feed
- [x] System alerts & notifications

#### 5. UI & Layout
- [x] Responsive design (mobile/tablet/desktop)
- [x] Sidebar navigation with collapsible menu
- [x] Topbar with user profile & logout
- [x] App layout wrapper (AppLayout component)
- [x] Brand identity (Navy #0B1F3B + Red #C62828)
- [x] Logo & assets
- [x] Loading skeletons & spinners

#### 6. Basic Permissions
- [x] Role-based access (super_admin, admin, user)
- [x] Simple role checks in API routes
- [x] Permission checks in UI (hide/show features)

---

## 🔄 Phase 2: Module Permissions & UI Enhancement (IN PROGRESS)

**Duration:** April 2026 - June 2026  
**Status:** 🔄 IN PROGRESS  
**Git:** commit 4b7e6ba (last Phase 1) → current main

### Completed in Phase 2

#### 1. Detailed Module Permissions System ✅
- [x] Define 11 modules (dashboard, assets, tickets, tasks, etc.)
- [x] Define permission actions (view, create, edit, delete, approve, export)
- [x] Store module_permissions as JSONB in users table
- [x] Create modules.ts with module definitions
- [x] Create permissions.ts with permission checking logic
- [x] Create api-permissions.ts middleware for API protection
- [x] Create useUserPermissions hook for components
- [x] Migration 023: Add module_permissions column to users

#### 2. Enhanced User Management UI ✅
- [x] User modal with tabs (Info, Permissions, Password)
- [x] PermissionsPanel component (module permission matrix)
- [x] Select/deselect permissions by module
- [x] "Select All" to assign all permissions
- [x] Default permissions assignment by role
- [x] User bulk actions (change role, assign permissions)
- [x] User bulk import/export (CSV)

#### 3. Organization Structure ✅
- [x] Companies management (create, edit, delete)
- [x] Departments management (linked to company)
- [x] Sub-departments (department hierarchy)
- [x] Job titles management
- [x] Positions management
- [x] Manager role added (super_admin > admin > manager > user)
- [x] Assign manager to department/team
- [x] Organization structure visualization

#### 4. Ticket System ✅
- [x] Ticket CRUD (create, read, update, delete)
- [x] Ticket statuses (open, in_progress, closed, rejected)
- [x] Ticket priorities (low, medium, high, critical)
- [x] Ticket assignment (assign to user)
- [x] Ticket comments & activity log
- [x] Kanban board (for admin) — To Do, In Progress, Done
- [x] Ticket list view (for users)
- [x] Bulk actions on tickets
- [x] Advanced search & filters on tickets
- [x] Ticket status history (audit trail)

#### 5. Room Bookings System ✅
- [x] Room management (create, edit, delete)
- [x] Calendar view (month, week, day)
- [x] Book a room (select date, time, room)
- [x] Check-in/check-out workflow
- [x] QR code check-in for rooms
- [x] Room usage history
- [x] Conflict detection (prevent double-booking)
- [x] List view for bookings

#### 6. UI/UX Improvements ✅
- [x] Enhanced form validation & error messages
- [x] Improved modal designs (responsive)
- [x] Loading states & spinners
- [x] Toast notifications (success/error)
- [x] Mobile-responsive tables
- [x] Advanced search component
- [x] Filter builder component (drag-drop filters)
- [x] Save filter presets

#### 7. Additional Features ✅
- [x] Task management (create, view, list)
- [x] Task activity logs
- [x] Task code auto-generation
- [x] Task archive feature
- [x] Delete request workflow
- [x] History/Audit log viewer
- [x] Notifications (bell icon, notification panel)
- [x] Tag system (create tags, assign to users/assets)
- [x] Settings page (system config, email setup)

#### 8. Zimbra Mail Administration ✅
- [x] Zimbra Admin SOAP client (`src/lib/zimbra/soap-client.ts`, 151 LOC) with two-variable single-flight token cache (inflight + cached)
- [x] Configuration module (`src/lib/zimbra/config.ts`, 23 LOC) — reads and validates 6 env vars
- [x] Type definitions (`src/lib/zimbra/types.ts`, 34 LOC) — ZimbraConfig, ZimbraError, ZimbraDomain, ZimbraAccount, ZimbraDistributionList
- [x] Admin guard (`src/lib/zimbra/require-zimbra-admin.ts`, 23 LOC) — header x-current-user-id + DB role check (super_admin/admin only)
- [x] Service layer (`src/lib/services/zimbra-service.ts`, 136 LOC) — 8 exported functions with LDAP escaping and password hashing
- [x] API routes (5 endpoints): GET domains, GET groups, POST/DELETE group members, GET/POST accounts, POST reset-password
- [x] UI: ZimbraClient (tabs), DomainsTab (domains list), GroupsTab (distribution lists + members), AccountsTab (search/create/reset)
- [x] Sidebar entry: Quản Lý Tài Sản > Zimbra Mail (cyan gradient, Server icon)
- [x] Audit log entries (4 actions): zimbra_account_created, zimbra_password_reset, zimbra_member_added, zimbra_member_removed
- [x] Security: TLS per-agent (never global NODE_TLS_REJECT_UNAUTHORIZED), header-based identity + DB role verification
- [x] TODO: Replace x-current-user-id header with JWT after auth migration

### In Progress / Next
- 🔄 Performance optimization (lazy loading, pagination)
- 🔄 Extended testing & bug fixes
- 🔄 Documentation review & completion

### Phase 2 Metrics
- **Modules covered:** 11/11 ✅
- **Permission granularity:** 6 actions/module ✅
- **Roles:** 4 levels ✅
- **UI components:** 50+ ✅
- **API endpoints:** 100+ ✅

---

## 📅 Phase 3: Mobile & Advanced Features (PLANNED)

**Duration:** July 2026 - December 2026  
**Status:** 📅 PLANNED  
**Priority:** High

### Planned Features

#### 1. Mobile App (React Native / Flutter)
- [ ] Native iOS app
- [ ] Native Android app
- [ ] Offline mode (sync when online)
- [ ] Push notifications
- [ ] Camera integration (QR scan)
- [ ] Biometric auth (Face ID, Fingerprint)

#### 2. Advanced Analytics & Reporting
- [ ] Custom report builder
- [ ] Export to Excel/PDF
- [ ] Scheduled report emails
- [ ] Dashboard customization (choose widgets)
- [ ] Asset depreciation calculator
- [ ] ROI analysis
- [ ] Maintenance cost analysis

#### 3. Public API
- [ ] REST API documentation
- [ ] API key management
- [ ] Rate limiting
- [ ] OAuth 2.0 for third-party integration
- [ ] Webhook support for events

#### 4. Advanced Asset Management
- [ ] Barcode support (UPC, Code128)
- [ ] Asset photo uploads
- [ ] Asset document attachments
- [ ] Asset maintenance scheduling
- [ ] Warranty tracking
- [ ] Insurance information
- [ ] Depreciation schedule

#### 5. AI/ML Features (Optional)
- [ ] Predictive maintenance
- [ ] Anomaly detection in asset usage
- [ ] Cost optimization recommendations
- [ ] Smart asset categorization

#### 6. Compliance & Security
- [ ] Role-based data masking
- [ ] Data encryption at rest
- [ ] Audit trail improvements
- [ ] GDPR compliance (data export/deletion)
- [ ] ISO 27001 certification support
- [ ] Two-factor authentication (2FA)

#### 7. Integration Ecosystem
- [ ] Slack integration (alerts, notifications)
- [ ] Microsoft Teams integration
- [ ] Zapier/IFTTT integration
- [ ] Accounting software integration (QuickBooks)
- [ ] HR software integration (BambooHR)

---

## 📈 Phase 4: Scale & Performance (FUTURE)

**Duration:** 2027+  
**Status:** 📅 FUTURE  
**Priority:** Medium

### Planned Enhancements

#### 1. Performance Optimization
- [ ] Database query optimization
- [ ] Elasticsearch for full-text search
- [ ] Redis caching layer
- [ ] CDN for static assets
- [ ] Image optimization & lazy loading
- [ ] Bundle size optimization

#### 2. Multi-Tenancy
- [ ] Workspace/organization isolation
- [ ] Shared resources (common assets library)
- [ ] Billing per workspace
- [ ] Resource limits per workspace

#### 3. Advanced Workflows
- [ ] Workflow builder (visual editor)
- [ ] Approval chains
- [ ] Conditional logic
- [ ] Notifications based on workflows
- [ ] Scheduled actions

#### 4. Data Intelligence
- [ ] Business intelligence (BI) dashboard
- [ ] Data warehouse integration
- [ ] Real-time analytics
- [ ] Predictive analytics
- [ ] Natural language query support

#### 5. Marketplace
- [ ] Plugin ecosystem
- [ ] App store for integrations
- [ ] Custom extension development
- [ ] Community contributions

---

## 📊 Feature Completion Matrix

| Feature | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---------|---------|---------|---------|---------|
| User Management | ✅ | ✅ | ✅ | ✅ |
| Authentication | ✅ | ✅ | ✅ | 🔄 |
| Asset Management | ✅ | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Permissions (basic) | ✅ | - | - | - |
| Permissions (module) | - | ✅ | ✅ | ✅ |
| Tickets | - | ✅ | ✅ | ✅ |
| Tasks | - | ✅ | ✅ | ✅ |
| Room Bookings | - | ✅ | ✅ | ✅ |
| Organization | - | ✅ | ✅ | ✅ |
| History/Audit | - | ✅ | ✅ | ✅ |
| Zimbra Mail Admin | - | ✅ | ✅ | ✅ |
| Mobile App | - | - | ✅ | ✅ |
| Advanced Reports | - | - | ✅ | ✅ |
| Public API | - | - | ✅ | ✅ |
| 2FA | - | - | ✅ | ✅ |
| Multi-tenancy | - | - | - | ✅ |
| Workflow Builder | - | - | - | ✅ |
| BI Dashboard | - | - | - | ✅ |

---

## 🎯 Success Metrics & KPIs

### Phase 2 (Current)
- [x] 11 modules with granular permissions
- [x] 50+ UI components
- [x] 100+ API endpoints
- [x] <3s page load time (target)
- [x] Mobile responsive (viewport < 768px)

### Phase 3 (Target)
- [ ] Mobile app launch (iOS + Android)
- [ ] 99.5% API uptime
- [ ] Support for 500+ concurrent users
- [ ] Advanced analytics on 10+ metrics
- [ ] Public API with 100+ integrations tested

### Phase 4 (Vision)
- [ ] Multi-tenant support for 10+ organizations
- [ ] Real-time analytics dashboard
- [ ] <500ms average API response time
- [ ] ISO 27001 compliance
- [ ] Plugin marketplace with 50+ extensions

---

## 🔗 Git Commit History (Phase Overview)

```
e220c81 — first commit (Phase 1 start)
  ├─ Initial Next.js setup
  ├─ Initial Supabase integration (later migrated to self-hosted pg)
  └─ Basic auth & assets

4b7e6ba — update giao dien tai san (Phase 1 end)
  ├─ Asset UI improvements
  └─ Dashboard enhancements

9e16a6a — update form tai san 2
  ├─ Asset form refinement
  └─ Validation improvements

8f84c3c — update giao dien dat phong hop va fix loi them cong ty (Phase 2)
  ├─ Room booking feature
  ├─ Organization (company) bug fix
  └─ Company addition improvements

22b7df5 — update giao dien nguoi dung hoan thien (Phase 2)
  ├─ User management UI completion
  ├─ Enhanced forms & validation
  └─ Permission panel improvements

1798bc7 — them phan quyen va bo sung role manager (Phase 2 current)
  ├─ Module permission system
  ├─ Manager role addition
  └─ Permission checking framework
```

---

## 📝 Notes & Considerations

### Technical Debt (to address in Phase 3+)
- [ ] Component files > 300 LOC should be split
- [ ] Service layer could use error boundary patterns
- [ ] API error handling could be more consistent
- [ ] Database indexes need performance review
- [ ] Client-side caching could be more aggressive

### Known Limitations (Phase 2)
- QR codes are local generation only (no cloud storage)
- Room check-in is manual (not automatic from QR scan)
- Reports are basic (no custom export templates)
- Mobile experience is responsive but not optimized
- No offline support

### Future Considerations
- GraphQL migration (after API stabilizes)
- WebSocket for real-time updates
- Service workers for offline support
- Database sharding for scale
- Microservices if multi-tenant architecture chosen

---

## 🚀 Next Steps (Action Items)

### Immediate (Next 1-2 weeks)
- [x] Complete Phase 2 testing
- [ ] Documentation review & update (in progress)
- [ ] Bug fixes from testing
- [ ] Performance profiling

### Short Term (Next 1 month)
- [ ] Release Phase 2 stable version
- [ ] User feedback collection
- [ ] Begin Phase 3 planning
- [ ] Mobile app prototype

### Medium Term (2-3 months)
- [ ] Phase 3 implementation begins
- [ ] Mobile app MVP
- [ ] Advanced analytics foundation
- [ ] Public API spec

### Long Term (6+ months)
- [ ] Phase 3 completion
- [ ] Phase 4 exploration
- [ ] Community feedback incorporation
- [ ] Marketplace planning

---

## 📞 Communication & Updates

- **Status Page:** Updates every 2 weeks
- **Release Notes:** Maintained in changelog
- **Issue Tracking:** GitHub Issues
- **Feedback:** nguyenminhtri173@gmail.com

---

## 📚 Related Documentation

- **Project Overview** → `/docs/project-overview-pdr.md`
- **System Architecture** → `/docs/system-architecture.md`
- **Code Standards** → `/docs/code-standards.md`
- **Deployment Guide** → `/docs/deployment-guide.md`
