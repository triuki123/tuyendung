import { NextRequest, NextResponse } from 'next/server';
import * as machineService from '@/lib/services/machineService';
import { pollerManager } from '@/lib/zkteco/pollerManager';
import { checkUnitAccess } from '@/lib/api-permissions';

function companyScope(request: NextRequest): string | null {
  return request.headers.get('x-current-user-role') === 'super_admin'
    ? null
    : request.headers.get('x-current-user-company');
}

/**
 * GET /api/attendance/machines/[id]
 * Lấy thông tin máy cụ thể
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-machines', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const scope = companyScope(request);
    if (request.headers.get('x-current-user-role') !== 'super_admin' && !scope) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const machine = await machineService.getMachineById(params.id, scope);
    if (!machine) {
      return NextResponse.json(
        { error: 'Máy không tồn tại' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: machine,
    });
  } catch (err) {
    console.error(`GET /api/attendance/machines/${params.id} error:`, err);
    return NextResponse.json(
      { error: 'Lỗi khi lấy thông tin máy' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/attendance/machines/[id]
 * Cập nhật thông tin máy
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-machines', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const scope = companyScope(request);
    if (request.headers.get('x-current-user-role') !== 'super_admin' && !scope) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const body = await request.json();
    if (body.port !== undefined) body.port = parseInt(body.port, 10);
    if (body.poll_interval_seconds !== undefined) body.poll_interval_seconds = parseInt(body.poll_interval_seconds, 10);

    const machine = await machineService.updateMachine(params.id, body, scope);
    if (!machine) {
      return NextResponse.json({ error: 'Máy không tồn tại trong công ty hiện tại' }, { status: 404 });
    }

    // Đổi host/port/chu kỳ/chế độ → đồng bộ lại pollers
    pollerManager.reconcile().catch(() => {});

    return NextResponse.json({
      success: true,
      data: machine,
    });
  } catch (err) {
    console.error(`PUT /api/attendance/machines/${params.id} error:`, err);
    return NextResponse.json(
      { error: 'Lỗi khi cập nhật máy' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/attendance/machines/[id]
 * Xóa máy
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-machines', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const scope = companyScope(request);
    if (request.headers.get('x-current-user-role') !== 'super_admin' && !scope) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const deleted = await machineService.deleteMachine(params.id, scope);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Máy không tồn tại' },
        { status: 404 }
      );
    }

    // Dừng poller của máy vừa xóa
    pollerManager.reconcile().catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Máy đã bị xóa',
    });
  } catch (err) {
    console.error(`DELETE /api/attendance/machines/${params.id} error:`, err);
    return NextResponse.json(
      { error: 'Lỗi khi xóa máy' },
      { status: 500 }
    );
  }
}
