import { NextRequest, NextResponse } from 'next/server';
import { getAttachmentContent, deleteAttachment, getExpenseById } from '@/lib/services/expenseService';
import { listApprovals } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/** GET — nội dung chứng từ (mặc định inline để XEM LIỀN; ?download=1 → tải về). */
export async function GET(request: NextRequest, { params }: { params: { attachmentId: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const file = await getAttachmentContent(params.attachmentId);
    if (!file) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });

    // Quyền: người tạo / trong chuỗi duyệt / expense.view tại công ty / super_admin
    const role = request.headers.get('x-current-user-role') || '';
    const e = await getExpenseById(file.expense_id);
    if (!e) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });
    let allowed = role === 'super_admin' || e.requested_by.toLowerCase() === userId.toLowerCase();
    if (!allowed) {
      const approvals = await listApprovals(e.id);
      allowed = approvals.some((a) => String(a.approver_user_id).toLowerCase() === userId.toLowerCase())
        || (await hasExpensePerm(userId, e.company_id, 'view'));
    }
    if (!allowed) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    const body = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content as any);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('GET expense attachment content error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — xóa chứng từ (người upload/người tạo, chỉ khi phiếu chưa duyệt xong). */
export async function DELETE(request: NextRequest, { params }: { params: { attachmentId: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const res = await deleteAttachment(params.attachmentId, userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE expense attachment error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
