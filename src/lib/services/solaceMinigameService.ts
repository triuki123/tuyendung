/**
 * solaceMinigameService — Minigame "đến sớm nhận quà".
 * Điều kiện: (Giờ vào làm − Giờ điểm danh sớm nhất hôm nay) ≥ earlyMinutes.
 * Trúng → sinh MÃ THƯỞNG (voucher is_reward) dùng-1-lần, có hạn giờ, chỉ áp cho pool món thưởng.
 */
import { query, queryOne, withTransaction } from '@/lib/db';
import { getMinigameConfig } from '@/lib/services/solaceSettingsService';
import { getLabeledRecordsForDate } from '@/lib/services/attendanceService';
import { notify } from '@/lib/notifications/engine';

/** Ngày kinh doanh hôm nay theo giờ VN (YYYY-MM-DD). */
function todayVN(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
/** "HH:MM" giờ VN từ 1 mốc thời gian. */
function hhmmVN(ts: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
}
function toMin(hhmm: string): number {
  const [h, m] = (hhmm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function genCode(): string {
  const s = (Date.now().toString(36) + Math.random().toString(36).slice(2)).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return 'QUA' + s.slice(-6);
}

export interface RewardItem { id: string; name: string; price: number }
export interface ClaimResult {
  code: string;
  expiresAt: string;          // ISO
  validMinutes: number;
  checkinTime: string;        // "HH:MM"
  workStart: string;          // "HH:MM"
  items: RewardItem[];        // pool món được chọn (miễn phí 1 món)
}

/** Giờ điểm danh sớm nhất hôm nay (HH:MM) hoặc null nếu chưa chấm. */
export async function getEarliestCheckinToday(userId: string): Promise<string | null> {
  const labeled = await getLabeledRecordsForDate(userId, todayVN());
  const first = labeled.find(x => x.label === 'check_in');
  return first ? hhmmVN(first.record.recorded_at) : null;
}

async function fetchItems(ids: string[]): Promise<RewardItem[]> {
  if (!ids?.length) return [];
  return query<RewardItem>(
    `SELECT id, name, price FROM solace_products WHERE id = ANY($1) AND is_active = TRUE ORDER BY name`, [ids]
  );
}
const remainMinutes = (expiresAt: string) => Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000));

/**
 * Quét minigame: kiểm điều kiện đến sớm + giới hạn/ngày → sinh mã thưởng.
 * - Đã nhận hôm nay mà mã còn hạn & chưa dùng → HIỆN LẠI đúng mã đó (không mất quà).
 * - Khóa nguyên tử theo user (advisory lock) → 2 lần bấm cùng lúc không sinh 2 mã.
 * Ném Error (tiếng Việt) nếu không đủ điều kiện.
 */
export async function claimMinigame(userId: string, opts?: { notify?: boolean }): Promise<ClaimResult> {
  const cfg = await getMinigameConfig();
  if (!cfg.enabled) throw new Error('Minigame hiện đang tắt');
  if (!cfg.rewardProductIds?.length) throw new Error('Quán chưa cấu hình món thưởng');

  // Giờ vào làm: ưu tiên theo nhân viên, thiếu thì dùng mặc định.
  const u = await queryOne<{ work_start_time: string | null }>(
    `SELECT work_start_time FROM users WHERE id::text = $1`, [userId]
  );
  const workStart = (u?.work_start_time && /^\d{1,2}:\d{2}$/.test(u.work_start_time)) ? u.work_start_time : cfg.defaultWorkStart;
  const checkin = await getEarliestCheckinToday(userId);
  const today = todayVN();

  let result: ClaimResult | null = null;
  let isNew = false;

  await withTransaction(async (client) => {
    // Serialize các lần claim của cùng 1 user (chống đua double-claim).
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`solace_mg_${userId}`]);

    // 1) Hiện lại mã còn hiệu lực đã nhận hôm nay.
    const ex = await client.query<{ code: string; expires_at: string; reward_product_ids: string[] | null }>(
      `SELECT v.code, v.expires_at, v.reward_product_ids
         FROM solace_minigame_claims c JOIN solace_vouchers v ON v.code = c.voucher_code
        WHERE c.user_id = $1 AND c.business_date = $2::date
          AND v.is_active AND v.used_count = 0 AND (v.expires_at IS NULL OR v.expires_at > NOW())
        ORDER BY c.created_at DESC LIMIT 1`,
      [userId, today]
    );
    if (ex.rows[0]) {
      const r = ex.rows[0];
      result = {
        code: r.code, expiresAt: r.expires_at, validMinutes: remainMinutes(r.expires_at),
        checkinTime: checkin ?? '', workStart, items: await fetchItems(r.reward_product_ids ?? cfg.rewardProductIds),
      };
      return;
    }

    // 2) Kiểm điều kiện đến sớm.
    if (!checkin) throw new Error('Chưa thấy dữ liệu điểm danh hôm nay. Bạn cần chấm công trước nhé!');
    const early = toMin(workStart) - toMin(checkin);
    if (early < cfg.earlyMinutes) {
      throw new Error(`Chưa đủ điều kiện 😅 Cần đến sớm tối thiểu ${cfg.earlyMinutes}'. Bạn điểm danh ${checkin}, giờ vào làm ${workStart} (sớm ${early > 0 ? early : 0}').`);
    }

    // 3) Giới hạn quà/ngày (đếm trong cùng transaction đã khóa).
    const cnt = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM solace_minigame_claims WHERE user_id = $1 AND business_date = $2::date`,
      [userId, today]
    );
    if (Number(cnt.rows[0]?.n ?? 0) >= cfg.dailyLimit) throw new Error('Bạn đã dùng hết lượt quà hôm nay. Hẹn gặp lại sáng mai! ☕');

    const items = await fetchItems(cfg.rewardProductIds);
    if (items.length === 0) throw new Error('Món thưởng đã ngừng bán, vui lòng báo quán');

    // 4) Sinh mã thưởng single-use + ghi nhận claim.
    const code = genCode();
    const expiresAt = new Date(Date.now() + cfg.voucherValidMinutes * 60_000).toISOString();
    await client.query(
      `INSERT INTO solace_vouchers (code, type, value, min_order, max_discount, usage_limit, is_active, expires_at, is_reward, reward_product_ids, owner_user_id)
       VALUES ($1, 'amount', 0, 0, 0, 1, TRUE, $2, TRUE, $3::jsonb, $4)`,
      [code, expiresAt, JSON.stringify(cfg.rewardProductIds), userId]
    );
    await client.query(
      `INSERT INTO solace_minigame_claims (id, user_id, business_date, voucher_code) VALUES ($1, $2, $3::date, $4)`,
      [genCode() + Date.now().toString(36), userId, today, code]
    );
    result = { code, expiresAt, validMinutes: cfg.voucherValidMinutes, checkinTime: checkin, workStart, items };
    isNew = true;
  });

  const r = result!;
  // Thông báo qua engine (in-app + bot Solace) — chỉ khi vừa sinh mã mới; mã nằm trong tin để khách luôn xem lại được.
  if (isNew && (opts?.notify ?? true)) {
    await notify('solace.minigame_reward', {
      code: r.code, expire: new Date(r.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      minutes: String(r.validMinutes), items: r.items.map(i => i.name).join(', '),
    }, { recipients: [userId], relatedId: r.code }).catch(() => {});
  }
  return r;
}
