import { query, queryOne, execute } from '@/lib/db';
import {
  ReminderType, ReminderSetting, SecurityConfig, TicketConfig, SchedulerConfig, HrAutomationConfig,
  RecipientRuleType, RecipientRule, SchedulerJob, SchedulerJobKey, BirthdayConfig, AccountEmailConfig,
  AssetWarrantyConfig, LegalReminderConfig, SsoConfig,
  DEFAULT_REMINDERS, DEFAULT_SECURITY, DEFAULT_RECIPIENT_RULES, DEFAULT_SCHEDULER_JOBS,
  mergeReminder, mergeSecurity, mergeTicket, mergeScheduler, mergeHrAutomation, mergeRecipientRule, mergeSchedulerJob,
  mergeBirthdayConfig, mergeAccountEmail, mergeAssetWarrantyConfig, mergeLegalReminder, mergeSsoConfig,
} from '@/lib/config/systemConfig';
import { ForecastConfig, mergeForecastConfig } from './recruitmentForecast';

/**
 * systemSettingsService — đọc/ghi cấu hình hệ thống (Nhắc nhở + Bảo mật), lưu key/value JSONB.
 *
 * - Key quy ước: `reminder.<type>` (vd 'reminder.contract'), `security.auth`.
 * - Mọi truy vấn .catch → DEFAULT (an toàn khi bảng chưa migrate).
 * - Cache TTL ngắn + invalidate khi lưu.
 */

const REMINDER_KEY = (t: ReminderType) => `reminder.${t}`;
const SECURITY_KEY = 'security.auth';
const TICKET_KEY = 'ticket.lifecycle';
const SCHEDULER_KEY = 'scheduler.hr';
const SCHEDULER_JOB_KEY = (k: SchedulerJobKey) => `scheduler.job.${k}`;
const HR_AUTOMATION_KEY = 'hr.automation';
const RECIPIENT_KEY = (t: RecipientRuleType) => `recipient.${t}`;
const BIRTHDAY_KEY = 'birthday.config';
const ACCOUNT_EMAIL_KEY = 'hr.accountEmail';
const FORECAST_KEY = 'recruitment.forecast';
const ASSET_WARRANTY_KEY = 'asset.warrantyPeriods';
const LEGAL_REMINDER_KEY = 'legal.reminderExtra';
const SSO_KEY = 'sso.provisioning';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: unknown; expires: number }>();

