import { NextRequest, NextResponse } from 'next/server';
import { listAttachments, addAttachment, getExpenseById } from '@/lib/services/expenseService';
import { listApprovals } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

async function canAccess(userId: string, role: string, expenseId: string): Promise<boolean> {
  const e = await getExpenseById(expenseId);
  if (!e) return false;
  if (role === 'super_admin' || e.requested_by.toLowerCase() === userId.toLowerCase()) return true;
  const approvals = await listApprovals(expenseId);
  if (approvals.some((a) => String(a.approver_user_id).toLowerCase() === userId.toLowerCase())) return true;
  return hasExpensePerm(userId, e.company_id, 'view');
}

/** GET — danh sách chứng từ của phiếu (chat + khu Chứng từ dùng chung kho này). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canAccess(userId, request.headers.get('x-current-user-role') || '', params.id))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const data = await listAttachments(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET expense attachments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — upload chứng từ (multipart, nhiều file). Gửi từ chat hay khu Chứng từ đều vào đây. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canAccess(userId, request.headers.get('x-current-user-role') || '', params.id))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const form = await request.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });

    const saved = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) return NextResponse.json({ error: `"${file.name}" vượt 10MB` }, { status: 400 });
      if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: `"${file.name}" — định dạng không hỗ trợ` }, { status: 400 });
      const content = Buffer.from(await file.arrayBuffer());
      saved.push(await addAttachment({ expense_id: params.id, file_name: file.name, mime_type: file.type, content, uploaded_by: userId }));
    }
    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (err) {
    console.error('POST expense attachments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
