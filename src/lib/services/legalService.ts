/**
 * Module Pháp Chế — service layer (bảng legal_* , mig 290).
 *
 * Mô hình quyền TẬP TRUNG: KHÔNG lọc theo getVisibleCompanyIds — ai có RBAC 'legal'
 * thấy dữ liệu MỌI công ty (đầu mối pháp chế tập đoàn). Mọi bản ghi gắn company_id
 * để lọc/báo cáo ở UI.
 *
 * ⚠️ pg trả BIGINT (value hợp đồng) dạng CHUỖI — mọi chỗ đọc ra phải ép Number()
 * trước khi cộng/so sánh (tránh lỗi nối chuỗi như vụ tổng giá trị tài sản).
 */
import crypto from 'crypto';
import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

// ===== Kiểu dữ liệu =====

export interface LegalDocumentType {
  id: string;
  name: string;
  group_key: 'dang_ky_dn' | 'giay_phep_con' | 'noi_bo';
  default_validity_months: number | null;
  sort: number;
  active: boolean;
}

export interface LegalDocument {
  id: string;
  company_id: string;
  company_name?: string | null;
  type_id: string | null;
  type_name?: string | null;
  title: string;
  doc_number: string | null;
  issued_by: string | null;
  issued_date: string | null;
  expiry_date: string | null;   // NULL = vô thời hạn
  status: 'active' | 'expired' | 'replaced' | 'revoked';
  holder: string | null;
  note: string | null;
  created_at: string;
  /** Số ngày còn lại tới hết hạn (âm = quá hạn); null nếu vô thời hạn. */
  days_left?: number | null;
  file_count?: number;
  /** Đang bị khóa BMHS (xem file/sửa/xóa cần mật khẩu). */
  locked?: boolean;
}

export interface LegalContract {
  id: string;
  company_id: string;
  company_name?: string | null;
  partner_name: string;
  partner_tax_code: string | null;
  title: string;
  contract_number: string | null;
  value: number | null;          // đã ép Number từ BIGINT
  signed_date: string | null;
  effective_from: string | null;
  effective_to: string | null;
  status: 'draft' | 'active' | 'expired' | 'liquidated' | 'terminated';
  owner_id: string | null;
  owner_name?: string | null;
  note: string | null;
  created_at: string;
  days_left?: number | null;
  file_count?: number;
  /** Đang bị khóa BMHS (xem file/sửa/xóa cần mật khẩu). */
  locked?: boolean;
}

export interface LegalComplianceItem {
  id: string;
  company_id: string | null;     // NULL = mọi công ty
  company_name?: string | null;
  name: string;
  agency: string | null;
  frequency: 'yearly' | 'quarterly' | 'monthly' | 'once';
  due_month: number | null;
  due_day: number | null;
  link_url: string | null;
  note: string | null;
  active: boolean;
  /** Các kỳ đã hoàn thành (đổ từ legal_compliance_logs). */
  done_periods?: string[];
}

export interface LegalAuthorization {
  id: string;
  company_id: string;
  company_name?: string | null;
  grantor: string;
  grantee: string;
  scope: string | null;
  doc_number: string | null;
  effective_from: string | null;
  effective_to: string | null;
  status: 'active' | 'expired' | 'revoked';
  note: string | null;
  created_at: string;
  days_left?: number | null;
}

export interface LegalSealLog {
  id: string;
  company_id: string;
  company_name?: string | null;
  used_at: string;
  document_desc: string;
  used_by: string;
  note: string | null;
  created_at: string;
}

export interface LegalFileMeta {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by_name?: string | null;
  created_at: string;
}

// ===== Tiện ích chung =====

