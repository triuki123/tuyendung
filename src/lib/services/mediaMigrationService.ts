import { pool, query, queryOne } from '@/lib/db';
import { getMinioClient, DEFAULT_MEDIA_BUCKET } from '@/lib/storage/minioClient';
import { SOURCE_TABLES, MIGRATION_ORDER, SourceTableConfig } from '../../../scripts/migrate-media/tables.config';

/**
 * Di trú dữ liệu BYTEA cũ → MinIO, chạy TRONG app (route /api/admin/media-migration)
 * vì DB prod chỉ truy cập được từ mạng nội bộ container. Logic port nguyên vẹn từ
 * scripts/migrate-media/index.ts (cursor row-value cho composite PK, validate uploader,
 * sniff mime, log media_migration_issues) — mỗi lượt gọi xử lý tối đa maxRows record
 * để không vượt timeout proxy; caller lặp tới khi remaining = 0.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/bmp': '.bmp', 'application/pdf': '.pdf',
};

function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  const hex = buffer.subarray(0, 12).toString('hex');
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (hex.startsWith('25504446')) return 'application/pdf';
  if (hex.startsWith('424d')) return 'image/bmp';
  return null;
}

function buildKey(cfg: SourceTableConfig, sourceId: string, fileName: string | null, mimeType: string): string {
  if (fileName) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${cfg.table}/${sourceId}/${safeName}`;
  }
  const ext = MIME_TO_EXT[mimeType] || '';
  return `${cfg.table}/${sourceId}/${generateId('file')}${ext}`;
}

async function validateUploader(cfg: SourceTableConfig, rawValue: unknown):
  Promise<{ uploaderId: string | null; issueReason: 'null' | 'invalid' | 'not_found' | null }> {
  if (!cfg.uploaderColumn) return { uploaderId: null, issueReason: null };
  if (rawValue === null || rawValue === undefined || rawValue === '') return { uploaderId: null, issueReason: 'null' };
  const asText = String(rawValue).trim();
  if (!UUID_RE.test(asText)) return { uploaderId: null, issueReason: 'invalid' };
  const row = await queryOne<{ id: string }>('SELECT id::text AS id FROM users WHERE id = $1::uuid', [asText]);
  if (!row) return { uploaderId: null, issueReason: 'not_found' };
  return { uploaderId: asText, issueReason: null };
}

export interface MigrationBatchReport {
  table: string;
  processed: number;
  migrated: number;
  issues: { null: number; invalid: number; not_found: number };
  failed: number;
  remaining: number;
  bytes: number;
}

function getConfig(table: string): SourceTableConfig {
  const cfg = SOURCE_TABLES.find((t) => t.table === table);
  if (!cfg) throw new Error(`Bảng "${table}" không có trong danh mục di trú`);
  return cfg;
}

/** Số record còn chờ di trú của 1 bảng. */
async function countRemaining(cfg: SourceTableConfig): Promise<number> {
  const softDeleteClause = cfg.hasSoftDelete ? 'AND deleted_at IS NULL' : '';
  const row = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM ${cfg.table} WHERE ${cfg.contentColumn} IS NOT NULL AND media_id IS NULL ${softDeleteClause}`
  );
  return Number(row?.n || 0);
}

/** Tổng quan tất cả bảng: còn bao nhiêu record + bytes BYTEA chưa di trú. */
export async function migrationStatus(): Promise<Array<{ table: string; remaining: number }>> {
  const out: Array<{ table: string; remaining: number }> = [];
  for (const t of MIGRATION_ORDER) {
    out.push({ table: t, remaining: await countRemaining(getConfig(t)) });
  }
  return out;
}

/** Di trú 1 lượt tối đa maxRows record của 1 bảng (an toàn gọi lặp lại). */
export async function migrateTableBatch(table: string, maxRows = 100): Promise<MigrationBatchReport> {
  const cfg = getConfig(table);
  const minio = getMinioClient();
  const bucket = DEFAULT_MEDIA_BUCKET;

  const pkCast = cfg.pkType === 'uuid' ? '::text' : '';
  const softDeleteClause = cfg.hasSoftDelete ? 'AND deleted_at IS NULL' : '';
  const extraCols: string[] = cfg.extraPkColumns || [];

  const report: MigrationBatchReport = {
    table, processed: 0, migrated: 0, issues: { null: 0, invalid: 0, not_found: 0 }, failed: 0, remaining: 0, bytes: 0,
  };

  const selectCols = [
    `${cfg.pkColumn}${pkCast} AS pk`,
    ...extraCols.map((c, i) => `${c} AS extra_${i}`),
    cfg.contentColumn,
    cfg.mimeColumn ? `${cfg.mimeColumn} AS mime_val` : 'NULL AS mime_val',
    cfg.fileNameColumn ? `${cfg.fileNameColumn} AS filename_val` : 'NULL AS filename_val',
    cfg.uploaderColumn ? `${cfg.uploaderColumn} AS uploader_val` : 'NULL AS uploader_val',
  ].join(', ');
  const orderCols = [`${cfg.pkColumn}${pkCast}`, ...extraCols].join(', ');

  // Không cursor giữa các lượt gọi — mỗi lượt lấy các record media_id IS NULL đầu tiên;
  // record failed trong lượt vẫn IS NULL sẽ được thử lại ở lượt sau (nếu fail mãi thì
  // caller thấy remaining không giảm và dừng — không lặp vô hạn phía server).
  const { rows } = await pool.query(
    `SELECT ${selectCols} FROM ${cfg.table}
      WHERE ${cfg.contentColumn} IS NOT NULL AND media_id IS NULL ${softDeleteClause}
      ORDER BY ${orderCols} ASC
      LIMIT $1`,
    [maxRows]
  );

  for (const row of rows) {
    report.processed += 1;
    const buffer: Buffer = row[cfg.contentColumn];
    const mimeType: string = row.mime_val || sniffMimeType(buffer) || 'application/octet-stream';
    const fileName: string | null = row.filename_val;
    const rowExtras: string[] = extraCols.map((_, i) => String(row[`extra_${i}`]));
    const sourceId: string = rowExtras.length > 0 ? `${row.pk}__${rowExtras.join('__')}` : String(row.pk);

    const { uploaderId, issueReason } = await validateUploader(cfg, row.uploader_val);
    if (issueReason) report.issues[issueReason] += 1;
    report.bytes += buffer?.length || 0;

    const objectKey = buildKey(cfg, sourceId, fileName, mimeType);
    const mediaId = generateId('media');

    try {
      await minio.putObject(bucket, objectKey, buffer, buffer.length, { 'Content-Type': mimeType });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO media
             (id, bucket, object_key, mime_type, size_bytes, visibility, uploader_id, original_name, source_table, source_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [mediaId, bucket, objectKey, mimeType, buffer.length, cfg.defaultVisibility, uploaderId, fileName, cfg.table, sourceId]
        );
        if (issueReason) {
          await client.query(
            `INSERT INTO media_migration_issues (id, source_table, source_id, reason, raw_value, media_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [generateId('mmi'), cfg.table, sourceId, issueReason, row.uploader_val ? String(row.uploader_val) : null, mediaId]
          );
        }
        const updateWhere = [`${cfg.pkColumn} = $2`, ...extraCols.map((c, i) => `${c} = $${3 + i}`)].join(' AND ');
        await client.query(`UPDATE ${cfg.table} SET media_id = $1 WHERE ${updateWhere}`, [mediaId, row.pk, ...rowExtras]);
        await client.query('COMMIT');
        report.migrated += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        report.failed += 1;
        console.error(`[media-migration] Lỗi ${cfg.table}#${sourceId}:`, err);
      } finally {
        client.release();
      }
    } catch (err) {
      report.failed += 1;
      console.error(`[media-migration] Upload lỗi ${cfg.table}#${sourceId}:`, err);
    }
  }

  report.remaining = await countRemaining(cfg);
  return report;
}

