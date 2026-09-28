import { Client as MinioClient } from 'minio';

/**
 * S3-compatible object storage client (MinIO) dùng chung cho toàn app — thay cho lưu file BYTEA
 * trực tiếp trong Postgres. Xem migrations/302_create_media_table.sql + scripts/migrate-media/
 * cho kế hoạch di trú dữ liệu cũ.
 *
 * Biến môi trường bắt buộc: S3_ENDPOINT (URL đầy đủ, vd https://assetflow-minio.fadoai.com),
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY. Tùy chọn: S3_REGION (mặc định us-east-1),
 * S3_BUCKET (bucket mặc định), S3_FORCE_PATH_STYLE (giữ để tương thích cấu hình S3 chuẩn —
 * MinIO SDK luôn dùng path-style theo mặc định nên cờ này không cần truyền riêng cho client).
 *
 * Cache trên globalThis giống pool Postgres ở db.ts — tránh Next.js dev (HMR) tạo client mới
 * mỗi lần reload code.
 */

function parseEndpoint(raw: string): { endPoint: string; port?: number; useSSL: boolean } {
  try {
    const url = new URL(raw);
    const useSSL = url.protocol === 'https:';
    const port = url.port ? Number(url.port) : undefined;
    return { endPoint: url.hostname, port, useSSL };
  } catch {
    // Cho phép truyền chỉ hostname (không có scheme) — coi như HTTPS mặc định.
    return { endPoint: raw, useSSL: true };
  }
}

function createMinioClient(): MinioClient {
  const rawEndpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!rawEndpoint || !accessKey || !secretKey) {
    throw new Error(
      'Thiếu cấu hình S3/MinIO: cần S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY trong biến môi trường.'
    );
  }

  const { endPoint, port, useSSL } = parseEndpoint(rawEndpoint);

  return new MinioClient({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    region: process.env.S3_REGION || 'us-east-1',
  });
}

const globalForMinio = globalThis as unknown as { __assetflowMinioClient?: MinioClient };

/**
 * Môi trường có đủ cấu hình S3/MinIO chưa — dùng để quyết định dual-write:
 * thiếu (dev chưa cấp key) thì các luồng upload rơi về lưu BYTEA như cũ, KHÔNG được throw.
 */
export function isS3Configured(): boolean {
  return Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

/** Client khởi tạo LƯỜI — import file này không được phép throw khi thiếu env (app không có S3 vẫn phải chạy). */
export function getMinioClient(): MinioClient {
  if (!globalForMinio.__assetflowMinioClient) {
    globalForMinio.__assetflowMinioClient = createMinioClient();
  }
  return globalForMinio.__assetflowMinioClient;
}

/** @deprecated dùng getMinioClient() — giữ Proxy để code cũ import trực tiếp không gãy. */
export const minioClient = new Proxy({} as MinioClient, {
  get(_t, prop) {
    const client = getMinioClient() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

/** Bucket mặc định dùng cho toàn hệ thống (media di trú từ BYTEA + upload mới). */
export const DEFAULT_MEDIA_BUCKET = process.env.S3_BUCKET || 'assetflow';

/** Đảm bảo bucket tồn tại — gọi 1 lần khi khởi động hoặc trước khi upload lần đầu. */
export async function ensureBucketExists(bucket: string = DEFAULT_MEDIA_BUCKET): Promise<void> {
  const exists = await minioClient.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(bucket, process.env.S3_REGION || 'us-east-1');
  }
}
