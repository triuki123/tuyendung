import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import {
  addMove, listMoves, listHolders, getSupply,
  type SupplyMoveType,
} from '@/lib/services/warehouseSupplyService';

export const dynamic = 'force-dynamic';

const MOVE_TYPES: SupplyMoveType[] = ['in', 'out', 'assign', 'return'];

/** GET: lịch sử biến động + ai đang giữ (?warehouseId=&supplyId=) */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const supplyId = sp.get('supplyId');
    const guard = await requireWarehouseManager(request, warehouseId, 'view');
    if ('response' in guard) return guard.response;
    if (!supplyId) return NextResponse.json({ error: 'Thiếu supplyId' }, { status: 400 });

    const supply = await getSupply(supplyId);
    if (!supply || supply.warehouse_id !== warehouseId) {
      return NextResponse.json({ error: 'Không tìm thấy vật tư trong kho này' }, { status: 404 });
    }

    const [moves, holders] = await Promise.all([listMoves(supplyId), listHolders(supplyId)]);
    return NextResponse.json({ success: true, data: { moves, holders } });
  } catch (err) {
    console.error('GET /api/warehouse/admin/supplies/moves error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST: ghi 1 phiếu biến động.
 * Body { warehouseId, supplyId, moveType: in|out|assign|return, quantity, workerId?, note? }
 *
 * Ghi phiếu là thao tác SỬA tồn kho ⇒ yêu cầu quyền 'edit' (không phải 'create',
 * vốn dành cho việc thêm vật tư mới vào danh mục).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;

    if (!MOVE_TYPES.includes(body.moveType)) {
      return NextResponse.json({ error: 'Loại phiếu không hợp lệ' }, { status: 400 });
    }

    const supply = await getSupply(body.supplyId);
    if (!supply || supply.warehouse_id !== body.warehouseId) {
      return NextResponse.json({ error: 'Không tìm thấy vật tư trong kho này' }, { status: 404 });
    }

    const result = await addMove({
      warehouseId: body.warehouseId,
      supplyId: body.supplyId,
      moveType: body.moveType,
      quantity: Number(body.quantity),
      workerId: body.workerId || null,
      note: body.note,
      createdBy: guard.actor.id,
    });

    // Lỗi nghiệp vụ (xuất quá tồn, thu hồi quá số đang giữ) → 400 kèm câu tiếng Việt
    // để UI hiện thẳng cho người dùng, không phải lỗi server.
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/warehouse/admin/supplies/moves error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
