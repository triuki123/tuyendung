# Tích hợp FADO SSO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đăng nhập AssetFlow qua FADO SSO (OIDC BFF, chỉ SSO + break-glass super_admin) và đồng bộ tạo/sửa/khóa user từ trang Users sang SSO Provisioning API.

**Architecture:** Confidential OIDC client tự viết chạy server-side (2 route `/api/auth/sso/start|callback`, verify JWT bằng `jose`), cắm vào hạ tầng session/cookie sẵn có (`finishLogin.ts` + `authCookie.ts` + middleware). Quản lý user: service `ssoProvisioningService` (M2M client_credentials) được gọi từ các hook trong `usersService`; trạng thái sync lưu trên 4 cột mới của bảng `users`; lỗi không chặn thao tác local.

**Tech Stack:** Next.js 13.5 App Router (Node runtime) · TypeScript 5 · PostgreSQL qua `src/lib/db.ts` · `jose` (mới) · bcryptjs (giữ cho break-glass).

**Spec:** `docs/superpowers/specs/2026-07-17-sso-integration-design.md` — đọc trước khi làm bất kỳ task nào.

## Global Constraints

- DB **chỉ** qua `src/lib/db.ts` (`query/queryOne/execute/withTransaction/buildInsert/buildUpdateById`). Không tạo Pool mới.
- Migration mới = **297** (`migrations/297_add_sso_columns_to_users.sql`), idempotent (`ADD COLUMN IF NOT EXISTS`), **mirror vào `docker/postgres/reconcile.sql`** (reconcile là schema thật khi deploy — xem skill hardcode-to-config).
- Cột camelCase trong SQL thủ công phải double-quote; cột mới của task này đều snake_case nên không cần.
- API route: try/catch, message lỗi tiếng Việt, không log password/token/secret.
- UI tiếng Việt, theo UI standards trong CLAUDE.md; không hardcode màu light.
- Thông báo mới **phải** qua engine `notify()` (`src/lib/notifications/`) — không INSERT thủ công.
- Config toàn cục mới đi qua `system_settings` + `systemConfig.ts` + `systemSettingsService.ts` (skill hardcode-to-config).
- Env mới (không commit giá trị): `SSO_ISSUER`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_M2M_CLIENT_ID`, `SSO_M2M_CLIENT_SECRET`.
- Repo **không có unit-test framework** (chỉ Playwright visual) — verification = `npm run type-check` + script node + kiểm tra flow thật trên dev server (port 4028). KHÔNG thêm framework test mới.
- Mỗi task kết thúc bằng commit. Message tiếng Việt theo style repo (`feat(sso): ...`), kết thúc bằng dòng `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Nhánh làm việc: `afterdeploy`. KHÔNG push/deploy nếu user chưa yêu cầu.

**Điều kiện tiên quyết (user làm tay trên SSO backoffice, ngoài scope code):** đăng ký client `assetflow-web` (confidential; redirect URIs `https://assetflow.fadoai.com/api/auth/sso/callback` + `http://localhost:4028/api/auth/sso/callback`; scopes `openid profile email`) và `assetflow-provisioner` (M2M, scope `users:write`); điền secrets vào `.env`. Code phải chạy được (build/type-check OK) kể cả khi env chưa điền — chỉ fail lúc runtime với message rõ.

---

### Task 1: Nền tảng — cài `jose`, migration 297, reconcile.sql, env

**Files:**
- Modify: `package.json` (qua npm install)
- Create: `migrations/297_add_sso_columns_to_users.sql`
- Modify: `docker/postgres/reconcile.sql` (khối ALTER TABLE users, gần dòng 2992)
- Modify: `.env` (local dev — thêm key rỗng nếu chưa có, KHÔNG commit)

**Interfaces:**
- Produces: cột `users.sso_user_id TEXT`, `users.sso_sync_status TEXT`, `users.sso_sync_error TEXT`, `users.sso_synced_at TIMESTAMPTZ`; package `jose` cho Task 2.

- [ ] **Step 1: Cài jose**

Run: `npm install jose`
Expected: `jose` xuất hiện trong `dependencies` của package.json, không lỗi peer.

- [ ] **Step 2: Tạo migration 297**

Kiểm tra trước số lớn nhất: `ls migrations/ | sort -t_ -k1 -n | tail -3` — nếu đã có 297 thì dùng số kế tiếp và đổi tên tương ứng ở mọi chỗ trong plan.

Tạo `migrations/297_add_sso_columns_to_users.sql`:

```sql
-- Migration 297: cột đồng bộ SSO (sso.fadoai.com) trên bảng users
-- sso_sync_status: synced | error | skipped_zimbra | NULL (chưa sync)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sso_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_error  TEXT,
  ADD COLUMN IF NOT EXISTS sso_synced_at   TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_sso_user_id_key
  ON users (sso_user_id) WHERE sso_user_id IS NOT NULL;
```

- [ ] **Step 3: Mirror vào reconcile.sql**

Mở `docker/postgres/reconcile.sql`, tìm khối `ADD COLUMN IF NOT EXISTS twofa_enabled` (gần dòng 2992) và thêm NGAY SAU khối đó:

```sql
-- SSO (migration 297): trạng thái đồng bộ user sang sso.fadoai.com
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sso_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_error  TEXT,
  ADD COLUMN IF NOT EXISTS sso_synced_at   TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_sso_user_id_key
  ON users (sso_user_id) WHERE sso_user_id IS NOT NULL;
```

- [ ] **Step 4: Chạy migration trên DB dev**

Run: `npm run migrate` (script `scripts/run-migrations.js`). Nếu script này chạy toàn bộ và gây phiền, dùng: `npm run migrate:direct migrations/297_add_sso_columns_to_users.sql`.
Verify: `node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool(); p.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name LIKE 'sso%'\").then(r=>{console.log(r.rows); p.end();})"`
Expected: 4 dòng `sso_user_id`, `sso_sync_status`, `sso_sync_error`, `sso_synced_at`.

- [ ] **Step 5: Thêm env placeholders vào `.env` local (nếu chưa có)**

Append (giá trị thật user điền sau từ SSO backoffice):

```
SSO_ISSUER=https://sso.fadoai.com/oidc
SSO_CLIENT_ID=assetflow-web
SSO_CLIENT_SECRET=
SSO_M2M_CLIENT_ID=assetflow-provisioner
SSO_M2M_CLIENT_SECRET=
```

KHÔNG commit `.env`. Nếu repo có `.env.example`, thêm 5 dòng trên vào đó (commit được vì rỗng).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json migrations/297_add_sso_columns_to_users.sql docker/postgres/reconcile.sql
git commit -m "feat(sso): nền tảng — cài jose + migration 297 cột đồng bộ SSO trên users

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `src/lib/auth/ssoClient.ts` — OIDC helper server-side

**Files:**
- Create: `src/lib/auth/ssoClient.ts`

**Interfaces:**
- Consumes: env `SSO_ISSUER/SSO_CLIENT_ID/SSO_CLIENT_SECRET`, `AUTH_SECRET` (đã có).
- Produces (Task 3 dùng):
  - `SSO_STATE_COOKIE: string` (= `'sso_oidc'`)
  - `getSsoEnv(): { issuer: string; clientId: string; clientSecret: string }` — throw nếu thiếu env
  - `randomToken(bytes?: number): string`
  - `generatePkce(): Promise<{ verifier: string; challenge: string }>`
  - `buildAuthorizeUrl(p: { redirectUri: string; state: string; nonce: string; challenge: string }): string`
  - `exchangeCode(p: { code: string; verifier: string; redirectUri: string }): Promise<SsoTokens>`
  - `resolveSsoIdentity(tokens: SsoTokens, expectedNonce: string): Promise<SsoIdentity>` — verify id_token, fallback `/userinfo` nếu thiếu email
  - `encodeStateCookie(p: { state: string; nonce: string; verifier: string; redirect: string }): Promise<string>`
  - `decodeStateCookie(v: string | null | undefined): Promise<{ state: string; nonce: string; verifier: string; redirect: string; iat: number } | null>` — null nếu sai chữ ký hoặc quá 10 phút

- [ ] **Step 1: Viết file đầy đủ**

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * ssoClient.ts — OIDC confidential client cho FADO SSO (sso.fadoai.com).
 * Chạy HOÀN TOÀN server-side (Node runtime): token không bao giờ chạm browser.
 * Flow: Authorization Code + PKCE; verify id_token RS256 qua JWKS; state/nonce/verifier
 * giữ trong cookie httpOnly ký HMAC (AUTH_SECRET) sống 10 phút.
 */

export const SSO_STATE_COOKIE = 'sso_oidc';
/** Cookie state OIDC chỉ sống 10 phút (đủ cho 1 vòng redirect). */
const STATE_TTL_SECONDS = 600;

export interface SsoTokens {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface SsoIdentity {
  sub: string;
  email: string;   // đã lowercase
  name?: string;
}

export function getSsoEnv(): { issuer: string; clientId: string; clientSecret: string } {
  const issuer = (process.env.SSO_ISSUER || 'https://sso.fadoai.com/oidc').replace(/\/$/, '');
  const clientId = process.env.SSO_CLIENT_ID;
  const clientSecret = process.env.SSO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SSO_CLIENT_ID / SSO_CLIENT_SECRET chưa được cấu hình trong env');
  }
  return { issuer, clientId, clientSecret };
}

// ---- base64url + random (Web Crypto — sẵn có ở Node 18+/Next runtime) ----
function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToB64url(buf);
}

/** PKCE S256: verifier 43–128 ký tự (64 ký tự b64url từ 48 bytes). */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: bytesToB64url(new Uint8Array(digest)) };
}

// ---- cookie state ký HMAC (cùng kỹ thuật authCookie.ts, payload khác shape) ----
function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET chưa được cấu hình');
  return s;
}

