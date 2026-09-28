# UI Audit — FADO AssetFlowPro
> Ngày kiểm tra: 2026-06-19 | Phiên bản: Next.js 13.5 App Router

---

## 1. Executive Summary

| Hạng mục | Điểm (1–5) | Nhận xét nhanh |
|----------|-----------|----------------|
| Kiến trúc component | 4 | App Router nhất quán, AppLayout bọc tốt |
| Design token / màu sắc | 3 | CSS variables đúng hướng nhưng còn hardcode rải rác |
| Responsive | 3 | Mobile-first khai báo nhưng một số trang thiếu breakpoint |
| Accessibility | 2 | Thiếu aria-label, focus ring, contrast chưa đủ |
| Loading & Empty state | 3 | Pattern đã có nhưng áp dụng không đồng đều |
| Nhất quán typography | 3 | Font weight class tùy tiện (font-bold vs font-700) |

**Kết luận nhanh:** Nền tảng kiến trúc tốt, convention CLAUDE.md rõ ràng. Vấn đề chủ yếu ở lớp thực thi — hardcode màu, thiếu a11y, và một số trang chưa theo pattern chuẩn.

---

## 2. Phân tích kiến trúc hiện tại

### Routing structure
```
src/app/
├── (auth)/           # login, forgot-password
├── dashboard/        # command center (role-based)
├── assets/           # tài sản vật lý
├── domains/          # quản lý tên miền
├── email/            # Zimbra email accounts
├── software/         # bản quyền phần mềm
├── tasks/            # công việc
├── tickets/          # yêu cầu hỗ trợ
├── users/            # quản lý người dùng
├── attendance/       # chấm công ZKTeco
├── leave/            # nghỉ phép
├── overtime/         # tăng ca
├── adjustment/       # bù công
├── hr/               # nguồn nhân lực
├── recruitment/      # tuyển dụng + ATS
├── reports/          # báo cáo
├── settings/         # cài đặt hệ thống
├── help/             # trung tâm trợ giúp
└── notifications/    # thông báo
```

### Phân lớp
- **Layout:** `AppLayout` (sidebar + topbar) bọc tất cả trang authenticated
- **State:** Server Component fetch + Client Component interaction
- **RBAC:** `useUserPermissions` hook + `PermissionGate` component
- **Data:** API route → Service layer → `db.ts` helpers

### Điểm kiến trúc đáng chú ý
- App Router được dùng nhất quán — không mix Pages Router
- Service layer tách biệt rõ ràng khỏi route handler
- SSE cho realtime notifications (không dùng WebSocket)

---

## 3. Module Inventory

### Bảng 20 module chính

| # | Module | Route | Quyền RBAC | Trạng thái UI |
|---|--------|-------|-----------|--------------|
| 1 | Dashboard | `/dashboard` | Tất cả | Hoàn thiện |
| 2 | Tài sản vật lý | `/assets` | `assets` | Hoàn thiện |
| 3 | Tên miền | `/domains` | `domains` | Hoàn thiện |
| 4 | Email Zimbra | `/email` | `email` | Hoàn thiện |
| 5 | Phần mềm | `/software` | `software` | Hoàn thiện |
| 6 | Công việc | `/tasks` | `tasks` | Hoàn thiện |
| 7 | Yêu cầu hỗ trợ | `/tickets` | `tickets` | Hoàn thiện |
| 8 | Người dùng | `/users` | `users` | Hoàn thiện |
| 9 | Chấm công | `/attendance` | `attendance` | Hoàn thiện |
| 10 | Nghỉ phép | `/leave` | `leave` | Hoàn thiện |
| 11 | Tăng ca | `/overtime` | `overtime` | Hoàn thiện |
| 12 | Bù công | `/adjustment` | `adjustment` | Hoàn thiện |
| 13 | Nguồn nhân lực | `/hr` | `hr` | Hoàn thiện |
| 14 | Tuyển dụng | `/recruitment` | `recruitment` | Hoàn thiện |
| 15 | Kho ứng viên | `/recruitment/candidates` | `recruitment` | Hoàn thiện |
| 16 | Báo cáo | `/reports` | `reports` | Một phần |
| 17 | Cài đặt | `/settings` | `settings` | Hoàn thiện |
| 18 | Trợ giúp | `/help` | Public | Hoàn thiện |
| 19 | Thông báo | `/notifications` | Tất cả | Hoàn thiện |
| 20 | Tra cứu tài sản | `/asset-lookup` | Tất cả | Hoàn thiện |

### Sub-routes nổi bật

