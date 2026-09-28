import { queryOne, buildUpdateById, execute, buildInsert } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { sendAssetAssignmentNotification } from '@/lib/services/notificationsService';
import { getActorWithPerms, canDeleteAssets, unauthorized, forbidden } from '@/lib/apiAuth';
import { getEffectiveContext, getCompanyMemberUserIds } from '@/lib/services/userCompanyService';

function assetBelongsToCompany(asset: { company_id?: string | null }, activeCompany: string | null): boolean {
  // Tài sản cũ không có company_id → cho phép đọc (backward compat), cần data migration về sau
  if (!asset.company_id) return true;
  return asset.company_id === activeCompany;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const effectiveContext = await getEffectiveContext(userId, activeCompany);
    const role = effectiveContext?.role ?? 'user';

    const { id } = await params;
    const data = await queryOne<any>('SELECT * FROM assets WHERE id = $1', [id]);

    if (!data) return NextResponse.json({ error: 'Không tìm thấy tài sản' }, { status: 404 });

    // super_admin xem tất cả; role khác phải trong cùng công ty
    if (role !== 'super_admin' && !assetBelongsToCompany(data, activeCompany)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    // Người dùng thường chỉ xem tài sản giao cho mình
    if (role === 'user' && data.assigned_to !== userId) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Asset fetch error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const effectiveContext = await getEffectiveContext(userId, activeCompany);
    const role = effectiveContext?.role ?? 'user';

    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền cập nhật tài sản' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Fetch old asset data for change tracking
    const oldAsset = await queryOne<any>('SELECT * FROM assets WHERE id = $1', [id]);

    if (!oldAsset) return NextResponse.json({ error: 'Không tìm thấy tài sản' }, { status: 404 });

    // Validate tài sản thuộc công ty active (admin không được sửa tài sản công ty khác)
    if (role !== 'super_admin' && !assetBelongsToCompany(oldAsset, activeCompany)) {
      return NextResponse.json({ error: 'Không có quyền cập nhật tài sản này' }, { status: 403 });
    }

    const updateData = {
      name: body.name,
      category: body.category,
      brand: body.brand,
      model: body.model,
      serial_number: body.serial_number,
      status: body.status,
      assigned_to: body.assigned_to,
      assigned_to_name: body.assigned_to_name,
      department: body.department,
      purchase_date: body.purchase_date,
      warranty_expiry: body.warranty_expiry,
      warranty_status: body.warranty_status ?? null,
      warranty_months: body.warranty_months ?? null,
      value: body.value,
      condition: body.condition,
      location: body.location,
      notes: body.notes,
      image_url: body.image_url,
      updated_at: new Date().toISOString(),
    };

    const { text, params: qParams } = buildUpdateById('assets', id, updateData);
    const updatedAsset = await queryOne(text, qParams);

    if (!updatedAsset) {
      throw new Error('Update did not return a row');
    }

    // Add audit log (non-blocking)
    try {
      const changes: string[] = [];
      if (oldAsset) {
        if (oldAsset.status !== body.status) changes.push(`status: ${oldAsset.status} → ${body.status}`);
        if (oldAsset.assigned_to !== body.assigned_to) changes.push(`assigned_to: ${oldAsset.assigned_to} → ${body.assigned_to}`);
        if (oldAsset.condition !== body.condition) changes.push(`condition: ${oldAsset.condition} → ${body.condition}`);
        if (oldAsset.location !== body.location) changes.push(`location: ${oldAsset.location} → ${body.location}`);
      }

      const performedBy = body.performed_by || 'System';
      const adminId = body.admin_id || performedBy;
      const changeDetails = changes.length > 0 ? changes.join(', ') : 'Updated';

      const { text: auditText, params: auditParams } = buildInsert('audit_logs', {
        admin_id: adminId,
        action: 'asset_updated',
        details: `Updated asset ${updatedAsset.code}: ${changeDetails}`,
        asset_id: updatedAsset.id,
        asset_code: updatedAsset.code,
        asset_name: updatedAsset.name,
        asset_type: 'hardware',
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
      await queryOne(auditText, auditParams);
    } catch (auditErr) {
      console.warn('Failed to add audit log:', auditErr);
    }

    // In-app + Telegram qua engine khi assigned_to thay đổi (fire-and-forget)
    if (oldAsset && oldAsset.assigned_to !== body.assigned_to) {
      sendAssetAssignmentNotification({
        asset:         updatedAsset,
        newAssignedTo: body.assigned_to || null,
        oldAssignedTo: oldAsset.assigned_to || null,
        performedByName: body.performed_by || body.admin_id || 'Quản trị viên',
      }).catch(() => null);
    }

    return NextResponse.json(updatedAsset);
  } catch (error) {
    console.error('Asset update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update asset' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Xoá CỨNG tài sản — phải super_admin VÀ có quyền 'delete' ở Quản Lý Tài Sản.
    const actor = await getActorWithPerms(request);
    if (!actor) return unauthorized();
    if (!canDeleteAssets(actor)) return forbidden('Bạn không có quyền xóa tài sản');

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return NextResponse.json(
        { error: 'Vui lòng nhập lý do xóa tài sản', code: 'REASON_REQUIRED' },
        { status: 400 }
      );
    }

    // Fetch asset data before deletion for audit log
    const asset = await queryOne('SELECT * FROM assets WHERE id = $1', [id]);

    await execute('DELETE FROM assets WHERE id = $1', [id]);

    // Add audit log (non-blocking)
    try {
      if (asset) {
        // actor lấy từ phiên đã xác thực — KHÔNG tin body client gửi.
        const adminId = actor.id;

        const { text: auditText, params: auditParams } = buildInsert('audit_logs', {
          admin_id: adminId,
          action: 'asset_deleted',
          details: `Xóa tài sản: ${asset.name} (${asset.code}). Lý do: ${reason}`,
          asset_id: asset.id,
          asset_code: asset.code,
          asset_name: asset.name,
          asset_type: 'hardware',
          created_at: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        });
        await queryOne(auditText, auditParams);
      }
    } catch (auditErr) {
      console.warn('Failed to add audit log:', auditErr);
    }

    return NextResponse.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Asset delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete asset' },
      { status: 500 }
    );
  }
}