async function hmacB64url(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(getAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return bytesToB64url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface OidcStatePayload {
  state: string;
  nonce: string;
  verifier: string;
  redirect: string; // đường dẫn nội bộ sau đăng nhập
  iat: number;
}

export async function encodeStateCookie(
  p: Omit<OidcStatePayload, 'iat'>
): Promise<string> {
  const payload = bytesToB64url(
    new TextEncoder().encode(JSON.stringify({ ...p, iat: Math.floor(Date.now() / 1000) }))
  );
  return `${payload}.${await hmacB64url(payload)}`;
}

export async function decodeStateCookie(
  v: string | null | undefined
): Promise<OidcStatePayload | null> {
  if (!v) return null;
  const dot = v.indexOf('.');
  if (dot <= 0) return null;
  const payload = v.slice(0, dot);
  const sig = v.slice(dot + 1);
  try {
    if (!timingSafeEqual(sig, await hmacB64url(payload))) return null;
    const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))) as OidcStatePayload;
    if (!parsed?.state || !parsed?.nonce || !parsed?.verifier) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(parsed.iat) || now - parsed.iat > STATE_TTL_SECONDS) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---- OIDC endpoints ----
export function buildAuthorizeUrl(p: {
  redirectUri: string; state: string; nonce: string; challenge: string;
}): string {
  const { issuer, clientId } = getSsoEnv();
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: p.redirectUri,
    scope: 'openid profile email',
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
  });
  return `${issuer}/authorize?${q.toString()}`;
}

/** Đổi authorization code lấy token (server-to-server, Basic auth client secret). */
export async function exchangeCode(p: {
  code: string; verifier: string; redirectUri: string;
}): Promise<SsoTokens> {
  const { issuer, clientId, clientSecret } = getSsoEnv();
  const res = await fetch(`${issuer}/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: p.code,
      redirect_uri: p.redirectUri,
      code_verifier: p.verifier,
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // KHÔNG log body đầy đủ ở caller nếu chứa token; ở đây body là lỗi OAuth (an toàn).
    throw new Error(`SSO token endpoint trả ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as SsoTokens;
}

// JWKS cache module-level (createRemoteJWKSet tự cache/refresh key theo kid).
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(issuer: string) {
  if (!jwksCache) jwksCache = createRemoteJWKSet(new URL(`${issuer}/jwks.json`));
  return jwksCache;
}

/**
 * Verify id_token (iss/aud/exp/chữ ký RS256 + nonce) rồi rút danh tính.
 * id_token thiếu email (tùy cấu hình OP) → fallback gọi /userinfo bằng access_token.
 */
export async function resolveSsoIdentity(
  tokens: SsoTokens,
  expectedNonce: string
): Promise<SsoIdentity> {
  const { issuer, clientId } = getSsoEnv();
  const { payload } = await jwtVerify(tokens.id_token, getJwks(issuer), {
    issuer,
    audience: clientId,
  });
  if (payload.nonce !== expectedNonce) throw new Error('nonce không khớp');

  let email = typeof payload.email === 'string' ? payload.email : '';
  let name = typeof payload.name === 'string' ? payload.name : undefined;

  if (!email) {
    const res = await fetch(`${issuer}/userinfo`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`SSO userinfo trả ${res.status}`);
    const info = (await res.json()) as { email?: string; name?: string };
    email = info.email || '';
    name = name || info.name;
  }
  if (!email) throw new Error('SSO không trả về email cho tài khoản này');

  return { sub: String(payload.sub), email: email.toLowerCase(), name };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (0 lỗi).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/ssoClient.ts
git commit -m "feat(sso): OIDC client helper — PKCE, đổi code lấy token, verify id_token qua JWKS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Route `/api/auth/sso/start` + `/callback`, biến thể redirect của finishLogin, middleware whitelist

**Files:**
- Modify: `src/lib/auth/finishLogin.ts`
- Modify: `src/lib/services/usersService.ts` (thêm `getUserByEmailInsensitive`)
- Create: `src/app/api/auth/sso/start/route.ts`
- Create: `src/app/api/auth/sso/callback/route.ts`
- Modify: `src/middleware.ts:49` (thêm whitelist)

**Interfaces:**
- Consumes: toàn bộ export của `ssoClient.ts` (Task 2); `createSession/recordLoginHistory` (`sessionService.ts`); `setSessionCookie` (`authCookie.ts`).
- Produces: `finishLoginRedirect(user: Record<string, any>, ctx: { userAgent: string; ipAddress: string }, redirectUrl: URL): Promise<NextResponse>`; `getUserByEmailInsensitive(email: string): Promise<any | null>`.

- [ ] **Step 1: Refactor `finishLogin.ts` — tách phần dựng session dùng chung + thêm biến thể redirect**

Thay TOÀN BỘ nội dung file `src/lib/auth/finishLogin.ts` bằng:

```ts
import { NextResponse } from 'next/server';
import { createSession, recordLoginHistory } from '@/lib/services/sessionService';
import { updateLastLogin } from '@/lib/services/usersService';
import { setSessionCookie } from '@/lib/authCookie';
import { getEffectiveRolePermissions } from '@/lib/modules';
import { normalizeRole } from '@/lib/rolePolicy';

interface LoginCtx { userAgent: string; ipAddress: string }

/** Phần dùng chung: tạo session DB + ghi lịch sử + last_login + hạn cookie theo cấu hình. */
async function establishSession(user: Record<string, any>, ctx: LoginCtx) {
  const session = await createSession(user.id, ctx);
  await recordLoginHistory(user.id, session.id, ctx, true);
  await updateLastLogin(user.id);
  const role = normalizeRole(user.role);
  const { getSecurityConfig } = await import('@/lib/services/systemSettingsService');
  const sec = await getSecurityConfig();
  return { session, role, maxAgeSeconds: sec.sessionDays * 86400 };
}

/**
 * Hoàn tất đăng nhập: tạo session, ghi lịch sử, set cookie phiên đã ký.
 * Dùng chung cho /api/auth/login (không 2FA) và /api/auth/login-2fa (sau khi qua OTP).
 */
export async function buildLoginResponse(
  user: Record<string, any>,
  ctx: LoginCtx
): Promise<NextResponse> {
  const { session, role, maxAgeSeconds } = await establishSession(user, ctx);
  const effectivePermissions = getEffectiveRolePermissions(role, user.module_permissions);
  const { password: _pw, ...safeUser } = user;
  const res = NextResponse.json(
    { ...safeUser, role, module_permissions: effectivePermissions, session_id: session.id },
    { status: 200 }
  );
  return setSessionCookie(res, {
    uid: String(user.id),
    role,
    sid: String(session.id),
    name: user.name as string | undefined,
    dept: user.department_id as string | undefined,
    // KHÔNG nhúng perms vào cookie: 63 module làm cookie vượt 4096 bytes → trình duyệt
    // âm thầm vứt bỏ, toàn bộ đăng nhập sập. Middleware luôn lấy quyền tươi từ DB
    // qua /api/internal/session/validate rồi ghi đè, nên perms trong cookie là thừa.
  }, maxAgeSeconds);
}

/**
 * Biến thể cho SSO callback: cùng logic dựng session nhưng trả 302 redirect
 * (browser đang ở giữa vòng OIDC redirect, không nhận JSON).
 */
export async function finishLoginRedirect(
  user: Record<string, any>,
  ctx: LoginCtx,
  redirectUrl: URL
): Promise<NextResponse> {
  const { session, role, maxAgeSeconds } = await establishSession(user, ctx);
  const res = NextResponse.redirect(redirectUrl, { status: 302 });
  return setSessionCookie(res, {
    uid: String(user.id),
    role,
    sid: String(session.id),
    name: user.name as string | undefined,
    dept: user.department_id as string | undefined,
  }, maxAgeSeconds);
}
```

- [ ] **Step 2: Thêm `getUserByEmailInsensitive` vào `usersService.ts`**

Ngay dưới `getUserByEmail` (dòng ~249-251):

```ts
/** Tra user theo email không phân biệt hoa/thường (SSO trả email đã lowercase). */
export async function getUserByEmailInsensitive(email: string) {
  return queryOne<any>(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]);
}
```

- [ ] **Step 3: Tạo `src/app/api/auth/sso/start/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  SSO_STATE_COOKIE, getSsoEnv, randomToken, generatePkce,
  buildAuthorizeUrl, encodeStateCookie,
} from '@/lib/auth/ssoClient';

/**
 * Khởi động đăng nhập SSO: sinh PKCE + state + nonce, lưu vào cookie ký HMAC (10'),
 * redirect sang trang đăng nhập của sso.fadoai.com.
 */
export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  try {
    getSsoEnv(); // fail sớm với message rõ nếu env thiếu

    // Chỉ chấp nhận đường dẫn nội bộ (chống open-redirect).
    const raw = request.nextUrl.searchParams.get('redirect') || '/dashboard';
    const redirect = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';

    const state = randomToken(16);
    const nonce = randomToken(16);
    const { verifier, challenge } = await generatePkce();
    const redirectUri = `${base}/api/auth/sso/callback`;

    const res = NextResponse.redirect(
      buildAuthorizeUrl({ redirectUri, state, nonce, challenge })
    );
    res.cookies.set(SSO_STATE_COOKIE, await encodeStateCookie({ state, nonce, verifier, redirect }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    console.error('GET /api/auth/sso/start error:', err);
    return NextResponse.redirect(new URL('/sign-up-login-screen?error=sso_failed', base));
  }
}
```

- [ ] **Step 4: Tạo `src/app/api/auth/sso/callback/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  SSO_STATE_COOKIE, exchangeCode, resolveSsoIdentity, decodeStateCookie,
} from '@/lib/auth/ssoClient';
import { getUserByEmailInsensitive } from '@/lib/services/usersService';
import { recordLoginHistory } from '@/lib/services/sessionService';
import { finishLoginRedirect } from '@/lib/auth/finishLogin';

/**
 * OIDC callback: check state → đổi code lấy token → verify id_token → map user local
 * theo email → dựng session AssetFlow như luồng login thường (AssetFlow là master,
 * KHÔNG auto-provision user mới từ SSO).
 */
export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/sign-up-login-screen?error=${code}`, base));
    res.cookies.set(SSO_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const st = await decodeStateCookie(request.cookies.get(SSO_STATE_COOKIE)?.value);
    if (!code || !state || !st || st.state !== state) return fail('sso_failed');

    const tokens = await exchangeCode({
      code,
      verifier: st.verifier,
      redirectUri: `${base}/api/auth/sso/callback`,
    });
    const ident = await resolveSsoIdentity(tokens, st.nonce);

    const user = await getUserByEmailInsensitive(ident.email);
    const userAgent = request.headers.get('user-agent') || '';
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '::1';

    if (!user) {
      console.log(`[SSO] Login từ SSO nhưng email chưa được cấp trên AssetFlow: ${ident.email}`);
      return fail('sso_no_account');
    }
    if (user.status === 'inactive') {
      await recordLoginHistory(user.id, null, { userAgent, ipAddress }, false, 'Account is inactive (SSO)');
      return fail('sso_inactive');
    }

    const res = await finishLoginRedirect(
      user as Record<string, any>,
      { userAgent, ipAddress },
      new URL(st.redirect, base)
    );
    res.cookies.set(SSO_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('GET /api/auth/sso/callback error:', err);
    return fail('sso_failed');
  }
}
```

- [ ] **Step 5: Whitelist middleware**

Trong `src/middleware.ts`, mảng `PUBLIC_API_PREFIXES` (sau dòng `'/api/auth/login-2fa',` ~dòng 56), thêm:

```ts
  // SSO OIDC: khởi động + callback (chưa có phiên).
  '/api/auth/sso/',
