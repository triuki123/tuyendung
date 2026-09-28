# CLAUDE.md — FADO AssetFlowPro

File context cho Claude. Đọc trước khi làm bất cứ việc gì trong dự án này.

## Bắt buộc đọc trước khi làm việc

Trước khi sửa code hoặc trả lời về codebase này, agent phải đọc tối thiểu các file sau:

1. `CLAUDE.md` - luật gốc và convention bắt buộc
2. `CODEX.md` - handoff/memory hiện hành để tiếp tục công việc đang dở
3. `docs/AGENT-INDEX.md` - bản đồ tài liệu, chỉ ra file nào bắt buộc đọc theo từng loại task

Nếu task liên quan đến một mảng cụ thể, agent phải đọc thêm các file được chỉ định trong `docs/AGENT-INDEX.md` trước khi sửa.

## Dự án là gì
Hệ thống **quản lý vòng đời tài sản doanh nghiệp** (asset management) cho tổ chức Việt Nam.
Giao diện tiếng Việt. Tích hợp sâu với email server **Zimbra** (qua SOAP Admin API).

## Stack
- **Next.js 13.5** (App Router) + **React 19** + **TypeScript 5**
- **Tailwind CSS 3.4** + Radix/shadcn UI
- **PostgreSQL self-hosted** qua thư viện `pg` (KHÔNG dùng Supabase — README cũ ghi sai)
- Auth: `bcryptjs` (hash password)
- Email: AWS SES + Nodemailer
- Realtime: Server-Sent Events (SSE)
- Deploy: Docker + Traefik (`asset.fadoai.com`), app chạy port **4028**

## Lệnh thường dùng
```bash
npm run dev          # dev server, port 4028
npm run build        # build production
npm run lint         # ESLint
npm run type-check   # tsc --noEmit
npm run format       # prettier
```

## Cấu trúc thư mục
```
src/
├── app/
│   ├── {feature}/page.tsx          # trang feature (App Router)
│   │   └── components/             # component riêng của feature
│   └── api/{feature}/route.ts      # API endpoint (GET/POST collection)
│       └── [id]/route.ts           # GET/PUT/DELETE item
├── components/                     # component dùng chung + ui/ (primitives)
├── hooks/                          # useUserPermissions, useRealtimeData...
├── context/                        # NotificationContext...
└── lib/
    ├── db.ts                       # pg Pool + query/queryOne/execute/withTransaction
    ├── modules.ts                  # định nghĩa module + action (RBAC)
    ├── permissions.ts              # canAccess, hasModulePermission
    ├── api-permissions.ts          # middleware check quyền cho API
    ├── authStore.ts                # auth state client-side (LEGACY — xem cảnh báo)
    ├── zimbra/                     # SOAP client tích hợp Zimbra
    └── services/                   # business logic: *Service.ts
```

## Convention BẮT BUỘC tuân theo

### Database
- Truy cập DB **chỉ qua `src/lib/db.ts`**: `query<T>()`, `queryOne<T>()`, `execute()`, `withTransaction()`, `buildInsert()`, `buildUpdateById()`. Không tạo Pool mới.
- Tên bảng: `plural_snake_case` (`users`, `room_bookings`).
- ⚠️ Tên cột **trộn camelCase** (`roleLabel`, `userId`, `performedBy`, `created_at`). Khi viết SQL thủ công phải **double-quote** cột camelCase: `SELECT "roleLabel" FROM users`. `buildInsert/buildUpdateById` đã tự quote.
- ID là `TEXT PRIMARY KEY` do app sinh (không phải serial/UUID auto).
- Migrations ở `migrations/`, đặt tên `{số}_{mô_tả}.sql`.

### ⚠️ QUY TẮC BẮT BUỘC: Mỗi cột mới = 1 migration

> **Khi nào cần tạo migration:**
> - Thêm cột mới vào bất kỳ bảng nào (`ALTER TABLE ... ADD COLUMN`)
> - Tạo bảng mới (`CREATE TABLE`)
> - Đổi kiểu dữ liệu, thêm index, constraint, enum
>
> **Quy trình bắt buộc — không được bỏ qua:**
> 1. Viết SQL query/service dùng cột `xyz` → **ngay lập tức** tạo `migrations/NNN_add_xyz_to_table.sql`
> 2. Số thứ tự `NNN` = số migration lớn nhất hiện có + 1 (kiểm tra thư mục `migrations/`)
> 3. Dùng `ADD COLUMN IF NOT EXISTS` để migration idempotent (chạy lại không lỗi)
> 4. **Chạy migration ngay** trên DB dev trước khi test: `node -e "require('pg')..."` hoặc `psql`
>
> **Template migration chuẩn:**
> ```sql
> -- Migration NNN: mô tả ngắn
> ALTER TABLE ten_bang
>   ADD COLUMN IF NOT EXISTS cot_moi   TEXT,
>   ADD COLUMN IF NOT EXISTS cot_khac  DATE;
> ```
>
> ❌ **Tuyệt đối không** viết service/query tham chiếu cột chưa có trong DB mà không có migration đi kèm.

