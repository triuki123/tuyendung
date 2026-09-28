/**
 * Registry widget Dashboard — nguồn sự thật duy nhất cho danh mục widget,
 * dùng bởi cả 3 shell (super_admin/admin, manager, user) và UI Tuỳ chỉnh.
 *
 * Thứ tự phần tử trong mảng = thứ tự MẶC ĐỊNH (sau khi filter theo role).
 * User chưa tuỳ chỉnh (dashboard_layout NULL) thấy đúng bố cục hiện hành.
 */

export type DashboardSlot = 'full' | 'main' | 'side';

export interface DashboardWidgetMeta {
  id: string;
  /** Tên hiển thị trong chế độ Tuỳ chỉnh */
  label: string;
  slot: DashboardSlot;
  /** Role được thấy widget (giữ đúng gating hiện tại; RBAC module để phase sau) */
  roles: string[];
}

/** Cấu hình per-user lưu ở users.dashboard_layout (JSONB). NULL = mặc định. */
export interface DashboardLayoutConfig {
  hidden: string[];
  order: string[];
}

const ADMIN = ['super_admin', 'admin'];

export const DASHBOARD_WIDGETS: DashboardWidgetMeta[] = [
  // ── Slot full-width ──
  { id: 'command-metrics', label: 'Dải Chỉ Số KPI', slot: 'full', roles: ADMIN },
  { id: 'manager-kpi', label: 'Chỉ Số Đội Ngũ', slot: 'full', roles: ['manager'] },
  { id: 'user-quick-actions', label: 'Thao Tác Nhanh', slot: 'full', roles: ['user'] },

  // ── Cột chính (2/3) ──
  { id: 'action-items', label: 'Cần Xử Lý Hôm Nay', slot: 'main', roles: ADMIN },
  { id: 'hr-insights', label: 'Phân Tích Nhân Sự', slot: 'main', roles: ADMIN },
  { id: 'user-action-items', label: 'Cần Xử Lý', slot: 'main', roles: ['user'] },
  { id: 'manager-approvals', label: 'Cần Tôi Duyệt', slot: 'main', roles: ['manager'] },
  { id: 'manager-team-today', label: 'Đội Ngũ Hôm Nay', slot: 'main', roles: ['manager'] },
  { id: 'user-my-work', label: 'Việc Của Tôi', slot: 'main', roles: ['user', 'manager'] },
  { id: 'user-room-bookings', label: 'Phòng Họp Của Tôi', slot: 'main', roles: ['user'] },

  // ── Cột phải (1/3) ──
  { id: 'announcements', label: 'Thông Báo', slot: 'side', roles: [...ADMIN, 'manager', 'user'] },
  { id: 'documents', label: 'Văn Bản – Quyết Định', slot: 'side', roles: [...ADMIN, 'manager', 'user'] },
  { id: 'user-statistics', label: 'Thống Kê Của Tôi', slot: 'side', roles: ['user'] },
  { id: 'user-recent-activity', label: 'Hoạt Động Gần Đây', slot: 'side', roles: ['user'] },
];

/** Danh mục widget của một role, theo thứ tự mặc định. */
export function widgetsForRole(role: string): DashboardWidgetMeta[] {
  return DASHBOARD_WIDGETS.filter((w) => w.roles.includes(role));
}

/** Chuẩn hoá config đọc từ DB/localStorage (chống dữ liệu rác). */
export function normalizeLayout(raw: unknown): DashboardLayoutConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { hidden: arr(o.hidden), order: arr(o.order) };
}

/**
 * Áp config lên danh mục widget: bỏ widget ẩn, sắp theo `order`;
 * widget không có trong order giữ vị trí mặc định (xếp sau, theo thứ tự registry).
 */
export function applyLayout(
  widgets: DashboardWidgetMeta[],
  layout: DashboardLayoutConfig | null
): DashboardWidgetMeta[] {
  if (!layout) return widgets;
  const hidden = new Set(layout.hidden);
  const idx = (w: DashboardWidgetMeta) => {
    const i = layout.order.indexOf(w.id);
    return i === -1 ? 1000 + widgets.indexOf(w) : i;
  };
  return widgets.filter((w) => !hidden.has(w.id)).sort((a, b) => idx(a) - idx(b));
}

/** Config có khác mặc định không (để hiện nút "Khôi phục mặc định"). */
export function isDefaultLayout(layout: DashboardLayoutConfig | null): boolean {
  return !layout || (layout.hidden.length === 0 && layout.order.length === 0);
}
