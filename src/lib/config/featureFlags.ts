/**
 * Cờ tính năng (build-time, inline qua NEXT_PUBLIC_*).
 *
 * LIGHT_THEME_ENABLED — bật/tắt giao diện Sáng cho người dùng.
 *   - Dev (.env): NEXT_PUBLIC_ENABLE_LIGHT_THEME=true  → hiện toggle, dùng được light.
 *   - Prod (Coolify không set biến này) → mặc định FALSE → light bị khoá hoàn toàn:
 *       toggle ẩn, luôn render dark, lớp shim CSS nằm im (chỉ áp dưới <html class="light">).
 *   ⇒ "dark launch": code nằm trong nhánh/đã build nhưng KHÔNG lộ ra product cho tới
 *     khi token hoá xong và bật cờ ở prod.
 */
export const LIGHT_THEME_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_LIGHT_THEME === 'true';
