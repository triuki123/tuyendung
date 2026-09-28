/**
 * Cấu hình 19 bảng nguồn đang lưu file dạng BYTEA — dùng bởi scripts/migrate-media/index.ts
 * để di trú dữ liệu sang MinIO + bảng `media` trung tâm (migrations/302, 303).
 *
 * Xem bảng tra cứu đầy đủ trong kế hoạch đã duyệt (PK thật, cột content, cột uploader).
 */

export interface SourceTableConfig {
  /** Tên bảng trong Postgres. */
  table: string;
  /** Tên cột khoá chính dùng để cursor-paginate và UPDATE ngược lại (không phải luôn là "id"). */
  pkColumn: string;
  /** Kiểu dữ liệu của pkColumn — 'text' hoặc 'uuid' (ảnh hưởng cách so sánh/ép kiểu trong SQL). */
  pkType: 'text' | 'uuid';
  /**
   * Cột PK phụ (nếu PK thật trên production là composite, vd company_logos có PK
   * (company_id, variant) — khác thiết kế gốc chỉ company_id). Khi có giá trị, câu UPDATE
   * SET media_id sẽ dùng WHERE pkColumn = $x AND {mỗi cột trong extraPkColumns} = $y để
   * tránh ghi đè nhầm sang các dòng khác cùng pkColumn nhưng khác biến thể.
   * QUAN TRỌNG: cột này PHẢI được include trong SELECT (qua selectExtraCols) để engine
   * lấy đúng giá trị dùng trong UPDATE.
   */
  extraPkColumns?: string[];
  /** Cột chứa nội dung BYTEA cần chuyển sang MinIO. */
  contentColumn: string;
  /** Cột mime type, nếu bảng có lưu riêng. */
  mimeColumn: string | null;
  /** Cột tên file gốc, nếu có. */
  fileNameColumn: string | null;
  /** Cột kích thước (bytes), nếu có — dùng để đối chiếu, không bắt buộc vì buffer.length luôn đúng. */
  sizeColumn: string | null;
  /**
   * Cột định danh người upload, hoặc null nếu bảng không có khái niệm uploader
   * (không ghi vào media_migration_issues cho các bảng null này — đây là thiết kế gốc,
   * không phải lỗi dữ liệu).
   */
  uploaderColumn: string | null;
  /** Kiểu cột uploader — ảnh hưởng cách so sánh với users.id (TEXT). */
  uploaderType: 'text' | 'uuid' | null;
  /**
   * true khi giá trị uploaderColumn CHÍNH LÀ khoá người dùng luôn tồn tại theo thiết kế
   * (vd user_avatars.user_id) — vẫn validate qua bảng users như bình thường, cờ này chỉ
   * để tài liệu hoá ý nghĩa cột.
   */
  uploaderIsSelf?: boolean;
  /** File có công khai (visibility='public') hay riêng tư mặc định. */
  defaultVisibility: 'public' | 'private';
  /** Bảng có cột deleted_at (soft delete) — bỏ qua record đã xoá mềm khi migrate. */
  hasSoftDelete: boolean;
}

