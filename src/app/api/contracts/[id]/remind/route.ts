import { NextRequest, NextResponse } from 'next/server';
import * as contractService from '@/lib/services/contractService';
import { remindEmployeeToSign } from '@/lib/services/contractWatcherService';
import { canManageContracts } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/** POST /api/contracts/[id]/remind — buzz nhân viên ký hợp đồng */
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

    if (contract.status !== 'pending_signing') {
      return NextResponse.json(
        { error: 'Chỉ có thể nhắc hợp đồng đang ở trạng thái chờ ký' },
        { status: 400 }
      );
    }

    await remindEmployeeToSign(
      contract.id,
      contract.contract_number,
      contract.employee_id,
      userId
    );

    return NextResponse.json({ success: true, message: 'Đã gửi nhắc nhở đến nhân viên' });
  } catch (err) {
    console.error('POST /api/contracts/[id]/remind error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