/** Ngày còn lại tới expiry theo giờ VN (âm = quá hạn); null nếu không có hạn. */
function daysLeftExpr(col: string): string {
  return `CASE WHEN ${col} IS NULL THEN NULL
          ELSE (${col} - (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) END`;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ===== Danh mục loại văn bản =====

export async function listDocumentTypes(includeInactive = false): Promise<LegalDocumentType[]> {
  return query<LegalDocumentType>(
    `SELECT * FROM legal_document_types ${includeInactive ? '' : 'WHERE active = TRUE'} ORDER BY sort, name`,
    []
  );
}

export async function createDocumentType(input: {
  name: string; groupKey: string; defaultValidityMonths?: number | null;
}): Promise<{ id: string }> {
  const id = newId('ldt');
  const maxSort = await queryOne<{ m: number }>(`SELECT COALESCE(MAX(sort), 0)::int AS m FROM legal_document_types`, []);
  const { text, params } = buildInsert('legal_document_types', {
    id, name: input.name.trim(), group_key: input.groupKey,
    default_validity_months: input.defaultValidityMonths ?? null,
    sort: (maxSort?.m ?? 0) + 1,
  });
  await execute(text, params);
  return { id };
}

export async function updateDocumentType(id: string, data: Record<string, unknown>): Promise<void> {
  const allowed: Record<string, unknown> = {};
  for (const k of ['name', 'group_key', 'default_validity_months', 'sort', 'active']) {
    if (k in data) allowed[k] = data[k] === '' ? null : data[k];
  }
  if (!Object.keys(allowed).length) return;
  const { text, params } = buildUpdateById('legal_document_types', id, allowed);
  await execute(text, params);
}

/**
 * Xóa loại văn bản — CHẶN khi đang có văn bản dùng loại này (xóa sẽ làm hồ sơ cũ
 * thành "không loại", mất nghĩa dữ liệu; trường hợp đó hãy Ẩn thay vì xóa).
 */
export async function deleteDocumentType(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const used = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM legal_documents WHERE type_id = $1`, [id]
  );
  if ((used?.n ?? 0) > 0) {
    return { ok: false, error: `Đang có ${used!.n} văn bản dùng loại này — hãy dùng "Ẩn" thay vì xóa để giữ nghĩa dữ liệu cũ` };
  }
  const n = await execute(`DELETE FROM legal_document_types WHERE id = $1`, [id]);
  return n > 0 ? { ok: true } : { ok: false, error: 'Không tìm thấy loại văn bản' };
}

// ===== Sổ văn bản pháp lý =====

const DOC_SELECT = `
  SELECT d.*, c.name AS company_name, t.name AS type_name,
         ${daysLeftExpr('d.expiry_date')} AS days_left,
         (SELECT COUNT(*)::int FROM legal_document_files f
           WHERE f.document_id = d.id AND f.deleted_at IS NULL) AS file_count,
         COALESCE(lk.enabled, FALSE) AS locked
    FROM legal_documents d
    LEFT JOIN companies c ON c.id = d.company_id
    LEFT JOIN legal_document_types t ON t.id = d.type_id
    LEFT JOIN legal_locks lk ON lk.entity_type = 'document' AND lk.entity_id = d.id`;

export async function listDocuments(filter: { companyId?: string; status?: string } = {}): Promise<LegalDocument[]> {
  const where: string[] = [];
  const p: unknown[] = [];
  if (filter.companyId) { p.push(filter.companyId); where.push(`d.company_id = $${p.length}`); }
  if (filter.status) { p.push(filter.status); where.push(`d.status = $${p.length}`); }
  const rows = await query<LegalDocument>(
    `${DOC_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY d.expiry_date ASC NULLS LAST, d.created_at DESC`,
    p
  );
  return rows.map((r) => ({ ...r, days_left: num(r.days_left) }));
}

export async function getDocument(id: string): Promise<LegalDocument | null> {
  const row = await queryOne<LegalDocument>(`${DOC_SELECT} WHERE d.id = $1`, [id]);
  return row ? { ...row, days_left: num(row.days_left) } : null;
}

export async function createDocument(input: {
  companyId: string; typeId?: string | null; title: string; docNumber?: string | null;
  issuedBy?: string | null; issuedDate?: string | null; expiryDate?: string | null;
  holder?: string | null; note?: string | null; createdBy?: string | null;
}): Promise<{ id: string }> {
  const id = newId('lgd');
  const { text, params } = buildInsert('legal_documents', {
    id, company_id: input.companyId, type_id: input.typeId ?? null,
    title: input.title.trim(), doc_number: input.docNumber?.trim() || null,
    issued_by: input.issuedBy?.trim() || null,
    issued_date: input.issuedDate || null, expiry_date: input.expiryDate || null,
    holder: input.holder?.trim() || null, note: input.note?.trim() || null,
    created_by: input.createdBy ?? null,
  });
  await execute(text, params);
  return { id };
}

const DOC_EDITABLE = ['company_id', 'type_id', 'title', 'doc_number', 'issued_by',
  'issued_date', 'expiry_date', 'status', 'holder', 'note'];

export async function updateDocument(id: string, data: Record<string, unknown>): Promise<void> {
  const allowed: Record<string, unknown> = {};
  for (const k of DOC_EDITABLE) if (k in data) allowed[k] = data[k] === '' ? null : data[k];
  if (!Object.keys(allowed).length) return;
  allowed.updated_at = new Date().toISOString();
  const { text, params } = buildUpdateById('legal_documents', id, allowed);
  await execute(text, params);
}

export async function deleteDocument(id: string): Promise<boolean> {
  return (await execute(`DELETE FROM legal_documents WHERE id = $1`, [id])) > 0;
}

// ===== File đính kèm (dùng chung cho documents + contracts) =====

/** Whitelist MIME giống contract_attachments; max 10MB. */
export const LEGAL_FILE_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

type FileTable = 'legal_document_files' | 'legal_contract_files';
const FILE_FK: Record<FileTable, string> = {
  legal_document_files: 'document_id',
  legal_contract_files: 'contract_id',
};

export async function addLegalFile(table: FileTable, parentId: string, file: {
  fileName: string; mimeType: string; content: Buffer; uploadedBy?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!ALLOWED_MIME.has(file.mimeType)) {
    return { ok: false, error: `Định dạng ${file.mimeType} không được hỗ trợ (PDF, ảnh, Word, Excel)` };
  }
  if (file.content.length > LEGAL_FILE_MAX_BYTES) {
    return { ok: false, error: 'File vượt quá 10MB' };
  }
  const id = newId('lgf');
  // Dual-write: có S3 → MinIO (media_id), chưa cấu hình → BYTEA cũ
  const media = await uploadBufferAsMedia({
    buffer: file.content, mimeType: file.mimeType, scope: table,
    originalName: file.fileName, uploaderId: file.uploadedBy, sourceId: id,
  });
  await execute(
    `INSERT INTO ${table} (id, ${FILE_FK[table]}, file_name, mime_type, size_bytes, content, media_id, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, parentId, file.fileName, file.mimeType, file.content.length,
     media ? null : file.content, media?.id ?? null, file.uploadedBy ?? null]
  );
  return { ok: true, id };
}

export async function listLegalFiles(table: FileTable, parentId: string): Promise<LegalFileMeta[]> {
  return query<LegalFileMeta>(
    `SELECT f.id, f.file_name, f.mime_type, f.size_bytes, f.created_at, u.name AS uploaded_by_name
       FROM ${table} f LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.${FILE_FK[table]} = $1 AND f.deleted_at IS NULL
      ORDER BY f.created_at DESC`,
    [parentId]
  );
}

/** Metadata NHẸ (không load BYTEA) — để gate khóa BMHS chạy TRƯỚC khi kéo nội dung. */
export async function getLegalFileParent(table: FileTable, fileId: string): Promise<
  { parent_id: string; file_name: string } | null
> {
  return queryOne(
    `SELECT ${FILE_FK[table]} AS parent_id, file_name
       FROM ${table} WHERE id = $1 AND deleted_at IS NULL`,
    [fileId]
  );
}

/** Tải nội dung file — CHỈ gọi khi thật sự cần trả bytes (BYTEA có thể tới 10MB). */
export async function getLegalFileContent(table: FileTable, fileId: string): Promise<
  { file_name: string; mime_type: string; content: Buffer; parent_id: string } | null
> {
  const row = await queryOne<{ file_name: string; mime_type: string; content: Buffer | null; parent_id: string; media_id: string | null }>(
    `SELECT file_name, mime_type, content, media_id, ${FILE_FK[table]} AS parent_id
       FROM ${table} WHERE id = $1 AND deleted_at IS NULL`,
    [fileId]
  );
  if (!row) return null;
  // Dual-read: có media_id → MinIO; không → BYTEA cũ (guard khóa đã chạy ở route trước khi gọi hàm này)
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { file_name: row.file_name, mime_type: row.mime_type, content: m.buffer, parent_id: row.parent_id };
  }
  if (!row.content) return null;
  return { file_name: row.file_name, mime_type: row.mime_type, content: row.content, parent_id: row.parent_id };
}

