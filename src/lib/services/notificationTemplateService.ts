import { randomUUID } from 'crypto';
import { query, execute } from '@/lib/db';
import {
  NotificationTemplate, DEFAULT_NOTIFICATION_TEMPLATES, renderTemplate, escapeTelegramVars,
} from '@/lib/notifications/templates';

/**
 * notificationTemplateService — đọc/ghi mẫu thông báo (bảng notification_templates),
 * merge override DB lên DEFAULT trong code. Mọi truy vấn .catch → DEFAULT (an toàn
 * khi bảng chưa migrate). Cache TTL ngắn + invalidate khi lưu.
 *
 * Hai loại mẫu:
 *  - HỆ THỐNG: key có trong DEFAULT_NOTIFICATION_TEMPLATES (code). DB chỉ ghi đè nội dung
 *    + cờ enabled. Không xoá được (chỉ tắt / khôi phục mặc định).
 *  - TÙY CHỈNH (is_custom): admin tự tạo, key dạng `custom:<uuid>`, KHÔNG có DEFAULT.
 *    Toàn bộ nội dung nằm ở DB. Dùng để GỬI THỦ CÔNG. Xoá được.
 */

const CACHE_TTL_MS = 60_000;
const CUSTOM_CATEGORY = 'Tùy chỉnh';

interface OverrideRow {
  template_key: string;
  title: string | null;
  message: string | null;
  icon: string | null;
  telegram: string | null;
  enabled: boolean | null;
  is_custom: boolean | null;
  category: string | null;
  label: string | null;
  placeholders: string | null;
}

interface OverrideEntry {
  title?: string;
  message?: string;
  icon?: string;
  telegram?: string;
  enabled: boolean;        // mặc định true
  isCustom: boolean;
  category?: string;
  label?: string;
  placeholders?: string[];
}

let cache: { rows: Record<string, OverrideEntry>; expires: number } | null = null;

export function invalidateNotificationTemplateCache(): void {
  cache = null;
}

async function readOverrides(): Promise<Record<string, OverrideEntry>> {
  if (cache && cache.expires > Date.now()) return cache.rows;
  const map: Record<string, OverrideEntry> = {};
  try {
    const rows = await query<OverrideRow>(
      `SELECT template_key, title, message, icon, telegram, enabled, is_custom, category, label, placeholders
         FROM notification_templates`
    );
    for (const r of rows) {
      const o: OverrideEntry = {
        enabled: r.enabled !== false,
        isCustom: r.is_custom === true,
      };
      if (r.title != null) o.title = r.title;
      if (r.message != null) o.message = r.message;
      if (r.icon != null) o.icon = r.icon;
      if (r.telegram != null) o.telegram = r.telegram;
      if (r.category != null) o.category = r.category;
      if (r.label != null) o.label = r.label;
      if (r.placeholders != null) {
        try { o.placeholders = JSON.parse(r.placeholders); } catch { o.placeholders = []; }
      }
      map[r.template_key] = o;
    }
  } catch {
    // bảng chưa tồn tại / chưa migrate cột → dùng DEFAULT
  }
  cache = { rows: map, expires: Date.now() + CACHE_TTL_MS };
  return map;
}

/** Build NotificationTemplate cho 1 mẫu custom từ bản ghi DB. */
function customToTemplate(o: OverrideEntry): NotificationTemplate {
  return {
    category: o.category ?? CUSTOM_CATEGORY,
    label: o.label ?? '(mẫu tùy chỉnh)',
    title: o.title ?? '',
    message: o.message ?? '',
    icon: o.icon ?? 'bell',
    telegram: o.telegram,
    placeholders: o.placeholders ?? [],
  };
}

