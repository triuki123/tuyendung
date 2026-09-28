import { NextRequest, NextResponse } from 'next/server';
import { getProductImage, setProductImage, removeProductImage } from '@/lib/services/solaceCatalogService';
import { guardSolace } from '@/lib/solaceApiGuard';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Phục vụ ảnh món (công khai cho user đã đăng nhập — hiển thị thực đơn).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const img = await getProductImage(params.id);
    if (!img) return NextResponse.json({ error: 'Không có ảnh' }, { status: 404 });
    return new NextResponse(new Uint8Array(img.content), {
      headers: {
        'Content-Type': img.mime_type ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err) {
    console.error('GET /api/solace/products/[id]/image error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'edit');
    if (g instanceof NextResponse) return g;

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Thiếu file ảnh' }, { status: 400 });
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Định dạng ảnh không hỗ trợ' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Ảnh vượt quá 5MB' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    await setProductImage(params.id, file.type, buf, g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/solace/products/[id]/image error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'edit');
    if (g instanceof NextResponse) return g;
    await removeProductImage(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/solace/products/[id]/image error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