export async function softDeleteLegalFile(table: FileTable, fileId: string): Promise<{ file_name: string; parent_id: string } | null> {
  const row = await queryOne<{ file_name: string; parent_id: string; media_id: string | null }>(
    `UPDATE ${table} SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING file_name, media_id, ${FILE_FK[table]} AS parent_id`,
    [fileId]
  );
  if (!row) return null;
  // Xoá mềm media kèm theo (best-effort)
  if (row.media_id) {
    try { await softDeleteMedia(row.media_id); } catch { /* nuốt lỗi */ }
  }
  return { file_name: row.file_name, parent_id: row.parent_id };
}

// ===== Lịch tuân thủ =====

export async function listComplianceItems(includeInactive = false): Promise<LegalComplianceItem[]> {
  const items = await query<LegalComplianceItem>(
    `SELECT i.*, c.name AS company_name
       FROM legal_compliance_items i
       LEFT JOIN companies c ON c.id = i.company_id
      ${includeInactive ? '' : 'WHERE i.active = TRUE'}
      ORDER BY i.due_month NULLS LAST, i.due_day NULLS LAST, i.name`,
    []
  );
  if (!items.length) return items;
  const logs = await query<{ item_id: string; period: string }>(
    `SELECT item_id, period FROM legal_compliance_logs WHERE item_id = ANY($1)`,
    [items.map((i) => i.id)]
  );
  const byItem = new Map<string, string[]>();
  for (const l of logs) {
    if (!byItem.has(l.item_id)) byItem.set(l.item_id, []);
    byItem.get(l.item_id)!.push(l.period);
  }
  return items.map((i) => ({ ...i, done_periods: byItem.get(i.id) ?? [] }));
}

