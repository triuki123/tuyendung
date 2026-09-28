import { NextRequest, NextResponse } from 'next/server';
import * as documentsService from '@/lib/services/documentsService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? undefined;
    const doc_type = searchParams.get('doc_type') ?? undefined;
    const search = searchParams.get('search') ?? undefined;

    // Phạm vi công ty:
    //  - admin/super_admin: xem tất cả; chỉ lọc khi chọn công ty (?company_id=)
    //  - nhân viên thường: chỉ thấy văn bản dùng-chung HOẶC của công ty mình (lấy từ DB)
    const role = request.headers.get('x-current-user-role') || '';
    let companyScopeId: string | null | undefined;
    if (role === 'super_admin') {
      companyScopeId = searchParams.get('company_id') || undefined;
    } else {
      companyScopeId = request.headers.get('x-current-user-company') || '';
    }

    const data = await documentsService.getAllDocuments({ status, doc_type, search, companyScopeId });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/documents error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id') ?? undefined;
    const body = await request.json();

    if (!body.title || !body.doc_type) {
      return NextResponse.json({ error: 'Thiếu tiêu đề hoặc loại văn bản' }, { status: 400 });
    }

    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const companyIds = role === 'super_admin'
      ? (Array.isArray(body.company_ids) ? body.company_ids : [])
      : [companyId!];
    const data = await documentsService.createDocument({
      ...body,
      company_ids: companyIds,
      created_by: userId,
    });

    // Thông báo cho nhân sự thuộc phạm vi công ty của văn bản (in-app + Telegram). Fire-and-forget.
    notifyDocumentPublished(data, companyIds, userId ?? null)
      .catch((e) => console.error('notifyDocumentPublished error:', e));

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/documents error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * Gửi thông báo khi đăng Văn bản - Quyết định.
 * - company_ids rỗng → toàn bộ nhân viên; có công ty → chỉ nhân viên các công ty đó.
 * - In-app (bảng notifications, chuông poll 10s) + Telegram (user đã khai chat_id).
 */
async function notifyDocumentPublished(
  doc: { id: string; title: string; doc_number?: string | null },
  companyIds: string[],
  creatorId: string | null,
) {
  const { query } = await import('@/lib/db');
  const scoped = Array.isArray(companyIds) && companyIds.length > 0;

  // Danh sách nhân sự đích (loại người đăng)
  const params: unknown[] = [creatorId ?? '00000000-0000-0000-0000-000000000000'];
  let companyClause = '';
  if (scoped) {
    params.push(companyIds);
    companyClause = `AND company_id::text = ANY($${params.length}::text[])`;
  }

  // In-app + Telegram cá nhân qua engine (active, trong phạm vi công ty, trừ người tạo)
  try {
    const { notify } = await import('@/lib/notifications/engine');
    const recipients = await query<{ id: string }>(
      `SELECT id::text AS id FROM users
        WHERE status = 'active' AND id::text <> $1 ${companyClause}`,
      params,
    );
    await notify('document.published', {
      docTitle: doc.title,
      numberSuffix: doc.doc_number ? ` (Số: ${doc.doc_number})` : '',
      numberLine: doc.doc_number ? `\nSố hiệu: ${doc.doc_number}` : '',
    }, { recipients: recipients.map(u => u.id), relatedId: doc.id });
  } catch (e) {
    console.error('document notify error:', e);
  }
}
