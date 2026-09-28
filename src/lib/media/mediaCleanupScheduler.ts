import { isS3Configured } from '@/lib/storage/minioClient';
import { cleanupStalePendingMedia, cleanupTrashedMedia } from '@/lib/services/mediaService';

/**
 * Scheduler dọn rác media (MinIO):
 * - Record 'pending' bỏ ngang (xin presigned URL rồi không upload) quá MEDIA_PENDING_TTL_MINUTES (mặc định 60').
 * - Media đã soft-delete quá MEDIA_TRASH_RETENTION_DAYS (mặc định 30 ngày): xoá object trên MinIO + xoá cứng record.
 * Chạy mỗi giờ; không có S3 thì tick bỏ qua (dev). Mọi thao tác idempotent, batch 200/lượt.
 */

const INTERVAL_MS = 60 * 60 * 1000; // 60 phút
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  if (!isS3Configured()) return;
  try {
    const stale = await cleanupStalePendingMedia();
    const trashed = await cleanupTrashedMedia();
    if (stale > 0 || trashed > 0) {
      console.log(`[MediaCleanupScheduler] dọn ${stale} pending bỏ ngang, ${trashed} media đã xoá quá hạn`);
    }
  } catch (err) {
    console.error('[MediaCleanupScheduler] tick error:', err);
  }
}

export function startMediaCleanupScheduler(): void {
  if (timer) return;
  console.log('[MediaCleanupScheduler] ▶ Started (interval 60 min)');
  timer = setInterval(() => {
    tick().catch(console.error);
  }, INTERVAL_MS);
  tick().catch(console.error);
}

export function stopMediaCleanupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
