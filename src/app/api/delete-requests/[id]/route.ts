import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute, buildInsert } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { getActorWithPerms, canDeleteAssets, unauthorized, forbidden } from '@/lib/apiAuth';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Duyệt yêu cầu xoá (approved → XOÁ CỨNG asset). Quyền: super_admin VÀ
    // có quyền 'delete' ở module Quản Lý Tài Sản. Trước đây route KHÔNG check
    // quyền → user thường có thể tự duyệt + xoá. Vá lỗ hổng nghiêm trọng này.
    const actor = await getActorWithPerms(request);
    if (!actor) return unauthorized();
    if (!canDeleteAssets(actor)) {
      return forbidden('Bạn không có quyền duyệt yêu cầu xoá tài sản');
    }
    const auth = { actor };

    const body = await request.json();

    // Fetch delete request to get asset info
    console.log('Fetching delete request...');
    const deleteRequest = await queryOne<Record<string, any>>(
      `SELECT * FROM delete_requests WHERE id = $1`,
      [params.id]
    );

    if (!deleteRequest) {
      return NextResponse.json(
        { error: 'Delete request not found' },
        { status: 404 }
      );
    }
    console.log('Delete request fetched:', deleteRequest.id);

    // Build SET clause from body fields (only known columns to avoid injection)
    const allowedCols = [
      'status', 'reviewed_by', 'reviewed_at', 'review_note', 'updated_at',
    ];
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const col of allowedCols) {
      if (col in body && col !== 'updated_at') {
        updateData[col] = body[col];
      }
    }
    // Người duyệt = actor đã xác thực (không tin body client gửi).
    updateData.reviewed_by = auth.actor.id;

    const cols = Object.keys(updateData);
    const vals = Object.values(updateData);
    const assignments = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');

    const updated = await queryOne<Record<string, any>>(
      `UPDATE delete_requests SET ${assignments} WHERE id = $${cols.length + 1} RETURNING *`,
      [...vals, params.id]
    );

    const updatedRequest = updated ?? {};
    console.log('Delete request updated');

    // If approved, delete the asset and write an audit log (non-blocking)
    if (body.status === 'approved') {
      try {
        const assetType = deleteRequest.asset_type;
        const assetId = deleteRequest.asset_id;

        console.log('Deleting asset...');
        await execute(`DELETE FROM assets WHERE id = $1`, [assetId]);
        console.log(`${assetType} ${assetId} deleted successfully`);

        // Audit log
        console.log('Adding audit log...');
        const { text: auditText, params: auditParams } = buildInsert('audit_logs', {
          action: 'asset_deleted_approved',
          asset_type: assetType,
          asset_id: assetId,
          asset_code: deleteRequest.asset_code,
          asset_name: deleteRequest.asset_name,
          approved_by: auth.actor.id,
          reason: deleteRequest.reason,
          review_note: body.review_note,
          created_at: new Date().toISOString(),
          admin_id: auth.actor.id,
        });
        await execute(auditText, auditParams).catch(err =>
          console.error('Error adding audit log:', err)
        );

        // Notify requester (in-app + Telegram)
        if (deleteRequest.requested_by) {
          await notify('deleteRequest.approved', {
            assetName: deleteRequest.asset_name, assetCode: deleteRequest.asset_code, reason: deleteRequest.reason,
          }, { recipients: [deleteRequest.requested_by] });
        }
      } catch (assetErr) {
        console.warn('Warning in asset deletion flow:', assetErr);
        // Don't throw — the status update already succeeded
      }
    }

    // If rejected, notify requester (in-app + Telegram)
    if (body.status === 'rejected' && deleteRequest.requested_by) {
      await notify('deleteRequest.rejected', {
        assetName: deleteRequest.asset_name, reason: body.review_note || 'Không có ghi chú',
      }, { recipients: [deleteRequest.requested_by] });
    }

    console.log('Delete request processed successfully');
    return NextResponse.json(updatedRequest);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error updating delete request:', errorMsg);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
