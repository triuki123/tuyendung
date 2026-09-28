/**
 * Lịch sử xử lý cho module Pháp Chế — bảng legal_audit_logs (mig 290).
 * Copy khuôn hrAuditService: ghi log NUỐT LỖI (không làm sập nghiệp vụ),
 * gọi ở tầng API route, diff hiển thị tiếng Việt "Nhãn: cũ → mới".
 */
import crypto from 'crypto';
import { query, execute } from '@/lib/db';
import { formatVND } from '@/lib/format';

export type LegalEntityType = 'document' | 'contract' | 'authorization' | 'seal_log' | 'compliance_item';

export type LegalAuditAction =
  | 'create' | 'update' | 'delete' | 'status_change'
  | 'attach' | 'detach' | 'mark_done' | 'unmark_done'
  | 'lock' | 'unlock' | 'view_file';

export interface FieldChange { label: string; from: string | null; to: string | null }
export type LegalAuditChanges = Record<string, FieldChange>;

export interface LegalAuditEntry {
  id: string;
  entity_type: LegalEntityType;
  entity_id: string;
  action: LegalAuditAction;
  details: string | null;
  changes: LegalAuditChanges | null;
  performed_by: string | null;
  performed_by_name: string | null;
  created_at: string;
}

interface LogInput {
  entityType: LegalEntityType;
  entityId: string;
  action: LegalAuditAction;
  details?: string | null;
  changes?: LegalAuditChanges | null;
  performedBy?: string | null;
}

/** Ghi 1 dòng lịch sử. Nuốt mọi lỗi. */
export async function logLegalRecord(input: LogInput): Promise<void> {
  try {
    await execute(
      `INSERT INTO legal_audit_logs (id, entity_type, entity_id, action, details, changes, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        'lga_' + crypto.randomBytes(10).toString('hex'),
        input.entityType,
        input.entityId,
        input.action,
        input.details ?? null,
        input.changes && Object.keys(input.changes).length ? JSON.stringify(input.changes) : null,
        input.performedBy || null,
      ]
    );
  } catch (err) {
    console.error('[legalAudit] ghi log thất bại (bỏ qua, không ảnh hưởng nghiệp vụ):', err);
  }
}

/** Lịch sử 1 bản ghi — kèm TÊN người thực hiện. */
export async function listLegalAudit(entityType: LegalEntityType, entityId: string): Promise<LegalAuditEntry[]> {
  return query<LegalAuditEntry>(
    `SELECT l.id, l.entity_type, l.entity_id, l.action, l.details, l.changes,
            l.performed_by::text AS performed_by,
            COALESCE(u.name, 'Hệ thống') AS performed_by_name,
            l.created_at
       FROM legal_audit_logs l
       LEFT JOIN users u ON u.id = l.performed_by
      WHERE l.entity_type = $1 AND l.entity_id = $2
      ORDER BY l.created_at DESC`,
    [entityType, entityId]
  );
}

// ── Nhãn tiếng Việt cho diff ────────────────────────────────────────────────

const DOC_STATUS: Record<string, string> = {
  active: 'Hiệu lực', expired: 'Hết hạn', replaced: 'Đã thay thế', revoked: 'Bị thu hồi',
};
const CONTRACT_STATUS: Record<string, string> = {
  draft: 'Nháp', active: 'Hiệu lực', expired: 'Hết hạn',
  liquidated: 'Đã thanh lý', terminated: 'Chấm dứt',
};
const AUTH_STATUS: Record<string, string> = {
  active: 'Hiệu lực', expired: 'Hết hạn', revoked: 'Đã thu hồi',
};

type FieldSpec = { label: string; format?: (v: unknown) => string };

/** YYYY-MM-DD… → dd/mm/yyyy (rỗng → '—'). */
function fmtDate(v: unknown): string {
  const s = String(v ?? '').slice(0, 10);
  const p = s.split('-');
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : '—';
}

const DOCUMENT_FIELDS: Record<string, FieldSpec> = {
  title:       { label: 'Tiêu đề' },
  doc_number:  { label: 'Số văn bản' },
  issued_by:   { label: 'Cơ quan cấp' },
  issued_date: { label: 'Ngày cấp', format: fmtDate },
  expiry_date: { label: 'Ngày hết hạn', format: (v) => (v ? fmtDate(v) : 'Vô thời hạn') },
  status:      { label: 'Trạng thái', format: (v) => DOC_STATUS[String(v)] ?? String(v) },
  holder:      { label: 'Nơi giữ bản gốc' },
  note:        { label: 'Ghi chú' },
};

const CONTRACT_FIELDS: Record<string, FieldSpec> = {
  title:           { label: 'Tiêu đề' },
  contract_number: { label: 'Số hợp đồng' },
  partner_name:    { label: 'Đối tác' },
  // Tiền BIGINT → pg trả chuỗi; formatVND nhận cả chuỗi lẫn số.
  value:           { label: 'Giá trị', format: (v) => (v == null || v === '' ? '—' : formatVND(v as any)) },
  signed_date:     { label: 'Ngày ký', format: fmtDate },
  effective_from:  { label: 'Hiệu lực từ', format: fmtDate },
  effective_to:    { label: 'Hiệu lực đến', format: (v) => (v ? fmtDate(v) : 'Không thời hạn') },
  status:          { label: 'Trạng thái', format: (v) => CONTRACT_STATUS[String(v)] ?? String(v) },
  note:            { label: 'Ghi chú' },
};

const AUTH_FIELDS: Record<string, FieldSpec> = {
  grantor:        { label: 'Người ủy quyền' },
  grantee:        { label: 'Người được ủy quyền' },
  scope:          { label: 'Phạm vi' },
  doc_number:     { label: 'Số văn bản' },
  effective_from: { label: 'Hiệu lực từ', format: fmtDate },
  effective_to:   { label: 'Hiệu lực đến', format: (v) => (v ? fmtDate(v) : 'Đến khi thu hồi') },
  status:         { label: 'Trạng thái', format: (v) => AUTH_STATUS[String(v)] ?? String(v) },
};

const FIELD_SPECS: Partial<Record<LegalEntityType, Record<string, FieldSpec>>> = {
  document: DOCUMENT_FIELDS,
  contract: CONTRACT_FIELDS,
  authorization: AUTH_FIELDS,
};

function display(v: unknown, spec: FieldSpec): string {
  if (v === null || v === undefined || v === '') return '—';
  return spec.format ? spec.format(v) : String(v);
}

/**
 * So sánh bản ghi TRƯỚC/SAU → diff + câu tiếng Việt.
 * Chỉ xét cột trong FIELD_SPECS; không đổi gì → changes rỗng (caller bỏ qua).
 */
export function buildLegalChanges(
  entityType: LegalEntityType,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): { changes: LegalAuditChanges; details: string } {
  const specs = FIELD_SPECS[entityType];
  const changes: LegalAuditChanges = {};
  if (!specs || !before || !after) return { changes, details: '' };

  for (const [key, spec] of Object.entries(specs)) {
    if (!(key in after)) continue;
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (String(from ?? '') === String(to ?? '')) continue;
    changes[key] = { label: spec.label, from: display(from, spec), to: display(to, spec) };
  }

  const parts = Object.values(changes).map((c) => `${c.label}: ${c.from} → ${c.to}`);
  return { changes, details: parts.join(' · ') };
}
