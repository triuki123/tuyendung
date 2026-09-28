'use client';

// Share in-flight bootstrap requests, including React StrictMode's remount.
// Completed identities are never cached here so permission changes stay fresh.
let pendingIdentity: Promise<Record<string, any>> | null = null;

export function getRecruitmentIdentity(): Promise<Record<string, any>> {
  if (pendingIdentity) return pendingIdentity;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  pendingIdentity = fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal })
    .then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? 'Phiên đăng nhập đã hết hạn.' : 'Không thể tải thông tin đăng nhập.');
      const identity = await response.json();
      if (!identity?.id) throw new Error('Không thể xác nhận người dùng.');
      return identity;
    })
    .finally(() => { clearTimeout(timeout); pendingIdentity = null; });
  return pendingIdentity;
}
