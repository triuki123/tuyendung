import crypto from 'crypto';
import { query, queryOne, execute, buildInsert } from '@/lib/db';

/** Tiện ích rút gọn link + QR: tạo/liệt kê/xóa link, phân giải khi quét QR. */

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // bỏ ký tự dễ nhầm (0,o,1,l)

function genCode(len = 6): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export interface ShortLink {
  id: string;
  code: string;
  target_url: string;
  title: string | null;
  created_by: string | null;
  expires_at: string | null;
  active: boolean;
  click_count: number;
  created_at: string;
}

/** Chuẩn hóa URL người dùng nhập: thêm https:// nếu thiếu; chỉ chấp nhận http/https */
export function normalizeUrl(input: string): string | null {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function createShortLink(input: {
  targetUrl: string; title?: string | null; createdBy: string; expiresAt?: string | null;
}): Promise<ShortLink> {
  // sinh code duy nhất (thử vài lần)
  let code = genCode();
  for (let i = 0; i < 6; i++) {
    const exists = await queryOne(`SELECT 1 FROM short_links WHERE code = $1`, [code]);
    if (!exists) break;
    code = genCode(i >= 3 ? 7 : 6);
  }
  const { text, params } = buildInsert('short_links', {
    id: `sl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    code,
    target_url: input.targetUrl,
    title: input.title?.trim() || null,
    created_by: input.createdBy,
    expires_at: input.expiresAt ?? null,
  });
  const rows = await query<ShortLink>(text, params);
  return rows[0];
}

export async function listByUser(userId: string): Promise<ShortLink[]> {
  return query<ShortLink>(
    `SELECT * FROM short_links WHERE created_by = $1::uuid ORDER BY created_at DESC LIMIT 200`,
    [userId]
  );
}

/** Lấy link còn hiệu lực theo code (cho redirect /s/<code>) */
export async function getActiveByCode(code: string): Promise<ShortLink | null> {
  return queryOne<ShortLink>(
    `SELECT * FROM short_links WHERE code = $1 AND active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [code]
  );
}

/** Lấy theo code kể cả hết hạn (để hiện thông báo phù hợp) */
export async function getAnyByCode(code: string): Promise<ShortLink | null> {
  return queryOne<ShortLink>(`SELECT * FROM short_links WHERE code = $1`, [code]);
}

export async function incrementClick(id: string): Promise<void> {
  await execute(`UPDATE short_links SET click_count = click_count + 1 WHERE id = $1`, [id]);
}

/** Bật/tắt link (giữ lịch sử) */
export async function setActive(id: string, userId: string, active: boolean): Promise<boolean> {
  const n = await execute(
    `UPDATE short_links SET active = $3 WHERE id = $1 AND created_by = $2::uuid`,
    [id, userId, active]
  );
  return n > 0;
}

/** Xóa hẳn link của chính mình */
export async function deleteById(id: string, userId: string): Promise<boolean> {
  const n = await execute(`DELETE FROM short_links WHERE id = $1 AND created_by = $2::uuid`, [id, userId]);
  return n > 0;
}

/**
 * Dọn link đã HẾT HẠN quá `graceDays` ngày (scheduler gọi). Link vĩnh viễn
 * (expires_at NULL) không bao giờ bị xóa. Trả số link đã xóa.
 */
export async function purgeExpiredShortLinks(graceDays: number): Promise<number> {
  return execute(
    `DELETE FROM short_links
     WHERE expires_at IS NOT NULL AND expires_at < NOW() - ($1 || ' days')::interval`,
    [String(Math.max(0, graceDays))]
  );
}