### API route (pattern chuẩn)
```ts
export async function GET(request: NextRequest) {
  try {
    // 1. check permission
    // 2. query qua service layer
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/xxx error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
```

### Service layer
- Mọi business logic ở `src/lib/services/{name}Service.ts`, dùng helper từ `db.ts`.
- Export named functions, có JSDoc, khai báo return type tường minh.

### Component
- `'use client'` khi cần; PascalCase; props có `interface` riêng; file < 300 dòng.
- Tailwind utility trong `className`, không inline CSS object. Mobile-first (`md:`, `lg:`).
- Text UI bằng tiếng Việt.

### 💰 Tiền tệ / số tiền — BẮT BUỘC
> Mọi thứ liên quan đến **tiền** (chi phí, giá, lương, ngân sách, nạp/thu/chi, giảm giá…) phải
> đi qua tiện ích chung, KHÔNG tự format/parse thủ công. Đơn vị: **đồng VND, số nguyên** (không số lẻ).

- **Hiển thị** số tiền → `formatVND(x)` (ra `13.800.000 đ`) hoặc `formatNumber(x)` (không có "đ").
  Cả hai ở `src/lib/format.ts`, dùng locale `vi-VN` → **ngăn cách hàng nghìn bằng dấu chấm**.
  KHÔNG `x.toLocaleString('en-US')`, KHÔNG tự chèn dấu phẩy/chấm.
- **Ô NHẬP** số tiền → dùng `<MoneyInput>` (`src/components/ui/MoneyInput.tsx`), KHÔNG dùng
  `<input type="number">` (trình duyệt chặn định dạng nên không thể hiện dấu ngăn cách khi gõ).
  - `value` nhận number hoặc chuỗi số; `onValueChange(n: number)` trả về **số nguyên đồng**.
  - State dạng number: `onValueChange={(n) => setForm({ ...form, cost: n })}`.
  - State dạng chuỗi (submit qua `parseVND`): `onValueChange={(n) => setX(n ? String(n) : '')}` để giữ nguyên kiểu chuỗi.
  - Ô cho phép số **âm** (vd điều chỉnh ví trừ tiền) thì MoneyInput hiện chưa hỗ trợ dấu `-` — giữ `<input>` hoặc nâng cấp component trước.
- **Parse** chuỗi người dùng nhập ("12.000", "12,000 đ") → số → `parseVND(input)`.
- Tiền lưu DB là **BIGINT theo đồng** (xem `src/lib/format.ts`), đừng dùng float cho tiền.

### Khác
- Không hardcode credentials/API key — dùng env.
- Không `console.log` password/dữ liệu nhạy cảm.
- Tránh `any` không chú thích.

## 🔔 Hệ thống Thông báo Tập trung — BẮT BUỘC cho MỌI thông báo/nhắc/automation mới

> Mọi luồng mới có **thông báo**, **nhắc nhở (reminder/scheduler)**, hoặc **tự động hoá**
> PHẢI đi qua hệ thống này — KHÔNG `INSERT INTO notifications` thủ công, KHÔNG gọi
> `sendTelegram*` trực tiếp, KHÔNG dùng `notifyUser()` cho luồng mới. Lý do: để admin sửa
> nội dung qua UI, và tự được hưởng outbox/retry/gộp/rate-limit/thống kê.

**Engine ở đâu:** `src/lib/notifications/` (`engine.ts`, `eventCatalog.ts`, `templates.ts`),
service `notificationTemplateService.ts` + `notificationOutboxService.ts`, UI cấu hình ở
`/cau-hinh-he-thong` (tab Mẫu thông báo / Trạng thái gửi), bảng `notification_templates`,
`notification_outbox`. Thiết kế đầy đủ: `docs/technical/notification-architecture.md`.

**Công thức thêm 1 thông báo mới (4 bước):**
1. **Template** — thêm vào `DEFAULT_NOTIFICATION_TEMPLATES` (`templates.ts`): `{ category,
   label, title (có {{biến}}+emoji), message, icon, telegram? (biến thể nhiều dòng nếu cần),
   placeholders }`. Nhiều biến thể trạng thái → dùng sub-key `key:state`.
