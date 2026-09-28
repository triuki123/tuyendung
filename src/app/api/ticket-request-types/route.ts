import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, buildInsert } from '@/lib/db';

// GET /api/ticket-request-types
// Tra ve loai yeu cau. Mac dinh chi active; ?all=1 -> ke ca inactive (cho admin).
export async function GET(req: NextRequest) {
  try {
    const all = req.nextUrl.searchParams.get('all') === '1';
    const rows = await query(
      `SELECT id, code, name, sort_order, is_active
         FROM ticket_request_types
        ${all ? '' : 'WHERE is_active = true'}
        ORDER BY sort_order ASC, name ASC`
    );
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('GET /api/ticket-request-types error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}

// POST /api/ticket-request-types — tao loai yeu cau (Super Admin only).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, name, sort_order, created_by } = body;

    if (!created_by) {
      return NextResponse.json({ error: 'Unauthorized: created_by is required' }, { status: 401 });
    }
    const user = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [created_by]);
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Chỉ Super Admin được tạo loại yêu cầu' }, { status: 403 });
    }

    if (!code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: 'Thiếu mã hoặc tên loại yêu cầu' }, { status: 400 });
    }

    const { text, params } = buildInsert('ticket_request_types', {
      code: code.trim(),
      name: name.trim(),
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
      is_active: true,
    });
    const row = await queryOne(text, params);
    return NextResponse.json(row, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/ticket-request-types error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}
