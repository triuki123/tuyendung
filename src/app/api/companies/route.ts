import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Company {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
}

/** GET — danh sách công ty đang hoạt động. */
export async function GET() {
  try {
    const data = await query<Company>(
      `SELECT id::text AS id, name, code, address FROM companies WHERE is_active = TRUE ORDER BY name ASC`,
      []
    );
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/companies error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
