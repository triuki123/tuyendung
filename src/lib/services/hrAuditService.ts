/**
 * Lịch sử xử lý tác vụ THEO TỪNG BẢN GHI cho module Quản Lý Hồ Sơ
 * (Hợp đồng / Đánh giá / Hồ sơ nhân sự) — bảng hr_record_audit_logs (mig 287).
 *
 * Nguyên tắc: ghi log KHÔNG BAO GIỜ được làm sập nghiệp vụ chính → mọi hàm ghi đều nuốt lỗi.
 * Gọi ở tầng API route (nơi đã có x-current-user-id), không sửa signature service nghiệp vụ.
 */
import crypto from 'crypto';
import { query, execute } from '@/lib/db';

export type HrEntityType = 'contract' | 'evaluation' | 'hr_document';

/** Mã hành động — UI map sang icon/màu theo mã (không đoán theo chuỗi tiếng Việt). */
export type HrAuditAction =
  | 'create' | 'update' | 'delete' | 'conclude' | 'renew'
  | 'attach' | 'detach' | 'replace_approve' | 'replace_reject';

export interface FieldChange { label: string; from: string | null; to: string | null }
export type HrAuditChanges = Record<string, FieldChange>;

export interface HrAuditEntry {
  id: string;
  entity_type: HrEntityType;
  entity_id: string;
  action: HrAuditAction;
  details: string | null;
  changes: HrAuditChanges | null;
  performed_by: string | null;
  performed_by_name: string | null;
  created_at: string;
}

interface LogInput {
  entityType: HrEntityType;
  entityId: string;
  action: HrAuditAction;
  details?: string | null;
  changes?: HrAuditChanges | null;
  performedBy?: string | null;
}

