import type { FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

/**
 * Ký cookie phiên (assetflow_session) hợp lệ — KHỚP signIdentity trong
 * src/lib/authCookie.ts (HMAC-SHA256 base64url payload.signature). Nhờ vậy
 * middleware cho qua và Playwright chụp được TRANG THẬT (không bị đẩy về login).
 * Không cần mật khẩu; chỉ cần AUTH_SECRET (đọc từ .env).
 */
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const AUTH = {
  id: '4ff71fda-0505-4332-a490-684922435f1c',
  email: 'namtp@fadogroup.com.au',
  name: 'Trà Phương Nam',
  role: 'super_admin',
  dept: '74ab7673-13d6-404f-a576-5f4e87f8f7fa',
  company: 'FADO Group',
};

const b64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export default async function globalSetup(_config: FullConfig) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET thiếu trong .env — không ký được cookie test.');

  const identity = {
    uid: AUTH.id, role: AUTH.role, sid: 'e2e-visual',
    name: AUTH.name, dept: AUTH.dept, iat: Math.floor(Date.now() / 1000),
  };
  const payload = b64url(Buffer.from(JSON.stringify(identity)));
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  const token = `${payload}.${sig}`;

  const authObj = {
    id: AUTH.id, email: AUTH.email, name: AUTH.name,
    role: AUTH.role, department: AUTH.dept, company: AUTH.company,
  };

  const state = {
    cookies: [{
      name: 'assetflow_session', value: token,
      domain: 'localhost', path: '/',
      expires: Math.floor(Date.now() / 1000) + 86400,
      httpOnly: true, secure: false, sameSite: 'Lax' as const,
    }],
    origins: [{
      origin: 'http://localhost:3002',
      localStorage: [
        { name: 'assetflow_auth', value: JSON.stringify(authObj) },
        { name: 'currentUser', value: JSON.stringify(authObj) },
        { name: 'userId', value: AUTH.id },
      ],
    }],
  };

  const dir = path.join(__dirname, '.auth');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));
  console.log('[global-setup] Đã ký cookie phiên test.');
}
