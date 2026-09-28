import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  signSessionValidationProof,
  verifyIdentity,
} from '@/lib/authCookie';

/**
 * Chốt chặn danh tính ở tầng server cho TOÀN BỘ ứng dụng:
 *
 * 1) Trang: chưa đăng nhập (cookie không hợp lệ) → redirect về đăng nhập.
 *    API:   chưa đăng nhập → 401.
 * 2) Đã đăng nhập: XÁC MINH chữ ký cookie rồi GHI ĐÈ các header danh tính bằng giá
 *    trị tin cậy lấy từ cookie, đồng thời XOÁ mọi header danh tính do client gửi.
 *    Nhờ vậy 276 route đang đọc x-current-user-id/role/permissions tự động nhận
 *    giá trị đã xác thực — không thể spoof nữa.
 *
 * x-current-user-company do client đề xuất nhưng được endpoint xác thực phiên đối
 * chiếu membership; middleware chỉ chuyển tiếp company/role/quyền đã xác minh.
 */

const LOGIN_PATH = '/sign-up-login-screen';

/** Header danh tính phải do server quyết định — luôn xoá bản client gửi. */
const IDENTITY_HEADERS = [
  'x-current-user-id',
  'x-current-user-role',
  'x-current-user-name',
  'x-current-user-dept',
  'x-current-user-company',
  'x-user-permissions',
  'x-user-id',
  'x-user-role',
  'x-session-id',
];

/**
 * Route có cơ chế xác thực RIÊNG (không qua cookie phiên) — phải bỏ qua middleware:
 *  - /api/auth/*            : đăng nhập/đăng xuất/quên mật khẩu
 *  - /api/telegram/webhook  : Telegram gọi vào (secret-token riêng)
 *  - /api/attendance/machine: máy chấm công (x-machine-key)
 *  - /api/setup/*           : khởi tạo hệ thống (x-setup-token)
 *  - /api/public/*          : biểu mẫu PUBLIC (onboarding + forms theo token)
 *  - các route bootstrap admin dưới đây (x-setup-token)
 */
const PUBLIC_API_PREFIXES = [
  // Chỉ các luồng khởi tạo/khôi phục đăng nhập được public. Các route đổi mật khẩu,
  // session, logout và admin-reset phải đi qua cookie phiên đã ký.
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-reset-token',
  // Quên mật khẩu qua OTP magic-link (chưa đăng nhập).
  '/api/auth/otp-reset',
  // Hoàn tất đăng nhập 2FA bằng OTP (chưa có phiên).
  '/api/auth/login-2fa',
  // Auto-login chỉ cho localhost development; route tự kiểm tra env + loopback.
  '/api/auth/dev-login',
  // SSO OIDC: khởi động + callback (chưa có phiên).
  '/api/auth/sso/',
  '/api/auth/telegram',
  '/api/internal/session/validate',
  '/api/telegram/webhook',
  // Bot SOLACE riêng — Telegram gọi vào (tự xác thực qua X-Telegram-Bot-Api-Secret-Token)
  '/api/solace/telegram/webhook',
  // Máy chấm công legacy (POST custom JSON, secret-token x-machine-key)
  '/api/attendance/machine',
  // ADMS — Ronald Jack / ZKTeco push protocol (GET/POST ?SN=<serial>).
  // Máy tự xác thực qua serial number; trang được middleware bảo vệ riêng.
  '/api/attendance/adms',
  '/api/setup/',
  '/api/public/',
  // Chrome extension tự xác thực bằng Bearer token ghép nối riêng.
  '/api/extension/',
  // Cổng đặt món KHÁCH VÃNG LAI (không đăng nhập) — chỉ đọc menu + tạo đơn cash/VietQR, có rate-limit.
  '/api/solace/guest/',
  // Mini-site Warehouse — công nhân auth bằng cookie warehouse_session riêng
  // (route tự verify). CHỈ whitelist endpoint worker; /api/warehouse/admin/* vẫn
  // đi qua cookie phiên AssetFlow như bình thường.
  '/api/warehouse/auth/',
  '/api/warehouse/me',
  '/api/warehouse/attendance',
  '/api/warehouse/output',
  '/api/warehouse/posts',
  '/api/warehouse/requests',
  '/api/warehouse/gate-qr',
  '/api/admin/migrate-manager-id',
  '/api/admin/run-migrations',
  '/api/admin/setup-database',
  // Di trú BYTEA → MinIO (route tự verify bằng x-migration-secret, tắt khi thiếu env)
  '/api/admin/media-migration',
];

/**
 * Trang public (không cần đăng nhập):
 *  - /onboarding/thong-tin-nhan-su-dau-vao : biểu mẫu nhận việc cố định
 *  - /forms/<token>                        : biểu mẫu PUBLIC (kho biểu mẫu)
 *    NOTE: từng biểu mẫu có cờ is_internal — middleware vẫn cho qua, API GET
 *    `/api/public/forms/[token]` tự kiểm cờ và trả 401 nếu nội bộ + chưa đăng nhập.
 *  - /iclock/...                           : máy ZKTeco firmware cũ push qua path
 *    này (rewrites trong next.config.mjs chuyển về /api/attendance/adms*).
 *    Middleware chạy TRƯỚC rewrites nên phải whitelist path gốc /iclock.
 */
