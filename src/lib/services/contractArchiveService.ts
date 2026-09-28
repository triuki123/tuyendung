/**
 * Lưu trữ hợp đồng vào kho Hồ Sơ nhân viên.
 *
 * Khi hợp đồng hoàn tất vòng đời (status = 'renewed' hoặc 'terminated'):
 *  1. Sinh bản tóm tắt hợp đồng (HTML — hiển thị tiếng Việt chuẩn, xem inline)
 *  2. Copy toàn bộ file đính kèm của hợp đồng sang hr_documents
 *  3. Đánh dấu contracts.archived_to_docs_at để chống lưu trùng (idempotent)
 *
 * Tài liệu sinh ra gắn doc_type 'hdoc_contract' + source_contract_id để truy vết.
 */
import { queryOne, execute } from '@/lib/db';
import { uploadBufferAsMedia } from '@/lib/services/mediaService';
import { getContractById } from './contractService';
import {
  listContractAttachments,
  getContractAttachmentContent,
} from './contractAttachmentsService';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp',
  pending_signing: 'Chờ ký',
  active: 'Hiệu lực',
  renewed: 'Đã gia hạn',
  terminated: 'Chấm dứt',
};

/** Map contract_type_id → hr_document_type_id. Không khớp thì fallback 'hdoc_contract'. */
const CONTRACT_TO_DOC_TYPE: Record<string, string> = {
  ctype_probation:   'hdoc_probation',
  ctype_cooperation: 'hdoc_cooperation',
  ctype_nda:         'hdoc_nda',
  ctype_termination: 'hdoc_termination',
};

function resolveDocType(contractTypeId: string | null | undefined): string {
  return CONTRACT_TO_DOC_TYPE[contractTypeId ?? ''] ?? 'hdoc_contract';
}

function esc(v: string | null | undefined): string {
  if (!v) return '';
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Sinh HTML tóm tắt hợp đồng — đầy đủ thông tin, xem được kể cả khi HĐ không có file đính kèm. */
function buildSummaryHtml(c: any): string {
  const rows: [string, string][] = [
    ['Số hợp đồng', esc(c.contract_number)],
    ['Loại hợp đồng', esc(c.contract_type_name) || '—'],
    ['Nhân viên', esc(c.employee_name) || '—'],
    ['Phòng ban', esc(c.department_name ?? c.employee_department_name) || '—'],
    ['Trạng thái', STATUS_LABEL[c.status] ?? esc(c.status)],
    ['Ngày ký', fmtDate(c.sign_date)],
    ['Ngày bắt đầu', fmtDate(c.start_date)],
    ['Ngày kết thúc', c.end_date ? fmtDate(c.end_date) : 'Không xác định thời hạn'],
    ['Thông tin lương', esc(c.salary_info) || '—'],
    ['Ghi chú', esc(c.notes) || '—'],
  ];
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><th>${k}</th><td>${v}</td></tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Tóm tắt hợp đồng ${esc(c.contract_number)}</title>
<style>
  body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #1a202c; max-width: 720px; margin: 32px auto; padding: 0 24px; }
  h1 { font-size: 20px; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; color: #312e81; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; vertical-align: top; }
  th { width: 200px; color: #475569; font-weight: 600; background: #f8fafc; }
  .footer { margin-top: 32px; color: #94a3b8; font-size: 11px; text-align: center; }
</style>
</head>
<body>
  <h1>TÓM TẮT HỢP ĐỒNG LAO ĐỘNG</h1>
  <p class="meta">Tài liệu được hệ thống lưu trữ tự động khi hợp đồng hoàn tất vòng đời.</p>
  <table>
${tr}
  </table>
  <p class="footer">FADO AssetFlowPro — Lưu trữ tự động</p>
</body>
</html>`;
}

async function insertHrDocument(data: {
  employeeId: string;
  docTypeId: string;
  title: string;
  fileName: string;
  mimeType: string | null;
  buffer: Buffer;
  uploadedBy: string | null;
  sourceContractId: string;
}): Promise<void> {
  const id = `hrd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Dual-write: có S3 → media_id + content NULL; chưa cấu hình → BYTEA như cũ.
  const media = await uploadBufferAsMedia({
    buffer: data.buffer,
    mimeType: data.mimeType || 'application/octet-stream',
    scope: 'hr_documents',
    originalName: data.fileName,
    uploaderId: data.uploadedBy,
    sourceId: id,
  });

  await execute(
    `INSERT INTO hr_documents
       (id, employee_id, doc_type_id, title, file_name, mime_type, size_bytes, content, uploaded_by, source_contract_id, media_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      data.employeeId,
      data.docTypeId,
      data.title,
      data.fileName,
      data.mimeType,
      data.buffer.length,
      media ? null : data.buffer,
      data.uploadedBy,
      data.sourceContractId,
      media ? media.id : null,
    ]
  );
}

/**
 * Lưu trữ 1 hợp đồng vào kho Hồ Sơ của nhân viên.
 * Idempotent: nếu đã lưu trước đó (archived_to_docs_at != NULL) thì bỏ qua.
 * @returns số tài liệu đã tạo (0 nếu đã lưu trước đó / không tìm thấy HĐ)
 */
export async function archiveContractToHrDocs(
  contractId: string,
  byUserId: string | null
): Promise<number> {
  const contract = await getContractById(contractId);
  if (!contract) {
    console.warn(`[ContractArchive] Không tìm thấy hợp đồng ${contractId}`);
    return 0;
  }

  // Chống lưu trùng
  if ((contract as any).archived_to_docs_at) {
    console.log(`[ContractArchive] Hợp đồng ${contractId} đã được lưu trữ trước đó — bỏ qua.`);
    return 0;
  }

  let created = 0;

  const docTypeId = resolveDocType(contract.contract_type_id);
  const safeNum = contract.contract_number.replace(/[/\\?%*:|"<>]/g, '-');

  // 1. Bản tóm tắt HTML
  try {
    const html = buildSummaryHtml(contract);
    await insertHrDocument({
      employeeId: contract.employee_id,
      docTypeId,
      title: contract.contract_number,
      fileName: `${safeNum}.html`,
      mimeType: 'text/html',
      buffer: Buffer.from(html, 'utf-8'),
      uploadedBy: byUserId,
      sourceContractId: contractId,
    });
    created++;
  } catch (err) {
    console.error('[ContractArchive] Lỗi sinh bản tóm tắt:', err);
  }

  // 2. Copy file đính kèm của hợp đồng
  try {
    const attachments = await listContractAttachments(contractId);
    for (const att of attachments) {
      try {
        const content = await getContractAttachmentContent(att.id);
        if (!content) continue;
        await insertHrDocument({
          employeeId: contract.employee_id,
          docTypeId,
          title: `${contract.contract_number} — ${att.file_name}`,
          fileName: att.file_name,
          mimeType: content.mime_type,
          buffer: content.content,
          uploadedBy: byUserId,
          sourceContractId: contractId,
        });
        created++;
      } catch (err) {
        console.error(`[ContractArchive] Lỗi copy file ${att.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[ContractArchive] Lỗi liệt kê file đính kèm:', err);
  }

  // 3. Đánh dấu đã lưu trữ
  try {
    await execute(
      `UPDATE contracts SET archived_to_docs_at = NOW() WHERE id = $1`,
      [contractId]
    );
  } catch (err) {
    console.error('[ContractArchive] Lỗi đánh dấu archived_to_docs_at:', err);
  }

  console.log(`[ContractArchive] Đã lưu trữ ${created} tài liệu từ HĐ ${contract.contract_number} vào Hồ Sơ nhân viên ${contract.employee_id}`);
  return created;
}