export async function createComplianceItem(input: {
  companyId?: string | null; name: string; agency?: string | null;
  frequency: string; dueMonth?: number | null; dueDay?: number | null;
  linkUrl?: string | null; note?: string | null; createdBy?: string | null;
}): Promise<{ id: string }> {
  const id = newId('lci');
  const { text, params } = buildInsert('legal_compliance_items', {
    id, company_id: input.companyId ?? null, name: input.name.trim(),
    agency: input.agency?.trim() || null, frequency: input.frequency,
    due_month: input.dueMonth ?? null, due_day: input.dueDay ?? null,
    link_url: input.linkUrl?.trim() || null, note: input.note?.trim() || null,
    created_by: input.createdBy ?? null,
  });
  await execute(text, params);
  return { id };
}

export async function updateComplianceItem(id: string, data: Record<string, unknown>): Promise<void> {
  const allowed: Record<string, unknown> = {};
  for (const k of ['company_id', 'name', 'agency', 'frequency', 'due_month', 'due_day', 'link_url', 'note', 'active']) {
    if (k in data) allowed[k] = data[k] === '' ? null : data[k];
  }
  if (!Object.keys(allowed).length) return;
  const { text, params } = buildUpdateById('legal_compliance_items', id, allowed);
  await execute(text, params);
}

export async function deleteComplianceItem(id: string): Promise<boolean> {
  return (await execute(`DELETE FROM legal_compliance_items WHERE id = $1`, [id])) > 0;
}

