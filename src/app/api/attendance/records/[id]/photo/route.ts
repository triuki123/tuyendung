import { NextRequest, NextResponse } from 'next/server';
import { getRecordPhoto } from '@/lib/services/attendanceService';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const file = await getRecordPhoto(params.id);
    if (!file) return NextResponse.json({ error: 'Không có ảnh' }, { status: 404 });

    return new NextResponse(new Uint8Array(file.photo), {
      headers: { 'Content-Type': file.mime },
    });
  } catch (err) {
    console.error('GET attendance photo error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