```

- [ ] **Step 6: Type-check + thử flow tới bước authorize**

Run: `npm run type-check` → PASS.
Run dev: `npm run dev` (nền), rồi: `curl -sI "http://localhost:4028/api/auth/sso/start" | grep -i "^location"`
Expected: `location: https://sso.fadoai.com/oidc/authorize?response_type=code&client_id=...&code_challenge=...` (nếu env SSO_CLIENT_ID/SECRET đã điền) HOẶC `location: .../sign-up-login-screen?error=sso_failed` (nếu env trống — cũng là hành vi đúng).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/finishLogin.ts src/lib/services/usersService.ts src/app/api/auth/sso/ src/middleware.ts
git commit -m "feat(sso): route start/callback OIDC + finishLoginRedirect cắm vào session hiện có

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `/api/auth/me`, bootstrap AppLayout, LoginClient chỉ-SSO + emergency, gate super_admin

**Files:**
- Create: `src/app/api/auth/me/route.ts`
- Modify: `src/components/AppLayout.tsx:85-91` (effect mount)
- Modify: `src/app/sign-up-login-screen/components/LoginClient.tsx`
- Modify: `src/app/api/auth/login/route.ts:40` (gate sau check inactive)

**Interfaces:**
- Consumes: header `x-current-user-id`, `x-user-permissions`, `x-session-id` do middleware tiêm (route này KHÔNG nằm trong whitelist → luôn có phiên hợp lệ khi tới đây).
- Produces: `GET /api/auth/me` trả JSON cùng shape với response của `buildLoginResponse` (user + `role` + `module_permissions` + `session_id`) — AppLayout dựa vào đó để bootstrap localStorage `assetflow_auth`.

- [ ] **Step 1: Tạo `src/app/api/auth/me/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/services/usersService';
import { getEffectiveRolePermissions } from '@/lib/modules';
import { normalizeRole } from '@/lib/rolePolicy';

/**
 * Trả user hiện tại theo phiên (cookie đã được middleware verify).
 * Dùng để client bootstrap localStorage sau khi đăng nhập SSO (callback là 302
 * redirect nên client không nhận JSON user như luồng login cũ).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const user = await getUserById(userId);
    if (!user) return NextResponse.json({ error: 'Người dùng không tồn tại' }, { status: 401 });

    const role = normalizeRole((user as any).role);
    // Ưu tiên quyền hiệu lực middleware đã resolve (đa công ty); fallback tính từ user.
    let perms: unknown = null;
    try { perms = JSON.parse(request.headers.get('x-user-permissions') || 'null'); } catch { perms = null; }
    const module_permissions = perms ?? getEffectiveRolePermissions(role, (user as any).module_permissions);

    const { password: _pw, ...safeUser } = user as Record<string, any>;
    return NextResponse.json({
      ...safeUser,
      role,
      module_permissions,
      session_id: request.headers.get('x-session-id'),
    });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Bootstrap trong `AppLayout.tsx`**

Thay effect mount (dòng 85-91) bằng:

```ts
  useEffect(() => {
    // Đa Công Ty: chèn header công ty đang làm việc vào mọi request /api/ (chống rò rỉ chéo).
    installCompanyFetchInterceptor();
    setIsMounted(true);
    const user = getCurrentUser();
    setCurrentUser(user);
    // SSO: sau callback (302) localStorage trống dù cookie phiên đã có → bootstrap từ server.
    if (!user) {
      fetch('/api/auth/me')
        .then((r) => (r.ok ? r.json() : null))
        .then((u) => {
          if (u?.id && typeof window !== 'undefined') {
            localStorage.setItem('assetflow_auth', JSON.stringify(u));
            localStorage.setItem('currentUser', JSON.stringify(u));
            setCurrentUser(getCurrentUser());
          }
        })
        .catch(() => { /* chưa đăng nhập — middleware đã lo redirect trang */ });
    }
  }, []);
```

- [ ] **Step 3: Gate super_admin trong `/api/auth/login`**

Trong `src/app/api/auth/login/route.ts`, NGAY SAU khối check `user.status === 'inactive'` (sau dòng 40) và TRƯỚC khối 2FA, thêm:

```ts
    // Chỉ SSO: đăng nhập mật khẩu chỉ còn là đường break-glass cho super_admin.
    if (user.role !== 'super_admin') {
      await recordLoginHistory(user.id, null, { userAgent, ipAddress }, false, 'Password login disabled (SSO only)');
      return NextResponse.json(
        { error: 'Đăng nhập bằng mật khẩu đã tắt — vui lòng dùng nút "Đăng nhập với FADO SSO".' },
        { status: 403 }
      );
    }
```

- [ ] **Step 4: Sửa `LoginClient.tsx` — mặc định chỉ nút SSO, form mật khẩu sau `?mode=emergency`**

Các thay đổi trong `src/app/sign-up-login-screen/components/LoginClient.tsx`:

(a) Thêm state + đọc URL params (đặt cạnh các useState hiện có, dòng ~27):

```ts
  // Chỉ SSO: form mật khẩu là đường break-glass, chỉ hiện khi ?mode=emergency.
  const [emergencyMode, setEmergencyMode] = useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'emergency') setEmergencyMode(true);
    const err = params.get('error');
    if (err) {
      const messages: Record<string, string> = {
        sso_no_account: 'Tài khoản SSO của bạn chưa được cấp trên AssetFlow. Liên hệ quản trị viên.',
        sso_inactive: 'Tài khoản này đã bị khóa trên AssetFlow.',
        sso_failed: 'Đăng nhập SSO thất bại hoặc phiên xác thực hết hạn. Vui lòng thử lại.',
      };
      setLoginError(messages[err] || 'Đăng nhập thất bại. Vui lòng thử lại.');
    }
  }, []);
```

(b) Ngay TRƯỚC thẻ `<form onSubmit={...}>` (dòng ~199), thêm nút SSO (dùng `<a>` để điều hướng full-page — flow OIDC là redirect):

```tsx
          {/* Đăng nhập SSO — luồng chính duy nhất */}
          <a
            href={`/api/auth/sso/start?redirect=${encodeURIComponent(getRedirectTarget())}`}
            className="w-full h-11 rounded-xl btn-accent font-600 text-sm flex items-center justify-center gap-2"
          >
            <Shield size={16} />
            Đăng nhập với FADO SSO
          </a>
```

(c) Bọc TOÀN BỘ phần form mật khẩu + divider + Telegram + ForgotPasswordModal trong điều kiện `emergencyMode`. Cụ thể: từ `<form onSubmit={handleSubmit(onSubmit)}...>` (dòng ~199) đến hết khối Telegram login (`</div>` đóng khối `flex flex-col items-center gap-2`, dòng ~313) bọc trong:

```tsx
          {emergencyMode && (
            <>
              {/* ... giữ nguyên form + divider + Telegram hiện có ... */}
            </>
          )}
