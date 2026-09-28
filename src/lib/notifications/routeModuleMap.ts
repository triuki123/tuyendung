/**
 * routeModuleMap — ánh xạ prefix đường dẫn nội bộ → moduleId (RBAC) để quyết định
 * một thông báo có được phép click điều hướng hay không.
 *
 * Nguyên tắc AN TOÀN (không vỡ product):
 *  - Chỉ liệt kê các đích RÕ RÀNG thuộc trang quản trị/duyệt. Trang cá nhân
 *    (/ho-so-cua-toi, /room-bookings, /solace/*, /tra-cuu/*, /assets/* của chính mình…)
 *    KHÔNG map → luôn cho click (fail-open) để không chặn nhầm thông báo hợp lệ.
 *  - Không tìm thấy mapping ⇒ CHO PHÉP. super_admin luôn được phép.
 *
 * Match theo prefix dài nhất trước.
 */
const ROUTE_MODULE_ENTRIES: [string, string][] = [
  ['/duyet-yeu-cau', 'duyet-yeu-cau'],
  ['/delete-requests', 'delete-requests'],
  ['/nguon-nhan-luc/onboarding', 'hr-onboarding'],
  ['/nguon-nhan-luc/offboarding', 'hr-offboarding'],
  ['/nguon-nhan-luc/yeu-cau-tuyen-dung', 'hr-requisitions'],
  ['/nguon-nhan-luc/tinh-hinh-tuyen-dung', 'hr-recruitment-dashboard'],
  ['/nguon-nhan-luc', 'hr-resources'],
  ['/yeu-cau-tuyen-dung', 'hr-requisitions'],
  ['/yeu-cau-thiet-ke', 'design-requests'],
  ['/tickets/admin', 'tickets'],
];

/** Trả moduleId cần quyền cho đường dẫn, hoặc null nếu không cần gate (cho phép). */
export function resolveRouteModule(url: string | null | undefined): string | null {
  if (!url) return null;
  const path = url.split('?')[0];
  let best: string | null = null;
  let bestLen = -1;
  for (const [prefix, moduleId] of ROUTE_MODULE_ENTRIES) {
    if ((path === prefix || path.startsWith(prefix + '/')) && prefix.length > bestLen) {
      best = moduleId;
      bestLen = prefix.length;
    }
  }
  return best;
}
