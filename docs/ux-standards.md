# UX Standards — FADOAssetFlowPro

> **Bộ quy tắc UX cho toàn bộ webapp.** Mọi trang/component/modal mới PHẢI tuân theo.
> Đây là chuẩn dùng chung — có thể export sang dự án khác (các primitive đều độc lập).
> Kiểm tra **Checklist cuối file** trước khi giao việc.

---

## 0. NỀN TẢNG DÙNG CHUNG (đã xây — luôn dùng lại, KHÔNG tự chế)

| Mục đích | Import | Cách dùng |
|----------|--------|-----------|
| Toast nổi | `useToast` từ `@/context/ToastContext` | `const toast = useToast(); toast.success/error/info/warning('...')` |
| Xác nhận (thay window.confirm) | `useConfirm` từ `@/context/ConfirmContext` | `if (await confirm({ title, message, danger: true })) {...}` |
| ESC đóng modal | `useEscapeKey` từ `@/hooks/useEscapeKey` | `useEscapeKey(onClose)` hoặc `useEscapeKey(onClose, isOpen)` |
| Cảnh báo chưa lưu | `useUnsavedGuard` từ `@/hooks/useUnsavedGuard` | `const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose)` |
| Trạng thái rỗng | `EmptyState` từ `@/components/ui/EmptyState` | `<EmptyState icon={Icon} title description action />` |
| Trạng thái lỗi | `ErrorState` từ `@/components/ui/ErrorState` | `<ErrorState onRetry={reload} message? />` |
| Skeleton tải | `@/components/ui/LoadingSkeleton` | `CardGridSkeleton`, `ListSkeleton`, `TableRowSkeleton`, `MetricCardSkeleton`, `SkeletonBlock` |
| Tương thích cũ | `useNotification` từ `@/lib/useNotification` | `showNotification(msg, 'success'\|'error'\|'info')` → route qua toast |

Providers mount sẵn ở `src/app/layout.tsx`: `ToastProvider` → `ConfirmProvider` → ...

---

## 1. THÔNG BÁO & PHẢN HỒI

### ❌ TUYỆT ĐỐI KHÔNG
```ts
alert('Lưu thành công');        // ❌ popup trình duyệt
window.confirm('Bạn có chắc?'); // ❌ chặn UI, xấu, không theme
```

### ✅ THAY BẰNG
```tsx
const toast = useToast();
toast.success('Đã lưu thay đổi');         // xanh, tự tắt 3s
toast.error('Lỗi: ' + e.message);          // đỏ, tự tắt 5s
toast.warning('Tồn kho thấp');             // vàng, 4s
toast.info('Đang đồng bộ...');             // chàm, 3s

const confirm = useConfirm();
if (await confirm({ title: 'Xóa?', message: '...', confirmLabel: 'Xóa', danger: true })) {
  // người dùng đã đồng ý
}
```

**Quy tắc:** mọi hành động lưu/xóa/gửi **thành công** phải có `toast.success`; **thất bại** phải có `toast.error`. KHÔNG đóng modal im lặng.

---

## 2. MODAL

| Thành phần | Bắt buộc |
|-----------|----------|
| ESC đóng | `useEscapeKey(...)` — MỌI modal |
| Backdrop click đóng | overlay `onClick` đóng + content `onClick={e=>e.stopPropagation()}` |
| Cảnh báo chưa lưu | CHỈ modal form tạo/sửa — `useUnsavedGuard` |
| Cuộn khi dài | `max-h-[85vh] overflow-y-auto` ở body |
| Vai trò a11y | `role="dialog"` / `alertdialog` + `aria-modal="true"` + `aria-label` |

### Modal form tạo/sửa — đủ 4 bước unsaved-guard
```tsx
const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
useEscapeKey(guardedClose);
// 1. div nội dung / <form>: onChange={markDirty}
// 2. nút X / Hủy / backdrop / ESC → guardedClose
// 3. sau lưu thành công: markClean(); onClose();
```

### Modal xem/xác nhận — chỉ ESC + backdrop
```tsx
useEscapeKey(onClose);   // hoặc useEscapeKey(onClose, isOpen) nếu return sớm
```

> ⚠️ Hook gọi **TOP-LEVEL vô điều kiện** (trước mọi `if(!isOpen) return null`). Modal render có điều kiện → dùng tham số `enabled`: `useEscapeKey(onClose, isOpen)`.

---

## 3. VÒNG ĐỜI TẢI DỮ LIỆU (quan trọng nhất)

Mọi trang/component tự fetch danh sách PHẢI render đủ **4 trạng thái** theo thứ tự:

```tsx
{loading ? (
  <CardGridSkeleton />                              // 1. ĐANG TẢI — skeleton/spinner
) : error ? (
  <ErrorState onRetry={reload} />                   // 2. LỖI — báo + nút thử lại
) : items.length === 0 ? (
  <EmptyState icon={Icon} title="Chưa có ..." />    // 3. RỖNG — hướng dẫn
) : (
  <div>{items.map(...)}</div>                        // 4. CÓ DỮ LIỆU
)}
```

```tsx
const [error, setError] = useState(false);
const load = useCallback(async () => {
  try { setLoading(true); setError(false); setItems(await fetchX()); }
  catch (e) { console.error(e); setError(true); }      // KHÔNG để list rỗng giả "không có data"
  finally { setLoading(false); }
}, [deps]);
```

> ❌ **Lỗi phổ biến nhất:** API fail → `setItems([])` → hiện "Chưa có dữ liệu" → người dùng tưởng KHÔNG có data trong khi thật ra LỖI. Luôn phân biệt **rỗng** vs **lỗi**.