2. **Event** — thêm vào `NOTIFICATION_EVENTS` (`eventCatalog.ts`): `{ key, templateKey, notifType
   (GIỮ NGUYÊN giá trị cột notifications.type), channels, telegramButtonLabel, relatedUrl,
   digest? (nếu fan-out tới cùng người) }`.
3. **Phát** — tại nơi nghiệp vụ: `await notify(eventKey, vars, { recipients: userIds[], relatedId })`.
   KHÔNG dựng chuỗi/INSERT/telegram thủ công.
4. **Scheduler (nếu là nhắc định kỳ)** — đọc khung giờ qua `resolveSchedulerTiming()` (đừng
   hardcode giờ); đăng ký start/stop trong `src/server.ts`; chống trùng bằng bảng `*_reminder_log`.

**Cấu hình kèm theo (nếu luồng có hằng số):** đưa ngưỡng/khung giờ/người nhận ra
`system_settings` qua `systemConfig.ts` + `systemSettingsService.ts` + tab trong
`/cau-hinh-he-thong` (xem skill `hardcode-to-config`). Mặc định = giá trị cũ, seed rỗng ⇒
không đổi hành vi khi deploy.

> Khi user mô tả một luồng mới có "tự động hoá / thông báo / nhắc", MẶC ĐỊNH áp công thức
> trên — coi như một phần của định nghĩa "xong", không cần hỏi lại.

## ⚠️ Nợ kỹ thuật & rủi ro (cần biết, đừng nhân rộng)

1. 🔴 **Permission check bị giả mạo được.** `api-permissions.checkPermission()` đọc quyền từ header `x-user-permissions` do client tự gửi → ai cũng spoof được. Đây là placeholder, CHƯA có auth server-side thật. Khi làm API mới, đừng coi cơ chế này là an toàn; ưu tiên thay bằng token/session verify.

2. 🟠 **Hai hệ auth song song mâu thuẫn:**
   - Thật & an toàn: `POST /api/auth/login` (DB + `bcrypt.compare`).
   - Legacy: `src/lib/authStore.ts` dùng `MOCK_USERS` so sánh **password plaintext** client-side.
   - Cần thống nhất về luồng DB+bcrypt và gỡ phần mock.

3. 🟡 **Migration trùng số thứ tự** (có hai file 008, 009, 012) → thứ tự chạy không xác định khi init DB mới.

4. RLS policy trong migration cũ là `USING(true)` (allow all) → không có giá trị bảo mật.

## Biến môi trường (.env)
```
DATABASE_URL=postgres://user:pass@host:5432/db   # hoặc PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
PGSSL=false
PG_POOL_MAX=30
NEXT_PUBLIC_APP_URL=http://localhost:4028
# Email (tùy chọn, cho password-reset)
AWS_REGION= / AWS_ACCESS_KEY_ID= / AWS_SECRET_ACCESS_KEY= / SES_FROM_EMAIL=
# Zimbra (server-side only)
ZIMBRA_ADMIN_URL= / ZIMBRA_ADMIN_USER= / ZIMBRA_ADMIN_PASSWORD=
ZIMBRA_TLS_REJECT_UNAUTHORIZED=false / ZIMBRA_DEFAULT_PASSWORD_SUFFIX=@123
# MinIO/S3 (object storage — bảng media trung tâm, xem migrations/302_create_media_table.sql)
S3_ENDPOINT=https://assetflow-minio.fadoai.com / S3_REGION=us-east-1
S3_ACCESS_KEY_ID= / S3_SECRET_ACCESS_KEY= / S3_FORCE_PATH_STYLE=true / S3_BUCKET=assetflow
```

## Tài liệu tham khảo trong repo
`docs/`: system-architecture, code-standards, codebase-summary, deployment-guide, và các `feature-*.md` (zimbra, permissions, tasks, notifications, password-reset, history).

---

## 🎨 UI Standards — BẮT BUỘC khi tạo trang/module mới

> Áp dụng cho mọi yêu cầu tạo giao diện mới. Không được bỏ qua.

### Bố cục tổng thể
- Mọi trang đều được bọc bởi `<AppLayout activePath="...">` — **không tự vẽ sidebar/topbar**.
- Sidebar (fixed, collapsible): Logo → **ĐIỀU HƯỚNG** → **HOẠT ĐỘNG** → **QUẢN TRỊ** → User+Logout.
- Topbar (sticky): search · notification bell · QR icon · user menu.
- Main content: `p-4 sm:p-5 lg:p-6 xl:p-8 2xl:p-10`, `max-w-screen-2xl mx-auto` — **không thêm padding ngoài**.