/** Mẫu đã resolve cho 1 key (merge DB lên DEFAULT, hoặc custom thuần DB). null nếu không có. */
export async function getTemplate(key: string): Promise<NotificationTemplate | null> {
  const overrides = await readOverrides();
  const o = overrides[key];
  const base = DEFAULT_NOTIFICATION_TEMPLATES[key];
  if (!base) {
    // không phải mẫu hệ thống → chỉ hợp lệ nếu là custom trong DB
    return o?.isCustom ? customToTemplate(o) : null;
  }
  if (!o) return base;
  const merged: NotificationTemplate = { ...base };
  if (o.title != null) merged.title = o.title;
  if (o.message != null) merged.message = o.message;
  if (o.icon != null) merged.icon = o.icon;
  if (o.telegram != null) merged.telegram = o.telegram;
  return merged;
}

/** Mẫu có đang BẬT không? (engine dùng để bỏ qua mẫu đã tắt). Mặc định BẬT. */
export async function isTemplateEnabled(key: string): Promise<boolean> {
  const overrides = await readOverrides();
  const o = overrides[key];
  return o ? o.enabled : true;
}

export interface RenderedNotification {
  title: string;
  message: string;
  icon: string;
  /** Text Telegram đã render (variant) — null nếu không có biến thể (caller dùng fallback). */
  telegram: string | null;
}

/**
 * Render thông báo theo key + biến. Key không tồn tại → null (caller dùng fallback cũ).
 * Đây là điểm vào cho mọi service phát thông báo. Telegram variant escape giá trị biến.
 */
export async function renderNotification(
  key: string,
  vars: Record<string, string | number>,
): Promise<RenderedNotification | null> {
  const tpl = await getTemplate(key);
  if (!tpl) return null;
  return {
    title: renderTemplate(tpl.title, vars),
    message: renderTemplate(tpl.message, vars),
    icon: tpl.icon,
    telegram: tpl.telegram ? renderTemplate(tpl.telegram, escapeTelegramVars(vars)) : null,
  };
}

// ─── CRUD cho UI ─────────────────────────────────────────────────────────────

export interface TemplateView {
  key: string;
  category: string;
  label: string;
  title: string;
  message: string;
  icon: string;
  telegram: string;        // '' = dùng fallback
  hasTelegramDefault: boolean; // DEFAULT có sẵn biến thể telegram?
  placeholders: string[];
  isOverridden: boolean;
  enabled: boolean;
  isCustom: boolean;
}

/** Danh sách mọi mẫu đã resolve (hệ thống + custom) kèm meta để UI hiển thị + sửa. */
export async function listTemplates(): Promise<TemplateView[]> {
  const overrides = await readOverrides();
  const out: TemplateView[] = [];

  // 1) Mẫu hệ thống (từ DEFAULT, merge override)
  for (const [key, base] of Object.entries(DEFAULT_NOTIFICATION_TEMPLATES)) {
    const o = overrides[key];
    const overriddenKeys = o
      ? ['title', 'message', 'icon', 'telegram'].filter((k) => (o as unknown as Record<string, unknown>)[k] != null)
      : [];
    out.push({
      key,
      category: base.category,
      label: base.label,
      title: o?.title ?? base.title,
      message: o?.message ?? base.message,
      icon: o?.icon ?? base.icon,
      telegram: o?.telegram ?? base.telegram ?? '',
      hasTelegramDefault: !!base.telegram,
      placeholders: base.placeholders,
      isOverridden: overriddenKeys.length > 0,
      enabled: o ? o.enabled : true,
      isCustom: false,
    });
  }

  // 2) Mẫu custom (chỉ ở DB)
  for (const [key, o] of Object.entries(overrides)) {
    if (!o.isCustom) continue;
    out.push({
      key,
      category: o.category ?? CUSTOM_CATEGORY,
      label: o.label ?? '(mẫu tùy chỉnh)',
      title: o.title ?? '',
      message: o.message ?? '',
      icon: o.icon ?? 'bell',
      telegram: o.telegram ?? '',
      hasTelegramDefault: false,
      placeholders: o.placeholders ?? [],
      isOverridden: true,
      enabled: o.enabled,
      isCustom: true,
    });
  }

  return out;
}

