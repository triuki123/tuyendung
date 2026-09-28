# Nhận Diện Thương Hiệu — AssetFlow Pro

**Cập nhật:** 2026-05-27

---

## Màu Sắc Chính

| Tên | Hex | CSS Variable | Sử Dụng |
|-----|-----|-------------|---------|
| Navy | `#0B1F3B` | `--primary` | Sidebar, nền chính, navigation |
| Red | `#C62828` | `--accent` | Nút CTA, badges, avatar gradient |
| Indigo | `#6366f1` | `--indigo` | Màu hỗ trợ, active nav, gradient |
| Background | `#060e1a` | `--background` | Nền tối toàn app |
| Card | `#0f1c2e` | `--card` | Nền card, modal |
| Foreground | `#f1f5f9` | `--foreground` | Text chính |
| Muted | `#94a3b8` | `--muted-foreground` | Text phụ |
| Glass | `rgba(11,31,59,0.85)` | `--glass-bg` | Glass morphism |

CSS variables định nghĩa trong `src/styles/tailwind.css`. Tailwind config trong `tailwind.config.js` map tất cả màu qua CSS custom properties.

---

## Logo

- **File:** `/public/assets/images/app_logo.png` (316 KB)
- **Fallback image:** `/public/assets/images/no_image.png`
- **Favicon:** `/favicon.ico`

### AppLogo Component

**File:** `src/components/ui/AppLogo.tsx`

```jsx
// Sidebar (expanded)
<AppLogo size={32} />

// Topbar (mobile)
<AppLogo size={24} />

// Custom
<AppLogo size={48} src="/custom-logo.png" />
```

Props mặc định: `src='/assets/images/app_logo.png'`, `size=64`. Hỗ trợ fallback về icon nếu ảnh lỗi.

---

## Typography

- **Font chính:** Plus Jakarta Sans (Google Fonts)
- **CSS Variable:** `--font-plus-jakarta-sans`
- **Áp dụng:** Toàn bộ UI text

| Cấp độ | Class Tailwind |
|--------|---------------|
| H1 / Page Title | `text-3xl font-bold text-foreground` |
| H2 / Section Title | `text-2xl font-bold text-foreground` |
| Label | `text-xs font-semibold text-muted-foreground uppercase` |
| Body | `text-sm font-medium text-foreground` |
| Helper / Muted | `text-xs text-muted-foreground/70` |

---

## Metadata App

Định nghĩa trong `src/app/layout.tsx`:

```typescript
export const metadata: Metadata = {
  title: 'AssetFlow Pro — Hệ thống quản lý tài sản doanh nghiệp',
  description: 'AssetFlow Pro giúp doanh nghiệp quản lý toàn bộ vòng đời tài sản...',
  icons: { icon: [{ url: '/favicon.ico', type: 'image/x-icon' }] },
};
```

Theme color trình duyệt mobile: `#060e1a`

---

## Visual Style

### Glass Morphism Cards
- Background: `var(--glass-bg)` (Navy với độ trong suốt)
- Border: `1px solid rgba(255,255,255,0.08)`
- Backdrop blur: `20px`
- Class utility: `glass-card`, `glass-card-hover`

### Buttons
- **Primary CTA:** class `.btn-accent` — Red `#C62828` gradient, hover darker red + glow
- **Dùng cho:** Lưu, Tạo, Submit

### Status Badges

| Trạng thái | Màu | Tailwind |
|-----------|-----|---------|
| Approved / Active | Green | `#34d399` |
| Rejected / Error | Red | `#f87171` |
| Pending | Amber | `#fbbf24` |
| Info / Important | Indigo | `#a5b4fc` |

### User Avatars
Gradient: `linear-gradient(Indigo #6366f1 → Red #C62828)`

### Spacing & Radius

| Element | Mobile | Tablet+ |
|---------|--------|---------|
| Gap | `gap-2` | `gap-3 sm:gap-4` |
| Padding | `p-3` | `p-3 sm:p-4` |
| Radius nhỏ | `rounded-lg` (12px) | |
| Radius vừa | `rounded-xl` (16px) | |
| Radius lớn | `rounded-2xl` (24px) | |

### Hover / Transitions
- Cards: lift Y-axis + glow shadow (class `glass-card-hover`)
- Buttons: color shift + slight lift
- Duration: 150–300ms ease

---

## Brand Elements Trong App

### Sidebar
- Background: `var(--primary)` (Navy)
- Logo: AssetFlow với chữ "Pro" màu gradient indigo
- Active nav item: indigo accent + left border
- User avatar: Indigo → Red gradient

### Topbar
- Background: Navy + glass morphism
- Logo 24px, click về Dashboard
- Search bar: Navy background, white text
- User avatar: Indigo → Red gradient

---

## Cải Tiến Tiếp Theo (Tùy Chọn)

- Custom favicon 32×32 và 64×64 với Navy + Red
- Logo variations: horizontal, vertical, icon-only
- Brand-themed loading spinners
- Branded error pages (404, 500)