### Cấu trúc 1 trang chuẩn (theo thứ tự)
```tsx
<div className="space-y-5 sm:space-y-6">

  {/* 1. Back link (nếu là trang con) */}
  <Link href="..." className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
    <ArrowLeft className="h-3.5 w-3.5" /> Tên trang cha
  </Link>

  {/* 2. Header row */}
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h1 className="text-xl sm:text-2xl font-700">Tiêu Đề Trang</h1>
      <p className="text-xs sm:text-sm text-muted-foreground">Mô tả ngắn</p>
    </div>
    <button className="btn-accent"><Plus className="h-4 w-4" /> Thêm mới</button>
  </div>

  {/* 3. Stats grid (nếu có số liệu) */}
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
    <StatCard />
  </div>

  {/* 4. Tabs (nếu có) */}
  <div className="flex gap-2 border-b border-white/10 overflow-x-auto">
    <button className="border-b-2 border-indigo-500 text-indigo-400">Tab active</button>
    <button className="text-muted-foreground">Tab khác</button>
  </div>

  {/* 5. Filters + Search */}
  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
    <SearchInput /> <FilterDropdown />
  </div>

  {/* 6. Content chính — card/table/list */}
  {loading ? (
    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  ) : data.length === 0 ? (
    <div className="flex flex-col items-center py-20 text-muted-foreground">
      <Icon className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm">Chưa có dữ liệu</p>
      <p className="text-xs mt-1 opacity-60">Hướng dẫn hành động tiếp theo</p>
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* items */}
    </div>
  )}

</div>
```

### Màu sắc — chỉ dùng CSS variables và Tailwind
```
✅ var(--card)              — card/panel background
✅ var(--background)        — page background
✅ var(--foreground)        — text chính
✅ var(--muted-foreground)  — text phụ
✅ border-white/5           — border nhẹ
✅ border-white/10          — border vừa
✅ bg-white/5               — hover background
✅ text-indigo-400          — primary accent text
✅ bg-indigo-600            — primary button
✅ bg-[#162033]             — input background
❌ KHÔNG hardcode màu light (white, #fff, gray-100...)
❌ KHÔNG dùng inline style cho màu — dùng Tailwind
```

### Card/Panel chuẩn
```tsx
<div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
  {/* content */}
</div>
```

### Modal chuẩn
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4"
  style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
  <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden"
    style={{ background: 'var(--card)' }}>
    {/* Header */}
    <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
      <h2 className="text-base font-700 text-foreground">Tiêu đề modal</h2>
      <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
    </div>
    {/* Body */}
    <div className="p-6 space-y-4">...</div>
    {/* Footer */}
    <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
      <button className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
      <button className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">Lưu</button>
    </div>
  </div>
</div>
```

### Typography chuẩn
| Dùng cho | Class |
|----------|-------|
| Tiêu đề trang | `text-xl sm:text-2xl font-700 text-foreground` |
| Tiêu đề section | `text-lg font-700 text-foreground` |
| Tiêu đề card | `text-base font-600 text-foreground` |
| Text chính | `text-sm text-foreground` |
| Text phụ | `text-xs text-muted-foreground` |
| Label input | `text-xs font-600 text-muted-foreground uppercase tracking-wider` |

### Responsive — Mobile-first bắt buộc
```
Mobile  (<640px):  1 cột, text nhỏ hơn, button full-width
Tablet  (sm:):     2 cột, flex-row cho header
Desktop (lg:):     3-4 cột, sidebar hiện đầy đủ
XL      (xl:):     max-w-screen-2xl, padding lớn hơn
```

### Checklist PHẢI ĐỦ trước khi giao
- [ ] Wrap `<AppLayout activePath="...">`
- [ ] Back link nếu là trang con
- [ ] `h1` tiêu đề + mô tả
- [ ] Loading state với `<Loader2 animate-spin>`
- [ ] Empty state với icon + text + hướng dẫn
- [ ] Permission check (RBAC module, không hardcode role)
- [ ] Responsive: mobile-first, không có breakpoint bị vỡ
- [ ] Text UI bằng **tiếng Việt**
- [ ] Chỉ dùng màu CSS variables + Tailwind dark-safe
- [ ] API error handling (try/catch, return `{ error }`)
- [ ] Không thêm padding ngoài `<main>` của AppLayout