const PUBLIC_PAGE_PREFIXES = [
  '/onboarding/thong-tin-nhan-su-dau-vao',
  '/forms/',
  '/iclock',
  '/preview',
  // Cổng đặt món khách vãng lai (quét QR, không cần đăng nhập).
  '/solace-guest',
  // Hồ sơ năng lực public (quét QR e-card, không cần đăng nhập).
  '/card/',
  // Trang lộ OTP qua magic-link (xác thực bằng link token trong email).
  '/otp',
  // Mini-site Warehouse (công nhân kho, auth riêng bằng warehouse_session).
  // /warehouse/admin cũng nằm dưới prefix này nhưng API admin vẫn cần phiên AssetFlow.
  '/warehouse',
  // Link rút gọn / QR: /s/<code> ai quét cũng mở được (không cần đăng nhập).
  '/s/',
  // Mini-site công bố văn bản: /cong-bo (danh sách) + /cong-bo/<public_token> (chi tiết).
  // KHÔNG dùng /thong-bao — path đó là Trung Tâm Thông Báo nội bộ, cần đăng nhập.
  // Chỉ văn bản có is_public = TRUE mới lộ ra (API /api/public/documents tự lọc).
  '/cong-bo',
];

function isPublicPath(pathname: string): boolean {
  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) return true;
  // Match exact hoặc prefix + '/' để '/api/attendance/machine' KHÔNG match nhầm
  // '/api/attendance/machines/...' (plural) hay '/api/attendance/machine-mappings/...'.
  if (PUBLIC_API_PREFIXES.some(p => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))) return true;
  if (PUBLIC_PAGE_PREFIXES.some(p => pathname === p || pathname.startsWith(p))) return true;
  return false;
}

function isLocalDevelopmentBypass(request: NextRequest): boolean {
  const hostname = request.nextUrl.hostname;
  return process.env.LOCAL_DEV_BYPASS_AUTH === 'true'
    && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1');
}

function denyUnauthenticated(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }
  if (isLocalDevelopmentBypass(request)) {
    const localLoginUrl = new URL('/api/auth/dev-login', request.url);
    localLoginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(localLoginUrl);
  }
  const loginUrl = new URL(LOGIN_PATH, request.url);
  if (pathname && pathname !== '/') {
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
  }
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestedCompanyId = request.headers.get('x-current-user-company');

  // Xây header sạch: luôn loại bỏ header danh tính do client tự gửi.
  const cleanHeaders = new Headers(request.headers);
  for (const h of IDENTITY_HEADERS) cleanHeaders.delete(h);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }

  const identity = await verifyIdentity(request.cookies.get(SESSION_COOKIE)?.value);
  if (!identity) {
    return denyUnauthenticated(request);
  }

  let effectiveRole = identity.role;
  let effectiveDept = identity.dept;
  let effectivePermissions = identity.perms;
  let effectiveCompanyId: string | null = null;

  // Tiêm danh tính tin cậy (server-side) cho các route phía sau.
  // Local dev uses a seeded account and must not make a loopback fetch through
  // the same middleware, which can deadlock the Next development server.
  if (identity.kind !== 'service' && !isLocalDevelopmentBypass(request)) {
    const timestamp = Math.floor(Date.now() / 1000);
    const proof = await signSessionValidationProof(identity.uid, identity.sid, timestamp);
    const isProduction = process.env.NODE_ENV === 'production';
    const host =
      isProduction && process.env.HOSTNAME && process.env.HOSTNAME !== '0.0.0.0'
        ? process.env.HOSTNAME
        : request.nextUrl.hostname;
    const protocol = isProduction ? 'http:' : request.nextUrl.protocol;
    const port = isProduction ? process.env.PORT || '4028' : request.nextUrl.port;
    const validationUrl =
      `${protocol}//${host}${port ? `:${port}` : ''}/api/internal/session/validate`;

    try {
      const validation = await fetch(validationUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-validation-proof': proof,
        },
        body: JSON.stringify({
          userId: identity.uid,
          sessionId: identity.sid,
          timestamp,
          requestedCompanyId,
        }),
        cache: 'no-store',
      });
      if (!validation.ok) return denyUnauthenticated(request);
      const result = await validation.json() as {
        valid?: boolean;
        context?: {
          companyId?: string | null;
          role?: string;
          departmentId?: string | null;
          permissions?: unknown;
        };
      };
      if (!result.valid || !result.context?.role) return denyUnauthenticated(request);
      effectiveRole = result.context.role;
      effectiveDept = result.context.departmentId ?? undefined;
      effectivePermissions = result.context.permissions;
      effectiveCompanyId = result.context.companyId ?? null;
    } catch (error) {
      console.error('Session validation unavailable:', error);
      return denyUnauthenticated(request);
    }
  }

  cleanHeaders.set('x-current-user-id', identity.uid);
  cleanHeaders.set('x-user-id', identity.uid);
  cleanHeaders.set('x-current-user-role', effectiveRole);
  cleanHeaders.set('x-user-role', effectiveRole);
  cleanHeaders.set('x-session-id', identity.sid);
  if (effectiveCompanyId) cleanHeaders.set('x-current-user-company', effectiveCompanyId);
  // HTTP headers chỉ chấp nhận ASCII — tên/department có dấu tiếng Việt phải
  // URL-encode (route đọc qua decodeIdentityHeader trong @/lib/authCookie).
  // Bỏ qua bước này từng làm middleware throw → toàn bộ trang 500.
  if (identity.name) cleanHeaders.set('x-current-user-name', encodeURIComponent(identity.name));
  if (effectiveDept) cleanHeaders.set('x-current-user-dept', encodeURIComponent(effectiveDept));
  if (effectivePermissions != null) {
    cleanHeaders.set('x-user-permissions', JSON.stringify(effectivePermissions));
  }

  return NextResponse.next({ request: { headers: cleanHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
