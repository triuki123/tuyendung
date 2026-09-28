# Bản đồ Token Giao Diện (Phase 1)

Hợp đồng cho codemod Phase 3: thay màu hardcode → token ngữ nghĩa.
**Nguyên tắc:** giá trị **dark của token = đúng mã hardcode cũ** ⇒ đổi sang token KHÔNG làm dark xê dịch. Light tự thích ứng qua `html.light`.

## Map tự động (codemod thay thẳng)

| Cũ (hardcode) | Mới (utility) | CSS var | Dark | Light |
|---|---|---|---|---|
| `bg-[#162033]` | `bg-surface-2` | `--surface-2` | `#162033` | `#f1f5f9` |
| `bg-[var(--card)]` / inline `var(--card)` | `bg-surface` | `--surface` | `#0f1c2e` | `#ffffff` |
| nền trang (`var(--background)`) | `bg-canvas` | `--canvas` | `#060e1a` | `#e8ebf1` |
| `border-white/5` | `border-line-subtle` | `--line-subtle` | `rgba(255,255,255,.05)` | `rgba(15,23,42,.10)` |
| `border-white/10` | `border-line` | `--line` | `rgba(255,255,255,.10)` | `rgba(15,23,42,.14)` |
| `border-white/20` | `border-line-strong` | `--line-strong` | `rgba(255,255,255,.20)` | `rgba(15,23,42,.16)` |
| `text-foreground` | `text-ink` | `--ink` | `#f1f5f9` | `#0f172a` |
| `text-muted-foreground`, `text-slate-400`, `text-slate-300` | `text-ink-muted` | `--ink-muted` | `#94a3b8` | `#475569` |
| `text-slate-500`, `text-gray-500` | `text-ink-faint` | `--ink-faint` | `#64748b` | `#64748b` |

## Cần DUYỆT TAY (nhập nhằng — codemod chỉ gắn cờ, không tự thay)

| Token | Vì sao | Quy tắc duyệt |
|---|---|---|
| `text-white` (386 chỗ) | Trên nút màu phải GIỮ trắng; trên nền thì → `text-ink` | Xem nền cha: nút/badge màu → giữ; còn lại → `text-ink` |
| `bg-white/5` (204) | Có thể là **mặt phẳng** hoặc **hover** | Hover (kèm `hover:`) → `hover:bg-hover`; nền tĩnh → `bg-hover` |
| `text-indigo-400`, `text-emerald-400`… | Màu nhấn — chưa có token accent | Để lại cho bộ token accent (Phase 1.5/3), tạm giữ shim |
| Gradient / inline-style nền tối | Không bắt được theo class | Sửa thủ công theo component |

## Trạng thái
- Token đã định nghĩa: `tailwind.config.js` (colors) + `tailwind.css` (`:root` dark, `html.light` light).
- Shim cũ vẫn chạy song song (cầu nối) cho file CHƯA migrate — gỡ ở Phase 5.
- Mỗi đợt migrate phải pass `npm run test:visual` (dark không đổi).
