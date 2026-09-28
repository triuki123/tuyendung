import { NextRequest } from 'next/server';

/** Trả action user có trong module email-center, hoặc null nếu chưa đăng nhập. */
export function getEmailCenterActions(request: NextRequest): string[] | null {
  const uid = request.headers.get('x-current-user-id');
  if (!uid) return null;
  const role = request.headers.get('x-current-user-role');
  if (role === 'super_admin') return ['payment', 'hr', 'account', 'internal', 'manage'];
  try {
    const raw = request.headers.get('x-user-permissions');
    if (!raw) return [];
    const perms = JSON.parse(raw);
    const a = perms?.['email-center'];
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

export function requireAction(request: NextRequest, action: string): { ok: true } | { ok: false; status: number; error: string } {
  const acts = getEmailCenterActions(request);
  if (acts === null) return { ok: false, status: 401, error: 'Chưa đăng nhập' };
  if (!acts.includes(action)) return { ok: false, status: 403, error: 'Không có quyền' };
  return { ok: true };
}
