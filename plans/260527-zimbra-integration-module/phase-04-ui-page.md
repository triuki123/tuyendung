---
phase: 4
title: "UI Page"
status: pending
priority: P2
effort: "1.5d"
dependencies: [3]
---

# Phase 4: UI Page
## Overview
Trang `/asset-management/zimbra` với tab: Domains, Accounts (search/create/reset), Groups (list + add/remove member). Gọi API qua fetch, theo pattern client component hiện có. **Lazy-load: chỉ fetch tab đang active**, tránh sập app khi Zimbra down.

## Requirements
- Functional: hiển thị domain; search + tạo account + reset password (modal báo password mới); list group + add/remove member.
- Non-functional: Tailwind + component hiện có; loading/error/empty state rõ; chỉ admin thấy nút thao tác; lazy fetch theo tab.

## Architecture
- File mới: `src/app/asset-management/zimbra/page.tsx` + `src/app/asset-management/zimbra/components/*`.
- Pattern: `page.tsx` render client component (như `email-accounts/page.tsx` → `EmailAccountsClient`).
- Components: `ZimbraClient.tsx` (tab container), `DomainsTab.tsx`, `AccountsTab.tsx`, `GroupsTab.tsx`. Mỗi file < 200 dòng.
- **Lazy-load:** mỗi tab fetch dữ liệu **khi được mở** (không fetch cả 3 lúc mount). Zimbra down → chỉ tab active chờ timeout, không 3 request song song treo.
- Data fetch `/api/zimbra/*` (qua `lib/api-client.ts` nếu phù hợp).
- Reset password → modal hiện `newPassword` + nút copy.
- **Nav link:** thêm vào `src/app/asset-management/components/AssetManagementSidebar.tsx` (mảng `label`/`href`, ~dòng 23-45) — **KHÔNG phải `layout.tsx`** (layout chỉ render sidebar).

## Related Code Files
- Create: `src/app/asset-management/zimbra/page.tsx`
- Create: `src/app/asset-management/zimbra/components/ZimbraClient.tsx`
- Create: `src/app/asset-management/zimbra/components/DomainsTab.tsx`
- Create: `src/app/asset-management/zimbra/components/AccountsTab.tsx`
- Create: `src/app/asset-management/zimbra/components/GroupsTab.tsx`
- Modify: `src/app/asset-management/components/AssetManagementSidebar.tsx` (thêm entry Zimbra vào mảng link)
- Read for context: `src/app/asset-management/email-accounts/page.tsx` + components

## Implementation Steps
1. `page.tsx` → render `ZimbraClient`.
2. `ZimbraClient`: tab state; render tab active, fetch lazy khi đổi tab.
3. `DomainsTab`: fetch `/api/zimbra/domains` khi active, bảng đơn giản.
4. `AccountsTab`: ô search (domain + query) → `/api/zimbra/accounts`; form tạo account (xử lý 409 trùng); nút reset → modal newPassword + copy.
5. `GroupsTab`: list group; chọn group → add/remove member (input email).
6. Thêm nav link Zimbra trong `AssetManagementSidebar.tsx`.
7. Loading/error/empty states; thông báo rõ khi Zimbra unreachable.

## Success Criteria
- [ ] Trang `/asset-management/zimbra` load, 3 tab hoạt động, fetch lazy theo tab.
- [ ] Search account hiển thị kết quả; tạo account thành công + toast; trùng → báo 409 rõ.
- [ ] Reset password hiện modal password mới + copy được.
- [ ] Add/remove member group cập nhật UI.
- [ ] User không đủ quyền không thấy nút thao tác (UI) + server vẫn chặn (P3).
- [ ] Zimbra down → chỉ tab active báo lỗi, app không treo.

## Risk Assessment
- Nav file đúng = `AssetManagementSidebar.tsx` (đã xác minh), không sửa layout.tsx.
- Password plaintext trong modal: người dùng chấp nhận; không log console/server ngoài payload.
- Eager fetch 3 tab gây cascade → lazy-load bắt buộc (Success Criterion).
