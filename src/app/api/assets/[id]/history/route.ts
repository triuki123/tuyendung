import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

interface HistoryEntry {
  id: string;
  date: string;
  action: string;
  performedBy: string;
  note: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const ctx = await getEffectiveContext(userId, activeCompany);
    const role = ctx?.role ?? 'user';

    // Verify asset exists và kiểm tra company scope (NULL = backward compat)
    const asset = await queryOne<{ company_id: string | null }>(
      'SELECT company_id FROM assets WHERE id = $1',
      [id]
    );
    if (!asset) return NextResponse.json({ error: 'Không tìm thấy tài sản', data: [], count: 0 }, { status: 404 });

    // super_admin xem tất cả; các role khác phải thuộc cùng công ty
    if (role !== 'super_admin' && asset.company_id && activeCompany && asset.company_id !== activeCompany) {
      return NextResponse.json({ error: 'Không có quyền xem tài sản này', data: [], count: 0 }, { status: 403 });
    }

    const auditLogs = await query(
      'SELECT * FROM audit_logs WHERE asset_id = $1 ORDER BY timestamp DESC',
      [id]
    );

    const actionMap: Record<string, string> = {
      asset_created: 'Nhập kho',
      asset_updated: 'Cập nhật',
      asset_inventory_recover: 'Kiểm kê: Thu hồi tài sản',
      asset_inventory_maintenance: 'Kiểm kê: Bảo trì / vệ sinh',
      asset_inventory_assign: 'Kiểm kê: Cấp phát tài sản',
      asset_inventory_retire: 'Kiểm kê: Thanh lý tài sản',
      asset_deleted: 'Xóa',
      asset_deleted_approved: 'Xóa (Phê duyệt)',
    };

    const historyEntries: HistoryEntry[] = auditLogs.map(log => ({
      id: log.id || `audit-${log.created_at}`,
      date: log.timestamp || log.created_at || new Date().toISOString(),
      action: actionMap[log.action] ?? log.action ?? 'Unknown',
      performedBy: log.admin_id || 'System',
      note: log.details || '',
    }));

    return NextResponse.json({
      data: historyEntries,
      count: historyEntries.length,
    });
  } catch (error) {
    console.error('Asset history fetch error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch asset history',
        data: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
