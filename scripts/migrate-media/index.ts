/**
 * Migration engine: di trú dữ liệu BYTEA từ 19 bảng nguồn sang MinIO + bảng `media` trung tâm.
 *
 * Chạy: npx ts-node scripts/migrate-media/index.ts --table=<ten_bang> [--batch-size=200] [--dry-run] [--bucket=assetflow]
 *
 * An toàn / zero-downtime:
 * - KHÔNG xoá cột content BYTEA của bảng nguồn — chỉ thêm/ghi media_id.
 * - Idempotent: điều kiện WHERE content IS NOT NULL AND media_id IS NULL nghĩa là chạy lại
 *   luôn tự động skip record đã migrate xong — an toàn để resume sau khi bị ngắt (Ctrl+C).
 * - Cursor pagination theo PK (không OFFSET) — không trôi trang khi có ghi đồng thời.
 * - Mỗi record: upload MinIO trước, rồi INSERT media + UPDATE bảng nguồn trong CÙNG 1
 *   transaction Postgres — nếu transaction fail, object trên MinIO chấp nhận mồ côi tạm
 *   (dọn sau bằng script riêng), ưu tiên không mất dữ liệu nguồn.
 * - --dry-run: chỉ đếm + validate uploader, KHÔNG ghi gì (không upload, không insert, không update).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: '.env.local' });
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: '.env' });

import { Pool, PoolClient } from 'pg';
import { Client as MinioClient } from 'minio';
import { getTableConfig, SourceTableConfig } from './tables.config';

interface CliArgs {
  table: string;
  batchSize: number;
  dryRun: boolean;
  bucket: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const found = args.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };

  const table = get('table');
  if (!table) {
    console.error('Thiếu tham số bắt buộc: --table=<ten_bang>');
    process.exit(1);
  }

  return {
    table,
    batchSize: Number(get('batch-size') || 200),
    dryRun: args.includes('--dry-run'),
    bucket: get('bucket') || process.env.S3_BUCKET || 'assetflow',
  };
}

/** Parse S3_ENDPOINT (URL đầy đủ, vd https://assetflow-minio.fadoai.com) thành tham số MinIO SDK. */
function parseS3Config(): { endPoint: string; port?: number; useSSL: boolean; accessKey: string; secretKey: string; region: string } {
  const raw = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!raw || !accessKey || !secretKey) {
    throw new Error('Thiếu cấu hình S3/MinIO: cần S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.');
  }
  let endPoint = raw;
  let port: number | undefined;
  let useSSL = true;
  try {
    const url = new URL(raw);
    endPoint = url.hostname;
    port = url.port ? Number(url.port) : undefined;
    useSSL = url.protocol === 'https:';
  } catch {
    // raw không phải URL hợp lệ — coi như hostname trần, giữ HTTPS mặc định.
  }
  return { endPoint, port, useSSL, accessKey, secretKey, region: process.env.S3_REGION || 'us-east-1' };
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Map mime type → đuôi file, dùng khi bảng nguồn không có tên file gốc (fileName null). */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf',
};

