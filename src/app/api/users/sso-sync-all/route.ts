import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { syncUserToSso } from '@/lib/services/ssoProvisioningService';

const BATCH_SIZE = 15;

/**
 * Đồng bộ hàng loạt user → SSO (công cụ migrate lần đầu + retry lỗi).
 * Mỗi request xử lý 1 batch; client gọi lặp cho tới khi remaining = 0.
 * Chỉ super_admin (role đã được middleware verify từ DB) — công cụ này KHÔNG scope theo
 * công ty (quét toàn bộ user active hệ thống), khác với /api/users/[id]/sso-sync (đã có
 * canSyncUserRecord chặn admin công ty A đụng user công ty B). Cho admin dùng ở đây sẽ
 * để admin công ty A tạo tài khoản SSO + gửi email mật khẩu ban đầu cho cả nhân sự công ty B.
 */
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin') {
      return NextResponse.json({ error: 'Chỉ Quản trị viên tối cao được đồng bộ hàng loạt' }, { status: 403 });
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
