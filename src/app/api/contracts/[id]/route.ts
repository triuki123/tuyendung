import { NextRequest, NextResponse } from 'next/server';
import * as contractService from '@/lib/services/contractService';
import {
  canManageContracts,
  canViewEmployeeData,
} from '@/lib/services/contractPermissionService';
import {
  notifyWatchersStatusChange,
  notifyEmployeePendingSigning,
} from '@/lib/services/contractWatcherService';
import { archiveContractToHrDocs } from '@/lib/services/contractArchiveService';
import { checkBmhsGate } from '@/lib/services/bmhsService';
import { logHrRecord, buildChanges } from '@/lib/services/hrAuditService';
import { execute } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/contracts/[id] — chi tiết + chuỗi gia hạn. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const contract = await contractService.getContractById(params.id);
    if (!contract) return NextResponse.json({ error: 'Không tìm thấy hợp đồng' }, { status: 404 });

    if (!(await canViewEmployeeData(userId, contract.employee_id, request.headers.get("x-current-user-company")))) {
      return NextResponse.json({ error: 'Không có quyền xem hợp đồng này' }, { status: 403 });
    }
    // Cổng BMHS: hồ sơ đã khóa → cần vé mở khóa (nhập mật khẩu).
    const gate = await checkBmhsGate(userId, contract.employee_id, request.headers.get('x-bmhs-token'));
    if (!gate.allowed) {
      return NextResponse.json({ error: 'Hồ sơ được bảo mật — cần nhập mật khẩu', requireBmhs: true, employeeId: contract.employee_id }, { status: 403 });
    }

    const chain = await contractService.getContractChain(params.id);
    return NextResponse.json({ success: true, data: contract, chain });
  } catch (err) {
    console.error('GET /api/contracts/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT /api/contracts/[id] — cập nhật (cần quyền hr.edit). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, "edit", request.headers.get("x-current-user-company")))) {
      return NextResponse.json({ error: 'Không có quyền sửa hợp đồng' }, { status: 403 });
    }

    const body = await request.json();

    // Lấy trạng thái cũ để so sánh
    const before = await contractService.getContractById(params.id);
    if (!before) return NextResponse.json({ error: 'Không tìm thấy hợp đồng' }, { status: 404 });

    const updated = await contractService.updateContract(params.id, {
      contract_type_id: body.contract_type_id,
      employment_type_id: body.employment_type_id,
      contract_number: body.contract_number,
      sign_date: body.sign_date,
      start_date: body.start_date,
      end_date: body.end_date,
      salary_info: body.salary_info,
      notes: body.notes,
      status: body.status,
    });
    if (!updated) return NextResponse.json({ error: 'Không tìm thấy hợp đồng' }, { status: 404 });

    // Lịch sử: chỉ ghi khi thực sự có thay đổi (tránh log rác khi lưu mà không đổi gì).
    const diff = buildChanges('contract', before as any, updated as any);
    if (Object.keys(diff.changes).length > 0) {
      await logHrRecord({
        entityType: 'contract', entityId: params.id, action: 'update',
        details: diff.details, changes: diff.changes, performedBy: userId,
      });
    }

    // Trigger notifications nếu trạng thái thay đổi
    if (body.status && body.status !== before.status) {
      // Notify watchers
      notifyWatchersStatusChange(
        params.id,
        before.contract_number,
        before.employee_name ?? null,
        before.status,
        body.status
      ).catch(() => {});

      // Notify nhân viên khi bị chuyển sang chờ ký
      if (body.status === 'pending_signing') {
        notifyEmployeePendingSigning(
          params.id,
          before.contract_number,
          before.employee_id
        ).catch(() => {});
      }

      // Hoàn tất vòng đời (Hiệu lực / Đã gia hạn / Chấm dứt) → lưu trữ vào kho Hồ Sơ nhân viên (await)
      if (body.status === 'active' || body.status === 'renewed' || body.status === 'terminated') {
        try {
          await archiveContractToHrDocs(params.id, userId);
        } catch (e) {
          console.error('[Contract PUT] archive error:', e);
        }
      }

      // Hồ sơ thôi việc hoàn tất (terminated) → chuyển nhân viên sang nghỉ việc
      if (
        body.status === 'terminated' &&
        (updated.contract_type_id === 'ctype_termination' ||
          before.contract_type_id === 'ctype_termination')
      ) {
        execute(
          `UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id::text = $1`,
          [before.employee_id]
        )
          .then(async () => {
            // Nghỉ việc → tắt phân công tổ chức (org_assignments)
            const { deactivateAllAssignments } = await import('@/lib/services/orgStructureService');
            await deactivateAllAssignments(before.employee_id);
          })
          .catch((e) => console.error('[Contract PUT] set inactive error:', e));
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Số hợp đồng đã tồn tại' }, { status: 409 });
    }
    console.error('PUT /api/contracts/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE /api/contracts/[id] — xóa (cần quyền hr.delete). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, "delete", request.headers.get("x-current-user-company")))) {
      return NextResponse.json({ error: 'Không có quyền xóa hợp đồng' }, { status: 403 });
    }

    // Đọc trước khi xóa để lịch sử còn ghi được số hợp đồng.
    const before = await contractService.getContractById(params.id);

    const ok = await contractService.deleteContract(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy hợp đồng' }, { status: 404 });

    await logHrRecord({
      entityType: 'contract', entityId: params.id, action: 'delete',
      details: `Xóa hợp đồng${before?.contract_number ? ` ${before.contract_number}` : ''}`,
      performedBy: userId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/contracts/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