```

Và `<ForgotPasswordModal>` giữ nguyên vị trí (modal điều khiển bằng state, chỉ mở được từ form emergency nên không cần bọc). Sửa subtitle trang (dòng ~188) thành: `Chào mừng trở lại. Đăng nhập bằng tài khoản FADO SSO.`

(d) Trong `onSubmit`, nhánh lỗi hiện đang hardcode message (dòng ~78-81) — đổi để hiện message server (gate 403 trả message tiếng Việt):

```ts
      } else {
        const j = await response.json().catch(() => null);
        setLoginError(j?.error || 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.');
        setIsLoading(false);
      }
```

- [ ] **Step 5: Type-check + kiểm tra UI**

Run: `npm run type-check` → PASS.
Mở `http://localhost:4028/sign-up-login-screen` — chỉ thấy nút "Đăng nhập với FADO SSO"; mở `...?mode=emergency` — thấy thêm form mật khẩu + Telegram. Đăng nhập mật khẩu bằng tài khoản KHÔNG phải super_admin → thấy lỗi "Đăng nhập bằng mật khẩu đã tắt...".

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/me/ src/components/AppLayout.tsx src/app/sign-up-login-screen/components/LoginClient.tsx src/app/api/auth/login/route.ts
git commit -m "feat(sso): màn hình login chỉ-SSO + break-glass super_admin + bootstrap phiên qua /api/auth/me

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Cấu hình SSO trong Cấu Hình Hệ Thống (domain Zimbra + bật/tắt auto-sync)

**Files:**
- Modify: `src/lib/config/systemConfig.ts` (thêm cuối file)
- Modify: `src/lib/services/systemSettingsService.ts`
- Modify: `src/app/api/system-config/route.ts` (PUT — thêm nhánh `body.sso`)
- Create: `src/app/cau-hinh-he-thong/components/SsoConfigCard.tsx`
- Modify: `src/app/cau-hinh-he-thong/components/SystemConfigClient.tsx` (mount card vào section `security`)

**Interfaces:**
- Produces (Task 6 dùng): `getSsoConfig(): Promise<SsoConfig>` với `SsoConfig = { zimbraDomains: string[]; autoSyncEnabled: boolean }`; key DB `sso.provisioning` trong `system_settings`.
- Theo skill hardcode-to-config: seed rỗng ⇒ DEFAULT (`zimbraDomains: []`, `autoSyncEnabled: true`) — deploy không đổi hành vi vì chưa luồng nào gọi config này trước Task 6.

- [ ] **Step 1: Thêm vào `systemConfig.ts` (cuối file)**

```ts
// ─── Cấu hình SSO (sso.fadoai.com) ───────────────────────────────────────────
export interface SsoConfig {
  /**
   * Domain email do Zimbra quản (vd 'fadogroup.com.au'): user các domain này KHÔNG
   * tạo local user bên SSO (họ đăng nhập SSO bằng chính mật khẩu Zimbra).
   * Rỗng = không phân loại trước; SSO tự từ chối và hệ thống đánh dấu skipped_zimbra.
   */
  zimbraDomains: string[];
  /** Tự đồng bộ sang SSO khi tạo/sửa/khóa user trên trang Người Dùng. */
  autoSyncEnabled: boolean;
}

export const DEFAULT_SSO: SsoConfig = {
  zimbraDomains: [],
  autoSyncEnabled: true,
};

export function mergeSsoConfig(partial: Partial<SsoConfig> | null | undefined): SsoConfig {
  const d = DEFAULT_SSO;
  if (!partial) return { zimbraDomains: [...d.zimbraDomains], autoSyncEnabled: d.autoSyncEnabled };
  const domains = Array.isArray(partial.zimbraDomains)
    ? partial.zimbraDomains
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)
    : [...d.zimbraDomains];
  return {
    zimbraDomains: domains,
    autoSyncEnabled: typeof partial.autoSyncEnabled === 'boolean' ? partial.autoSyncEnabled : d.autoSyncEnabled,
  };
}
```

- [ ] **Step 2: Getter/saver trong `systemSettingsService.ts`**

Thêm import `SsoConfig, mergeSsoConfig` vào khối import từ `systemConfig` (dòng 2-9). Thêm hằng key (cạnh dòng 31): `const SSO_KEY = 'sso.provisioning';`. Thêm cạnh các getter khác:

```ts
/** Cấu hình SSO provisioning (merge DB lên DEFAULT). */
export async function getSsoConfig(): Promise<SsoConfig> {
  const partial = await readKey<SsoConfig>(SSO_KEY);
  return mergeSsoConfig(partial);
}

/** Lưu cấu hình SSO provisioning. */
export async function saveSsoConfig(cfg: SsoConfig, actor: string | null): Promise<void> {
  await upsert(SSO_KEY, 'sso', cfg, actor);
}
```

Trong `getResolvedSettings()` (dòng 144-173): thêm `sso: SsoConfig;` vào return type, `const sso = await getSsoConfig();` và thêm `sso` vào object trả về.

- [ ] **Step 3: PUT `/api/system-config` — nhánh validate + save**

Trong `src/app/api/system-config/route.ts`, hàm PUT, thêm nhánh mới theo pattern các nhánh hiện có (vd sau khối `body.accountEmail`, ~dòng 191):

```ts
    if (body.sso) {
      const s = body.sso;
      if (!Array.isArray(s.zimbraDomains) || s.zimbraDomains.some((d: unknown) => typeof d !== 'string')) {
        return NextResponse.json({ error: 'Danh sách domain Zimbra không hợp lệ' }, { status: 400 });
      }
      if (typeof s.autoSyncEnabled !== 'boolean') {
        return NextResponse.json({ error: 'autoSyncEnabled phải là true/false' }, { status: 400 });
      }
      const { mergeSsoConfig } = await import('@/lib/config/systemConfig');
      const { saveSsoConfig } = await import('@/lib/services/systemSettingsService');
      await saveSsoConfig(mergeSsoConfig(s), actor);
    }
```

Lưu ý: dùng đúng biến `actor` như các nhánh hiện có trong file (đọc code thật để khớp tên biến; nếu file dùng import tĩnh thay vì dynamic thì thêm vào khối import đầu file cho nhất quán).

- [ ] **Step 4: Tạo `SsoConfigCard.tsx` (tự quản fetch/save)**

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Save } from 'lucide-react';

interface SsoConfigState {
  zimbraDomains: string[];
  autoSyncEnabled: boolean;
}

/**
 * Card cấu hình SSO trong tab Bảo mật của Cấu Hình Hệ Thống.
 * Lưu vào system_settings key 'sso.provisioning' qua /api/system-config.
 */
export default function SsoConfigCard() {
  const [cfg, setCfg] = useState<SsoConfigState | null>(null);
  const [domainsText, setDomainsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // GET /api/system-config trả { data: {...} } (xem SystemConfigClient.tsx:173).
    fetch('/api/system-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const sso = (j?.data?.sso ?? j?.sso) as SsoConfigState | undefined;
        if (sso) {
          setCfg(sso);
          setDomainsText(sso.zimbraDomains.join(', '));
        }
      })
      .catch(() => setMsg({ ok: false, text: 'Không tải được cấu hình SSO' }));
  }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    const zimbraDomains = domainsText
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    try {
      const res = await fetch('/api/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sso: { ...cfg, zimbraDomains } }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setCfg({ ...cfg, zimbraDomains });
        setMsg({ ok: true, text: 'Đã lưu cấu hình SSO' });
      } else {
        setMsg({ ok: false, text: j?.error || 'Lưu thất bại' });
      }
    } catch {
      setMsg({ ok: false, text: 'Lưu thất bại. Vui lòng thử lại.' });
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) {
    return (
      <div className="rounded-2xl border border-white/5 p-6 flex justify-center" style={{ background: 'var(--card)' }}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2.5 border-b border-white/5 px-5 py-3.5">
        <KeyRound className="h-4 w-4 text-indigo-400" />
        <h3 className="text-base font-600 text-foreground">Đăng nhập SSO &amp; đồng bộ tài khoản</h3>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
            Domain email Zimbra (phân cách bởi dấu phẩy)
          </label>
          <textarea
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
            rows={2}
            placeholder="fadogroup.com.au, fado.vn"
            className="mt-1.5 w-full rounded-xl bg-[#162033] border border-white/10 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/60"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            User thuộc các domain này đăng nhập SSO bằng mật khẩu Zimbra — hệ thống sẽ KHÔNG tạo tài khoản local bên SSO cho họ.
          </p>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.autoSyncEnabled}
            onChange={(e) => setCfg({ ...cfg, autoSyncEnabled: e.target.checked })}
            className="w-4 h-4 rounded accent-indigo-500"
          />
          <span className="text-sm text-foreground">Tự đồng bộ sang SSO khi tạo / sửa / khóa người dùng</span>
        </label>
        {msg && (
          <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>
        )}
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu cấu hình SSO
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Mount vào section Bảo mật**

Trong `SystemConfigClient.tsx`: thêm `import SsoConfigCard from './SsoConfigCard';` đầu file. Section Bảo mật render các input `security.sessionDays` (dòng ~1003) và `security.resetTokenHours` (dòng ~1023) — thêm `<SsoConfigCard />` NGAY SAU card chứa 2 input đó (sau thẻ đóng `</div>` của card Bảo mật, vẫn trong block render của section `security`).

- [ ] **Step 6: Verify**

Run: `npm run type-check` → PASS.
Mở `/cau-hinh-he-thong` (đăng nhập super_admin, dùng `?mode=emergency` nếu cần) → tab Bảo mật thấy card mới; nhập `fadogroup.com.au`, bấm Lưu → reload thấy giá trị giữ nguyên.
Verify DB: `node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool(); p.query(\"SELECT value FROM system_settings WHERE key='sso.provisioning'\").then(r=>{console.log(r.rows); p.end();})"` → thấy JSON đã lưu.

- [ ] **Step 7: Commit**

```bash
git add src/lib/config/systemConfig.ts src/lib/services/systemSettingsService.ts src/app/api/system-config/route.ts src/app/cau-hinh-he-thong/components/
git commit -m "feat(sso): cấu hình domain Zimbra + bật/tắt auto-sync trong Cấu Hình Hệ Thống

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `ssoProvisioningService.ts` — M2M client + orchestrator sync

**Files:**
- Create: `src/lib/services/ssoProvisioningService.ts`

**Interfaces:**
- Consumes: `getSsoConfig()` (Task 5); env `SSO_M2M_CLIENT_ID/SECRET`, `SSO_ISSUER`; `query/queryOne/execute` từ `@/lib/db`; `notify()` từ `@/lib/notifications/engine` (event Task 9 — đến Task 9 mới có event, nên bọc try/catch để không vỡ trước đó).
- Produces (Task 7, 8 dùng):
  - `isZimbraEmail(email: string): Promise<boolean>`
  - `syncUserToSso(u: { id: string; email: string; name?: string | null; phone?: string | null; status?: string | null }, opts?: { password?: string; force?: boolean }): Promise<SsoSyncResult>` với `SsoSyncResult = { status: 'synced' | 'skipped_zimbra' | 'error' | 'disabled'; error?: string; ssoUserId?: string }` — hàm này TỰ cập nhật 4 cột `sso_*` và KHÔNG BAO GIỜ throw.
  - `resetSsoPasswordForUser(userId: string, newPassword: string): Promise<SsoSyncResult>`
  - `setSsoStatusForUser(userId: string, status: 'active' | 'inactive'): Promise<SsoSyncResult>`
  - `markSsoSyncStatus(userId: string, status: string, error?: string | null): Promise<void>`
  - `generateRandomPassword(length?: number): string` (mặc định 16, đạt yêu cầu ≥10 của SSO)

- [ ] **Step 1: Viết file đầy đủ**

```ts
import { queryOne, execute, query } from '@/lib/db';
import { getSsoConfig } from '@/lib/services/systemSettingsService';

/**
 * ssoProvisioningService — đồng bộ user AssetFlow → SSO (sso.fadoai.com) qua
 * Provisioning API (M2M client_credentials, scope users:write, rate-limit 30 req/phút).
 *
 * Nguyên tắc: AssetFlow là master. Lỗi SSO KHÔNG chặn thao tác local — chỉ ghi
 * sso_sync_status='error' để retry bằng nút Đồng bộ SSO trên trang Người Dùng.
 * Email thuộc domain Zimbra (cấu hình ở Cấu Hình Hệ Thống) → skipped_zimbra:
 * user đó đăng nhập SSO bằng mật khẩu Zimbra, không cần local user bên SSO.
 */

export interface SsoSyncResult {
  status: 'synced' | 'skipped_zimbra' | 'error' | 'disabled';
  error?: string;
  ssoUserId?: string;
  /**
   * Chỉ có khi vừa TẠO user SSO mới bằng mật khẩu TỰ SINH (caller không truyền password).
   * Caller chịu trách nhiệm gửi email cho user — TUYỆT ĐỐI không log/không lưu DB.
   */
  generatedPassword?: string;
}

interface SsoProvisionedUser {
  id: string;
  email: string;
  authSource?: string;
  status?: string;
  name?: string;
}

// ---- env + base URL ----
function getM2mEnv(): { issuer: string; base: string; clientId: string; clientSecret: string } {
  const issuer = (process.env.SSO_ISSUER || 'https://sso.fadoai.com/oidc').replace(/\/$/, '');
  const base = issuer.replace(/\/oidc$/, ''); // provisioning nằm ngoài /oidc
  const clientId = process.env.SSO_M2M_CLIENT_ID;
  const clientSecret = process.env.SSO_M2M_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SSO_M2M_CLIENT_ID / SSO_M2M_CLIENT_SECRET chưa được cấu hình trong env');
  }
  return { issuer, base, clientId, clientSecret };
}

