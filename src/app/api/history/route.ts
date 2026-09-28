import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface HistoryEntry {
  id: string;
  assetId: string | null;
  assetCode: string | null;
  assetName: string | null;
  date: string;
  action: string;
  performedBy: string;
  note: string;
  type: 'audit' | 'delete_request' | 'asset_operation';
  status?: string;
}

// Cac service ghi audit theo dang action = `${verb}_${table}` (vd create_companies)
// con cac luong cu dung nhan rieng. Map ve nhan tieng Viet de hien thi.
const LEGACY_ACTION_LABELS: Record<string, string> = {
  asset_created: 'Nhập kho',
  asset_updated: 'Cập nhật tài sản',
  asset_deleted: 'Xóa tài sản',
  asset_deleted_approved: 'Xóa tài sản (Phê duyệt)',
  CREATE: 'Tạo người dùng',
  UPDATE: 'Cập nhật người dùng',
  DEACTIVATE: 'Vô hiệu hóa người dùng',
};
const VERB_LABELS: Record<string, string> = {
  create: 'Tạo',
  update: 'Cập nhật',
  deactivate: 'Vô hiệu hóa',
  activate: 'Kích hoạt',
  delete: 'Xóa',
};
const TABLE_LABELS: Record<string, string> = {
  companies: 'công ty',
  departments: 'phòng ban',
  sub_departments: 'bộ phận',
  positions: 'vị trí',
  job_titles: 'chức danh',
  tags: 'tag nhân viên',
  org_tags: 'tag tổ chức',
  org_tag_assignments: 'gán tag tổ chức',
  users: 'người dùng',
};

function formatAction(action: string | null | undefined): string {
  if (!action) return 'Không rõ';
  if (LEGACY_ACTION_LABELS[action]) return LEGACY_ACTION_LABELS[action];
  const m = action.match(/^([a-z]+)_(.+)$/);
  if (m) {
    const verb = VERB_LABELS[m[1]];
    const table = TABLE_LABELS[m[2]];
    if (verb && table) return `${verb} ${table}`;
  }
  if (VERB_LABELS[action]) return VERB_LABELS[action];
  return action;
}

// Nhan dien ten dai dien cho mot ban ghi (uu tien name/title/code/email).
function describeRecord(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  return obj.name || obj.title || obj.code || obj.email || '';
}

// audit_logs.details la jsonb -> pg tra ve object. Render thang ra React se
// crash ("Objects are not valid as a React child"). Tom tat ve chuoi doc duoc.
function formatNote(details: unknown): string {
  if (details == null) return '';
  if (typeof details === 'string') return details;
  if (typeof details !== 'object') return String(details);

  const d = details as Record<string, any>;
  if (typeof d.message === 'string') return d.message;
  if (typeof d.note === 'string') return d.note;

  const changes = d.changes;
  if (changes && typeof changes === 'object') {
    if (changes.created) {
      const label = describeRecord(changes.created);
      return label ? `Tạo mới: ${label}` : 'Tạo mới';
    }
    if (changes.before || changes.after) {
      const before = changes.before || {};
      const after = changes.after || {};
      const skip = new Set(['id', 'created_at', 'updated_at', 'updated_by', 'created_by']);
      const changedFields = Object.keys(after).filter(
        k => !skip.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k])
      );
      const label = describeRecord(after) || describeRecord(before);
      if (changedFields.length) {
        return `${label ? label + ' — ' : ''}thay đổi: ${changedFields.join(', ')}`;
      }
      return label ? `${label} — không có thay đổi` : 'Không có thay đổi';
    }
    if ('is_active' in changes) {
      return changes.is_active ? 'Kích hoạt lại' : 'Vô hiệu hóa';
    }
  }
  if (d.table) return `Bảng ${TABLE_LABELS[d.table] || d.table}`;
  return '';
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Fetch from audit_logs table (asset operations and other activities)
    let auditLogs: any[] = [];
    try {
      auditLogs = await query(
        `SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1`,
        [limit]
      );
    } catch (auditError) {
      console.error('Audit logs fetch error:', auditError);
    }

    // Fetch approved/rejected delete requests
    let deleteRequests: any[] = [];
    try {
      deleteRequests = await query(
        `SELECT * FROM delete_requests
         WHERE status = ANY($1)
         ORDER BY updated_at DESC
         LIMIT $2`,
        [['approved', 'rejected'], limit]
      );
    } catch (deleteError) {
      console.error('Delete requests fetch error:', deleteError);
    }

    // admin_id la user id (UUID) -> doi sang ten nguoi de hien thi.
    const userNameById = new Map<string, string>();
    if (Array.isArray(auditLogs)) {
      const ids = Array.from(
        new Set(
          auditLogs
            .map(l => l.admin_id)
            .filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v))
        )
      );
      if (ids.length > 0) {
        try {
          const users = await query<{ id: string; name: string; email: string }>(
            `SELECT id, name, email FROM users WHERE id = ANY($1)`,
            [ids]
          );
          users.forEach(u => userNameById.set(u.id, u.name || u.email || u.id));
        } catch (userError) {
          console.error('History user lookup error:', userError);
        }
      }
    }

    // Combine and transform data
    const historyEntries: HistoryEntry[] = [];

    // Process audit logs
    if (Array.isArray(auditLogs)) {
      auditLogs.forEach(log => {
        const isUuid = typeof log.admin_id === 'string' && /^[0-9a-f-]{36}$/i.test(log.admin_id);
        const performedBy =
          (log.admin_id && userNameById.get(log.admin_id)) ||
          (isUuid ? 'Người dùng đã xóa' : log.admin_id) ||
          'Hệ thống';
        historyEntries.push({
          id: log.id || `audit-${log.created_at}`,
          assetId: log.asset_id || null,
          assetCode: log.asset_code || null,
          assetName: log.asset_name || null,
          date: log.timestamp || log.created_at || new Date().toISOString(),
          action: formatAction(log.action),
          performedBy,
          note: formatNote(log.details),
          type: 'audit',
        });
      });
    }

    // Process delete requests
    if (Array.isArray(deleteRequests)) {
      deleteRequests.forEach(req => {
        const action =
          req.status === 'approved'
            ? 'Xóa tài sản (Phê duyệt)'
            : 'Xóa tài sản (Từ chối)';

        historyEntries.push({
          id: req.id,
          assetId: req.asset_id,
          assetCode: req.asset_code,
          assetName: req.asset_name,
          date: req.updated_at || req.created_at,
          action,
          performedBy: req.reviewed_by ? 'Super Admin' : 'Chờ duyệt',
          note:
            req.status === 'approved'
              ? `Phê duyệt - Lý do: ${req.reason}`
              : `Từ chối - Lý do: ${req.review_note || 'Không có ghi chú'}`,
          type: 'delete_request',
          status: req.status,
        });
      });
    }

    // Sort combined list by date descending
    historyEntries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const paginatedEntries = historyEntries.slice(offset, offset + limit);

    return NextResponse.json({
      data: paginatedEntries,
      count: historyEntries.length,
      offset,
      limit,
    });
  } catch (error) {
    console.error('History fetch error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch history',
        data: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