export const SOURCE_TABLES: SourceTableConfig[] = [
  {
    table: 'ticket_attachments',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'text',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'document_attachments',
    pkColumn: 'id',
    pkType: 'uuid',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'file_size',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'uuid',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'announcement_attachments',
    pkColumn: 'id',
    pkType: 'uuid',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'file_size',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'uuid',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'attendance_records',
    pkColumn: 'id',
    pkType: 'uuid',
    contentColumn: 'photo',
    mimeColumn: 'photo_mime',
    fileNameColumn: null,
    sizeColumn: null,
    uploaderColumn: 'user_id',
    uploaderType: 'uuid',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'contract_attachments',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'text',
    defaultVisibility: 'private',
    hasSoftDelete: true,
  },
  {
    table: 'hr_documents',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'text',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'hr_document_replace_requests',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'new_content',
    mimeColumn: 'new_mime_type',
    fileNameColumn: 'new_file_name',
    sizeColumn: 'new_size_bytes',
    uploaderColumn: 'requested_by',
    uploaderType: 'text',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'evaluation_attachments',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'text',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'hr_cv_pool',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'text',
    defaultVisibility: 'private',
    hasSoftDelete: true,
  },
  {
    table: 'hr_jd_pool',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'created_by',
    uploaderType: 'text',
    defaultVisibility: 'private',
    hasSoftDelete: true,
  },
  {
    table: 'requisition_attachments',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'text',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'user_avatars',
    pkColumn: 'user_id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: null,
    fileNameColumn: null,
    sizeColumn: null,
    uploaderColumn: 'user_id',
    uploaderType: 'text',
    uploaderIsSelf: true,
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'company_logos',
    pkColumn: 'company_id',
    pkType: 'uuid',
    // PK thật trên production là composite (company_id, variant) — 1 công ty có thể có
    // nhiều biến thể logo (đã xác nhận qua information_schema, khác thiết kế gốc migration 144
    // vốn chỉ khai company_id PRIMARY KEY). Không có extraPkColumns sẽ khiến UPDATE ghi đè
    // media_id giữa các variant của cùng 1 company_id — đã xảy ra thật ở lần chạy đầu.
    extraPkColumns: ['variant'],
    contentColumn: 'content',
    mimeColumn: null,
    fileNameColumn: null,
    sizeColumn: null,
    uploaderColumn: null,
    uploaderType: null,
    defaultVisibility: 'public',
    hasSoftDelete: false,
  },
  {
    table: 'signature_images',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: null,
    sizeColumn: null,
    uploaderColumn: 'user_id',
    uploaderType: 'text',
    // Phục vụ public không cần cookie qua /api/public/signature-image/[id] — giữ nguyên khi migrate.
    defaultVisibility: 'public',
    hasSoftDelete: false,
  },
  {
    table: 'solace_product_images',
    pkColumn: 'product_id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: null,
    sizeColumn: null,
    uploaderColumn: null,
    uploaderType: null,
    defaultVisibility: 'public',
    hasSoftDelete: false,
  },
  {
    table: 'ecard_images',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: null,
    sizeColumn: null,
    uploaderColumn: 'user_id',
    uploaderType: 'uuid',
    defaultVisibility: 'public',
    hasSoftDelete: false,
  },
  {
    table: 'email_attachments',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime',
    fileNameColumn: 'filename',
    sizeColumn: 'size',
    uploaderColumn: null,
    uploaderType: null,
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'expense_attachments',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'uuid',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'warehouse_photos',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: null,
    fileNameColumn: null,
    sizeColumn: null,
    uploaderColumn: null,
    uploaderType: null,
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'legal_document_files',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'uuid',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
  {
    table: 'legal_contract_files',
    pkColumn: 'id',
    pkType: 'text',
    contentColumn: 'content',
    mimeColumn: 'mime_type',
    fileNameColumn: 'file_name',
    sizeColumn: 'size_bytes',
    uploaderColumn: 'uploaded_by',
    uploaderType: 'uuid',
    defaultVisibility: 'private',
    hasSoftDelete: false,
  },
];

/**
 * Thứ tự chạy migrate thật (Phase 4) — rủi ro tăng dần: bảng nhỏ/ít quan trọng trước,
 * bảng lớn/nhiều record hoặc đã có kế hoạch riêng (P2 signed-URL) để cuối cùng.
 */
export const MIGRATION_ORDER: string[] = [
  'company_logos',
  'user_avatars',
  'signature_images',
  'solace_product_images',
  'ecard_images',
  'ticket_attachments',
  'document_attachments',
  'announcement_attachments',
  'evaluation_attachments',
  'requisition_attachments',
  'contract_attachments',
  'hr_documents',
  'hr_document_replace_requests',
  'hr_cv_pool',
  'hr_jd_pool',
  'attendance_records',
  'legal_document_files',
  'legal_contract_files',
  'warehouse_photos',
  'email_attachments',
  'expense_attachments',
];

export function getTableConfig(table: string): SourceTableConfig {
  const cfg = SOURCE_TABLES.find((t) => t.table === table);
  if (!cfg) {
    throw new Error(`Không tìm thấy cấu hình cho bảng "${table}" trong tables.config.ts`);
  }
  return cfg;
}