/** Đánh dấu 1 kỳ đã nộp. UNIQUE(item_id, period) → nộp trùng trả false. */
export async function markComplianceDone(itemId: string, period: string, doneBy?: string | null, note?: string | null): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO legal_compliance_logs (id, item_id, period, done_by, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (item_id, period) DO NOTHING
     RETURNING id`,
    [newId('lcl'), itemId, period, doneBy ?? null, note?.trim() || null]
  );
  return !!row;
}

/** Bỏ đánh dấu (nộp nhầm). */
export async function unmarkComplianceDone(itemId: string, period: string): Promise<boolean> {
  return (await execute(`DELETE FROM legal_compliance_logs WHERE item_id = $1 AND period = $2`, [itemId, period])) > 0;
}

export async function getComplianceItem(id: string): Promise<LegalComplianceItem | null> {
  return queryOne<LegalComplianceItem>(`SELECT * FROM legal_compliance_items WHERE id = $1`, [id]);
}

// ===== Hợp đồng thương mại =====

const CONTRACT_SELECT = `
  SELECT k.*, c.name AS company_name, u.name AS owner_name,
         ${daysLeftExpr('k.effective_to')} AS days_left,
         (SELECT COUNT(*)::int FROM legal_contract_files f
           WHERE f.contract_id = k.id AND f.deleted_at IS NULL) AS file_count,
         COALESCE(lk.enabled, FALSE) AS locked
    FROM legal_contracts k
    LEFT JOIN companies c ON c.id = k.company_id
    LEFT JOIN users u ON u.id = k.owner_id
    LEFT JOIN legal_locks lk ON lk.entity_type = 'contract' AND lk.entity_id = k.id`;

function mapContract(r: LegalContract): LegalContract {
  return { ...r, value: num(r.value), days_left: num(r.days_left) };
}

export async function listContracts(filter: { companyId?: string; status?: string } = {}): Promise<LegalContract[]> {
  const where: string[] = [];
  const p: unknown[] = [];
  if (filter.companyId) { p.push(filter.companyId); where.push(`k.company_id = $${p.length}`); }
  if (filter.status) { p.push(filter.status); where.push(`k.status = $${p.length}`); }
  const rows = await query<LegalContract>(
    `${CONTRACT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY k.effective_to ASC NULLS LAST, k.created_at DESC`,
    p
  );
  return rows.map(mapContract);
}

export async function getContract(id: string): Promise<LegalContract | null> {
  const row = await queryOne<LegalContract>(`${CONTRACT_SELECT} WHERE k.id = $1`, [id]);
  return row ? mapContract(row) : null;
}

export async function createContract(input: {
  companyId: string; partnerName: string; partnerTaxCode?: string | null;
  title: string; contractNumber?: string | null; value?: number | null;
  signedDate?: string | null; effectiveFrom?: string | null; effectiveTo?: string | null;
  ownerId?: string | null; note?: string | null; createdBy?: string | null;
}): Promise<{ id: string }> {
  const id = newId('lgc');
  const { text, params } = buildInsert('legal_contracts', {
    id, company_id: input.companyId,
    partner_name: input.partnerName.trim(), partner_tax_code: input.partnerTaxCode?.trim() || null,
    title: input.title.trim(), contract_number: input.contractNumber?.trim() || null,
    value: input.value ?? null,
    signed_date: input.signedDate || null,
    effective_from: input.effectiveFrom || null, effective_to: input.effectiveTo || null,
    owner_id: input.ownerId || null, note: input.note?.trim() || null,
    created_by: input.createdBy ?? null,
  });
  await execute(text, params);
  return { id };
}

const CONTRACT_EDITABLE = ['company_id', 'partner_name', 'partner_tax_code', 'title',
  'contract_number', 'value', 'signed_date', 'effective_from', 'effective_to',
  'status', 'owner_id', 'note'];

export async function updateContract(id: string, data: Record<string, unknown>): Promise<void> {
  const allowed: Record<string, unknown> = {};
  for (const k of CONTRACT_EDITABLE) if (k in data) allowed[k] = data[k] === '' ? null : data[k];
  if (!Object.keys(allowed).length) return;
  allowed.updated_at = new Date().toISOString();
  const { text, params } = buildUpdateById('legal_contracts', id, allowed);
  await execute(text, params);
}

export async function deleteContract(id: string): Promise<boolean> {
  return (await execute(`DELETE FROM legal_contracts WHERE id = $1`, [id])) > 0;
}

// ===== Ủy quyền =====

export async function listAuthorizations(filter: { companyId?: string } = {}): Promise<LegalAuthorization[]> {
  const p: unknown[] = [];
  let where = '';
  if (filter.companyId) { p.push(filter.companyId); where = `WHERE a.company_id = $1`; }
  const rows = await query<LegalAuthorization>(
    `SELECT a.*, c.name AS company_name, ${daysLeftExpr('a.effective_to')} AS days_left
       FROM legal_authorizations a
       LEFT JOIN companies c ON c.id = a.company_id
      ${where}
      ORDER BY a.status = 'active' DESC, a.effective_to ASC NULLS LAST, a.created_at DESC`,
    p
  );
  return rows.map((r) => ({ ...r, days_left: num(r.days_left) }));
}

export async function getAuthorization(id: string): Promise<LegalAuthorization | null> {
  return queryOne<LegalAuthorization>(`SELECT * FROM legal_authorizations WHERE id = $1`, [id]);
}

export async function createAuthorization(input: {
  companyId: string; grantor: string; grantee: string; scope?: string | null;
  docNumber?: string | null; effectiveFrom?: string | null; effectiveTo?: string | null;
  note?: string | null; createdBy?: string | null;
}): Promise<{ id: string }> {
  const id = newId('lau');
  const { text, params } = buildInsert('legal_authorizations', {
    id, company_id: input.companyId,
    grantor: input.grantor.trim(), grantee: input.grantee.trim(),
    scope: input.scope?.trim() || null, doc_number: input.docNumber?.trim() || null,
    effective_from: input.effectiveFrom || null, effective_to: input.effectiveTo || null,
    note: input.note?.trim() || null, created_by: input.createdBy ?? null,
  });
  await execute(text, params);
  return { id };
}

export async function updateAuthorization(id: string, data: Record<string, unknown>): Promise<void> {
  const allowed: Record<string, unknown> = {};
  for (const k of ['company_id', 'grantor', 'grantee', 'scope', 'doc_number',
    'effective_from', 'effective_to', 'status', 'note']) {
    if (k in data) allowed[k] = data[k] === '' ? null : data[k];
  }
  if (!Object.keys(allowed).length) return;
  const { text, params } = buildUpdateById('legal_authorizations', id, allowed);
  await execute(text, params);
}

export async function deleteAuthorization(id: string): Promise<boolean> {
  return (await execute(`DELETE FROM legal_authorizations WHERE id = $1`, [id])) > 0;
}

// ===== Sổ con dấu =====

export async function listSealLogs(filter: { companyId?: string; limit?: number } = {}): Promise<LegalSealLog[]> {
  const p: unknown[] = [];
  let where = '';
  if (filter.companyId) { p.push(filter.companyId); where = `WHERE s.company_id = $1`; }
  p.push(Math.min(filter.limit ?? 200, 500));
  return query<LegalSealLog>(
    `SELECT s.*, c.name AS company_name
       FROM legal_seal_logs s
       LEFT JOIN companies c ON c.id = s.company_id
      ${where}
      ORDER BY s.used_at DESC, s.created_at DESC
      LIMIT $${p.length}`,
    p
  );
}

export async function createSealLog(input: {
  companyId: string; usedAt: string; documentDesc: string; usedBy: string;
  note?: string | null; createdBy?: string | null;
}): Promise<{ id: string }> {
  const id = newId('lsl');
  const { text, params } = buildInsert('legal_seal_logs', {
    id, company_id: input.companyId, used_at: input.usedAt,
    document_desc: input.documentDesc.trim(), used_by: input.usedBy.trim(),
    note: input.note?.trim() || null, created_by: input.createdBy ?? null,
  });
  await execute(text, params);
  return { id };
}

export async function deleteSealLog(id: string): Promise<boolean> {
  return (await execute(`DELETE FROM legal_seal_logs WHERE id = $1`, [id])) > 0;
}

// ===== Sắp hết hạn (dùng cho scheduler nhắc + widget) =====

export interface ExpiringRecord {
  id: string;
  entity_type: 'document' | 'contract' | 'authorization';
  title: string;
  company_name: string | null;
  expiry_date: string;
  days_left: number;
}

/**
 * Gom mọi thứ có hạn sắp đến/quá hạn trong 1 query (documents + contracts +
 * authorizations còn hiệu lực). withinDays: lấy các bản ghi còn <= N ngày (kể cả quá hạn).
 */
export async function listExpiring(withinDays: number): Promise<ExpiringRecord[]> {
  const rows = await query<ExpiringRecord>(
    `SELECT * FROM (
       SELECT d.id, 'document'::text AS entity_type, d.title, c.name AS company_name,
              d.expiry_date::text AS expiry_date, ${daysLeftExpr('d.expiry_date')} AS days_left
         FROM legal_documents d LEFT JOIN companies c ON c.id = d.company_id
        WHERE d.status = 'active' AND d.expiry_date IS NOT NULL
       UNION ALL
       SELECT k.id, 'contract', k.title, c.name,
              k.effective_to::text, ${daysLeftExpr('k.effective_to')}
         FROM legal_contracts k LEFT JOIN companies c ON c.id = k.company_id
        WHERE k.status = 'active' AND k.effective_to IS NOT NULL
       UNION ALL
       SELECT a.id, 'authorization', a.grantor || ' → ' || a.grantee, c.name,
              a.effective_to::text, ${daysLeftExpr('a.effective_to')}
         FROM legal_authorizations a LEFT JOIN companies c ON c.id = a.company_id
        WHERE a.status = 'active' AND a.effective_to IS NOT NULL
     ) x
     WHERE x.days_left <= $1
     ORDER BY x.days_left ASC`,
    [withinDays]
  );
  return rows.map((r) => ({ ...r, days_left: Number(r.days_left) }));
}