---

## 4. PHẢN HỒI HÀNH ĐỘNG

### ❌ Không nuốt lỗi ở hành động người dùng
```tsx
await saveSettings(x).catch(() => {});   // ❌ user tưởng đã lưu mà mất dữ liệu
```
```tsx
try { await saveSettings(x); toast.success('Đã lưu'); }
catch (e) { toast.error('Lưu thất bại, thử lại'); }   // ✅
```
> Ngoại lệ: fetch nền fire-and-forget (đếm badge, ping, prefetch) được phép im lặng.

### Khóa nút async khi đang xử lý (chống double-submit)
```tsx
const [busy, setBusy] = useState(false);
<button disabled={busy} onClick={async () => { setBusy(true); try{...} finally{ setBusy(false); }}}>
  {busy ? 'Đang xử lý...' : 'Lưu'}
</button>
```

---

## 5. LOADING STATE

| Tình huống | Dùng |
|-----------|------|
| Tải trang/danh sách lần đầu | Skeleton (`CardGridSkeleton`/`ListSkeleton`/`TableRowSkeleton`) |
| Tải nhỏ / inline | `<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />` |
| Nút đang xử lý | `disabled` + nhãn "Đang xử lý..." |
| Refresh nền sau khi đã có data | **Im lặng** (silent), không bật loading toàn trang |

❌ KHÔNG dùng text trơn `<div>Đang tải...</div>`.

---

## 6. EMPTY STATE
Mọi danh sách rỗng dùng `<EmptyState>`: **icon + tiêu đề + mô tả + (nếu hợp lý) nút hành động**. KHÔNG để màn trống.

---

## 7. FORM
- Bọc `<form onSubmit>` để Enter submit được; nút submit `type="submit"`.
- Field bắt buộc đánh dấu `*` + `required`/`aria-required`.
- Lỗi validation hiện **ngay cạnh field**, không chỉ disable nút.
- Sau submit thành công: `toast.success` + đóng/giữ tùy ngữ cảnh.

---

## 8. ACCESSIBILITY (tối thiểu)
- Nút icon-only: bắt buộc `aria-label` (tiếng Việt).
- Modal: `role="dialog"`/`alertdialog` + `aria-modal="true"` + `aria-label`.
- Ảnh `<img>`: `alt` (rỗng `alt=""` nếu trang trí).
- Liên kết label↔input bằng `htmlFor`/`id`.

---

## 9. MOBILE / RESPONSIVE (mobile-first)
- Bảng rộng: bọc `<div className="overflow-x-auto">` (hoặc card-list riêng cho mobile).
- Modal dài: body `max-h-[85vh] overflow-y-auto`.
- Vùng chạm ≥ 32px; tôn trọng `env(safe-area-inset-*)` (notch/home).
- Breakpoint: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` ...

---

## 10. MÀU SẮC & THEME
- CHỈ dùng biến CSS + Tailwind dark-safe: `var(--card)`, `var(--background)`, `var(--foreground)`, `var(--muted-foreground)`, `border-white/5`, `bg-white/5`, `text-indigo-400`, `bg-indigo-600`, `bg-[#162033]`.
- ❌ KHÔNG hardcode màu sáng (`#fff`, `white`, `gray-100`...), KHÔNG inline style cho màu.

---

## 11. VỆ SINH MÃ
- KHÔNG để `console.log` debug trong component UI (đã dọn). Server/scheduler có log chủ đích (prefix `[Tên]`) thì được.
- KHÔNG `console.log` mật khẩu/dữ liệu nhạy cảm.
- Giữ `console.error`/`console.warn` cho xử lý lỗi.

---

## ✅ CHECKLIST TRƯỚC KHI GIAO (trang/feature mới)
- [ ] alert()/window.confirm() → toast/useConfirm
- [ ] Mọi action thành công/thất bại có toast
- [ ] Không nuốt lỗi ở hành động người dùng
- [ ] Modal: ESC + backdrop đóng; form sửa có cảnh báo chưa lưu
- [ ] 4 trạng thái: loading (skeleton) → error (ErrorState+retry) → empty (EmptyState) → data
- [ ] Nút async có disabled khi đang xử lý
- [ ] Loading dùng skeleton/spinner, không phải text "Đang tải..."
- [ ] Form: Enter submit, field bắt buộc đánh dấu, lỗi cạnh field
- [ ] A11y: aria-label nút icon, role modal, alt ảnh
- [ ] Mobile: bảng cuộn ngang, modal cuộn dọc, safe-area
- [ ] Chỉ dùng màu CSS variables (dark-safe), không hardcode màu sáng
- [ ] Không còn console.log debug
- [ ] `npm run type-check` + `npm run build` pass

---

## TRẠNG THÁI ÁP DỤNG (cập nhật 2026-06)

| Hạng mục | Trạng thái |
|----------|-----------|
| alert()/confirm() → toast/confirm (toàn webapp) | ✅ XONG (~210 chỗ) |
| ESC + backdrop + dirty-guard cho modal (toàn webapp) | ✅ XONG (~100 modal) |
| Error state + skeleton + empty state (vòng đời tải) | ✅ XONG (các trang chính) |
| Nuốt-lỗi-lưu → toast | ✅ XONG (hành động chính) |
| Khóa nút async double-submit | ✅ XONG (các nút rủi ro) |
| Dọn console.log debug UI | ✅ XONG (~75 dòng) |
| A11y aria-label + role modal | ✅ Cơ bản |
| Mobile overflow/scroll | ✅ Cơ bản |
| console.log trong API routes (server) | ⬜ Để sau (ít ảnh hưởng UX) |
