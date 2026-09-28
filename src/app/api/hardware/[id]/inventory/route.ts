import { NextRequest, NextResponse } from 'next/server';
import { buildInsert, queryOne, buildUpdateById, withTransaction } from '@/lib/db';
import { checkUnitAccess } from '@/lib/api-permissions';
import {
  canAccessAssetData,
  getAssetVisibleUserIds,
  type AssetScopeContext,
} from '@/lib/services/assetAccessService';

type InventoryAction = 'recover' | 'maintenance' | 'assign' | 'retire';

function actionLabel(action: InventoryAction): string {
  switch (action) {
    case 'recover':
      return 'Kiểm kê: Thu hồi tài sản';
    case 'maintenance':
      return 'Kiểm kê: Bảo trì / vệ sinh';
    case 'assign':
      return 'Kiểm kê: Cấp phát tài sản';
    case 'retire':
      return 'Kiểm kê: Thanh lý tài sản';
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!checkUnitAccess(request, 'hardware', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const action = body.action as InventoryAction | undefined;
    if (!action || !['recover', 'maintenance', 'assign', 'retire'].includes(action)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai loại kiểm kê', code: 'INVALID_ACTION' }, { status: 400 });
    }

    const oldAsset = await queryOne<any>('SELECT * FROM assets WHERE id = $1', [id]);
    if (!oldAsset) return NextResponse.json({ error: 'Không tìm thấy tài sản' }, { status: 404 });
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const context: AssetScopeContext = {
      userId,
      role: request.headers.get('x-current-user-role') || 'user',
      companyId: request.headers.get('x-current-user-company'),
    };
    if (!(await canAccessAssetData(context, oldAsset))) {
      return NextResponse.json({ error: 'Tài sản nằm ngoài phạm vi dữ liệu của bạn' }, { status: 403 });
    }

    const now = new Date().toISOString();
    let updateData: Record<string, unknown> = { updated_at: now };
    let note = '';

    if (action === 'recover') {
      updateData = {
        ...updateData,
        status: 'available',
        assigned_to: null,
        assigned_to_name: null,
      };
      note = body.note?.trim() || 'Đã thu hồi tài sản về trạng thái sẵn sàng';
    }

    if (action === 'maintenance') {
      const maintenanceNote = typeof body.note === 'string' ? body.note.trim() : '';
      if (!maintenanceNote) {
        return NextResponse.json({ error: 'Vui lòng nhập nội dung bảo trì / vệ sinh', code: 'NOTE_REQUIRED' }, { status: 400 });
      }
      if (body.set_maintenance_status === true) {
        updateData.status = 'maintenance';
      }
      note = maintenanceNote;
    }

    if (action === 'assign') {
      if (oldAsset.status !== 'available') {
        return NextResponse.json({ error: 'Chỉ có thể cấp phát khi tài sản đang ở trạng thái sẵn sàng', code: 'ASSET_NOT_AVAILABLE' }, { status: 400 });
      }
      const companyId = typeof body.company_id === 'string' ? body.company_id.trim() : '';
      const departmentId = typeof body.department_id === 'string' ? body.department_id.trim() : '';
      const subDepartmentId = typeof body.sub_department_id === 'string' ? body.sub_department_id.trim() : '';
      const assignedTo = typeof body.assigned_to === 'string' ? body.assigned_to.trim() : '';
      if (!companyId || !departmentId || !subDepartmentId || !assignedTo) {
        return NextResponse.json({ error: 'Vui lòng chọn đầy đủ Công ty, Phòng ban, Bộ phận và Nhân viên', code: 'MISSING_ASSIGNMENT' }, { status: 400 });
      }
      const assignedUser = await queryOne<{ id: string; name: string }>('SELECT id, name FROM users WHERE id = $1', [assignedTo]);
      if (!assignedUser) {
        return NextResponse.json({ error: 'Không tìm thấy nhân viên được phân bổ', code: 'ASSIGNEE_NOT_FOUND' }, { status: 404 });
      }
      if (context.role !== 'super_admin') {
        const visibleUserIds = await getAssetVisibleUserIds(context);
        if (companyId !== oldAsset.company_id || !visibleUserIds.includes(assignedTo)) {
          return NextResponse.json({ error: 'Không được cấp phát tài sản ngoài phạm vi quản lý' }, { status: 403 });
        }
      }
      updateData = {
        ...updateData,
        status: 'assigned',
        company_id: companyId,
        department_id: departmentId,
        sub_department_id: subDepartmentId,
        assigned_to: assignedTo,
        assigned_to_name: assignedUser.name,
      };
      note = body.note?.trim() || `Đã cấp phát cho ${assignedUser.name}`;
    }

    if (action === 'retire') {
      updateData = {
        ...updateData,
        status: 'retired',
      };
      note = body.note?.trim() || 'Đã thanh lý tài sản';
    }

    const updated = await withTransaction(async (client) => {
      const { text, params: qParams } = buildUpdateById('assets', id, updateData);
      const updateResult = await client.query(text, qParams);
      const updatedAsset = updateResult.rows[0];
      if (!updatedAsset) throw new Error('Update failed');

      const detailMessage = `${actionLabel(action)}: ${updatedAsset.name} (${updatedAsset.code}). ${note}`.trim();
      const { text: auditText, params: auditParams } = buildInsert('audit_logs', {
        admin_id: userId,
        action: `asset_inventory_${action}`,
        // Production may retain the legacy JSON/JSONB type for this column.
        // A JSON string scalar is accepted by JSON/JSONB and is returned by pg as a normal string.
        details: JSON.stringify(detailMessage),
        asset_id: updatedAsset.id,
        asset_code: updatedAsset.code,
        asset_name: updatedAsset.name,
        asset_type: 'hardware',
        created_at: now,
        timestamp: now,
      });
      await client.query(auditText, auditParams);
      return updatedAsset;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Hardware inventory error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to inventory hardware' },
      { status: 500 }
    );
  }
}
