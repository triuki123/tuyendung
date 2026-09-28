import { NextRequest, NextResponse } from 'next/server';
import { listMessages, addMessage, getExpenseById } from '@/lib/services/expenseService';
import { listApprovals } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';
import { queryOne } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';

export const dynamic = 'force-dynamic';

async function canAccess(userId: string, role: string, expenseId: string): Promise<{ ok: boolean; e?: NonNullable<Awaited<ReturnType<typeof getExpenseById>>> }> {
  const e = await getExpenseById(expenseId);
  if (!e) return { ok: false };
  if (role === 'super_admin' || e.requested_by.toLowerCase() === userId.toLowerCase()) return { ok: true, e };
  const approvals = await listApprovals(expenseId);
  if (approvals.some((a) => String(a.approver_user_id).toLowerCase() === userId.toLowerCase())) return { ok: true, e };
  return { ok: (await hasExpensePerm(userId, e.company_id, 'view')), e };
}

/** GET — thread trao đổi của phiếu. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const acc = await canAccess(userId, request.headers.get('x-current-user-role') || '', params.id);
    if (!acc.ok) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const data = await listMessages(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET expense messages error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — gửi tin vào thread (immutable) + notify các bên liên quan. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const acc = await canAccess(userId, request.headers.get('x-current-user-role') || '', params.id);
    if (!acc.ok || !acc.e) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const text = String(body.body || '').trim();
    // Refs chứng từ đã upload (chat = cổng nhập chứng từ): [{id, file_name, mime_type}]
    const atts = Array.isArray(body.attachments)
      ? body.attachments.filter((a: any) => a?.id).map((a: any) => ({ id: String(a.id), file_name: String(a.file_name || ''), mime_type: String(a.mime_type || '') }))
      : [];
    if (!text && !atts.length) return NextResponse.json({ error: 'Nội dung trống' }, { status: 400 });

    const me = await queryOne<{ name: string }>('SELECT name FROM users WHERE id::text = $1', [userId.toLowerCase()]);
    const msg = await addMessage({
      expense_id: params.id, source: 'assetflow', author_ref: userId,
      author_name: me?.name || 'Người dùng', body: text || '📎 Đã gửi chứng từ', attachments: atts, client_msg_id: body.client_msg_id,
    });

    // Notify người tạo + mọi người trong chuỗi duyệt (trừ người gửi)
    const approvals = await listApprovals(params.id);
    const recipients = Array.from(new Set(
      [acc.e.requested_by, ...approvals.map((a) => String(a.approver_user_id))]
        .filter((id) => id && id.toLowerCase() !== userId.toLowerCase())
    ));
    if (recipients.length) {
      await notify('expense.message_new', {
        code: acc.e.code || '', author: me?.name || 'Người dùng',
        preview: (text || '📎 Đã gửi chứng từ').slice(0, 120), expenseId: params.id,
      }, { recipients, relatedId: params.id }).catch(() => {});
    }
    return NextResponse.json({ success: true, data: msg }, { status: 201 });
  } catch (err) {
    console.error('POST expense messages error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