| Route | Mô tả |
|-------|-------|
| `/assets/[id]` | Chi tiết tài sản + lịch sử |
| `/hr/contracts` | Hợp đồng lao động |
| `/hr/offboarding` | Quy trình nghỉ việc |
| `/hr/compliance` | Tuân thủ luật lao động |
| `/recruitment/[id]` | Chi tiết yêu cầu tuyển dụng |
| `/users/[id]/permissions` | Ma trận phân quyền user |
| `/settings/email-signature` | Chữ ký email Zimbra |
| `/attendance/export` | Xuất bảng công Excel |

---

## 4. Điểm mạnh

1. **AppLayout nhất quán** — Tất cả trang authenticated đều wrap `<AppLayout>`, không trang nào tự vẽ sidebar/topbar, tránh duplication code.

2. **Service layer rõ ràng** — Business logic tập trung ở `src/lib/services/*Service.ts`, route handler chỉ gọi service và trả JSON, dễ test và bảo trì.

3. **db.ts helpers đầy đủ** — `query`, `queryOne`, `execute`, `withTransaction`, `buildInsert`, `buildUpdateById` che giấu boilerplate SQL, nhất quán toàn codebase.

4. **RBAC module/action granular** — Ma trận phân quyền ở `modules.ts` định nghĩa rõ từng action (view/create/edit/delete/approve), `PermissionGate` dùng được ở mọi nơi.

5. **Migration có quy trình** — Convention đánh số + `ADD COLUMN IF NOT EXISTS` làm migration idempotent, dễ reproduce môi trường mới.

6. **SSE realtime** — Server-Sent Events cho notification không cần WebSocket server riêng, phù hợp với Next.js serverless-friendly.

7. **Zimbra integration đầy đủ** — SOAP Admin API client riêng ở `src/lib/zimbra/`, tách biệt khỏi business logic chính.

8. **CSS variables đúng hướng** — `var(--card)`, `var(--foreground)`, `var(--muted-foreground)` được dùng làm nền, đảm bảo theme switching không cần sửa component.

9. **Tiếng Việt nhất quán** — Toàn bộ UI label, toast, empty state, error message đều bằng tiếng Việt, phù hợp người dùng mục tiêu.

10. **Multi-company architecture** — `getEffectiveContext()` tự suy role theo công ty hiện tại, company switcher ở Topbar, không hardcode company_id.

11. **Type safety** — TypeScript 5 với return type tường minh ở service layer, tránh `any` không chú thích.

---

## 5. Vấn đề phát hiện

| # | Area | Issue | Severity | Suggestion |
|---|------|-------|----------|-----------|
| 1 | Màu sắc | Một số component dùng `bg-white`, `text-gray-900`, `border-gray-200` hardcode — vỡ dark mode | 🔴 High | Thay bằng `var(--card)`, `text-foreground`, `border-white/10` |
| 2 | Typography | Trộn lẫn `font-bold` (Tailwind) và `font-700` (custom) cho cùng mục đích | 🟠 Medium | Chọn một: dùng `font-semibold`/`font-bold` Tailwind hoặc custom `font-600`/`font-700` nhất quán |
| 3 | Accessibility | Thiếu `aria-label` trên icon-only button (X đóng modal, bell notification, filter icon) | 🔴 High | Thêm `aria-label="Đóng"`, `aria-label="Thông báo"` v.v. |
| 4 | Loading state | Một số trang không có loading state — render thẳng empty state khi data chưa về | 🟠 Medium | Thêm `isLoading` state + `<Loader2 animate-spin>` theo pattern chuẩn |
| 5 | Empty state | Thiếu "hướng dẫn hành động tiếp theo" ở nhiều empty state — chỉ có text "Chưa có dữ liệu" | 🟡 Low | Thêm button CTA hoặc link điều hướng trong empty state |
| 6 | Form validation | Error message form hiển thị không nhất quán — có nơi dùng toast, có nơi dùng inline text đỏ | 🟠 Medium | Chọn một pattern: inline error dưới field cho validation, toast cho lỗi server |
| 7 | Modal scroll | Modal có nhiều field (form tạo mới) không scroll được trên mobile — bị cắt | 🔴 High | Thêm `overflow-y-auto max-h-[90vh]` cho modal body |
| 8 | Permission check | `api-permissions.checkPermission()` đọc từ header client-gửi — có thể spoof | 🔴 Critical | Đây là nợ kỹ thuật đã biết, cần migrate sang session/token verify phía server |
| 9 | Responsive table | Bảng dữ liệu trên mobile bị tràn ngang, không có horizontal scroll hoặc card layout | 🟠 Medium | Wrap bảng trong `<div className="overflow-x-auto">` hoặc đổi sang card list trên mobile |
| 10 | Console.log | Còn sót `console.log` debug trong một số API route và component | 🟡 Low | Chạy `grep -r "console.log" src/` để tìm và xóa |