// ---- machine token (client_credentials) + cache ----
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getMachineToken(forceNew = false): Promise<string> {
  if (!forceNew && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const { issuer, clientId, clientSecret } = getM2mEnv();
  const res = await fetch(`${issuer}/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'users:write' }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SSO M2M token lỗi ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

// ---- throttle: SSO giới hạn 30 req/phút → giãn tối thiểu 2.1s giữa các call ----
const MIN_GAP_MS = 2_100;
let throttleChain: Promise<void> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = throttleChain.then(fn);
  throttleChain = run.then(
    () => new Promise<void>((r) => setTimeout(r, MIN_GAP_MS)),
    () => new Promise<void>((r) => setTimeout(r, MIN_GAP_MS)),
  );
  return run;
}

/** Gọi Provisioning API kèm token; 401 → xin token mới + retry đúng 1 lần. */
async function ssoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { base } = getM2mEnv();
  const doFetch = async (forceToken: boolean) => {
    const token = await getMachineToken(forceToken);
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {}),
        authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  };
  return throttled(async () => {
    let res = await doFetch(false);
    if (res.status === 401) res = await doFetch(true);
    return res;
  });
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  return `SSO ${res.status}: ${body.slice(0, 300)}`;
}

// ---- API calls thô ----
export async function createSsoUser(p: {
  email: string; password: string; fullName?: string; phoneNumber?: string;
}): Promise<SsoProvisionedUser> {
  const res = await ssoFetch('/provisioning/users', {
    method: 'POST',
    body: JSON.stringify({
      email: p.email,
      password: p.password,
      fullName: p.fullName || p.email,
      ...(p.phoneNumber ? { phoneNumber: p.phoneNumber } : {}),
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SsoProvisionedUser;
}

export async function findSsoUserByEmail(email: string): Promise<SsoProvisionedUser | null> {
  const res = await ssoFetch(`/provisioning/users?email=${encodeURIComponent(email)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res));
  const j = (await res.json()) as SsoProvisionedUser | { items?: SsoProvisionedUser[] };
  // API có thể trả object đơn hoặc dạng danh sách — chấp nhận cả hai.
  if ((j as { items?: SsoProvisionedUser[] }).items) {
    return (j as { items: SsoProvisionedUser[] }).items[0] ?? null;
  }
  return (j as SsoProvisionedUser).id ? (j as SsoProvisionedUser) : null;
}

export async function updateSsoProfile(ssoUserId: string, patch: {
  fullName?: string; displayName?: string; phoneNumber?: string;
}): Promise<void> {
  const res = await ssoFetch(`/provisioning/users/${encodeURIComponent(ssoUserId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function setSsoStatus(ssoUserId: string, status: 'active' | 'inactive'): Promise<void> {
  const res = await ssoFetch(`/provisioning/users/${encodeURIComponent(ssoUserId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function resetSsoPassword(ssoUserId: string, password: string): Promise<void> {
  const res = await ssoFetch(`/provisioning/users/${encodeURIComponent(ssoUserId)}/password`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

// ---- helpers ----
export async function isZimbraEmail(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  if (!domain) return false;
  const cfg = await getSsoConfig();
  return cfg.zimbraDomains.includes(domain);
}

/** Mật khẩu ngẫu nhiên đạt yêu cầu SSO (≥10 ký tự). KHÔNG log giá trị này. */
export function generateRandomPassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

/** SSO từ chối vì email thuộc domain Zimbra (server tự biết dù ta chưa cấu hình domain). */
function isZimbraRejection(message: string): boolean {
  return /zimbra/i.test(message);
}

export async function markSsoSyncStatus(
  userId: string,
  status: string,
  error?: string | null,
  ssoUserId?: string | null
): Promise<void> {
  await execute(
    `UPDATE users SET
       sso_sync_status = $2,
       sso_sync_error  = $3,
       sso_synced_at   = NOW()
       ${ssoUserId !== undefined ? ', sso_user_id = $4' : ''}
     WHERE id::text = $1`,
    ssoUserId !== undefined
      ? [userId, status, error ?? null, ssoUserId]
      : [userId, status, error ?? null]
  );
}

/** Báo super_admin khi sync lỗi (qua notification engine — event thêm ở eventCatalog). */
async function notifySyncFailed(u: { id: string; email: string; name?: string | null }, errorMessage: string): Promise<void> {
  try {
    const admins = await query<{ id: string }>(
      `SELECT id::text AS id FROM users WHERE role = 'super_admin' AND status = 'active'`
    );
    if (admins.length === 0) return;
    const { notify } = await import('@/lib/notifications/engine');
    await notify(
      'sso.sync_failed',
      { userName: u.name || u.email, userEmail: u.email, errorMessage: errorMessage.slice(0, 200) },
      { recipients: admins.map((a) => a.id), relatedId: u.id }
    );
  } catch (e) {
    console.error('[sso] notifySyncFailed error:', (e as Error).message);
  }
}

// ---- orchestrator ----
/**
 * Đồng bộ 1 user local → SSO. KHÔNG throw — mọi kết quả phản ánh qua return + cột sso_*.
 * - Zimbra domain → skipped_zimbra (không gọi SSO).
 * - Đã có sso_user_id → PATCH profile + status.
 * - Chưa có → tìm theo email để LINK, không thấy → tạo mới (password truyền vào hoặc random).
 */
export async function syncUserToSso(
  u: { id: string; email: string; name?: string | null; phone?: string | null; status?: string | null },
  opts: { password?: string; force?: boolean } = {}
): Promise<SsoSyncResult> {
  try {
    const cfg = await getSsoConfig();
    if (!cfg.autoSyncEnabled && !opts.force) return { status: 'disabled' };

    const email = u.email?.trim().toLowerCase();
    if (!email) {
      await markSsoSyncStatus(u.id, 'error', 'User không có email');
      return { status: 'error', error: 'User không có email' };
    }

    if (await isZimbraEmail(email)) {
      await markSsoSyncStatus(u.id, 'skipped_zimbra', null);
      return { status: 'skipped_zimbra' };
    }

    // Lấy link hiện có từ DB (nguồn sự thật, không tin object truyền vào).
    const row = await queryOne<{ sso_user_id: string | null }>(
      `SELECT sso_user_id FROM users WHERE id::text = $1`, [u.id]
    );
    let ssoUserId = row?.sso_user_id || null;
    let generatedPassword: string | undefined;

    if (!ssoUserId) {
      const existing = await findSsoUserByEmail(email);
      if (existing?.id) {
        ssoUserId = existing.id; // LINK tài khoản SSO sẵn có thay vì tạo trùng
      } else {
        // Không có password tường minh → tự sinh; trả về cho caller gửi email (spec §7.5).
        if (!opts.password) generatedPassword = generateRandomPassword();
        const created = await createSsoUser({
          email,
          password: opts.password || (generatedPassword as string),
          fullName: u.name || email,
          phoneNumber: u.phone || undefined,
        });
        ssoUserId = created.id;
      }
    }

    await updateSsoProfile(ssoUserId, {
      fullName: u.name || email,
      ...(u.phone ? { phoneNumber: u.phone } : {}),
    });
    await setSsoStatus(ssoUserId, u.status === 'inactive' ? 'inactive' : 'active');

    await markSsoSyncStatus(u.id, 'synced', null, ssoUserId);
    return { status: 'synced', ssoUserId, ...(generatedPassword ? { generatedPassword } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isZimbraRejection(message)) {
      // SSO tự từ chối vì domain Zimbra → coi như phân loại đúng, không phải lỗi.
      await markSsoSyncStatus(u.id, 'skipped_zimbra', null).catch(() => {});
      return { status: 'skipped_zimbra' };
    }
    console.error(`[sso] sync user ${u.id} lỗi:`, message);
    await markSsoSyncStatus(u.id, 'error', message).catch(() => {});
    await notifySyncFailed(u, message);
    return { status: 'error', error: message };
  }
}

/** Đổi mật khẩu SSO cho user local (nếu đã link). SSO tự thu hồi mọi phiên của user đó. */
export async function resetSsoPasswordForUser(userId: string, newPassword: string): Promise<SsoSyncResult> {
  try {
    const row = await queryOne<{ sso_user_id: string | null; email: string; name: string | null }>(
      `SELECT sso_user_id, email, name FROM users WHERE id::text = $1`, [userId]
    );
    if (!row) return { status: 'error', error: 'User không tồn tại' };
    if (!row.sso_user_id) return { status: 'error', error: 'User chưa liên kết SSO' };
    await resetSsoPassword(row.sso_user_id, newPassword);
    return { status: 'synced', ssoUserId: row.sso_user_id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sso] reset password user ${userId} lỗi:`, message);
    return { status: 'error', error: message };
  }
}

/** Khóa/mở user bên SSO (nếu đã link) — dùng cho deactivate/hard-delete. */
export async function setSsoStatusForUser(userId: string, status: 'active' | 'inactive'): Promise<SsoSyncResult> {
  try {
    const row = await queryOne<{ sso_user_id: string | null }>(
      `SELECT sso_user_id FROM users WHERE id::text = $1`, [userId]
    );
    if (!row?.sso_user_id) return { status: 'error', error: 'User chưa liên kết SSO' };
    await setSsoStatus(row.sso_user_id, status);
    return { status: 'synced', ssoUserId: row.sso_user_id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sso] set status user ${userId} lỗi:`, message);
    return { status: 'error', error: message };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check` → PASS. (Import `notify` là dynamic nên event chưa tồn tại ở catalog không gây lỗi compile; runtime engine tự log "event không tồn tại" cho tới Task 9.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/ssoProvisioningService.ts
git commit -m "feat(sso): service provisioning M2M — token cache, throttle 30req/phút, orchestrator sync

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Hook sync vào `usersService` + luật mật khẩu (local NULL trừ super_admin, min 10)

**Files:**
- Modify: `src/lib/services/usersService.ts` (createUser ~253, updateUser ~364, deactivateUser ~555, hardDeleteUser ~585, adminChangeUserPassword ~648)
- Modify: `src/app/api/users/route.ts` (POST — validate password ≥10)
- Modify (validation 8→10 + placeholder text): `src/app/users/components/UsersClient.tsx:269,282` · `src/app/users/components/UsersModalTabside.tsx:578-579,660-661,1974` · `src/app/users/components/UsersModal.tsx:362` · `src/app/users/components/ApproveUsersModal.tsx:94,304`

**Interfaces:**
- Consumes: `syncUserToSso`, `resetSsoPasswordForUser`, `setSsoStatusForUser`, `markSsoSyncStatus` (Task 6) — luôn qua `await import(...)` để không kéo stack notification vào mọi chỗ import usersService.
- Produces: hành vi mới của các hàm usersService (chữ ký KHÔNG đổi).

- [ ] **Step 1: `createUser` — không lưu hash local cho user thường + sync sau insert**

Trong `createUser` (dòng ~271-287), thay dòng build password:

```ts
    password: userData.password ? await bcrypt.hash(userData.password, 10) : userData.password,
```

bằng:

```ts
    // Chỉ SSO: user thường KHÔNG giữ bcrypt hash local (mật khẩu sống bên SSO).
    // Riêng super_admin giữ hash để break-glass khi SSO sự cố.
    password: userData.password && (userData.role || 'user') === 'super_admin'
      ? await bcrypt.hash(userData.password, 10)
      : null,
```

Và NGAY TRƯỚC `delete data.password;` (dòng ~359), thêm:

```ts
  // Đồng bộ sang SSO (không chặn luồng tạo user nếu SSO lỗi — badge trên trang Users).
  if (data.id) {
    try {
      const { syncUserToSso } = await import('@/lib/services/ssoProvisioningService');
      const r = await syncUserToSso(
        { id: String(data.id), email: data.email, name: data.name, phone: data.phone, status: data.status },
        { password: userData.password || undefined }
      );
      // Form không nhập mật khẩu → SSO đã tạo bằng mật khẩu tự sinh → email cho user.
      if (r.generatedPassword) {
        try {
          const { sendSsoInitialPasswordEmail } = await import('@/lib/services/emailService');
          await sendSsoInitialPasswordEmail(data.email, data.name || data.email, r.generatedPassword);
        } catch (e) {
          console.error('Gửi email mật khẩu SSO ban đầu (create) lỗi:', (e as Error).message);
        }
      }
    } catch (e) {
      console.error('SSO sync (create) error:', (e as Error).message);
    }
  }
```

Lưu ý thứ tự task: `sendSsoInitialPasswordEmail` được thêm ở Task 8 — nếu thực thi Task 7 trước Task 8, thêm hàm đó vào `emailService.ts` ngay tại task này (code đầy đủ nằm ở Task 8 Step 1) rồi Task 8 bỏ qua bước trùng.

- [ ] **Step 2: `updateUser` — luật hash + sync profile/status + cảnh báo đổi email**

(a) Thay dòng `if (userData.password) updateData.password = await bcrypt.hash(userData.password, 10);` (dòng ~519) bằng:

```ts
  if (userData.password) {
    // Chỉ SSO: hash local chỉ dành cho super_admin (break-glass); user thường → NULL.
    const targetRole = normalizeRole((userData.role || user.role) as string);
    updateData.password = targetRole === 'super_admin' ? await bcrypt.hash(userData.password, 10) : null;
  }
```

(b) NGAY SAU khối dual-write `trySyncAssignments` (dòng ~527-532), thêm:

```ts
  // Đồng bộ SSO: profile/trạng thái đổi → PATCH; đổi mật khẩu → reset bên SSO.
  try {
    const sso = await import('@/lib/services/ssoProvisioningService');
    const emailChanged = userData.email && userData.email.trim().toLowerCase() !== user.email?.toLowerCase();
    if (emailChanged && user.sso_user_id) {
      // SSO không có API đổi email — đánh dấu để admin xử lý tay, không auto tạo tài khoản trùng.
      await sso.markSsoSyncStatus(id, 'error', 'Email đã đổi — cần cập nhật tay bên SSO rồi bấm Đồng bộ SSO');
    } else if (['name', 'phone', 'status', 'email'].some((f) => userData[f] !== undefined)) {
      await sso.syncUserToSso({ id, email: data.email, name: data.name, phone: data.phone, status: data.status });
    }
    if (userData.password) {
      const r = await sso.resetSsoPasswordForUser(id, userData.password);
      if (r.status === 'error' && r.error !== 'User chưa liên kết SSO') {
        console.error('SSO reset password (update) error:', r.error);
      }
    }
  } catch (e) {
    console.error('SSO sync (update) error:', (e as Error).message);
  }
```

Lưu ý: `user.sso_user_id` đến từ `getUserById` — nếu SELECT của `getUserById` liệt kê cột tường minh (không phải `SELECT *`), thêm `sso_user_id, sso_sync_status, sso_sync_error` vào danh sách cột của nó.

- [ ] **Step 3: `deactivateUser` + `hardDeleteUser`**

Trong `deactivateUser`, NGAY TRƯỚC `delete data.password;` (dòng ~576), thêm:

```ts
  // Khóa cả bên SSO — user hết đăng nhập được ngay.
  try {
    const { setSsoStatusForUser } = await import('@/lib/services/ssoProvisioningService');
    await setSsoStatusForUser(id, 'inactive');
  } catch (e) {
    console.error('SSO deactivate error:', (e as Error).message);
  }
```

Trong `hardDeleteUser`, thay toàn bộ hàm bằng (lấy `sso_user_id` TRƯỚC khi xóa, khóa SSO SAU khi xóa local thành công):

```ts
export async function hardDeleteUser(id: string): Promise<boolean> {
  // SSO không có xóa cứng → khóa vĩnh viễn bên SSO sau khi xóa local.
  const ssoRow = await queryOne<{ sso_user_id: string | null }>(
    `SELECT sso_user_id FROM users WHERE id::text = $1`, [id]
  );
  const deleted = await withTransaction(async (client) => {
    await client.query(
      `UPDATE assets SET assigned_to = NULL, assigned_to_name = NULL, updated_at = NOW()
        WHERE assigned_to::text = $1`,
      [id]
    );
    const res = await client.query(`DELETE FROM users WHERE id::text = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  });
  if (deleted && ssoRow?.sso_user_id) {
    try {
      const { setSsoStatus } = await import('@/lib/services/ssoProvisioningService');
      await setSsoStatus(ssoRow.sso_user_id, 'inactive');
    } catch (e) {
      console.error('SSO hard-delete (khóa SSO) error:', (e as Error).message);
    }
  }
  return deleted;
}
```

- [ ] **Step 4: `adminChangeUserPassword` — min 10 + reset SSO + luật hash**

Thay khối từ `if (newPassword.length < 8)` đến hết gán `updateData` (dòng ~665-671) bằng:

```ts
  if (newPassword.length < 10) {
    throw new Error('Mật khẩu phải có ít nhất 10 ký tự');
  }

  const now = new Date().toISOString();
  // Chỉ SSO: hash local chỉ cho super_admin (break-glass); user thường → NULL.
  const updateData: any = {
    password: targetUser.role === 'super_admin' ? await bcrypt.hash(newPassword, 10) : null,
    updated_at: now,
  };
```

Và NGAY TRƯỚC `return true;` cuối hàm, thêm:

```ts
  // Đổi mật khẩu bên SSO (nguồn xác thực thật). SSO tự thu hồi mọi phiên của user đó.
  try {
    const { resetSsoPasswordForUser } = await import('@/lib/services/ssoProvisioningService');
    const r = await resetSsoPasswordForUser(targetUserId, newPassword);
    if (r.status === 'error' && r.error !== 'User chưa liên kết SSO') {
      console.error('SSO admin reset password error:', r.error);
    }
  } catch (e) {
    console.error('SSO admin reset password error:', (e as Error).message);
  }
```

- [ ] **Step 5: Validate password ≥10 server-side khi tạo user**

Trong `src/app/api/users/route.ts` POST, sau check `if (!body.email || !body.name)` (dòng ~86-88), thêm:

```ts
    if (body.password && String(body.password).length < 10) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 10 ký tự (yêu cầu của SSO)' }, { status: 400 });
    }
```

- [ ] **Step 6: Nâng validation client 8 → 10**

Sửa từng chỗ (đổi cả số trong điều kiện lẫn message/placeholder, giữ nguyên phần còn lại):
- `UsersClient.tsx:269`: `if (form.password.length < 10) newErrors.password = 'Mật khẩu phải có ít nhất 10 ký tự';`
- `UsersClient.tsx:282`: tương tự cho `passwordForm.newPassword`.
- `UsersModalTabside.tsx:578-579`, `660-661`: `< 10` + message `'Mật khẩu phải có ít nhất 10 ký tự'`.
- `UsersModalTabside.tsx:1974`: text 💡 đổi thành `Mật khẩu mới phải có ít nhất 10 ký tự...`.
- `UsersModal.tsx:362`: `< 10` + message.
- `ApproveUsersModal.tsx:94`: `< 10` + message; dòng `304` placeholder → `"Ít nhất 10 ký tự"`.

- [ ] **Step 7: Verify**

Run: `npm run type-check` → PASS.
Manual (dev server, đăng nhập admin qua `?mode=emergency`): tạo user mới email ngoài (vd `test-sso@gmail.com`, mật khẩu 12 ký tự) → user tạo thành công; kiểm DB: `SELECT email, password IS NULL AS no_pw, sso_sync_status, sso_sync_error FROM users WHERE email='test-sso@gmail.com'` → `no_pw = true`; `sso_sync_status` = `synced` (env M2M đã điền + client đã đăng ký) hoặc `error` kèm message rõ (env chưa điền — hành vi đúng, không chặn tạo).

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/usersService.ts src/app/api/users/route.ts src/app/users/components/
git commit -m "feat(sso): hook đồng bộ SSO vào usersService + mật khẩu local chỉ super_admin, min 10 ký tự

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: API retry/bulk sync + badge & nút trên trang Users

**Files:**
- Modify: `src/lib/services/emailService.ts` (thêm `sendSsoInitialPasswordEmail`)
- Create: `src/app/api/users/[id]/sso-sync/route.ts`
- Create: `src/app/api/users/sso-sync-all/route.ts`
- Modify: `src/lib/services/usersService.ts` — `getUsers` (SELECT dòng ~58-76) và `getVisibleUsers` (SELECT tương ứng): thêm `u.sso_user_id, u.sso_sync_status, u.sso_sync_error,` vào danh sách cột (cạnh `u.module_permissions,`)
- Modify: `src/app/users/components/UsersClient.tsx` (badge + nút per-user + nút bulk)

**Interfaces:**
- Consumes: `syncUserToSso` + `SsoSyncResult.generatedPassword` (Task 6); pattern permission của `POST /api/users`; `sesClient` sẵn có trong `emailService.ts`.
- Produces: `POST /api/users/[id]/sso-sync` → `{ success: true, result }` (result ĐÃ strip `generatedPassword` — không bao giờ trả mật khẩu về client); `POST /api/users/sso-sync-all` → `{ processed, synced, skippedZimbra, emailed, errors: Array<{email, error}>, remaining }` — UI gọi lặp tới khi `remaining === 0`; `sendSsoInitialPasswordEmail(email: string, name: string, password: string): Promise<void>`.

- [ ] **Step 1: Thêm `sendSsoInitialPasswordEmail` vào `emailService.ts`**

Thêm cuối file, dùng chung `sesClient` đầu file và cùng giá trị `Source` với `sendPasswordResetEmail` (đọc hàm đó để lấy đúng biến env From — thường `SES_FROM_EMAIL`):

```ts
/**
 * Email mật khẩu SSO ban đầu — gửi khi hệ thống TỰ SINH mật khẩu lúc đồng bộ user
 * sang SSO (spec SSO §7.5). KHÔNG log mật khẩu ở bất kỳ đâu.
 */
export async function sendSsoInitialPasswordEmail(
  email: string,
  name: string,
  password: string
) {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🔑 Tài khoản FADO SSO của bạn</h1>
      </div>
      <div style="background: #f8f9fa; padding: 30px;">
        <p style="color: #555; font-size: 16px; line-height: 1.6;">Xin chào <strong>${name}</strong>,</p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Tài khoản đăng nhập FADO SSO đã được tạo cho bạn. Từ nay bạn đăng nhập AssetFlow
          (và các ứng dụng FADO khác) bằng tài khoản này.
        </p>
        <p style="color: #555; font-size: 15px;">Email đăng nhập: <strong>${email}</strong></p>
        <p style="color: #555; font-size: 15px;">Mật khẩu ban đầu: <strong style="font-family: monospace;">${password}</strong></p>
        <p style="color: #999; font-size: 13px;">Vui lòng đổi mật khẩu sau lần đăng nhập đầu tiên.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 36px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">Đăng nhập AssetFlow</a>
        </div>
      </div>
    </div>
  `;
  const command = new SendEmailCommand({
    Source: process.env.SES_FROM_EMAIL || '',
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Tài khoản FADO SSO của bạn', Charset: 'UTF-8' },
      Body: { Html: { Data: htmlContent, Charset: 'UTF-8' } },
    },
  });
  await sesClient.send(command);
}
```

- [ ] **Step 2: Route per-user `src/app/api/users/[id]/sso-sync/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/services/usersService';
import { canAccess } from '@/lib/permissions';
import { checkUnitAccess } from '@/lib/api-permissions';
import { syncUserToSso } from '@/lib/services/ssoProvisioningService';

/** Đồng bộ lại 1 user sang SSO (nút "Đồng bộ SSO" trên trang Người Dùng). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const actor = await getUserById(currentUserId);
    if (!actor) return NextResponse.json({ error: 'Người dùng không tồn tại' }, { status: 401 });
    if (!checkUnitAccess(request, 'users', 'edit') && !canAccess(actor.module_permissions as any, 'users', 'edit')) {
      return NextResponse.json({ error: 'Bạn không có quyền đồng bộ người dùng' }, { status: 403 });
    }

    const target = await getUserById(params.id);
    if (!target) return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 });

    const result = await syncUserToSso(
      {
        id: String(target.id),
        email: (target as any).email,
        name: (target as any).name,
        phone: (target as any).phone,
        status: (target as any).status,
      },
      { force: true }
    );

    // Vừa tạo user SSO mới bằng mật khẩu tự sinh → email cho user (không chặn nếu email lỗi).
    if (result.generatedPassword) {
      try {
        const { sendSsoInitialPasswordEmail } = await import('@/lib/services/emailService');
        await sendSsoInitialPasswordEmail(
          (target as any).email,
          (target as any).name || (target as any).email,
          result.generatedPassword
        );
      } catch (e) {
        console.error('Gửi email mật khẩu SSO ban đầu lỗi:', (e as Error).message);
      }
    }

    // TUYỆT ĐỐI không trả mật khẩu về client.
    const { generatedPassword: _gp, ...safeResult } = result;
    return NextResponse.json({ success: true, result: safeResult });
  } catch (err) {
    console.error('POST /api/users/[id]/sso-sync error:', err);
    return NextResponse.json({ error: 'Lỗi server khi đồng bộ SSO' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Route bulk `src/app/api/users/sso-sync-all/route.ts`**

Chạy theo BATCH (tối đa 15 user chưa-sync mỗi request — throttle 2.1s/call giữ request < ~35s) và trả `remaining` để UI gọi lặp:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { syncUserToSso } from '@/lib/services/ssoProvisioningService';

const BATCH_SIZE = 15;

/**
 * Đồng bộ hàng loạt user → SSO (công cụ migrate lần đầu + retry lỗi).
 * Mỗi request xử lý 1 batch; client gọi lặp cho tới khi remaining = 0.
 * Chỉ admin/super_admin (role đã được middleware verify từ DB).
 */
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Chỉ quản trị viên được đồng bộ hàng loạt' }, { status: 403 });
    }

    // Ứng viên: user active chưa từng synced/skipped (NULL hoặc error).
    const candidates = await query<{ id: string; email: string; name: string | null; phone: string | null; status: string }>(
      `SELECT id::text AS id, email, name, phone, status FROM users
        WHERE status = 'active'
          AND (sso_sync_status IS NULL OR sso_sync_status = 'error')
        ORDER BY created_at ASC`
    );

    const batch = candidates.slice(0, BATCH_SIZE);
    let synced = 0, skippedZimbra = 0, emailed = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const u of batch) {
      const r = await syncUserToSso(u, { force: true });
      if (r.status === 'synced') {
        synced++;
        // User SSO mới với mật khẩu tự sinh → email mật khẩu ban đầu (spec §7.5).
        if (r.generatedPassword) {
          try {
            const { sendSsoInitialPasswordEmail } = await import('@/lib/services/emailService');
            await sendSsoInitialPasswordEmail(u.email, u.name || u.email, r.generatedPassword);
            emailed++;
          } catch (e) {
            console.error(`Gửi email mật khẩu SSO cho ${u.email} lỗi:`, (e as Error).message);
          }
        }
      }
      else if (r.status === 'skipped_zimbra') skippedZimbra++;
      else if (r.status === 'error') errors.push({ email: u.email, error: r.error || 'Không rõ' });
    }

    return NextResponse.json({
      processed: batch.length,
      synced,
      skippedZimbra,
      emailed,
      errors,
      remaining: Math.max(0, candidates.length - batch.length),
    });
  } catch (err) {
    console.error('POST /api/users/sso-sync-all error:', err);
    return NextResponse.json({ error: 'Lỗi server khi đồng bộ hàng loạt' }, { status: 500 });
  }
}
```

Lưu ý: user lỗi lặp lại vẫn nằm trong candidates các vòng sau nhưng `remaining` tính theo tổng — UI dừng theo `remaining` VÀ hiển thị `errors`; nếu 1 batch trả `processed > 0` mà `synced + skippedZimbra === 0` (toàn lỗi), UI dừng lặp để tránh vòng vô hạn (xem Step 4).

- [ ] **Step 4: Thêm cột sso vào SELECT của `getUsers` + `getVisibleUsers`**

Trong `usersService.ts`, cả hai query SELECT danh sách user (dòng ~58-76 của `getUsers` và block tương ứng trong `getVisibleUsers` — grep `u.module_permissions,`), thêm ngay sau `u.module_permissions,`:

```sql
            u.sso_user_id, u.sso_sync_status, u.sso_sync_error,
```

- [ ] **Step 5: UI UsersClient — badge + nút per-user + nút bulk**

Trong `src/app/users/components/UsersClient.tsx`:

(a) Thêm helper render badge (đặt gần các helper render hiện có, trước phần return chính):

```tsx
  /** Badge trạng thái đồng bộ SSO — hiển thị cạnh badge trạng thái user. */
  const renderSsoBadge = (u: any) => {
    if (u.sso_sync_status === 'synced') {
      return <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-600 bg-green-500/15 text-green-300" title="Đã đồng bộ SSO">✓ SSO</span>;
    }
    if (u.sso_sync_status === 'skipped_zimbra') {
      return <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-600 bg-sky-500/15 text-sky-300" title="Đăng nhập SSO bằng tài khoản Zimbra">Zimbra</span>;
    }
    if (u.sso_sync_status === 'error') {
      return <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-600 bg-amber-500/15 text-amber-300" title={u.sso_sync_error || 'Đồng bộ SSO lỗi'}>⚠ SSO</span>;
    }
    return <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-600 bg-white/5 text-muted-foreground" title="Chưa đồng bộ SSO">— SSO</span>;
  };
```

(b) Gọi `{renderSsoBadge(u)}` cạnh badge trạng thái ở CẢ HAI chế độ hiển thị: card view (gần `statusColor` dòng ~1395) và table view (gần `statusLabel` dòng ~1691-1692).

(c) Handler per-user (đặt cạnh các handler hiện có như handler archive dòng ~1335):

```tsx
  const handleSsoSync = async (u: any) => {
    try {
      const res = await fetch(`/api/users/${u.id}/sso-sync`, { method: 'POST' });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.result?.status !== 'error') {
        toast.success('Đã đồng bộ SSO');
      } else {
        toast.error(j?.result?.error || j?.error || 'Đồng bộ SSO thất bại');
      }
      await loadUsers(true);
    } catch {
      toast.error('Đồng bộ SSO thất bại');
    }
  };
```

(component chính của file đã có sẵn `const toast = useToast();` dòng ~698 và `const loadUsers = React.useCallback(...)` dòng ~1114 — đặt handler trong cùng scope đó).

(d) Nút per-user: trong cụm nút hành động của mỗi row (cạnh nút Lưu trữ/Kích hoạt, dòng ~1475 card view và ~1864 table view), thêm:

```tsx
                    <button
                      onClick={() => handleSsoSync(u)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-indigo-400 hover:bg-white/5"
                      title="Đồng bộ SSO"
                    >
                      <RefreshCw size={13} />
                    </button>
```

(thêm `RefreshCw` vào import lucide-react đầu file nếu chưa có).

(e) Nút bulk (chỉ admin/super_admin — dùng biến role hiện có của file, grep `isAdmin`/`currentUser`): đặt cạnh nút "Thêm mới" ở header row:

```tsx
  const [bulkSyncing, setBulkSyncing] = useState(false);

  const handleSsoSyncAll = async () => {
    if (!confirm('Đồng bộ toàn bộ người dùng đang hoạt động sang SSO? Quá trình chạy theo lô, có thể mất vài phút.')) return;
    setBulkSyncing(true);
    const total = { synced: 0, skippedZimbra: 0, errors: [] as Array<{ email: string; error: string }> };
    try {
      // Gọi lặp theo batch tới khi hết; dừng nếu 1 batch toàn lỗi (tránh vòng vô hạn).
      for (let i = 0; i < 100; i++) {
        const res = await fetch('/api/users/sso-sync-all', { method: 'POST' });
        const j = await res.json();
        if (!res.ok) { toast.error(j?.error || 'Đồng bộ hàng loạt thất bại'); break; }
        total.synced += j.synced; total.skippedZimbra += j.skippedZimbra; total.errors.push(...j.errors);
        if (j.remaining === 0 || (j.processed > 0 && j.synced + j.skippedZimbra === 0)) break;
      }
      const summary = `Đồng bộ SSO xong: ${total.synced} thành công, ${total.skippedZimbra} Zimbra, ${total.errors.length} lỗi`;
      if (total.errors.length) toast.error(summary); else toast.success(summary);
    } finally {
      setBulkSyncing(false);
      await loadUsers(true);
    }
  };
```

```tsx
            {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
              <button
                onClick={handleSsoSyncAll}
                disabled={bulkSyncing}
                className="btn-ghost rounded-xl px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-60"
              >
                {bulkSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Đồng bộ SSO
              </button>
            )}
```

- [ ] **Step 6: Verify**

Run: `npm run type-check` → PASS.
Manual: trang `/users` — thấy badge SSO trên từng user; bấm "Đồng bộ SSO" per-user với user lỗi → badge cập nhật; bấm nút bulk (admin) → toast tổng kết; user email domain đã khai ở Cấu Hình → badge `Zimbra` (không gọi SSO); user email ngoài chưa có bên SSO → nhận được email "Tài khoản FADO SSO của bạn" (nếu SES đã cấu hình — chưa cấu hình thì log lỗi email nhưng sync vẫn `synced`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/emailService.ts src/app/api/users/ src/lib/services/usersService.ts src/app/users/components/UsersClient.tsx
git commit -m "feat(sso): API đồng bộ lại + đồng bộ hàng loạt theo lô, badge SSO + email mật khẩu ban đầu

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Notification `sso.sync_failed` qua engine

**Files:**
- Modify: `src/lib/notifications/templates.ts` (thêm entry vào `DEFAULT_NOTIFICATION_TEMPLATES`)
- Modify: `src/lib/notifications/eventCatalog.ts` (thêm entry vào `NOTIFICATION_EVENTS`)

**Interfaces:**
- Consumes: `notifySyncFailed` trong `ssoProvisioningService.ts` (Task 6) đã gọi `notify('sso.sync_failed', { userName, userEmail, errorMessage }, { recipients, relatedId })` — task này chỉ đăng ký template + event để engine nhận diện.

- [ ] **Step 1: Template**

Thêm vào `DEFAULT_NOTIFICATION_TEMPLATES` (nhóm mới ở cuối object, trước dấu `};`):

```ts
  // ── SSO ──
  'sso_sync_failed': {
    category: 'Hệ thống — SSO', label: 'Đồng bộ SSO thất bại', icon: 'alert-triangle',
    placeholders: ['userName', 'userEmail', 'errorMessage'],
    title: '⚠️ Đồng bộ SSO thất bại — {{userName}}',
    message: 'Không đồng bộ được tài khoản {{userEmail}} sang SSO: {{errorMessage}}. Vào Người Dùng → nút Đồng bộ SSO để thử lại.',
    telegram: '⚠️ *Đồng bộ SSO thất bại*\n\n👤 {{userName}} ({{userEmail}})\n❌ {{errorMessage}}\n\n_Vào Người Dùng → nút Đồng bộ SSO để thử lại._',
  },
```

- [ ] **Step 2: Event**

Thêm vào `NOTIFICATION_EVENTS` (cuối object, trước `};`):

```ts
  // ── SSO ──
  'sso.sync_failed': {
    key: 'sso.sync_failed',
    templateKey: 'sso_sync_failed',
    notifType: 'sso_sync_failed',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Mở Người Dùng',
    relatedUrl: () => '/users',
  },
```

- [ ] **Step 3: Verify**

Run: `npm run type-check` → PASS.
Manual: tắt tạm env `SSO_M2M_CLIENT_ID` (hoặc dùng user email không hợp lệ), tạo user mới → super_admin nhận thông báo in-app "⚠️ Đồng bộ SSO thất bại — ..." (chuông thông báo), template hiện trong `/cau-hinh-he-thong` tab Mẫu thông báo (category "Hệ thống — SSO").

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications/templates.ts src/lib/notifications/eventCatalog.ts
git commit -m "feat(sso): thông báo sso.sync_failed cho super_admin qua notification engine

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Verification tổng thể + cập nhật docs

**Files:**
- Modify: `CODEX.md` (mục Stack/auth), `docs/AGENT-INDEX.md` (mục Permissions/Auth/Sessions)

- [ ] **Step 1: Toàn bộ check tĩnh**

Run: `npm run type-check` → PASS. `npm run lint` → không lỗi mới (warning sẵn có bỏ qua). `npm run build` → build thành công.

- [ ] **Step 2: Checklist flow thật (dev server + SSO thật, cần env đã điền + 2 client đã đăng ký)**

1. `/sign-up-login-screen` → chỉ nút SSO → bấm → đăng nhập bên sso.fadoai.com → quay về `/dashboard`, sidebar/quyền hiển thị đúng (localStorage được bootstrap).
2. Login SSO bằng email KHÔNG có trong bảng `users` → quay về login với "Tài khoản SSO của bạn chưa được cấp...".
3. `?redirect=/users` được giữ qua vòng SSO (vào thẳng `/users` sau đăng nhập).
4. `?mode=emergency`: user thường → 403 message; super_admin → vào được.
5. Tạo user email ngoài (mật khẩu ≥10) → badge `✓ SSO` → đăng nhập SSO bằng user đó được ngay; DB `password IS NULL`.
6. Tạo user email domain Zimbra (đã khai config) → badge `Zimbra`, không gọi SSO.
7. Khóa user (Lưu trữ) → SSO status `inactive` → user đó login SSO bị chặn.
8. Admin đổi mật khẩu user → đăng nhập SSO bằng mật khẩu mới OK.
9. Bulk "Đồng bộ SSO" → toast tổng kết đúng số lượng; user lỗi có badge `⚠ SSO` + tooltip; super_admin nhận notification.
10. Đăng xuất → quay về login; đăng nhập lại qua SSO không cần nhập pass (SSO session 12h còn sống) — hành vi đúng của SSO.

Ghi kết quả từng mục (PASS/FAIL + ghi chú). Mục nào FAIL → sửa xong chạy lại, không báo hoàn thành khi chưa PASS.

- [ ] **Step 3: Cập nhật docs**

- `CODEX.md` mục "Stack va kien truc": sửa dòng auth thành mô tả hiện hành — đăng nhập chính qua FADO SSO (OIDC, `/api/auth/sso/*`), mật khẩu local chỉ còn break-glass super_admin (`?mode=emergency`); đồng bộ user sang SSO qua `ssoProvisioningService` + cột `users.sso_*`.
- `docs/AGENT-INDEX.md` mục "Permissions/Auth/Sessions": thêm vào danh sách bắt buộc đọc: `src/lib/auth/ssoClient.ts`, `src/lib/services/ssoProvisioningService.ts`, spec `docs/superpowers/specs/2026-07-17-sso-integration-design.md`.

- [ ] **Step 4: Commit cuối**

```bash
git add CODEX.md docs/AGENT-INDEX.md
git commit -m "docs(sso): cập nhật CODEX + AGENT-INDEX theo kiến trúc auth SSO mới

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Ghi chú cho người thực thi

- **Số dòng trong plan là mốc định vị tại thời điểm viết** — luôn đối chiếu bằng chuỗi code trích dẫn (anchor) trước khi sửa; file có thể đã xê dịch.
- **Không log secret**: mọi chỗ log lỗi SSO chỉ log message đã cắt ngắn, không log token/password/client_secret.
- **`changePassword` (user tự đổi, cần mật khẩu cũ)**: user thường không còn hash local → hàm này tự nhiên vô hiệu (bcrypt.compare fail). Đây là hành vi CHẤP NHẬN theo spec (mật khẩu sống bên SSO); không sửa trong scope này.
- **Nếu SSO backoffice chưa đăng ký client**: các task vẫn code + verify tĩnh được; các bước manual liên quan SSO thật đánh dấu BLOCKED và báo user, không tự bịa kết quả.
