/**
 * Khóa BMHS cho bản ghi Pháp Chế — bảng legal_locks (mig 292).
 *
 * Khác BMHS gốc (khóa theo nhân viên): đây khóa theo TỪNG BẢN GHI văn bản/hợp đồng.
 * Tái dùng nguyên: tầng vé HMAC 60s (src/lib/bmhs/token.ts, subject =
 * 'legal:<type>:<id>') + canManageBmhs (quyền đặt/gỡ = super_admin + module BMHS).
 *
 * Khóa chặn: xem/tải file + sửa/xóa bản ghi. KHÔNG ẩn khỏi danh sách (chủ ý — để
 * người có quyền vẫn thấy hạn gia hạn).
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { queryOne, execute } from '@/lib/db';
import { issueUnlockToken, verifyUnlockToken } from '@/lib/bmhs/token';
import { canManageBmhs } from '@/lib/services/bmhsService';
import { getEffectiveRolePermissions, type UserModulePermissions } from '@/lib/modules';

export type LegalLockEntity = 'document' | 'contract';

/** Subject của vé — gắn chặt vào đúng 1 bản ghi, vé của bản ghi khác không dùng được. */
export function lockSubject(entityType: LegalLockEntity, entityId: string): string {
  return `legal:${entityType}:${entityId}`;
}

export interface LegalLockStatus {
  locked: boolean;
  set_by_name?: string | null;
  set_at?: string | null;
}

export async function getLockStatus(entityType: LegalLockEntity, entityId: string): Promise<LegalLockStatus> {
  const row = await queryOne<{ enabled: boolean; set_at: string; set_by_name: string | null }>(
    `SELECT l.enabled, l.set_at, u.name AS set_by_name
       FROM legal_locks l LEFT JOIN users u ON u.id = l.set_by
      WHERE l.entity_type = $1 AND l.entity_id = $2`,
    [entityType, entityId]
  );
  if (!row || !row.enabled) return { locked: false };
  return { locked: true, set_by_name: row.set_by_name, set_at: row.set_at };
}

/** Đặt (hoặc đổi) mật khẩu khóa. Mật khẩu ≥ 6 ký tự — validate ở route trước khi gọi. */
export async function setLock(entityType: LegalLockEntity, entityId: string, password: string, setBy: string): Promise<void> {
  const hash = bcrypt.hashSync(password, 10);
  await execute(
    `INSERT INTO legal_locks (id, entity_type, entity_id, enabled, password_hash, set_by, set_at)
     VALUES ($1, $2, $3, TRUE, $4, $5, NOW())
     ON CONFLICT (entity_type, entity_id)
     DO UPDATE SET enabled = TRUE, password_hash = EXCLUDED.password_hash,
                   set_by = EXCLUDED.set_by, set_at = NOW()`,
    ['llk_' + crypto.randomBytes(8).toString('hex'), entityType, entityId, hash, setBy]
  );
}

export async function removeLock(entityType: LegalLockEntity, entityId: string): Promise<boolean> {
  return (await execute(
    `DELETE FROM legal_locks WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, entityId]
  )) > 0;
}

export async function verifyLockPassword(entityType: LegalLockEntity, entityId: string, password: string): Promise<boolean> {
  const row = await queryOne<{ password_hash: string; enabled: boolean }>(
    `SELECT password_hash, enabled FROM legal_locks WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, entityId]
  );
  if (!row || !row.enabled) return false;
  return bcrypt.compareSync(password, row.password_hash);
}

/** Đổi mật khẩu khóa qua luồng reset OTP (đã consumeOtp xong mới được gọi). */
export async function resetLockPassword(entityType: LegalLockEntity, entityId: string, newPassword: string, setBy: string): Promise<void> {
  await setLock(entityType, entityId, newPassword, setBy);
}

/**
 * Quyền 'lock' của module legal — người quản khóa của NHÓM PHÁP CHẾ:
 * đặt/gỡ/đổi mật khẩu từng hồ sơ + bypass không cần nhập.
 * (Song song vẫn có canManageBmhs = "chìa khóa tổng" super_admin+BMHS.)
 * Đọc quyền HIỆU LỰC qua getEffectiveRolePermissions — nhất quán với login/API,
 * và tôn trọng luật DEFAULT_OFF (super_admin không tick cũng không có).
 */
export async function canLockLegal(userId: string): Promise<boolean> {
  const u = await queryOne<{ role: string; module_permissions: UserModulePermissions | null }>(
    `SELECT role, module_permissions FROM users WHERE id::text = $1`,
    [userId.toLowerCase()]
  );
  if (!u) return false;
  const eff = getEffectiveRolePermissions(u.role as any, u.module_permissions);
  return (eff.legal ?? []).includes('lock');
}

/** Được quản lý khóa: quyền 'lock' của Pháp Chế HOẶC chìa khóa tổng BMHS. */
export async function canManageLegalLock(userId: string): Promise<boolean> {
  return (await canLockLegal(userId)) || (await canManageBmhs(userId));
}

export interface GateResult {
  allowed: boolean;
  /** true khi bị chặn vì khóa (route trả 403 requireLegalLock để client bật modal). */
  requireLock?: boolean;
}

/**
 * Cổng kiểm khóa — gọi trong route TRƯỚC khi trả nội dung/ghi thay đổi.
 * Thứ tự: chưa khóa → qua; quản trị BMHS → bypass; vé hợp lệ → qua; còn lại chặn.
 */
export async function checkLegalLockGate(
  viewerId: string,
  entityType: LegalLockEntity,
  entityId: string,
  token: string | null | undefined
): Promise<GateResult> {
  const status = await getLockStatus(entityType, entityId);
  if (!status.locked) return { allowed: true };
  // Bypass: người quản khóa (quyền 'lock' pháp chế hoặc BMHS tổng) — họ gỡ được
  // khóa nên bắt nhập mật khẩu với họ chỉ là hình thức.
  if (await canManageLegalLock(viewerId)) return { allowed: true };
  if (verifyUnlockToken(token, viewerId, lockSubject(entityType, entityId))) return { allowed: true };
  return { allowed: false, requireLock: true };
}

/** Sinh vé sau khi verify mật khẩu thành công (route verify gọi). */
export function issueLegalUnlockToken(viewerId: string, entityType: LegalLockEntity, entityId: string): string {
  return issueUnlockToken(viewerId, lockSubject(entityType, entityId));
}
