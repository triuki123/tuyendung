import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/services/usersService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { syncUserToSso } from '@/lib/services/ssoProvisioningService';
import { getCompanyMemberUserIds, getEffectiveContext } from '@/lib/services/userCompanyService';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

/**
 * Scope theo bản ghi (Đa Công Ty) — khớp `canAccessUserRecord` của PUT /api/users/[id]:
 * super_admin thấy tất cả; admin chỉ user cùng công ty đang làm việc; manager chỉ subtree.
 * Đồng bộ SSO có thể TẠO tài khoản SSO + gửi email nên phải chặn admin công ty A đụng user
 * công ty B (chỉ check module-level users:edit là chưa đủ).
 */
async function canSyncUserRecord(request: NextRequest, targetId: string): Promise<boolean> {
  const currentUserId = request.headers.get('x-current-user-id');
  const currentUserCompany = request.headers.get('x-current-user-company');
  if (!currentUserId) return false;
  if (!checkUnitAccess(request, 'users', 'edit')) return false;
  const ctx = await getEffectiveContext(currentUserId, currentUserCompany || null);
  if (!ctx) return false;
  if (ctx.role === 'super_admin') return true;
  if (ctx.role === 'admin') {
    if (!ctx.company_id) return false;
    const memberIds = await getCompanyMemberUserIds(ctx.company_id);
    return memberIds.includes(targetId);
  }
  if (ctx.role === 'manager') {
    const subtreeIds = await getOrgSubtreeUserIds(currentUserId, ctx.company_id);
    return [currentUserId, ...subtreeIds].includes(targetId);
  }
  return false;
}

/** Đồng bộ lại 1 user sang SSO (nút "Đồng bộ SSO" trên trang Người Dùng). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    if (!(await canSyncUserRecord(request, id))) {
      return NextResponse.json({ error: 'Bạn không có quyền đồng bộ người dùng này' }, { status: 403 });
    }

    const target = await getUserById(id);
    if (!target) return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 });

    // useLocalHash: user CŨ còn bcrypt hash trong AssetFlow thì import thẳng hash sang SSO
    // → họ giữ nguyên mật khẩu đang dùng, không phát sinh mật khẩu mới/email. User tạo sau
    // khi lên SSO có password = NULL nên nhánh này tự động không áp dụng.
    const result = await syncUserToSso(
      {
        id: String(target.id),
        email: (target as any).email,
        name: (target as any).name,
        phone: (target as any).phone,
        status: (target as any).status,
      },
      { force: true, useLocalHash: true }
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
