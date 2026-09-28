import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { guardSolace } from '@/lib/solaceApiGuard';

// Tìm thành viên FADO để gắn vào đơn / trả ví / chọn người nhận thông báo.
export async function GET(request: NextRequest) {
  try {
    const auth = await guardSolace(request, 'solace-pos', 'view');
    if (auth instanceof NextResponse) return auth;
    const sp = new URL(request.url).searchParams;
    const idsParam = sp.get('ids');
    if (idsParam) {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length === 0) return NextResponse.json({ success: true, data: [] });
      const data = await query<{ id: string; name: string; email: string }>(
        `SELECT id::text AS id, name, email FROM users WHERE id::text = ANY($1)`, [ids]
      );
      return NextResponse.json({ success: true, data });
    }
    const q = (sp.get('q') ?? '').trim();
    if (q.length < 2) return NextResponse.json({ success: true, data: [] });
    const data = await query<{ id: string; name: string; email: string }>(
      `SELECT id::text AS id, name, email
         FROM users
        WHERE status = 'active' AND (name ILIKE $1 OR email ILIKE $1)
        ORDER BY name ASC LIMIT 10`,
      [`%${q}%`]
    );
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/members error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