export function invalidateSystemSettingsCache(): void {
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
    value = null; // bảng chưa tồn tại → dùng DEFAULT
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Mốc nhắc cho 1 loại (merge DB lên DEFAULT). Reminder service gọi hàm này TRONG mỗi lần chạy. */
export async function getReminderSetting(type: ReminderType): Promise<ReminderSetting> {
  const partial = await readKey<ReminderSetting>(REMINDER_KEY(type));
  return mergeReminder(type, partial);
}

/** Nhắc Pháp Chế nâng cao: mốc quá hạn + mốc tuân thủ (merge DB lên DEFAULT). */
export async function getLegalReminderConfig(): Promise<LegalReminderConfig> {
  const partial = await readKey<LegalReminderConfig>(LEGAL_REMINDER_KEY);
  return mergeLegalReminder(partial);
}

/** Cấu hình bảo mật (merge DB lên DEFAULT). */
export async function getSecurityConfig(): Promise<SecurityConfig> {
  const partial = await readKey<SecurityConfig>(SECURITY_KEY);
  return mergeSecurity(partial);
}

/** Cấu hình vòng đời ticket (merge DB lên DEFAULT). Service auto-close/archive gọi TRONG mỗi lần chạy. */
export async function getTicketConfig(): Promise<TicketConfig> {
  const partial = await readKey<TicketConfig>(TICKET_KEY);
  return mergeTicket(partial);
}

/** Khung giờ/tần suất scheduler HR (merge DB lên DEFAULT). Scheduler gọi mỗi vòng lặp. */
export async function getSchedulerConfig(): Promise<SchedulerConfig> {
  const partial = await readKey<SchedulerConfig>(SCHEDULER_KEY);
  return mergeScheduler(partial);
}

/** Khung giờ chạy của 1 scheduler job (merge DB lên DEFAULT). Scheduler gọi mỗi vòng lặp. */
export async function getSchedulerJob(key: SchedulerJobKey): Promise<SchedulerJob> {
  const partial = await readKey<SchedulerJob>(SCHEDULER_JOB_KEY(key));
  return mergeSchedulerJob(key, partial);
}

/** Ngưỡng tự động hoá HR (merge DB lên DEFAULT). Service evaluation gọi TRONG mỗi lần chạy. */
export async function getHrAutomationConfig(): Promise<HrAutomationConfig> {
  const partial = await readKey<HrAutomationConfig>(HR_AUTOMATION_KEY);
  return mergeHrAutomation(partial);
}

/** Quy tắc người nhận cho 1 loại nhắc (merge DB lên DEFAULT). */
export async function getRecipientRule(type: RecipientRuleType): Promise<RecipientRule> {
  const partial = await readKey<RecipientRule>(RECIPIENT_KEY(type));
  return mergeRecipientRule(type, partial);
}

export interface ResolvedRecipient {
  id: string;
  name: string;
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
}

/**
 * Phân giải danh sách người nhận theo quy tắc: hợp của (vai trò) ∪ (người sửa HR
 * nếu bật) ∪ (người cụ thể). Quy tắc rỗng hoàn toàn → không ai nhận.
 */
export async function resolveRecipients(type: RecipientRuleType): Promise<ResolvedRecipient[]> {
  const rule = await getRecipientRule(type);
  const conds: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (rule.roles.length > 0) { conds.push(`role = ANY($${i})`); params.push(rule.roles); i++; }
  if (rule.includeHrEditors) {
    conds.push(`(module_permissions IS NOT NULL AND module_permissions->'hr' @> '["edit"]'::jsonb)`);
  }
  if (rule.userIds.length > 0) { conds.push(`id::text = ANY($${i})`); params.push(rule.userIds); i++; }
  if (conds.length === 0) return [];
  return query<ResolvedRecipient>(
    `SELECT id::text AS id, name, telegram_chat_id, telegram_enabled
       FROM users
      WHERE status = 'active' AND (${conds.join(' OR ')})`,
    params
  );
}

// ─── CRUD cho UI ─────────────────────────────────────────────────────────────

export interface SystemSettingView {
  key: string;
  category: string;
  value: unknown;
  updated_at: string | null;
}

/** Toàn bộ cấu hình đã RESOLVE (merge sẵn lên default) để UI/đọc tiện. */
export async function getResolvedSettings(): Promise<{
  reminders: Record<ReminderType, ReminderSetting>;
  security: SecurityConfig;
  ticket: TicketConfig;
  scheduler: SchedulerConfig;
  schedulerJobs: Record<SchedulerJobKey, SchedulerJob>;
  hrAutomation: HrAutomationConfig;
  recipientRules: Record<RecipientRuleType, RecipientRule>;
  accountEmail: AccountEmailConfig;
  assetWarranty: AssetWarrantyConfig;
  legalReminder: LegalReminderConfig;
  sso: SsoConfig;
}> {
  const types = Object.keys(DEFAULT_REMINDERS) as ReminderType[];
  const reminders = {} as Record<ReminderType, ReminderSetting>;
  for (const t of types) reminders[t] = await getReminderSetting(t);
  const security = await getSecurityConfig();
  const ticket = await getTicketConfig();
  const scheduler = await getSchedulerConfig();
  const jobKeys = Object.keys(DEFAULT_SCHEDULER_JOBS) as SchedulerJobKey[];
  const schedulerJobs = {} as Record<SchedulerJobKey, SchedulerJob>;
  for (const k of jobKeys) schedulerJobs[k] = await getSchedulerJob(k);
  const hrAutomation = await getHrAutomationConfig();
  const recipientTypes = Object.keys(DEFAULT_RECIPIENT_RULES) as RecipientRuleType[];
  const recipientRules = {} as Record<RecipientRuleType, RecipientRule>;
  for (const t of recipientTypes) recipientRules[t] = await getRecipientRule(t);
  const accountEmail = await getAccountEmailConfig();
  const assetWarranty = await getAssetWarrantyConfig();
  const legalReminder = await getLegalReminderConfig();
  const sso = await getSsoConfig();
  return { reminders, security, ticket, scheduler, schedulerJobs, hrAutomation, recipientRules, accountEmail, assetWarranty, legalReminder, sso };
}

/** Lưu 1 reminder setting. */
export async function saveReminderSetting(type: ReminderType, milestones: number[], actor: string | null): Promise<void> {
  await upsert(REMINDER_KEY(type), 'reminder', { milestones }, actor);
}

/** Lưu cấu hình bảo mật. */
export async function saveSecurityConfig(cfg: SecurityConfig, actor: string | null): Promise<void> {
  await upsert(SECURITY_KEY, 'security', cfg, actor);
}

/** Lưu nhắc Pháp Chế nâng cao. */
export async function saveLegalReminderConfig(cfg: LegalReminderConfig, actor: string | null): Promise<void> {
  await upsert(LEGAL_REMINDER_KEY, 'legal', cfg, actor);
}

/** Lưu cấu hình vòng đời ticket. */
export async function saveTicketConfig(cfg: TicketConfig, actor: string | null): Promise<void> {
  await upsert(TICKET_KEY, 'ticket', cfg, actor);
}

/** Lưu khung giờ/tần suất scheduler HR. */
export async function saveSchedulerConfig(cfg: SchedulerConfig, actor: string | null): Promise<void> {
  await upsert(SCHEDULER_KEY, 'scheduler', cfg, actor);
}

/** Lưu khung giờ chạy của 1 scheduler job. */
export async function saveSchedulerJob(key: SchedulerJobKey, job: SchedulerJob, actor: string | null): Promise<void> {
  await upsert(SCHEDULER_JOB_KEY(key), 'scheduler', job, actor);
}

/** Lưu ngưỡng tự động hoá HR. */
export async function saveHrAutomationConfig(cfg: HrAutomationConfig, actor: string | null): Promise<void> {
  await upsert(HR_AUTOMATION_KEY, 'hr', cfg, actor);
}

/** Lưu quy tắc người nhận cho 1 loại nhắc. */
export async function saveRecipientRule(type: RecipientRuleType, rule: RecipientRule, actor: string | null): Promise<void> {
  await upsert(RECIPIENT_KEY(type), 'recipient', rule, actor);
}

/** Cấu hình tính năng Sinh Nhật (merge DB lên DEFAULT). */
export async function getBirthdayConfig(): Promise<BirthdayConfig> {
  const partial = await readKey<BirthdayConfig>(BIRTHDAY_KEY);
  return mergeBirthdayConfig(partial);
}

/** Lưu cấu hình tính năng Sinh Nhật. */
export async function saveBirthdayConfig(cfg: BirthdayConfig, actor: string | null): Promise<void> {
  await upsert(BIRTHDAY_KEY, 'birthday', cfg, actor);
}

/** Cấu hình email cấp tài khoản nhân sự mới (merge DB lên DEFAULT). */
export async function getAccountEmailConfig(): Promise<AccountEmailConfig> {
  const partial = await readKey<AccountEmailConfig>(ACCOUNT_EMAIL_KEY);
  return mergeAccountEmail(partial);
}

/** Lưu cấu hình email cấp tài khoản nhân sự mới. */
export async function saveAccountEmailConfig(cfg: AccountEmailConfig, actor: string | null): Promise<void> {
  await upsert(ACCOUNT_EMAIL_KEY, 'hr', cfg, actor);
}

/** Cấu hình dự báo tuyển dụng (trọng số/tỉ lệ benchmark; merge DB lên DEFAULT). */
export async function getForecastConfig(): Promise<ForecastConfig> {
  const partial = await readKey<ForecastConfig>(FORECAST_KEY);
  return mergeForecastConfig(partial);
}

/** Lưu cấu hình dự báo tuyển dụng. */
export async function saveForecastConfig(cfg: ForecastConfig, actor: string | null): Promise<void> {
  await upsert(FORECAST_KEY, 'recruitment', cfg, actor);
}

/** Danh sách thời hạn bảo hành tài sản (merge DB lên DEFAULT). */
export async function getAssetWarrantyConfig(): Promise<AssetWarrantyConfig> {
  const partial = await readKey<AssetWarrantyConfig>(ASSET_WARRANTY_KEY);
  return mergeAssetWarrantyConfig(partial);
}

/** Lưu danh sách thời hạn bảo hành tài sản. */
export async function saveAssetWarrantyConfig(cfg: AssetWarrantyConfig, actor: string | null): Promise<void> {
  await upsert(ASSET_WARRANTY_KEY, 'asset', cfg, actor);
}

/** Cấu hình SSO provisioning (merge DB lên DEFAULT). */
export async function getSsoConfig(): Promise<SsoConfig> {
  const partial = await readKey<SsoConfig>(SSO_KEY);
  return mergeSsoConfig(partial);
}

/** Lưu cấu hình SSO provisioning. */
export async function saveSsoConfig(cfg: SsoConfig, actor: string | null): Promise<void> {
  await upsert(SSO_KEY, 'sso', cfg, actor);
}

async function upsert(key: string, category: string, value: unknown, actor: string | null): Promise<void> {
  await execute(
    `INSERT INTO system_settings (key, category, value, updated_by, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, category, JSON.stringify(value), actor]
  );
  invalidateSystemSettingsCache();
}
