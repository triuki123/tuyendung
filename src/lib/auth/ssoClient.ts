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

/** Chỉ chấp nhận đường dẫn nội bộ an toàn (chống open-redirect kể cả '//' và '/\\'). */
export function safeInternalPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  // Phải bắt đầu bằng '/' và ký tự thứ 2 KHÔNG phải '/' hoặc '\' (chặn //host và /\host,
  // cả hai đều resolve thành host ngoài do WHATWG coi '\' như '/').
  if (raw === '/') return raw;
  if (/^\/[^/\\]/.test(raw)) return raw;
  return fallback;
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
