/**
 * Công ty đang làm việc (Đa Công Ty).
 *
 * - Mặc định = công ty chính của user (assetflow_auth.company_id).
 * - Khi user đổi công ty trên Topbar → lưu vào localStorage 'active_company_id'.
 * - Mọi request gửi header x-current-user-company = công ty này; server tự suy
 *   role/quyền theo cặp (user, công ty) qua getEffectiveContext.
 */
const KEY = 'active_company_id';

export function getActiveCompanyId(): string | null {
  if (typeof window === 'undefined') return null;
  const active = localStorage.getItem(KEY);
  if (active) return active;
  try {
    const raw = localStorage.getItem('assetflow_auth') || localStorage.getItem('currentUser');
    if (!raw) return null;
    return JSON.parse(raw).company_id || null;
  } catch {
    return null;
  }
}

export function setActiveCompanyId(companyId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, companyId);
}

export function clearActiveCompanyId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}

/**
 * Interceptor toàn cục: tự chèn header x-current-user-company = công ty đang
 * làm việc vào MỌI request /api/ same-origin chưa tự set header này.
 *
 * Mục đích: chống rò rỉ chéo công ty một cách hệ thống — không phụ thuộc từng
 * client nhớ gắn header. Endpoint nào không multi-company-aware sẽ bỏ qua header
 * (additive, an toàn). Cài 1 lần; nếu client đã tự set thì giữ nguyên (không đè).
 */
export function installCompanyFetchInterceptor(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__companyFetchPatched) return;
  (window as any).__companyFetchPatched = true;

  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const company = getActiveCompanyId();
      if (company) {
        const url =
          typeof input === 'string' ? input
          : input instanceof URL ? input.href
          : (input as Request).url;
        const sameOrigin =
          !!url && (!/^https?:\/\//i.test(url) || url.startsWith(window.location.origin));
        const isApi = !!url && url.includes('/api/');
        if (sameOrigin && isApi) {
          if (input instanceof Request) {
            if (!input.headers.has('x-current-user-company')) {
              const headers = new Headers(input.headers);
              headers.set('x-current-user-company', company);
              input = new Request(input, { headers });
            }
          } else {
            const headers = new Headers((init && init.headers) || {});
            if (!headers.has('x-current-user-company')) {
              headers.set('x-current-user-company', company);
              init = { ...init, headers };
            }
          }
        }
      }
    } catch {
      /* nuốt lỗi — luôn fallback gọi fetch gốc */
    }
    return orig(input as any, init);
  };
}
