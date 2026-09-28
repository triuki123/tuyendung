import { purgeExpiredShortLinks } from '@/lib/services/shortLinkService';

/**
 * Dọn link rút gọn đã hết hạn quá hạn ân hạn. Chạy mỗi 12 giờ.
 * Ân hạn cấu hình qua env SHORTLINK_PURGE_GRACE_DAYS (mặc định 30 ngày).
 * Dữ liệu chỉ là text nên rất nhẹ — mục đích là giữ bảng gọn, không phải giảm tải.
 */
const INTERVAL_MS = 12 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

function graceDays(): number {
  const n = Number(process.env.SHORTLINK_PURGE_GRACE_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

async function tick(): Promise<void> {
  try {
    const n = await purgeExpiredShortLinks(graceDays());
    if (n) console.log(`[ShortLinkScheduler] đã xóa ${n} link hết hạn`);
  } catch (err) {
    console.error('[ShortLinkScheduler] tick error:', err);
  }
}

export function startShortLinkScheduler(): void {
  if (timer) return;
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
  // Chạy 1 lần sau khi boot (trễ nhẹ để không dồn tải lúc khởi động)
  setTimeout(() => { tick().catch(console.error); }, 60_000);
  console.log('[ShortLinkScheduler] started');
}

export function stopShortLinkScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
