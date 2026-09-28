import { NextRequest, NextResponse } from 'next/server';
import {
  getUserSignature,
  saveUserSignature,
  getSignatureAutofill,
  getSignatureCompanyMeta,
} from '@/lib/services/signatureService';
import { renderSignatureHtml, renderSignatureText } from '@/lib/signature/templates';

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Lấy userId server-side (header ưu tiên, fallback query param). */
function resolveUserId(request: NextRequest): string | null {
  const fromHeader = request.headers.get('x-current-user-id');
  if (fromHeader) return fromHeader;
  return new URL(request.url).searchParams.get('userId');
}

// GET /api/email-signature        → chữ ký hiện tại + dữ liệu auto-fill
// GET /api/email-signature?preview → (POST dùng cho render); ở đây chỉ đọc
export async function GET(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId || !isValidUUID(userId)) {
      return NextResponse.json({ error: 'userId không hợp lệ' }, { status: 400 });
    }

    const [signature, autofill, company] = await Promise.all([
      getUserSignature(userId),
      getSignatureAutofill(userId),
      getSignatureCompanyMeta(userId),
    ]);

    return NextResponse.json({ success: true, signature, autofill, company });
  } catch (err) {
    console.error('GET /api/email-signature error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

// POST /api/email-signature
//   - body.action === 'preview' → chỉ render HTML/text, KHÔNG lưu (live preview server-side optional)
//   - mặc định → lưu chữ ký (upsert)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'preview') {
      const html = renderSignatureHtml(body.data);
      const text = renderSignatureText(body.data);
      return NextResponse.json({ success: true, html, text });
    }

    const userId = resolveUserId(request) || body.userId;
    if (!userId || !isValidUUID(userId)) {
      return NextResponse.json({ error: 'userId không hợp lệ' }, { status: 400 });
    }
    if (!body.data || typeof body.data !== 'object') {
      return NextResponse.json({ error: 'Thiếu dữ liệu chữ ký' }, { status: 400 });
    }

    const saved = await saveUserSignature({
      userId,
      companyId: body.companyId ?? null,
      data: body.data,
    });

    return NextResponse.json({ success: true, signature: saved });
  } catch (err) {
    console.error('POST /api/email-signature error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