function buildObjectKey(cfg: SourceTableConfig, sourceId: string, fileName: string | null, mimeType: string): string {
  if (fileName) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${cfg.table}/${sourceId}/${safeName}`;
  }
  // Không có tên file gốc (vd company_logos, user_avatars, solace_product_images) — sinh id
  // ngẫu nhiên nhưng thêm đúng đuôi theo mime type đã biết, để MinIO console/OS nhận diện được
  // loại file qua tên (trước đây thiếu đuôi khiến icon danh sách hiển thị "file lạ" dù nội
  // dung/Content-Type vẫn đúng — chỉ là UX, không phải lỗi dữ liệu).
  const ext = MIME_TO_EXT[mimeType] || '';
  return `${cfg.table}/${sourceId}/${generateId('file')}${ext}`;
}

/**
 * Đoán mime type từ magic bytes khi bảng nguồn không lưu cột mime riêng (vd company_logos,
 * user_avatars, warehouse_photos) — tránh lưu 'application/octet-stream' cho ảnh thật, khiến
 * MinIO console/trình duyệt không preview được (chỉ tải về). Chỉ cần các định dạng phổ biến
 * dùng cho logo/avatar/ảnh chấm công; không cần bộ nhận diện đầy đủ.
 */
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

interface Report {
  total: number;
  ok: number;
  issues: { null: number; invalid: number; not_found: number };
  totalBytes: number;
}

async function validateUploader(
  pool: Pool,
  cfg: SourceTableConfig,
  rawValue: unknown
): Promise<{ uploaderId: string | null; issueReason: 'null' | 'invalid' | 'not_found' | null }> {
  if (!cfg.uploaderColumn) {
    // Bảng không có khái niệm uploader theo thiết kế gốc — không phải lỗi dữ liệu.
    return { uploaderId: null, issueReason: null };
  }
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { uploaderId: null, issueReason: 'null' };
  }

  const asText = String(rawValue).trim();
  // users.id trên production là UUID thật (schema drift so với migrations/001 gốc — xem
  // ghi chú trong migrations/302_create_media_table.sql) — bất kể uploaderColumn khai báo
  // kiểu gì ở bảng nguồn, giá trị đưa vào so sánh PHẢI là UUID hợp lệ, nếu không Postgres
  // sẽ ném lỗi ép kiểu (không phải trả về 0 dòng) khi query users.id = $1.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(asText)) {
    return { uploaderId: null, issueReason: 'invalid' };
  }

  const { rows } = await pool.query('SELECT id FROM users WHERE id = $1::uuid', [asText]);
  if (rows.length === 0) {
    return { uploaderId: null, issueReason: 'not_found' };
  }
  return { uploaderId: asText, issueReason: null };
}

async function run(): Promise<void> {
  const args = parseArgs();
  const cfg = getTableConfig(args.table);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    host: process.env.DATABASE_URL ? undefined : process.env.PGHOST || 'localhost',
    port: process.env.DATABASE_URL ? undefined : Number(process.env.PGPORT || 5432),
    user: process.env.DATABASE_URL ? undefined : process.env.PGUSER || 'postgres',
    password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD || 'postgres',
    database: process.env.DATABASE_URL ? undefined : process.env.PGDATABASE || 'assetflow',
  });

  const minio = args.dryRun ? null : new MinioClient(parseS3Config());

  if (minio) {
    const exists = await minio.bucketExists(args.bucket).catch(() => false);
    if (!exists) {
      console.log(`[migrate-media] Tạo bucket "${args.bucket}"...`);
      await minio.makeBucket(args.bucket);
    }
  }

  const pkCast = cfg.pkType === 'uuid' ? '::text' : '';
  const softDeleteClause = cfg.hasSoftDelete ? 'AND deleted_at IS NULL' : '';

  const countRes = await pool.query(
    `SELECT COUNT(*) AS n FROM ${cfg.table}
      WHERE ${cfg.contentColumn} IS NOT NULL AND media_id IS NULL ${softDeleteClause}`
  );
  const totalToMigrate = Number(countRes.rows[0].n);
  console.log(`[migrate-media] Bảng "${cfg.table}": ${totalToMigrate} record cần migrate (chưa có media_id).`);

  const report: Report = { total: 0, ok: 0, issues: { null: 0, invalid: 0, not_found: 0 }, totalBytes: 0 };

  // PK composite (vd company_logos: company_id, variant) — cursor phải so sánh row-value
  // (pk, extra1, ...) > (lastPk, lastExtra1, ...), nếu không dùng chỉ "pkColumn > lastSeenPk"
  // sẽ BỎ SÓT các dòng có cùng pkColumn nhưng khác extraPkColumns (đã gặp thật với company_logos).
  const extraCols: string[] = cfg.extraPkColumns || [];
  let lastSeenPk: string | null = null;
  let lastSeenExtras: string[] = [];
  let processed = 0;

  while (true) {
    let cursorClause = '';
    let params: any[] = [args.batchSize];
    if (lastSeenPk !== null) {
      const cursorCols = [`${cfg.pkColumn}${pkCast}`, ...extraCols].join(', ');
      const cursorParams = extraCols.map((_, i) => `$${3 + i}`);
      cursorClause = `AND (${cursorCols}) > ($2${cursorParams.length ? ', ' + cursorParams.join(', ') : ''})`;
      params = [args.batchSize, lastSeenPk, ...lastSeenExtras];
    }

    const selectCols: string = [
      `${cfg.pkColumn}${pkCast} AS pk`,
      ...extraCols.map((c, i) => `${c} AS extra_${i}`),
      cfg.contentColumn,
      cfg.mimeColumn ? `${cfg.mimeColumn} AS mime_val` : `NULL AS mime_val`,
      cfg.fileNameColumn ? `${cfg.fileNameColumn} AS filename_val` : `NULL AS filename_val`,
      cfg.uploaderColumn ? `${cfg.uploaderColumn} AS uploader_val` : `NULL AS uploader_val`,
    ].join(', ');

    const orderCols = [`${cfg.pkColumn}${pkCast}`, ...extraCols].join(', ');

    const queryResult: { rows: any[] } = await pool.query(
      `SELECT ${selectCols}
         FROM ${cfg.table}
        WHERE ${cfg.contentColumn} IS NOT NULL AND media_id IS NULL ${softDeleteClause} ${cursorClause}
        ORDER BY ${orderCols} ASC
        LIMIT $1`,
      params
    );
    const rows: any[] = queryResult.rows;

    if (rows.length === 0) break;

    for (const row of rows) {
      report.total += 1;
      const buffer: Buffer = row[cfg.contentColumn];
      // Ưu tiên mime lưu sẵn trong bảng nguồn; nếu không có/rỗng, đoán từ magic bytes (đúng
      // cho ảnh — tránh lưu 'application/octet-stream' khiến MinIO console không preview được).
      const mimeType: string = row.mime_val || sniffMimeType(buffer) || 'application/octet-stream';
      const fileName: string | null = row.filename_val;
      const uploaderRaw: unknown = row.uploader_val;
      const rowExtras: string[] = extraCols.map((_, i) => String(row[`extra_${i}`]));
      // source_id bao gồm cả extra cols khi có composite PK — tránh trùng source_id giữa
      // các dòng cùng pkColumn nhưng khác variant (object_key cũng cần khác nhau).
      const sourceId: string = rowExtras.length > 0 ? `${row.pk}__${rowExtras.join('__')}` : String(row.pk);

      const { uploaderId, issueReason } = await validateUploader(pool, cfg, uploaderRaw);
      if (issueReason) {
        report.issues[issueReason] += 1;
      } else if (cfg.uploaderColumn) {
        report.ok += 1;
      }
      report.totalBytes += buffer?.length || 0;

      if (args.dryRun) {
        lastSeenPk = String(row.pk);
        lastSeenExtras = rowExtras;
        continue;
      }

      const objectKey = buildObjectKey(cfg, sourceId, fileName, mimeType);
      const mediaId = generateId('media');

      await (minio as MinioClient).putObject(args.bucket, objectKey, buffer, buffer.length, {
        'Content-Type': mimeType,
      });

      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO media
             (id, bucket, object_key, mime_type, size_bytes, visibility, uploader_id, original_name, source_table, source_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            mediaId,
            args.bucket,
            objectKey,
            mimeType,
            buffer.length,
            cfg.defaultVisibility,
            uploaderId,
            fileName,
            cfg.table,
            sourceId,
          ]
        );

        if (issueReason) {
          await client.query(
            `INSERT INTO media_migration_issues (id, source_table, source_id, reason, raw_value, media_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [generateId('mmi'), cfg.table, sourceId, issueReason, uploaderRaw ? String(uploaderRaw) : null, mediaId]
          );
        }

        // WHERE đầy đủ theo composite PK (nếu có) — chỉ dùng pkColumn sẽ ghi đè nhầm sang
        // các dòng khác có cùng pkColumn nhưng khác extraPkColumns (vd company_logos.variant).
        const updateWhere = [`${cfg.pkColumn} = $2`, ...extraCols.map((c, i) => `${c} = $${3 + i}`)].join(' AND ');
        await client.query(
          `UPDATE ${cfg.table} SET media_id = $1 WHERE ${updateWhere}`,
          [mediaId, row.pk, ...rowExtras]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate-media] Lỗi khi migrate ${cfg.table}#${sourceId} — object đã lên MinIO (${objectKey}) nhưng chưa gắn media_id. Bỏ qua, tiếp tục record kế tiếp.`, err);
      } finally {
        client.release();
      }

      lastSeenPk = String(row.pk);
      lastSeenExtras = rowExtras;
    }

    processed += rows.length;
    console.log(`[migrate-media] ${cfg.table}: đã xử lý ${processed}/${totalToMigrate}...`);
  }

  console.log('\n=== Báo cáo ===');
  console.log(`Bảng: ${cfg.table}${args.dryRun ? ' (DRY RUN — chưa ghi gì)' : ''}`);
  console.log(`Tổng record: ${report.total}`);
  if (cfg.uploaderColumn) {
    console.log(`Uploader hợp lệ: ${report.ok}`);
    console.log(`Issue — null: ${report.issues.null}, invalid: ${report.issues.invalid}, not_found: ${report.issues.not_found}`);
  } else {
    console.log('Bảng này không có khái niệm uploader — mọi record sẽ có uploader_id = NULL (không phải lỗi).');
  }
  console.log(`Tổng dung lượng: ${(report.totalBytes / 1024 / 1024).toFixed(2)} MB`);

  await pool.end();
}

run().catch((err) => {
  console.error('[migrate-media] Lỗi không mong đợi:', err);
  process.exit(1);
});