/** Lưu (ghi đè) nội dung 1 mẫu hệ thống. KHÔNG đụng cờ enabled/is_custom. */
export async function saveTemplate(
  key: string,
  data: { title: string; message: string; icon: string; telegram?: string },
  actor: string | null,
): Promise<void> {
  await execute(
    `INSERT INTO notification_templates (template_key, title, message, icon, telegram, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (template_key) DO UPDATE
       SET title = EXCLUDED.title, message = EXCLUDED.message, icon = EXCLUDED.icon,
           telegram = EXCLUDED.telegram, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, data.title, data.message, data.icon, data.telegram?.trim() ? data.telegram.trim() : null, actor]
  );
  invalidateNotificationTemplateCache();
}

/** Bật/tắt 1 mẫu (hệ thống hoặc custom). Mẫu hệ thống chưa có override → tạo dòng cờ. */
export async function setTemplateEnabled(key: string, enabled: boolean, actor: string | null): Promise<void> {
  await execute(
    `INSERT INTO notification_templates (template_key, enabled, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (template_key) DO UPDATE
       SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, enabled, actor]
  );
  invalidateNotificationTemplateCache();
}

/** Tạo 1 mẫu TÙY CHỈNH. Trả về key mới (`custom:<uuid>`). */
export async function createCustomTemplate(
  data: { label: string; title: string; message: string; telegram?: string; icon?: string; placeholders?: string[] },
  actor: string | null,
): Promise<string> {
  const key = `custom:${randomUUID()}`;
  await execute(
    `INSERT INTO notification_templates
       (template_key, title, message, icon, telegram, enabled, is_custom, category, label, placeholders, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8, $9, NOW())`,
    [
      key, data.title, data.message, data.icon?.trim() || 'bell',
      data.telegram?.trim() ? data.telegram.trim() : null,
      CUSTOM_CATEGORY, data.label,
      JSON.stringify(data.placeholders ?? []), actor,
    ]
  );
  invalidateNotificationTemplateCache();
  return key;
}

/** Cập nhật nội dung 1 mẫu custom. */
export async function updateCustomTemplate(
  key: string,
  data: { label: string; title: string; message: string; telegram?: string; icon?: string },
  actor: string | null,
): Promise<void> {
  await execute(
    `UPDATE notification_templates
       SET title = $2, message = $3, icon = $4, telegram = $5, label = $6, updated_by = $7, updated_at = NOW()
     WHERE template_key = $1 AND is_custom = true`,
    [key, data.title, data.message, data.icon?.trim() || 'bell',
      data.telegram?.trim() ? data.telegram.trim() : null, data.label, actor]
  );
  invalidateNotificationTemplateCache();
}

/** Xoá 1 mẫu TÙY CHỈNH (mẫu hệ thống không xoá được). */
export async function deleteCustomTemplate(key: string): Promise<void> {
  await execute(`DELETE FROM notification_templates WHERE template_key = $1 AND is_custom = true`, [key]);
  invalidateNotificationTemplateCache();
}

/** Khôi phục 1 mẫu HỆ THỐNG về DEFAULT (xoá override). Custom thì dùng deleteCustomTemplate. */
export async function resetTemplate(key: string): Promise<void> {
  await execute(`DELETE FROM notification_templates WHERE template_key = $1 AND is_custom = false`, [key]);
  invalidateNotificationTemplateCache();
}

/** Dùng cho code khác nếu cần kiểm tra key hợp lệ (hệ thống). */
export function isKnownTemplateKey(key: string): boolean {
  return key in DEFAULT_NOTIFICATION_TEMPLATES;
}

/** Key custom hợp lệ về cú pháp? */
export function isCustomTemplateKey(key: string): boolean {
  return /^custom:[0-9a-fA-F-]{8,}$/.test(key);
}
