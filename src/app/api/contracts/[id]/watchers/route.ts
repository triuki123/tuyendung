import { NextRequest, NextResponse } from 'next/server';
import * as watcherService from '@/lib/services/contractWatcherService';
import * as contractService from '@/lib/services/contractService';
import { canManageContracts, canViewEmployeeData } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/** GET /api/contracts/[id]/watchers */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');

    const contract = await contractService.getContractById(params.id);
    if (!contract) return NextResponse.json({ error: 'Không tìm thấy hợp đồng' }, { status: 404 });
    if (!(await canViewEmployeeData(userId, contract.employee_id, activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const data = await watcherService.listWatchers(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/contracts/[id]/watchers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/contracts/[id]/watchers — body: { user_id } */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');
    if (!(await canManageContracts(userId, 'edit', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const contract = await contractService.getContractById(params.id);
    if (!contract) return NextResponse.json({ error: 'Không tìm thấy hợp đồng' }, { status: 404 });

    const { user_id, role } = await request.json();
    if (!user_id) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 });
    const watcherRole = role === 'co_handler' ? 'co_handler' : 'watcher';

    const watcher = await watcherService.addWatcher(params.id, user_id, userId, contract.contract_number, watcherRole);
    return NextResponse.json({ success: true, data: watcher }, { status: 201 });
  } catch (err) {
    console.error('POST /api/contracts/[id]/watchers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE /api/contracts/[id]/watchers — body: { user_id } */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');
    if (!(await canManageContracts(userId, 'edit', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const { user_id } = await request.json();
    if (!user_id) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 });

    const ok = await watcherService.removeWatcher(params.id, user_id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy người theo dõi' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/contracts/[id]/watchers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
