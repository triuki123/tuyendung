# AGENT-INDEX.md

Muc tieu cua file nay la giam toi da viec Claude Code hoac Codex bo sot context khi mo lai repo. Khong can doc moi file Markdown trong repo moi lan; thay vao do, doc theo thu tu uu tien duoi day.

## Always Read

Doc 3 file nay truoc khi lam bat ky viec gi:

1. `/CLAUDE.md`
2. `/CODEX.md`
3. `/docs/AGENT-INDEX.md`

## Source Of Truth

- `CLAUDE.md`: luat goc, convention, rui ro ky thuat, guardrail bat buoc.
- `CODEX.md`: memory hien hanh, module dang lam do, deploy, nhac nho van hanh.
- Code hien tai trong repo: uu tien cao hon README hoac cac bao cao cu neu co mau thuan.

## Read By Task Type

### Frontend/UI/UX

Bat buoc doc:

- `/docs/ux-standards.md`
- phan UI standards trong `/CLAUDE.md`
- file/module hien tai se sua

Nen doc them neu can:

- `/docs/design-system/ui-audit.md`
- `/docs/design-system/design-system.html`
- `/docs/design-system/component-library.html`

### Database/Migration/Schema

Bat buoc doc:

- phan Database va migration trong `/CLAUDE.md`
- `/CODEX.md`
- thu muc `/migrations/` de kiem tra so migration moi nhat va tranh trung so

Nho:

- khong them cot/bang/index/constraint ma khong co migration
- canh giac cot camelCase trong DB cu

### Notifications/Reminder/Automation

Bat buoc doc:

- phan notification engine trong `/CLAUDE.md`
- `/docs/feature-notifications.md`
- `/docs/technical/notification-architecture.md` neu task cham vao engine/template/outbox

Nho:

- khong `INSERT INTO notifications` thu cong cho luong moi
- khong gui Telegram truc tiep cho luong moi neu dang co engine tap trung

### Deploy/Coolify/Production

Bat buoc doc:

- `/docs/deploy-coolify.md`
- `/docs/coolify-deploy-status.md`
- `/DEPLOYMENT.md`
- `/.claude/skills/deploy-coolify/SKILL.md`

Nen doc them:

- `/docs/deployment-guide.md`
- `/docs/deploy-migration.md`

### Hardcode To Config/System Settings

Bat buoc doc:

- `/.claude/skills/hardcode-to-config/SKILL.md`
- file config lien quan trong `src/lib/config/`
- phan system config trong `/CLAUDE.md` va `/CODEX.md`

### Attendance/ZKTeco/Cham cong

Bat buoc doc:

- `/ATTENDANCE_QUICK_START.md`
- `/ATTENDANCE_SYNC_SETUP.md`
- `/docs/feature-attendance-realtime.md`
- code hien tai trong `src/lib/zkteco/`, `src/services/attendanceProxyService.ts`, va module attendance lien quan

### Zimbra/Email Admin

Bat buoc doc:

- `/docs/feature-zimbra.md`
- `/CLAUDE.md`
- code hien tai trong `src/lib/zimbra/` va `src/lib/services/zimbra-service.ts`

### Permissions/Auth/Sessions

Bat buoc doc:

- `/docs/feature-permissions.md`
- `/docs/technical/multi-company-definition.md`
- phan no ky thuat/rui ro trong `/CLAUDE.md`
- code hien tai trong `src/lib/api-permissions.ts`, `src/lib/permissions.ts`, `src/lib/authStore.ts`, va API auth lien quan
- `src/lib/auth/ssoClient.ts`
- `src/lib/services/ssoProvisioningService.ts`
- `docs/superpowers/specs/2026-07-17-sso-integration-design.md`

Nho:

- khong mac dinh auth/permission hien tai la an toan

### Multi-company/Da Cong Ty

Bat buoc doc:

- `/docs/technical/multi-company-definition.md`
- `src/lib/services/userCompanyService.ts`
- `src/lib/activeCompany.ts`
- `src/components/CompanySwitcher.tsx`

Nho:

- company active khac company chinh
- khong tin role/quyen client tu khai
- moi scope du lieu phai resolve qua `getEffectiveContext()`

### Tasks/History/Audit

Nen doc:

- `/docs/feature-tasks.md`
- `/docs/feature-history.md`

## Reference Only

Nhung file duoi day co gia tri tham khao lich su, khong mac dinh la source of truth neu code hien tai khac:

- `/README.md`
- `/PHASE1_COMPLETE.md`
- `/IMPLEMENTATION_STATUS.md`
- `/REALTIME_IMPLEMENTATION.md`
- `/NOTIFICATION_FIX_SUMMARY.md`
- `/NOTIFICATION_NAVIGATION.md`
- `/NOTIFICATION_SYSTEM_TEST_REPORT.md`
- `/QC_TEST_REPORT_v0.0.2.md`
- `/docs/PHASE1_ARCHITECTURE.md`
- `/docs/PHASE1_FEATURE_OVERVIEW.md`
- `/docs/PHASE1_TEST_EXECUTION.md`

### Module Chi Phi / Expense (integration voi webapp Ke toan)

Bat buoc doc truoc khi bat tay:

- `/docs/technical/expense-module-integration.md` — dac ta thread-per-expense + API contract 2 chieu (DRAFT, cho Ke toan chot)

Nho:

- AssetFlow chi tao chi phi + duyet; Ke toan xu ly hach toan qua API. KHONG nhan doi so cai (khac `solace-cash`).
- Thread trao doi gan theo tung expense; tai dung notification/outbox/comment UI san co.

## Working Rule For Any Agent

1. Doc `CLAUDE.md`, `CODEX.md`, `docs/AGENT-INDEX.md`.
2. Xac dinh loai task.
3. Doc them cac file bat buoc theo loai task do.
4. Kiem tra code hien tai va `git status` truoc khi sua.
5. Neu docs mau thuan voi code, uu tien code + `CLAUDE.md`, sau do cap nhat docs neu task cho phep.
