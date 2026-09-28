/**
 * OTP challenge dùng chung — mô hình magic-link → trang lộ OTP → dùng OTP.
 *
 * Luồng:
 *  1) createChallenge(): sinh LINK token, email cho user. Link hiệu lực LINK_TTL.
 *  2) revealOtp(linkToken): user bấm link → sinh OTP mới, lộ 1 lần trên trang.
 *     OTP hiệu lực OTP_TTL kể từ lúc lộ (refresh = sinh mã mới, đếm lại).
 *  3) checkOtp()/consumeOtp(): app xác minh OTP người dùng nhập lại.
 *
 * Tái sử dụng cho mọi phương thức cần OTP qua cột `purpose`.
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryOne, execute } from '@/lib/db';

const LINK_TTL_MS = 30 * 60 * 1000; // link: 30 phút từ lúc gửi
const OTP_TTL_MS = 10 * 60 * 1000;  // OTP: 10 phút từ lúc lộ mã
const OTP_MAX_ATTEMPTS = 5;

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Tạo challenge + trả LINK token thô (để nhúng vào magic-link email). */
export async function createChallenge(input: {
  purpose: string;
  subjectId?: string | null;
  requestedBy?: string | null;
  email: string;
}): Promise<{ linkToken: string; challengeId: string; linkExpiresText: string }> {
  const linkToken = crypto.randomBytes(32).toString('hex');
  const id = `otpc_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  // Vô hiệu các challenge cũ chưa dùng cùng purpose+subject.
  await execute(
    `UPDATE otp_challenges SET link_expires_at = NOW() WHERE purpose = $1 AND subject_id IS NOT DISTINCT FROM $2 AND otp_consumed_at IS NULL`,
    [input.purpose, input.subjectId ?? null]
  );
  await execute(
    `INSERT INTO otp_challenges (id, purpose, subject_id, requested_by, email, link_token_hash, link_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, NOW() + INTERVAL '${LINK_TTL_MS} milliseconds')`,
    [id, input.purpose, input.subjectId ?? null, input.requestedBy ?? null, input.email, sha256(linkToken)]
  );
  return { linkToken, challengeId: id, linkExpiresText: '30 phút' };
}

/** Sinh & lưu OTP mới cho 1 challenge (theo id). Trả OTP thô. Dùng cho lộ mã / gửi trực tiếp. */
export async function issueOtpById(challengeId: string): Promise<string> {
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const otpHash = await bcrypt.hash(otp, 10);
  await execute(
    `UPDATE otp_challenges SET otp_hash = $2, otp_expires_at = NOW() + INTERVAL '${OTP_TTL_MS} milliseconds', attempts = 0 WHERE id = $1`,
    [challengeId, otpHash]
  );
  return otp;
}

/** Bấm magic-link → sinh & lộ OTP (6 số). Trả OTP thô để hiển thị 1 lần. */
export async function revealOtp(linkToken: string): Promise<{ ok: boolean; otp?: string; purpose?: string; error?: string }> {
  if (!linkToken || !/^[0-9a-f]{64}$/.test(linkToken)) return { ok: false, error: 'Liên kết không hợp lệ.' };
  const row = await queryOne<{ id: string; purpose: string; link_expires_at: string; otp_consumed_at: string | null }>(
    `SELECT id, purpose, link_expires_at, otp_consumed_at FROM otp_challenges WHERE link_token_hash = $1`,
    [sha256(linkToken)]
  );
  if (!row) return { ok: false, error: 'Liên kết không tồn tại.' };
  if (row.otp_consumed_at) return { ok: false, error: 'Mã đã được sử dụng.' };
  if (new Date(row.link_expires_at).getTime() < Date.now()) return { ok: false, error: 'Liên kết đã hết hạn. Hãy yêu cầu lại.' };

  const otp = await issueOtpById(row.id);
  return { ok: true, otp, purpose: row.purpose };
}

async function loadActive(purpose: string, subjectId?: string | null) {
  return queryOne<{ id: string; otp_hash: string | null; otp_expires_at: string | null; otp_consumed_at: string | null; attempts: number }>(
    `SELECT id, otp_hash, otp_expires_at, otp_consumed_at, attempts FROM otp_challenges
      WHERE purpose = $1 AND subject_id IS NOT DISTINCT FROM $2 AND otp_consumed_at IS NULL AND otp_hash IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [purpose, subjectId ?? null]
  );
}

/** Kiểm OTP đúng (KHÔNG tiêu thụ) — cho bước xác minh. */
export async function checkOtp(purpose: string, subjectId: string | null, otp: string): Promise<{ ok: boolean; error?: string }> {
  const row = await loadActive(purpose, subjectId);
  if (!row?.otp_hash) return { ok: false, error: 'Chưa lấy mã. Hãy mở email và bấm "Xác minh & Đăng nhập".' };
  if (!row.otp_expires_at || new Date(row.otp_expires_at).getTime() < Date.now()) return { ok: false, error: 'Mã đã hết hạn. Hãy lấy mã mới từ email.' };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: 'Nhập sai quá số lần. Hãy lấy mã mới.' };
  const match = await bcrypt.compare(otp, row.otp_hash);
  if (!match) {
    await execute(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    return { ok: false, error: 'Mã OTP không đúng.' };
  }
  return { ok: true };
}

/** Xác minh OTP + đánh dấu đã dùng (tiêu thụ) — cho bước hoàn tất. */
export async function consumeOtp(purpose: string, subjectId: string | null, otp: string): Promise<{ ok: boolean; error?: string }> {
  const res = await checkOtp(purpose, subjectId, otp);
  if (!res.ok) return res;
  const row = await loadActive(purpose, subjectId);
  if (row) await execute(`UPDATE otp_challenges SET otp_consumed_at = NOW() WHERE id = $1`, [row.id]);
  return { ok: true };
}
