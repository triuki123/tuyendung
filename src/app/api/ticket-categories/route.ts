import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, buildInsert } from '@/lib/db';

// GET /api/ticket-categories
// Tra ve danh muc ticket (phang). Mac dinh chi active; ?all=1 -> ke ca inactive
// (cho admin). Client tu dung parent_id de dung cay/cascading. Kem custom_fields
// schema de render truong dong.
export async function GET(req: NextRequest) {
  try {
    const all = req.nextUrl.searchParams.get('all') === '1';
    const rows = await query(
      `SELECT id, parent_id, name, request_type, default_unit_tag_id,
              custom_fields, sort_order, is_active
         FROM ticket_categories
        ${all ? '' : 'WHERE is_active = true'}
        ORDER BY sort_order ASC, name ASC`
    );
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('GET /api/ticket-categories error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}

// POST /api/ticket-categories — tao danh muc (Super Admin only).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, parent_id, request_type, default_unit_tag_id, custom_fields, sort_order, created_by } = body;

    if (!created_by) {
      return NextResponse.json({ error: 'Unauthorized: created_by is required' }, { status: 401 });
    }
    const user = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [created_by]);
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Chỉ Super Admin được tạo danh mục' }, { status: 403 });
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Thiếu tên danh mục' }, { status: 400 });
    }

    const { text, params } = buildInsert('ticket_categories', {
      name: name.trim(),
      parent_id: parent_id || null,
      request_type: request_type || null,
      default_unit_tag_id: default_unit_tag_id || null,
      custom_fields: Array.isArray(custom_fields) ? JSON.stringify(custom_fields) : '[]',
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
      is_active: true,
    });
    const row = await queryOne(text, params);
    return NextResponse.json(row, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/ticket-categories error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}
