/**
 * solaceVoucherService — mã giảm giá Solace.
 * Loại 'percent' (value% , có thể trần max_discount) hoặc 'amount' (số tiền). Tiền BIGINT đồng.
 */
import { query, queryOne, execute } from '@/lib/db';
import { logActivity } from '@/lib/services/auditService';

export interface Voucher {
  code: string; type: 'percent' | 'amount'; value: number; min_order: number;
  max_discount: number; usage_limit: number; used_count: number; is_active: boolean; expires_at: string | null;
  is_reward?: boolean; reward_product_ids?: string[] | null; owner_user_id?: string | null;
}

const norm = (c: string) => (c ?? '').trim().toUpperCase();

export interface VoucherCheck { ok: boolean; discount: number; message: string; code?: string; isReward?: boolean; ownerUserId?: string | null }
/** Món trong đơn để tính mã thưởng (miễn phí 1 món thuộc pool). */
export interface VoucherItem { product_id: string | null; unit_price: number; qty: number }

/** Kiểm tra mã + tính số tiền giảm. KHÔNG tăng lượt dùng. items cần cho MÃ THƯỞNG. */
export async function validateVoucher(code: string, subtotal: number, items?: VoucherItem[]): Promise<VoucherCheck> {
  const v = await queryOne<Voucher>(
    `SELECT code, type, value, min_order, max_discount, usage_limit, used_count, is_active, expires_at, is_reward, reward_product_ids, owner_user_id
       FROM solace_vouchers WHERE code = $1`, [norm(code)]
  );
  if (!v) return { ok: false, discount: 0, message: 'Mã không tồn tại' };
  if (!v.is_active) return { ok: false, discount: 0, message: 'Mã đã ngưng' };
  if (v.expires_at && new Date(v.expires_at).getTime() < Date.now()) return { ok: false, discount: 0, message: 'Mã đã hết hạn' };
  if (v.usage_limit > 0 && v.used_count >= v.usage_limit) return { ok: false, discount: 0, message: 'Mã đã hết lượt' };

  // MÃ THƯỞNG (minigame): miễn phí 1 món thuộc pool — đơn phải có ít nhất 1 món hợp lệ.
  if (v.is_reward) {
    const pool = new Set((v.reward_product_ids ?? []).map(String));
    const eligible = (items ?? []).filter(it => it.product_id && pool.has(String(it.product_id)));
    if (eligible.length === 0) return { ok: false, discount: 0, message: 'Mã thưởng chỉ áp dụng cho món quà quy định — hãy thêm 1 món thưởng vào đơn' };
    const free = Math.max(...eligible.map(it => Number(it.unit_price)));  // miễn phí 1 đơn vị món thưởng giá cao nhất
    return { ok: true, discount: Math.min(free, subtotal), message: 'Áp dụng mã thưởng thành công', code: v.code, isReward: true, ownerUserId: v.owner_user_id ?? null };
  }

  if (subtotal < Number(v.min_order)) return { ok: false, discount: 0, message: `Đơn tối thiểu ${Number(v.min_order)}đ để dùng mã` };
  let discount = v.type === 'percent'
    ? Math.floor(subtotal * Number(v.value) / 100)
    : Number(v.value);
  if (v.type === 'percent' && v.max_discount > 0) discount = Math.min(discount, Number(v.max_discount));
  discount = Math.min(discount, subtotal);
  return { ok: true, discount, message: 'Áp dụng thành công', code: v.code };
}

/** Tăng lượt dùng (gọi sau khi đơn tạo thành công). Atomic + tôn trọng usage_limit. */
export async function consumeVoucher(code: string): Promise<void> {
  await execute(
    `UPDATE solace_vouchers SET used_count = used_count + 1, updated_at = NOW()
      WHERE code = $1 AND (usage_limit = 0 OR used_count < usage_limit)`, [norm(code)]
  );
}

// ─── CRUD (admin) ────────────────────────────────────────────────────────────
export async function listVouchers(): Promise<Voucher[]> {
  return query<Voucher>(
    `SELECT code, type, value, min_order, max_discount, usage_limit, used_count, is_active, expires_at
       FROM solace_vouchers ORDER BY created_at DESC`
  );
}

export interface VoucherInput {
  code: string; type: 'percent' | 'amount'; value: number; min_order?: number;
  max_discount?: number; usage_limit?: number; is_active?: boolean; expires_at?: string | null;
}

export async function upsertVoucher(input: VoucherInput, actor: string | null): Promise<void> {
  const code = norm(input.code);
  if (!code) throw new Error('Thiếu mã');
  await execute(
    `INSERT INTO solace_vouchers (code, type, value, min_order, max_discount, usage_limit, is_active, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (code) DO UPDATE SET type = EXCLUDED.type, value = EXCLUDED.value, min_order = EXCLUDED.min_order,
       max_discount = EXCLUDED.max_discount, usage_limit = EXCLUDED.usage_limit, is_active = EXCLUDED.is_active,
       expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
    [code, input.type, Math.round(input.value) || 0, Math.round(input.min_order ?? 0), Math.round(input.max_discount ?? 0),
     Math.round(input.usage_limit ?? 0), input.is_active ?? true, input.expires_at || null]
  );
  void logActivity({ action: 'solace_voucher_saved', details: `Lưu mã giảm giá ${code}`, performedBy: actor ?? 'System' }).catch(() => {});
}

export async function deleteVoucher(code: string, actor: string | null): Promise<void> {
  await execute(`DELETE FROM solace_vouchers WHERE code = $1`, [norm(code)]);
  void logActivity({ action: 'solace_voucher_deleted', details: `Xoá mã giảm giá ${norm(code)}`, performedBy: actor ?? 'System' }).catch(() => {});
}