---

## 6. Đề xuất ưu tiên

### P0 — Làm ngay (security & broken UX)

**P0.1: Fix modal scroll trên mobile**
```tsx
// Thêm vào modal body
<div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
  {/* form content */}
</div>
```

**P0.2: Thêm aria-label cho icon-only button**
```tsx
// Trước
<button onClick={onClose}><X className="h-4 w-4" /></button>

// Sau
<button onClick={onClose} aria-label="Đóng modal">
  <X className="h-4 w-4" />
</button>
```

**P0.3: Permission API (nợ kỹ thuật)**
- Không thêm feature mới dùng `x-user-permissions` header
- Ưu tiên implement session verify (JWT hoặc DB session) cho các API nhạy cảm mới

### P1 — Sprint tiếp theo (consistency)

**P1.1: Audit và xóa hardcode màu**

Tìm và thay thế:
```bash
# Tìm các file vi phạm
grep -r "bg-white\|text-gray-900\|border-gray-200\|bg-gray-50\|bg-gray-100" src/
```

Thay thế pattern:
```tsx
// Sai
<div className="bg-white border border-gray-200 text-gray-900">

// Đúng
<div className="border border-white/10 text-foreground" style={{ background: 'var(--card)' }}>
```

**P1.2: Nhất quán typography weight**

Chọn convention: dùng Tailwind standard
```tsx
// Thống nhất mapping
font-700 -> font-bold      (700)
font-600 -> font-semibold  (600)
font-500 -> font-medium    (500)
```

**P1.3: Responsive table**
```tsx
// Wrap tất cả <table> trong
<div className="overflow-x-auto rounded-2xl border border-white/5">
  <table className="w-full min-w-[640px]">
    {/* ... */}
  </table>
</div>
```

### P2 — Backlog (polish)

**P2.1: Chuẩn hóa form validation**

Áp dụng pattern thống nhất:
- Inline error (đỏ, dưới field) cho validation phía client
- Toast error cho lỗi phía server
- Không dùng alert() hoặc console.error thay toast

**P2.2: Enriched empty state**
```tsx
// Pattern chuẩn với CTA
<div className="flex flex-col items-center py-20 text-muted-foreground">
  <PackageOpen className="h-10 w-10 mb-3 opacity-30" />
  <p className="text-sm font-medium">Chưa có tài sản nào</p>
  <p className="text-xs mt-1 opacity-60">Thêm tài sản đầu tiên để bắt đầu quản lý</p>
  <button className="btn-indigo mt-4 text-xs px-4 py-2 rounded-xl">
    <Plus className="h-3.5 w-3.5 mr-1" /> Thêm tài sản
  </button>
</div>
```

**P2.3: Loading skeleton thay Loader2**

Đối với danh sách dài, skeleton loader tốt hơn spinner:
```tsx
// Skeleton card
<div className="rounded-2xl border border-white/5 p-4 animate-pulse" style={{ background: 'var(--card)' }}>
  <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
  <div className="h-3 bg-white/5 rounded w-1/2" />
</div>
```

### P3 — Nice to have (DX)

- Tạo `components/ui/DataTable.tsx` tái sử dụng thay vì mỗi trang tự vẽ bảng
- Tạo `components/ui/PageHeader.tsx` cho header row chuẩn (h1 + description + CTA)
- Tạo `components/ui/StatCard.tsx` tái sử dụng cho stats grid
- Document design token vào Storybook hoặc `/help` section

---

## 7. Kết luận

FADO AssetFlowPro có nền tảng kiến trúc vững — App Router nhất quán, service layer rõ ràng, RBAC granular, và convention CLAUDE.md được document tốt. Vấn đề chủ yếu nằm ở lớp thực thi UI chưa đồng đều giữa các module.

**3 việc cần làm ngay:**

1. **Fix modal scroll** trên mobile — ảnh hưởng UX trực tiếp người dùng cuối
2. **Audit hardcode màu** — chạy grep, sửa theo batch, tránh dark mode bị vỡ sau này
3. **Thêm aria-label** cho icon button — đơn giản nhưng bắt buộc cho accessibility

Các vấn đề P1 nên được gộp vào sprint thường kỳ. Không cần refactor lớn — chủ yếu là consistency fixes có thể làm theo module từng cái một.
