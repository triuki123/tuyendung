import { NextRequest, NextResponse } from 'next/server';
import { getActiveByCode, getAnyByCode, incrementClick } from '@/lib/services/shortLinkService';

export const dynamic = 'force-dynamic';

/** Trang thông báo khi link hỏng/hết hạn (public, dark theme gọn) */
function notice(message: string, sub: string): NextResponse {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link không khả dụng</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0a0f1c;color:#e2e8f0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px}
  .card{max-width:360px;text-align:center;background:#111827;border:1px solid rgba(255,255,255,.08);
    border-radius:20px;padding:32px}
  h1{font-size:18px;margin:0 0 8px} p{font-size:13px;color:#94a3b8;margin:0}
  .ico{font-size:40px;margin-bottom:12px}
</style></head><body><div class="card">
  <div class="ico">🔗</div><h1>${message}</h1><p>${sub}</p>
</div></body></html>`;
  return new NextResponse(html, { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** GET /s/<code>: phân giải link rút gọn → chuyển hướng đến đích (public). */
export async function GET(_request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const link = await getActiveByCode(params.code);
    if (link) {
      incrementClick(link.id).catch(() => {});
      return NextResponse.redirect(link.target_url, 307);
    }
    // Không active/hết hạn/không tồn tại → thông báo phù hợp
    const any = await getAnyByCode(params.code);
    if (!any) return notice('Link không tồn tại', 'Mã QR hoặc đường dẫn này không đúng.');
    if (!any.active) return notice('Link đã bị tắt', 'Người tạo đã vô hiệu hóa liên kết này.');
    return notice('Link đã hết hạn', 'Liên kết này đã quá thời hạn sử dụng.');
  } catch (err) {
    console.error('GET /s/[code] error:', err);
    return notice('Có lỗi xảy ra', 'Thử lại sau ít phút.');
  }
}