/** Verify mẫu ngẫu nhiên: đối chiếu size record media vs statObject trên MinIO. */
export async function verifyTableSample(table: string, sampleSize = 5): Promise<{
  table: string; checked: number; ok: number; mismatches: string[];
}> {
  const minio = getMinioClient();
  const rows = await query<{ id: string; bucket: string; object_key: string; size_bytes: string }>(
    `SELECT id, bucket, object_key, size_bytes::text AS size_bytes FROM media
      WHERE source_table = $1 AND deleted_at IS NULL ORDER BY RANDOM() LIMIT $2`,
    [table, sampleSize]
  );
  const mismatches: string[] = [];
  let ok = 0;
  for (const m of rows) {
    try {
      const st = await minio.statObject(m.bucket, m.object_key);
      if (Number(st.size) === Number(m.size_bytes)) ok += 1;
      else mismatches.push(`${m.id}: size DB ${m.size_bytes} ≠ MinIO ${st.size}`);
    } catch {
      mismatches.push(`${m.id}: object không tồn tại (${m.object_key})`);
    }
  }
  return { table, checked: rows.length, ok, mismatches };
}

/**
 * Dọn BYTEA sau khi bảng đã di trú 100%: SET NULL cột content các dòng ĐÃ có media_id,
 * rồi VACUUM (thường) để Postgres tái sử dụng chỗ trống. Thu nhỏ file vật lý thật sự
 * cần VACUUM FULL/pg_repack trong giờ bảo trì (lock bảng) — không làm ở đây.
 * Từ chối chạy nếu bảng còn record chưa di trú.
 */
export async function clearByteaForTable(table: string): Promise<{ table: string; cleared: number }> {
  const cfg = getConfig(table);
  const remaining = await countRemaining(cfg);
  if (remaining > 0) {
    throw new Error(`Bảng ${table} còn ${remaining} record chưa di trú — không dọn BYTEA`);
  }
  const res = await pool.query(
    `UPDATE ${cfg.table} SET ${cfg.contentColumn} = NULL
      WHERE media_id IS NOT NULL AND ${cfg.contentColumn} IS NOT NULL`
  );
  // VACUUM không chạy được trong transaction — dùng query trần trên pool.
  await pool.query(`VACUUM ${cfg.table}`);
  return { table, cleared: res.rowCount || 0 };
}