/** Ghi 1 dòng lịch sử. Nuốt mọi lỗi — không để log hỏng làm sập thao tác nghiệp vụ. */
export async function logHrRecord(input: LogInput): Promise<void> {
  try {
    await execute(
      `INSERT INTO hr_record_audit_logs (id, entity_type, entity_id, action, details, changes, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        'hra_' + crypto.randomBytes(10).toString('hex'),
        input.entityType,
        input.entityId,
        input.action,
        input.details ?? null,
        input.changes && Object.keys(input.changes).length ? JSON.stringify(input.changes) : null,
        input.performedBy || null,
      ]
    );
  } catch (err) {
    console.error('[hrAudit] ghi log thất bại (bỏ qua, không ảnh hưởng nghiệp vụ):', err);
  }
}

/** Lịch sử của 1 bản ghi — kèm TÊN người thực hiện (không trả id thô). */
export async function listHrRecordAudit(entityType: HrEntityType, entityId: string): Promise<HrAuditEntry[]> {
  return query<HrAuditEntry>(
    `SELECT l.id, l.entity_type, l.entity_id, l.action, l.details, l.changes,
            l.performed_by::text AS performed_by,
            COALESCE(u.name, 'Hệ thống') AS performed_by_name,
            l.created_at
       FROM hr_record_audit_logs l
       LEFT JOIN users u ON u.id = l.performed_by
      WHERE l.entity_type = $1 AND l.entity_id = $2
      ORDER BY l.created_at DESC`,
    [entityType, entityId]
  );
}

/** 1 dòng lịch sử tổng hợp — kèm tên bản ghi để hiển thị (số HĐ / tên nhân viên / tên tệp). */
export interface HrAuditFeedEntry extends HrAuditEntry {
  entity_label: string | null;
}

export interface FeedFilter {
  entityType?: HrEntityType | 'all';
  action?: string;
  /** Tìm theo tên bản ghi hoặc tên người thực hiện. */
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Lịch sử TOÀN MODULE (mọi bản ghi) — cho tab "Lịch sử".
 * LEFT JOIN sang từng bảng nghiệp vụ để lấy nhãn dễ đọc thay vì id thô.
 */
export async function listHrAuditFeed(f: FeedFilter = {}): Promise<{ items: HrAuditFeedEntry[]; total: number }> {
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const offset = Math.max(f.offset ?? 0, 0);

  const where: string[] = [];
  const p: unknown[] = [];

  if (f.entityType && f.entityType !== 'all') {
    p.push(f.entityType);
    where.push(`l.entity_type = $${p.length}`);
  }
  if (f.action && f.action !== 'all') {
    p.push(f.action);
    where.push(`l.action = $${p.length}`);
  }

  // Nhãn bản ghi: HĐ → số HĐ · nhân viên; Đánh giá → tên nhân viên; Hồ sơ → tên tệp.
  const labelExpr = `COALESCE(
    c.contract_number || COALESCE(' · ' || cu.name, ''),
    eu.name,
    d.title, d.file_name
  )`;

  if (f.search?.trim()) {
    p.push(`%${f.search.trim()}%`);
    const i = p.length;
    where.push(`(${labelExpr} ILIKE $${i} OR u.name ILIKE $${i} OR l.details ILIKE $${i})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const FROM = `
    FROM hr_record_audit_logs l
    LEFT JOIN users u ON u.id = l.performed_by
    LEFT JOIN contracts   c  ON l.entity_type = 'contract'    AND c.id = l.entity_id
    LEFT JOIN users       cu ON cu.id::text = c.employee_id
    LEFT JOIN evaluations e  ON l.entity_type = 'evaluation'  AND e.id = l.entity_id
    LEFT JOIN users       eu ON eu.id::text = e.employee_id
    LEFT JOIN hr_documents d ON l.entity_type = 'hr_document' AND d.id = l.entity_id
    ${whereSql}`;

  const totalRow = await query<{ n: string }>(`SELECT COUNT(*) AS n ${FROM}`, p);
  const total = Number(totalRow[0]?.n ?? 0);

  p.push(limit, offset);
  const items = await query<HrAuditFeedEntry>(
    `SELECT l.id, l.entity_type, l.entity_id, l.action, l.details, l.changes,
            l.performed_by::text AS performed_by,
            COALESCE(u.name, 'Hệ thống') AS performed_by_name,
            ${labelExpr} AS entity_label,
            l.created_at
     ${FROM}
     ORDER BY l.created_at DESC
     LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p
  );

  return { items, total };
}

// ── Nhãn tiếng Việt cho từng cột (chỉ các cột đáng theo dõi) ────────────────────

const CONTRACT_STATUS: Record<string, string> = {
  draft: 'Nháp', pending_signing: 'Chờ ký', active: 'Hiệu lực',
  renewed: 'Đã gia hạn', terminated: 'Chấm dứt',
};
const EVALUATION_STATUS: Record<string, string> = {
  draft: 'Nháp', pending_signing: 'Chờ ký', evaluated: 'Đã đánh giá',
  passed: 'Đạt', failed: 'Không đạt', extended: 'Gia hạn thử việc',
};
const EVALUATION_RESULT: Record<string, string> = { pass: 'Đạt', fail: 'Không đạt' };

/** Cột theo dõi + nhãn + hàm format giá trị sang chữ dễ đọc. */
type FieldSpec = { label: string; format?: (v: unknown) => string };

const CONTRACT_FIELDS: Record<string, FieldSpec> = {
  contract_number: { label: 'Số hợp đồng' },
  status:          { label: 'Trạng thái', format: (v) => CONTRACT_STATUS[String(v)] ?? String(v) },
  sign_date:       { label: 'Ngày ký', format: fmtDate },
  start_date:      { label: 'Ngày bắt đầu', format: fmtDate },
  end_date:        { label: 'Ngày kết thúc', format: (v) => (v ? fmtDate(v) : 'Vô thời hạn') },
  salary_info:     { label: 'Lương' },
  notes:           { label: 'Ghi chú' },
};

const EVALUATION_FIELDS: Record<string, FieldSpec> = {
  status:              { label: 'Trạng thái', format: (v) => EVALUATION_STATUS[String(v)] ?? String(v) },
  result:              { label: 'Kết quả', format: (v) => EVALUATION_RESULT[String(v)] ?? String(v) },
  result_note:         { label: 'Nhận xét' },
  probation_end_date:  { label: 'Hạn đánh giá', format: fmtDate },
  hire_date:           { label: 'Ngày vào làm', format: fmtDate },
};

const HR_DOCUMENT_FIELDS: Record<string, FieldSpec> = {
  document_type_id: { label: 'Loại tài liệu' },
  file_name:        { label: 'Tên file' },
  note:             { label: 'Ghi chú' },
};

const FIELD_SPECS: Record<HrEntityType, Record<string, FieldSpec>> = {
  contract: CONTRACT_FIELDS,
  evaluation: EVALUATION_FIELDS,
  hr_document: HR_DOCUMENT_FIELDS,
};

/** YYYY-MM-DD… → dd/mm/yyyy (rỗng → '—'). */
function fmtDate(v: unknown): string {
  const s = String(v ?? '').slice(0, 10);
  const p = s.split('-');
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : '—';
}

function display(v: unknown, spec: FieldSpec): string {
  if (v === null || v === undefined || v === '') return '—';
  return spec.format ? spec.format(v) : String(v);
}

/**
 * So sánh bản ghi TRƯỚC/SAU, trả về diff + câu mô tả tiếng Việt.
 * Chỉ xét các cột có trong FIELD_SPECS của entity đó (bỏ qua updated_at, cột joined…).
 * Không có gì đổi → trả changes rỗng (caller nên bỏ qua, không ghi log thừa).
 */
export function buildChanges(
  entityType: HrEntityType,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): { changes: HrAuditChanges; details: string } {
  const specs = FIELD_SPECS[entityType];
  const changes: HrAuditChanges = {};
  if (!before || !after) return { changes, details: '' };

  for (const [key, spec] of Object.entries(specs)) {
    if (!(key in after)) continue;                    // không gửi lên thì không coi là đổi
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    // So sánh dạng chuỗi để tránh lệch kiểu (Date vs string, number vs string).
    if (String(from ?? '') === String(to ?? '')) continue;
    changes[key] = { label: spec.label, from: display(from, spec), to: display(to, spec) };
  }

  const parts = Object.values(changes).map((c) => `${c.label}: ${c.from} → ${c.to}`);
  return { changes, details: parts.join(' · ') };
}
