import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, buildInsert, execute } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');

    // Join users để lấy tên người duyệt (DB chỉ lưu reviewed_by là UUID, không có
    // reviewed_by_name → trước đây UI hiện UUID khó hiểu).
    // Ép ::text CẢ HAI vế: reviewed_by là UUID, u.id::text là text → so sánh
    // text = uuid sẽ throw "operator does not exist" và làm GET trả 500.
    const baseSql = `
      SELECT d.*, u.name AS reviewed_by_name
      FROM delete_requests d
      LEFT JOIN users u ON u.id::text = d.reviewed_by::text
    `;
    let rows: any[];
    if (status) {
      rows = await query(
        `${baseSql} WHERE d.status = $1 ORDER BY d.created_at DESC`,
        [status]
      );
    } else {
      rows = await query(`${baseSql} ORDER BY d.created_at DESC`);
    }

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching delete requests:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch delete requests' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Delete request body received:', body);

    if (!body.asset_id || !body.asset_code || !body.asset_name || !body.requested_by) {
      return NextResponse.json(
        { error: 'Missing required fields: asset_id, asset_code, asset_name, requested_by' },
        { status: 400 }
      );
    }

    const deleteRequest = {
      asset_id: body.asset_id,
      asset_code: body.asset_code,
      asset_name: body.asset_name,
      asset_type: body.asset_type || 'hardware',
      requested_by: body.requested_by,
      requested_by_name: body.requested_by_name || null,
      requested_at: body.requested_at || new Date().toISOString(),
      reason: body.reason || null,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    console.log('Inserting delete request:', JSON.stringify(deleteRequest));

    const { text, params } = buildInsert('delete_requests', deleteRequest);
    const created = await queryOne(text, params);

    if (!created) {
      throw new Error('Insert returned no row');
    }

    console.log('Delete request created successfully:', created);

    // Thông báo cho người duyệt: super_admin HOẶC có quyền Xóa ở Quản Lý Tài Sản
    // (non-blocking). Điều kiện dùng chung ASSET_DELETE_APPROVER_SQL.
    try {
      const { ASSET_DELETE_APPROVER_SQL } = await import('@/lib/apiAuth');
      const approvers = await query<{ id: string }>(
        `SELECT id FROM users WHERE ${ASSET_DELETE_APPROVER_SQL}`
      );

      if (approvers.length > 0) {
        const { notify } = await import('@/lib/notifications/engine');
        await notify('deleteRequest.pending', {
          requestedByName: body.requested_by_name, assetName: body.asset_name, assetCode: body.asset_code, reason: body.reason,
        }, { recipients: approvers.map(a => a.id) });
      }
    } catch (notifyErr) {
      console.warn('Warning: Notification system error:', notifyErr);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create delete request';
    console.error('Error creating delete request:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
