/**
 * solaceSettingsService — đọc/ghi cấu hình module SOLACE (lưu system_settings, key `solace.*`).
 *
 * - Mọi truy vấn .catch → DEFAULT (an toàn khi bảng chưa migrate).
 * - Cache TTL ngắn + invalidate khi lưu (giống systemSettingsService).
 */
import { query, queryOne, execute } from '@/lib/db';
import {
  OperatingConfig, DebtConfig, MinigameConfig, BankConfig, RecipientsConfig, InventoryConfig, WalletConfig, DeliveryConfig, ShiftDef, SalesShiftDef, ReceiptConfig,
  mergeOperating, mergeDebt, mergeMinigame, mergeBank, mergeRecipients, mergeInventory, mergeWallet, mergeDelivery, mergeShifts, mergeSalesShifts, mergeReceipt,
} from '@/lib/config/solaceConfig';

const K = {
  operating: 'solace.operating',
  debt: 'solace.debt',
  minigame: 'solace.minigame',
  bank: 'solace.bank',
  recipients: 'solace.recipients',
  inventory: 'solace.inventory',
  wallet: 'solace.wallet',
  delivery: 'solace.delivery',
  shifts: 'solace.shifts',
  salesShifts: 'solace.salesShifts',
  receipt: 'solace.receipt',
} as const;

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: unknown; expires: number }>();

export function invalidateSolaceSettingsCache(): void {
  cache.clear();
}

async function readKey<T>(key: string): Promise<Partial<T> | null> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Partial<T> | null;
  let value: Partial<T> | null = null;
  try {
    const row = await queryOne<{ value: Partial<T> }>(
      `SELECT value FROM system_settings WHERE key = $1`, [key]
    );
    value = row?.value ?? null;
  } catch {
    value = null;
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

async function upsert(key: string, value: unknown, actor: string | null): Promise<void> {
  await execute(
    `INSERT INTO system_settings (key, category, value, updated_by, updated_at)
     VALUES ($1, 'solace', $2::jsonb, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, JSON.stringify(value), actor]
  );
  invalidateSolaceSettingsCache();
}

// ─── Getters (merge DB lên DEFAULT) ──────────────────────────────────────────
export async function getOperatingConfig(): Promise<OperatingConfig> {
  return mergeOperating(await readKey<OperatingConfig>(K.operating));
}
export async function getDebtConfig(): Promise<DebtConfig> {
  return mergeDebt(await readKey<DebtConfig>(K.debt));
}
export async function getMinigameConfig(): Promise<MinigameConfig> {
  return mergeMinigame(await readKey<MinigameConfig>(K.minigame));
}
export async function getBankConfig(): Promise<BankConfig> {
  return mergeBank(await readKey<BankConfig>(K.bank));
}
export async function getRecipientsConfig(): Promise<RecipientsConfig> {
  return mergeRecipients(await readKey<RecipientsConfig>(K.recipients));
}
export async function getInventoryConfig(): Promise<InventoryConfig> {
  return mergeInventory(await readKey<InventoryConfig>(K.inventory));
}
export async function getWalletConfig(): Promise<WalletConfig> {
  return mergeWallet(await readKey<WalletConfig>(K.wallet));
}
export async function getDeliveryConfig(): Promise<DeliveryConfig> {
  return mergeDelivery(await readKey<DeliveryConfig>(K.delivery));
}
export async function getSalesShifts(): Promise<SalesShiftDef[]> {
  return mergeSalesShifts((await readKey<{ list: SalesShiftDef[] }>(K.salesShifts))?.list ?? null);
}
export async function getShifts(): Promise<ShiftDef[]> {
  return mergeShifts((await readKey<{ list: ShiftDef[] }>(K.shifts))?.list ?? null);
}
export async function getReceiptConfig(): Promise<ReceiptConfig> {
  return mergeReceipt(await readKey<ReceiptConfig>(K.receipt));
}

/** Toàn bộ cấu hình SOLACE đã RESOLVE — tiện cho UI Cấu Hình. */
export async function getSolaceSettings() {
  return {
    operating: await getOperatingConfig(),
    debt: await getDebtConfig(),
    minigame: await getMinigameConfig(),
    bank: await getBankConfig(),
    recipients: await getRecipientsConfig(),
    inventory: await getInventoryConfig(),
    wallet: await getWalletConfig(),
    delivery: await getDeliveryConfig(),
    shifts: await getShifts(),
    receipt: await getReceiptConfig(),
  };
}

// ─── Setters ─────────────────────────────────────────────────────────────────
export async function saveOperatingConfig(cfg: OperatingConfig, actor: string | null): Promise<void> {
  await upsert(K.operating, cfg, actor);
}
export async function saveDebtConfig(cfg: DebtConfig, actor: string | null): Promise<void> {
  await upsert(K.debt, cfg, actor);
}
export async function saveMinigameConfig(cfg: MinigameConfig, actor: string | null): Promise<void> {
  await upsert(K.minigame, cfg, actor);
}
export async function saveBankConfig(cfg: BankConfig, actor: string | null): Promise<void> {
  await upsert(K.bank, cfg, actor);
}
export async function saveRecipientsConfig(cfg: RecipientsConfig, actor: string | null): Promise<void> {
  await upsert(K.recipients, cfg, actor);
}
export async function saveInventoryConfig(cfg: InventoryConfig, actor: string | null): Promise<void> {
  await upsert(K.inventory, cfg, actor);
}
export async function saveWalletConfig(cfg: WalletConfig, actor: string | null): Promise<void> {
  await upsert(K.wallet, cfg, actor);
}
export async function saveDeliveryConfig(cfg: DeliveryConfig, actor: string | null): Promise<void> {
  await upsert(K.delivery, cfg, actor);
}
export async function saveShifts(list: ShiftDef[], actor: string | null): Promise<void> {
  await upsert(K.shifts, { list }, actor);
}
export async function saveReceiptConfig(cfg: ReceiptConfig, actor: string | null): Promise<void> {
  await upsert(K.receipt, cfg, actor);
}

/** Người nhận thông báo (Đơn mới / Kết ca) đã phân giải kèm Telegram. */
export interface SolaceRecipient {
  id: string;
  name: string;
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
}
export async function resolveSolaceRecipients(kind: 'order' | 'shiftClose'): Promise<SolaceRecipient[]> {
  const cfg = await getRecipientsConfig();
  const ids = kind === 'order' ? cfg.order : cfg.shiftClose;
  if (!ids || ids.length === 0) return [];
  return query<SolaceRecipient>(
    `SELECT id::text AS id, name, telegram_chat_id, telegram_enabled
       FROM users
      WHERE status = 'active' AND id::text = ANY($1)`,
    [ids]
  );
}
