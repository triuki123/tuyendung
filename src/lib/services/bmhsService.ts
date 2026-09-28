/**
 * BMHS — Bảo Mật Hồ Sơ.
 * Khóa hồ sơ nhân sự (module Quản Lý Hồ Sơ): người xem phải nhập mật khẩu để xem/tải,
 * trừ chính chủ hồ sơ và super_admin có quyền BMHS. Mật khẩu do super_admin+BMHS đặt.
 */
import bcrypt from 'bcryptjs';
import { queryOne, execute } from '@/lib/db';
import { verifyUnlockToken } from '@/lib/bmhs/token';

interface BmhsRow {
  bmhs_enabled: boolean;
  bmhs_password_hash: string | null;
  bmhs_set_by: string | null;
  bmhs_set_at: string | null;
}

/** Trạng thái khóa của 1 hồ sơ. */
export async function getBmhsStatus(employeeId: string): Promise<{ enabled: boolean; set_at: string | null; set_by: string | null }> {
  const row = await queryOne<BmhsRow>(
    `SELECT bmhs_enabled, bmhs_set_by, bmhs_set_at FROM users WHERE id::text = $1`,
    [employeeId.toLowerCase()]
  );
  return { enabled: !!row?.bmhs_enabled, set_at: row?.bmhs_set_at ?? null, set_by: row?.bmhs_set_by ?? null };
}

/** Người dùng có quyền QUẢN TRỊ BMHS: role super_admin + module_permissions['bmhs'] gồm 'manage'. */
export async function canManageBmhs(userId: string): Promise<boolean> {
  const u = await queryOne<{ role: string; module_permissions: Record<string, string[]> | null }>(
    `SELECT role, module_permissions FROM users WHERE id::text = $1`,
    [userId.toLowerCase()]
  );
  if (!u || u.role !== 'super_admin') return false;
  const perms = u.module_permissions?.['bmhs'];
  return Array.isArray(perms) && perms.includes('manage');
}

/** Được bỏ qua cổng BMHS (xem/tải không cần nhập): chính chủ hồ sơ hoặc super_admin+BMHS. */
export async function canBypassBmhs(viewerId: string, employeeId: string): Promise<boolean> {
  if (viewerId.toLowerCase() === employeeId.toLowerCase()) return true;
  return canManageBmhs(viewerId);
}

/** Bật khóa + đặt mật khẩu (đã kiểm quyền ở route). */
export async function enableBmhs(employeeId: string, password: string, setBy: string): Promise<void> {
  const hash = await bcrypt.hash(password, 10);
  await execute(
    `UPDATE users SET bmhs_enabled = true, bmhs_password_hash = $2, bmhs_set_by = $3, bmhs_set_at = NOW() WHERE id::text = $1`,
    [employeeId.toLowerCase(), hash, setBy.toLowerCase()]
  );
}

/** Tắt khóa (xóa hash). */
export async function disableBmhs(employeeId: string): Promise<void> {
  await execute(
    `UPDATE users SET bmhs_enabled = false, bmhs_password_hash = NULL, bmhs_set_by = NULL, bmhs_set_at = NULL WHERE id::text = $1`,
    [employeeId.toLowerCase()]
  );
}

/** Kiểm mật khẩu khóa hồ sơ. */
export async function verifyBmhsPassword(employeeId: string, password: string): Promise<boolean> {
  if (!password) return false;
  const row = await queryOne<BmhsRow>(
    `SELECT bmhs_enabled, bmhs_password_hash FROM users WHERE id::text = $1`,
    [employeeId.toLowerCase()]
  );
  if (!row?.bmhs_enabled || !row.bmhs_password_hash) return false;
  return bcrypt.compare(password, row.bmhs_password_hash);
}

/**
 * Cổng chặn: kiểm 1 request có được xem/tải hồ sơ employeeId không.
 * - Hồ sơ không khóa → cho qua.
 * - Được bỏ qua (chủ / super_admin+BMHS) → cho qua.
 * - Có vé mở khóa hợp lệ → cho qua.
 * - Còn lại → chặn (requireBmhs = true).
 */
export async function checkBmhsGate(
  viewerId: string,
  employeeId: string,
  unlockToken?: string | null
): Promise<{ allowed: boolean; requireBmhs: boolean }> {
  const status = await getBmhsStatus(employeeId);
  if (!status.enabled) return { allowed: true, requireBmhs: false };
  if (await canBypassBmhs(viewerId, employeeId)) return { allowed: true, requireBmhs: false };
  if (verifyUnlockToken(unlockToken, viewerId, employeeId)) return { allowed: true, requireBmhs: false };
  return { allowed: false, requireBmhs: true };
}
