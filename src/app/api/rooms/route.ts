import { query, queryOne, buildInsert } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const data = await query('SELECT * FROM rooms ORDER BY name ASC');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch rooms' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { randomUUID } = await import('crypto');
    // id đặt SAU spread để không bị body ghi đè ngược; mặc định UUID ngẫu nhiên.
    const roomData = { ...body, id: body.id || randomUUID() };

    // Idempotent: nếu id đã tồn tại (vd seed phòng mặc định chạy lại) → bỏ qua
    // êm thay vì ném 23505. ON CONFLICT DO NOTHING khiến RETURNING không trả row.
    const { text, params } = buildInsert('rooms', roomData);
    const insertSql = text.replace(' RETURNING *', ' ON CONFLICT (id) DO NOTHING RETURNING *');
    const row = await queryOne(insertSql, params);

    if (!row) {
      // Phòng đã tồn tại — trả về bản ghi hiện có, coi như thành công (200).
      const existing = await queryOne('SELECT * FROM rooms WHERE id = $1', [roomData.id]);
      return NextResponse.json(existing, { status: 200 });
    }
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create room' },
      { status: 500 }
    );
  }
}
