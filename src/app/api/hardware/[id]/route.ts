import { queryOne, buildUpdateById, execute, buildInsert } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAssetWithNames } from '../_assetQuery';
import { getActorWithPerms, canDeleteAssets, unauthorized, forbidden } from '@/lib/apiAuth';
import { checkUnitAccess } from '@/lib/api-permissions';
import {
  canAccessAssetData,
  getAssetVisibleUserIds,
  type AssetScopeContext,
} from '@/lib/services/assetAccessService';

function getScopeContext(request: NextRequest): AssetScopeContext | null {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return null;
  return {
    userId,
    role: request.headers.get('x-current-user-role') || 'user',
    companyId: request.headers.get('x-current-user-company'),
  };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hardware', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const context = getScopeContext(request);
    if (!context) return unauthorized();
    const data = await getAssetWithNames(params.id);

    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!(await canAccessAssetData(context, data))) {
      return forbidden('Tài sản nằm ngoài phạm vi dữ liệu của bạn');
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Hardware fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch hardware' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hardware', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const context = getScopeContext(request);
    if (!context) return unauthorized();
    const existingAsset = await getAssetWithNames(params.id);
    if (!existingAsset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canAccessAssetData(context, existingAsset))) {
      return forbidden('Tài sản nằm ngoài phạm vi dữ liệu của bạn');
    }
    const body = await request.json();
    if (context.role !== 'super_admin') {
      body.company_id = existingAsset.company_id;
      if (body.assigned_to) {
        const visibleUserIds = await getAssetVisibleUserIds(context);
        if (!visibleUserIds.includes(body.assigned_to)) {
          return forbidden('Không được phân bổ tài sản ngoài phạm vi quản lý');
        }
      }
    }

    // Kiểm tra serial trùng (bỏ qua chính nó)
    if (body.serial_number?.trim()) {
      const dup = await queryOne<{ id: string; code: string; name: string }>(
        `SELECT id, code, name FROM assets WHERE serial_number = $1 AND id <> $2 LIMIT 1`,
        [body.serial_number.trim(), params.id]
      );
      if (dup) {
        return NextResponse.json(
          {
            error: `Số serial "${body.serial_number}" đã tồn tại trên thiết bị "${dup.name}" (${dup.code})`,
            code: 'DUPLICATE_SERIAL',
          },
          { status: 409 }
        );
      }
    }

    let updated: any;
    try {
      const { text, params: qParams } = buildUpdateById('assets', params.id, body);
      updated = await queryOne(text, qParams);
    } catch (dbErr: any) {
      if (dbErr?.code === '23505') {
        return NextResponse.json(
          { error: 'Mã tài sản hoặc số serial đã tồn tại trên một thiết bị khác.', code: 'DUPLICATE' },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    if (!updated) throw new Error('Update did not return a row');

    const withNames = await getAssetWithNames(params.id).catch(() => null);
    return NextResponse.json(withNames ?? updated);
  } catch (error) {
    console.error('Hardware update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server khi cập nhật tài sản' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Xoá CỨNG tài sản — phải super_admin VÀ có quyền 'delete' ở Quản Lý Tài Sản.
    const actor = await getActorWithPerms(request);
    if (!actor) return unauthorized();
    if (!canDeleteAssets(actor)) return forbidden('Bạn không có quyền xóa tài sản');

    // Bắt buộc nhập lý do xoá (lưu vào audit để truy vết).
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return NextResponse.json(
        { error: 'Vui lòng nhập lý do xóa tài sản', code: 'REASON_REQUIRED' },
        { status: 400 }
      );
    }

    // Lấy thông tin trước khi xoá để ghi audit
    const asset = await queryOne<{ code: string; name: string }>(
      'SELECT code, name FROM assets WHERE id = $1',
      [params.id]
    );

    await execute('DELETE FROM assets WHERE id = $1', [params.id]);

    // Ghi audit (non-blocking) — actor từ phiên đã xác thực, kèm lý do
    try {
      const { text, params: p } = buildInsert('audit_logs', {
        admin_id: actor.id,
        action: 'asset_deleted',
        details: `Xóa tài sản ${asset?.code ?? params.id}${asset?.name ? ' - ' + asset.name : ''}. Lý do: ${reason}`,
        asset_id: params.id,
        asset_code: asset?.code ?? null,
        asset_name: asset?.name ?? null,
        asset_type: 'hardware',
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
      await queryOne(text, p);
    } catch (auditErr) {
      console.warn('Audit log (asset delete) failed:', auditErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Hardware delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete hardware' },
      { status: 500 }
    );
  }
}
