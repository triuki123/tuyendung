/**
 * Lịch sử xử lý của TỪNG yêu cầu tuyển dụng — bảng requisition_audit_logs (mig 310).
 *
 * Nguyên tắc: ghi log KHÔNG BAO GIỜ được làm sập nghiệp vụ chính → hàm ghi nuốt mọi lỗi.
 * Đọc hiển thị qua <RecordHistoryDrawer apiBase="/api/requisition-audit" />.
 */
import crypto from 'crypto';
import { query, execute } from '@/lib/db';

/** Mã hành động — UI map sang icon/màu theo mã, không đoán theo chuỗi tiếng Việt. */
export type ReqAuditAction =
  | 'create' | 'update' | 'delete' | 'status_change'
  | 'approve' | 'accept' | 'reject' | 'follow' | 'unfollow' | 'workflow_update';

export interface FieldChange { label: string; from: string | null; to: string | null }
export type ReqAuditChanges = Record<string, FieldChange>;

export interface ReqAuditEntry {
  id: string;
  requisition_id: string;
  action: ReqAuditAction;
  details: string | null;
  changes: ReqAuditChanges | null;
  performed_by: string | null;
  performed_by_name: string | null;
  created_at: string;
}

interface LogInput {
  requisitionId: string;
  action: ReqAuditAction;
  details?: string | null;
  changes?: ReqAuditChanges | null;
  performedBy?: string | null;
}

/** Ghi 1 dòng lịch sử. Nuốt mọi lỗi — log hỏng không được làm sập thao tác nghiệp vụ. */
export async function logRequisition(input: LogInput): Promise<void> {
  try {
    await execute(
      `INSERT INTO requisition_audit_logs (id, requisition_id, action, details, changes, performed_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        'rqa_' + crypto.randomBytes(10).toString('hex'),
        input.requisitionId,
        input.action,
        input.details ?? null,
        input.changes && Object.keys(input.changes).length ? JSON.stringify(input.changes) : null,
        input.performedBy || null,
      ]
    );
  } catch (err) {
    console.error('[requisitionAudit] ghi log thất bại (bỏ qua, không ảnh hưởng nghiệp vụ):', err);
  }
}

/** Lịch sử của 1 yêu cầu — kèm TÊN người thực hiện (không trả id thô). */
export async function listRequisitionAudit(requisitionId: string): Promise<ReqAuditEntry[]> {
  return query<ReqAuditEntry>(
    `SELECT l.id, l.requisition_id, l.action, l.details, l.changes, l.performed_by,
            COALESCE(u.name, 'Hệ thống') AS performed_by_name, l.created_at
       FROM requisition_audit_logs l
       LEFT JOIN users u ON u.id::text = l.performed_by
      WHERE l.requisition_id = $1
      ORDER BY l.created_at DESC`,
    [requisitionId]
  );
}

// ── Nhãn tiếng Việt cho từng cột theo dõi ─────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Chờ phê duyệt', pending: 'Chờ tiếp nhận', open: 'Đang tuyển',
  on_hold: 'Tạm dừng', filled: 'Hoàn thành', cancelled: 'Lưu trữ', rejected: 'Từ chối',
};
const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Khẩn cấp', high: 'Cao', normal: 'Bình thường', low: 'Thấp',
};
const SALARY_TYPE_LABELS: Record<string, string> = {
  gross: 'Gross', net: 'Net', negotiable: 'Thỏa thuận',
};

type FieldSpec = { label: string; format?: (v: unknown) => string };

/**
 * Cột theo dõi. Các cột *_name là giá trị ĐÃ JOIN sẵn trong Requisition — so sánh theo tên
 * để lịch sử đọc được ("Phòng Kế Toán" thay vì id thô).
 */
const REQ_FIELDS: Record<string, FieldSpec> = {
  title:              { label: 'Vị trí cần tuyển' },
  company_name:       { label: 'Công ty' },
  department_name:    { label: 'Phòng ban' },
  sub_department_name:{ label: 'Bộ phận' },
  owner_name:         { label: 'Người phụ trách' },
  requester_name:     { label: 'Người yêu cầu' },
  interviewer_names:  { label: 'Người phỏng vấn', format: fmtList },
  follower_names:     { label: 'Người theo dõi', format: fmtList },
  status:             { label: 'Trạng thái', format: (v) => STATUS_LABELS[String(v)] ?? String(v) },
  priority:           { label: 'Độ ưu tiên', format: (v) => PRIORITY_LABELS[String(v)] ?? String(v) },
  target_headcount:   { label: 'Số lượng cần' },
  filled_count:       { label: 'Đã tuyển được' },
  salary_min:         { label: 'Lương từ', format: fmtMoney },
  salary_max:         { label: 'Lương đến', format: fmtMoney },
  salary_type:        { label: 'Loại lương', format: (v) => SALARY_TYPE_LABELS[String(v)] ?? String(v) },
  budget_code:        { label: 'Mã ngân sách' },
  open_date:          { label: 'Ngày mở', format: fmtDate },
  target_close_date:  { label: 'Hạn tuyển', format: fmtDate },
  note:               { label: 'Ghi chú' },
  cnt_sourcing:       { label: 'Pipeline · Tìm nguồn' },
  cnt_screening:      { label: 'Pipeline · Sàng lọc CV' },
  cnt_interview:      { label: 'Pipeline · Phỏng vấn' },
  cnt_offer:          { label: 'Pipeline · Đã offer' },
};

function fmtList(v: unknown): string {
  return Array.isArray(v) && v.length ? v.join(', ') : '—';
}
function fmtMoney(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('vi-VN') + ' đ' : '—';
}
/** YYYY-MM-DD… → dd/mm/yyyy (rỗng → '—'). */
function fmtDate(v: unknown): string {
  const s = String(v ?? '').slice(0, 10);
  const p = s.split('-');
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : '—';
}

function display(v: unknown, spec: FieldSpec): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v) && v.length === 0) return '—';
  return spec.format ? spec.format(v) : String(v);
}

/** So sánh giá trị: mảng so theo tập hợp (đổi thứ tự không tính là thay đổi). */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const norm = (x: unknown) => [...(Array.isArray(x) ? x : [])].map(String).sort().join('|');
    return norm(a) === norm(b);
  }
  return String(a ?? '') === String(b ?? '');
}

/**
 * So sánh yêu cầu TRƯỚC/SAU → diff + câu mô tả tiếng Việt.
 * Chỉ xét cột trong REQ_FIELDS (bỏ qua updated_at, id, days_open…).
 * Không có gì đổi → changes rỗng (caller nên bỏ qua, không ghi log thừa).
 */
export function buildRequisitionChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): { changes: ReqAuditChanges; details: string } {
  const changes: ReqAuditChanges = {};
  if (!before || !after) return { changes, details: '' };

  for (const [key, spec] of Object.entries(REQ_FIELDS)) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (same(from, to)) continue;
    changes[key] = { label: spec.label, from: display(from, spec), to: display(to, spec) };
  }

  const parts = Object.values(changes).map((c) => `${c.label}: ${c.from} → ${c.to}`);
  return { changes, details: parts.join(' · ') };
}
