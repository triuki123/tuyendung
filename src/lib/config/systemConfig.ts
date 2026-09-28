/**
 * systemConfig.ts — NGUỒN DUY NHẤT cho hằng số cấu hình hệ thống (Nhắc nhở + Bảo mật).
 *
 * Theo skill hardcode-to-config: giá trị mặc định ở đây KHỚP CHÍNH XÁC hằng số hardcode cũ.
 * Service `systemSettingsService` đọc DB rồi merge lên các DEFAULT này; seed rỗng ⇒ hành vi y hệt.
 * File thuần TS (không import DB) → dùng được cả client lẫn server.
 */

// ─── Nhắc nhở ────────────────────────────────────────────────────────────────
/** Chỉ cấu hình MỐC NHẮC (số ngày trước hết hạn). Slot/giờ gửi giữ trong code từng service. */
export interface ReminderSetting {
  milestones: number[];
}

export type ReminderType =
  | 'contract'
  | 'leave_balance'
  | 'asset_maintenance'
  | 'evaluation'
  | 'requisition'
  | 'legal_document'
  | 'legal_contract';

/** Mặc định = đúng các mảng đang hardcode trong từng reminder service. */
export const DEFAULT_REMINDERS: Record<ReminderType, ReminderSetting> = {
  contract:          { milestones: [30, 15, 5, 1] },
  leave_balance:     { milestones: [30, 14, 7, 1] },
  asset_maintenance: { milestones: [30, 14, 7, 1] },
  evaluation:        { milestones: [7, 3, 1] },
  requisition:       { milestones: [5, 1] },
  // Pháp chế: giấy phép cần chạy thủ tục gia hạn SỚM (90 ngày) — khác hợp đồng lao động.
  legal_document:    { milestones: [90, 30, 7] },
  legal_contract:    { milestones: [60, 30, 7] },
};

// ─── Nhắc nhở Pháp Chế (nâng cao) ────────────────────────────────────────────
/**
 * Hai mảng mốc TRƯỚC hạn (legal_document/legal_contract) đã nằm ở DEFAULT_REMINDERS.
 * Đây là phần còn lại từng hardcode trong legalReminderService:
 *  - overdueMilestones: nhắc LẠI sau khi quá hạn (ngày thứ N sau hạn) — chặn spam mỗi ngày.
 *  - complianceMilestones: nhắc nghĩa vụ tuân thủ trước hạn nộp (0 = đúng ngày hạn).
 */
export interface LegalReminderConfig {
  overdueMilestones: number[];
  complianceMilestones: number[];
}

/** Mặc định = ĐÚNG hằng số hardcode cũ trong legalReminderService — deploy không đổi hành vi. */
export const DEFAULT_LEGAL_REMINDER: LegalReminderConfig = {
  overdueMilestones: [1, 7, 30],
  complianceMilestones: [7, 3, 1, 0],
};

export function mergeLegalReminder(partial: Partial<LegalReminderConfig> | null | undefined): LegalReminderConfig {
  if (!partial) return { overdueMilestones: [...DEFAULT_LEGAL_REMINDER.overdueMilestones], complianceMilestones: [...DEFAULT_LEGAL_REMINDER.complianceMilestones] };
  return {
    overdueMilestones: Array.isArray(partial.overdueMilestones) ? partial.overdueMilestones : [...DEFAULT_LEGAL_REMINDER.overdueMilestones],
    complianceMilestones: Array.isArray(partial.complianceMilestones) ? partial.complianceMilestones : [...DEFAULT_LEGAL_REMINDER.complianceMilestones],
  };
}

// ─── Bảo mật ─────────────────────────────────────────────────────────────────
export interface SecurityConfig {
  /** Thời gian sống của session cookie (ngày). Đổi chỉ áp cho phiên đăng nhập MỚI. */
  sessionDays: number;
  /** Thời hạn hiệu lực của link reset mật khẩu (giờ). */
  resetTokenHours: number;
}

/** Mặc định = giá trị hardcode cũ (authCookie 30 ngày, forgot-password 24h). */
export const DEFAULT_SECURITY: SecurityConfig = {
  sessionDays: 30,
  resetTokenHours: 24,
};

// ─── Ticket ──────────────────────────────────────────────────────────────────
export interface TicketConfig {
  /** Tự đóng ticket resolved/rejected sau N ngày không phản hồi. */
  autoCloseDays: number;
  /** Tự lưu trữ ticket đã kết thúc sau N ngày. */
  autoArchiveDays: number;
}

/** Mặc định = giá trị hardcode cũ (auto-close 3 ngày, archive 7 ngày). */
export const DEFAULT_TICKET: TicketConfig = {
  autoCloseDays: 3,
  autoArchiveDays: 7,
};

// ─── Scheduler (khung giờ chạy nhắc của các scheduler Quản Lý Hồ Sơ) ─────────
/**
 * Khung giờ + tần suất các scheduler HR (hợp đồng, đánh giá, tuyển dụng, số dư
 * phép, bảo trì tài sản). Mỗi tick so giờ VN: trùng khung sáng → slot 'am',
 * trùng khung chiều → 'pm'. windowMinutes = độ rộng cửa sổ kể từ đầu giờ.
 */
export interface SchedulerConfig {
  morningHour: number;          // giờ chạy buổi sáng (0–23)
  eveningHour: number;          // giờ chạy buổi chiều (0–23)
  windowMinutes: number;        // cửa sổ phút kể từ đầu giờ (1–59)
  checkIntervalMinutes: number; // chu kỳ quét (phút)
}

/** Mặc định = đúng hằng số cũ trong các *Scheduler.ts (9h/15h, cửa sổ 15', quét 10'). */
export const DEFAULT_SCHEDULER: SchedulerConfig = {
  morningHour: 9,
  eveningHour: 15,
  windowMinutes: 15,
  checkIntervalMinutes: 10,
};

/** Quyết định slot từ giờ:phút VN — hàm thuần (không DB). Trùng logic cũ khi dùng DEFAULT. */
export function resolveSlot(
  hour: number,
  minute: number,
  cfg: SchedulerConfig = DEFAULT_SCHEDULER,
): 'am' | 'pm' | null {
  if (hour === cfg.morningHour && minute < cfg.windowMinutes) return 'am';
  if (hour === cfg.eveningHour && minute < cfg.windowMinutes) return 'pm';
  return null;
}

// ─── Khung giờ chạy các scheduler nền (mỗi job 1 giờ riêng) ──────────────────
/**
 * Giờ chạy của từng scheduler nền chạy theo mốc giờ cố định trong ngày.
 * KHÁC với SchedulerConfig (dành cho 5 reminder HR chạy 2 slot sáng/chiều).
 * Mỗi job ở đây chạy 1 lần/ngày (hoặc theo điều kiện ngày riêng) tại `hour`.
 * `endHour` chỉ dùng cho job chạy theo KHUNG giờ (nhắc phòng họp 7h–21h).
 *
 * DEFAULT = đúng giờ hardcode cũ trong từng *Scheduler.ts → seed rỗng không đổi hành vi.
 */
export interface SchedulerJob {
  hour: number;       // giờ bắt đầu chạy (0–23)
  endHour?: number;   // giờ kết thúc khung (chỉ job chạy theo khung, vd nhắc phòng họp)
}

export type SchedulerJobKey =
  | 'onboardingDraft'
  | 'recruitmentReport'
  | 'leaveAccrual'
  | 'roomBookingReminder'
  | 'roomCheckin'
  | 'taskOverdue'
  | 'attendanceSummary'
  | 'onboardingChecklist'
  | 'archiveBookings'
  | 'ticketAutoClose'
  | 'ticketArchive'
  | 'birthdayDigest'
  | 'birthdayDaily'
  | 'solaceDebtReminder';

export const DEFAULT_SCHEDULER_JOBS: Record<SchedulerJobKey, SchedulerJob> = {
  onboardingDraft:     { hour: 9 },
  recruitmentReport:   { hour: 8 },
  leaveAccrual:        { hour: 7 },
  roomBookingReminder: { hour: 7, endHour: 21 },
  roomCheckin:         { hour: 7, endHour: 21 },
  taskOverdue:         { hour: 8 },
  attendanceSummary:   { hour: 8 },
  onboardingChecklist: { hour: 10 },
  archiveBookings:     { hour: 2 },
  ticketAutoClose:     { hour: 17 },
  ticketArchive:       { hour: 3 },
  birthdayDigest:      { hour: 8 },  // ngày 1 hằng tháng — danh sách sinh nhật trong tháng
  birthdayDaily:       { hour: 8 },  // mỗi sáng — nhắc sinh nhật BOD & Leader hôm nay
  solaceDebtReminder:  { hour: 9 },  // mỗi sáng — nhắc công nợ Solace + cảnh báo tồn kho thấp
};

/** Nhãn hiển thị (UI) + mô tả ngắn cho từng job. */
export const SCHEDULER_JOB_LABELS: Record<SchedulerJobKey, { label: string; desc: string; ranged?: boolean }> = {
  onboardingDraft:     { label: 'Tạo nháp thỏa thuận onboarding', desc: 'Tạo bản nháp trước ngày vào làm (số ngày cấu hình ở mục Tự động hoá HR)' },
  recruitmentReport:   { label: 'Báo cáo tuyển dụng tuần',        desc: 'Gửi Telegram sáng Thứ Hai' },
  leaveAccrual:        { label: 'Cộng phép năm tự động',          desc: 'Chuyển phép / cộng dần / trừ phép hết hạn' },
  roomBookingReminder: { label: 'Nhắc phòng họp sắp diễn ra',     desc: 'Quét trong khung giờ hành chính', ranged: true },
  roomCheckin:         { label: 'Tự động hoá nhận/trả phòng',     desc: 'Nhắc check-in/trả phòng + tự nhả phòng no-show', ranged: true },
  taskOverdue:         { label: 'Nhắc công việc quá hạn',         desc: 'Nhắc task/ticket quá hạn hoặc đến hạn hôm nay' },
  attendanceSummary:   { label: 'Tổng kết chấm công tháng',       desc: 'Gửi tổng kết tháng trước (ngày 1 hằng tháng)' },
  onboardingChecklist: { label: 'Nhắc onboarding tồn đọng',       desc: 'Nhắc submission chưa xử lý quá 2 ngày' },
  archiveBookings:     { label: 'Lưu trữ booking phòng họp cũ',   desc: 'Lưu trữ booking quá 7 ngày (ban đêm)' },
  ticketAutoClose:     { label: 'Tự đóng ticket tồn',             desc: 'Đóng ticket resolved/rejected quá hạn' },
  ticketArchive:       { label: 'Lưu trữ ticket đã kết thúc',     desc: 'Lưu trữ ticket kết thúc quá hạn (ban đêm)' },
  birthdayDigest:      { label: 'Sinh nhật — danh sách đầu tháng', desc: 'Gửi danh sách sinh nhật trong tháng (ngày 1 hằng tháng)' },
  birthdayDaily:       { label: 'Sinh nhật — nhắc BOD & Leader',  desc: 'Nhắc người phụ trách khi BOD & Leader sinh nhật hôm nay' },
  solaceDebtReminder:  { label: 'Solace — nhắc công nợ & tồn kho', desc: 'Nhắc thành viên còn nợ + cảnh báo nguyên liệu sắp hết (mỗi sáng)' },
};

export function mergeSchedulerJob(key: SchedulerJobKey, partial: Partial<SchedulerJob> | null | undefined): SchedulerJob {
  const d = DEFAULT_SCHEDULER_JOBS[key];
  if (!partial) return { ...d };
  const hour = Number.isInteger(partial.hour) && partial.hour! >= 0 && partial.hour! <= 23 ? partial.hour! : d.hour;
  const out: SchedulerJob = { hour };
  if (d.endHour !== undefined) {
    out.endHour = Number.isInteger(partial.endHour) && partial.endHour! >= 0 && partial.endHour! <= 23 ? partial.endHour! : d.endHour;
  }
  return out;
}

// ─── Tự động hoá HR (ngưỡng đánh giá thử việc) ───────────────────────────────
export interface HrAutomationConfig {
  /** Tự tạo thẻ đánh giá khi nhân viên còn N ngày hết thử việc. */
  evaluationAutoCreateDaysBefore: number;
  /** Quét các đánh giá sắp đến hạn trong N ngày tới để nhắc. */
  evaluationLookupDays: number;
  /**
   * Tạo nháp HĐ onboarding trước ngày vào làm N ngày (scheduler tạo khi còn ≤ N ngày).
   * Tăng N để mốc tạo không rơi vào cuối tuần (vd vào làm Thứ 2 → đặt 3 để tạo từ Thứ 6).
   */
  onboardingDraftLeadDays: number;
  /**
   * Nhắc ký HĐ đủ N lần mà chưa ký → tự báo cáo lên cấp trên (escalation) một lần.
   * Đếm cả nhắc tay lẫn nhắc tự động.
   */
  contractReminderEscalateAfter: number;
  /**
   * Tự LƯU TRỮ thẻ đánh giá đã kết luận (Đạt/Không đạt/Gia hạn) sau N ngày kể từ ngày
   * kết luận. 0 = TẮT (không tự lưu trữ — giữ hành vi cũ). Lưu trữ chỉ ẩn khỏi danh sách
   * chính, không xoá dữ liệu; xem lại qua bộ lọc "Đã lưu trữ".
   */
  evaluationAutoArchiveDays: number;
}

/** Mặc định = đúng hằng số cũ (auto-create 7 ngày, lookup 7 ngày, tạo nháp trước 1 ngày, escalate sau 3 lần nhắc, KHÔNG tự lưu trữ). */
export const DEFAULT_HR_AUTOMATION: HrAutomationConfig = {
  evaluationAutoCreateDaysBefore: 7,
  evaluationLookupDays: 7,
  onboardingDraftLeadDays: 1,
  contractReminderEscalateAfter: 3,
  evaluationAutoArchiveDays: 0,
};

// ─── Email cấp tài khoản cho nhân sự mới ─────────────────────────────────────
export interface AccountEmailConfig {
  /** Mật khẩu Zimbra mặc định điền sẵn vào form gửi email cấp tài khoản (QTV sửa được từng lần gửi). */
  zimbraDefaultPassword: string;
}

export const DEFAULT_ACCOUNT_EMAIL: AccountEmailConfig = {
  zimbraDefaultPassword: 'Miczone@Abc123',
};

export function mergeAccountEmail(partial: Partial<AccountEmailConfig> | null | undefined): AccountEmailConfig {
  const d = DEFAULT_ACCOUNT_EMAIL;
  if (!partial) return { ...d };
  return {
    zimbraDefaultPassword: typeof partial.zimbraDefaultPassword === 'string' && partial.zimbraDefaultPassword.trim()
      ? partial.zimbraDefaultPassword.trim()
      : d.zimbraDefaultPassword,
  };
}

// ─── Quy tắc người nhận thông báo (đánh giá & bảo trì tài sản) ───────────────
/**
 * Ai nhận nhắc: hợp của 3 nguồn — theo vai trò, (tuỳ chọn) người có quyền sửa HR,
 * và danh sách người cụ thể. DEFAULT khớp đúng query hardcode cũ.
 */
export interface RecipientRule {
  roles: string[];            // vai trò nhận nhắc
  includeHrEditors: boolean;  // cộng thêm user có module_permissions.hr chứa 'edit'
  userIds: string[];          // người cụ thể thêm vào
}

export type RecipientRuleType =
  | 'evaluation'
  | 'asset_maintenance'
  | 'hr_general'    // Người nhận thông báo Quản Lý Hồ Sơ (onboarding draft…) — trước ở hr_settings
  | 'room_booking'  // Người nhận thông báo Đặt Phòng Họp — trước ở room_booking_settings
  | 'birthday'      // Người nhận thông báo sinh nhật (digest đầu tháng + nhắc BOD & Leader)
  | 'legal';        // Người nhận nhắc hạn Pháp Chế (giấy phép/hợp đồng/ủy quyền/tuân thủ)

/**
 * Mặc định người nhận.
 * - evaluation/asset_maintenance: khớp điều kiện hardcode cũ trong 2 reminder service.
 * - hr_general/room_booking: trước đây CHỈ dựa trên danh sách user cụ thể (không vai trò),
 *   nên default rỗng — dữ liệu thật được di trú từ bảng cũ qua migration 168.
 */
export const DEFAULT_RECIPIENT_RULES: Record<RecipientRuleType, RecipientRule> = {
  // cũ: role IN ('admin','super_admin') OR module_permissions.hr @> ["edit"]
  evaluation:        { roles: ['admin', 'super_admin'], includeHrEditors: true,  userIds: [] },
  // cũ: role IN ('admin','super_admin')
  asset_maintenance: { roles: ['admin', 'super_admin'], includeHrEditors: false, userIds: [] },
  // cũ: chỉ danh sách user cụ thể (hr_settings.hr_notify_recipient_user_ids)
  hr_general:        { roles: [], includeHrEditors: false, userIds: [] },
  // cũ: chỉ danh sách user cụ thể (room_booking_settings.notifyRecipients)
  room_booking:      { roles: [], includeHrEditors: false, userIds: [] },
  // Sinh nhật: mặc định rỗng — HR phải cấu hình tường minh tại Cấu Hình Hệ Thống → Người nhận
  birthday:          { roles: [], includeHrEditors: false, userIds: [] },
  // Pháp chế: mặc định admin/super_admin nhận; nên cấu hình đích danh nhóm pháp chế qua UI.
  legal:             { roles: ['admin', 'super_admin'], includeHrEditors: false, userIds: [] },
};

// ─── Cấu hình tính năng Sinh Nhật ────────────────────────────────────────────
export interface BirthdayConfig {
  /** Bật/tắt toàn bộ tính năng chúc mừng sinh nhật (scheduler + popup). */
  enabled: boolean;
  /** Tên tag đánh dấu BOD & Leader (nhắc riêng đúng ngày sinh nhật). */
  vipTagName: string;
}

export const DEFAULT_BIRTHDAY_CONFIG: BirthdayConfig = {
  enabled: true,
  vipTagName: 'BOD & Leader',
};

export function mergeBirthdayConfig(partial: Partial<BirthdayConfig> | null | undefined): BirthdayConfig {
  const d = DEFAULT_BIRTHDAY_CONFIG;
  if (!partial) return { ...d };
  return {
    enabled: typeof partial.enabled === 'boolean' ? partial.enabled : d.enabled,
    vipTagName: typeof partial.vipTagName === 'string' && partial.vipTagName.trim() ? partial.vipTagName.trim() : d.vipTagName,
  };
}

// ─── Cấu hình thời hạn Bảo Hành Tài Sản ──────────────────────────────────────
/** months = 0 nghĩa là BẢO HÀNH TRỌN ĐỜI (không có ngày hết hạn). */
export interface WarrantyPeriod { id: string; label: string; months: number }
export interface AssetWarrantyConfig { periods: WarrantyPeriod[] }

/** Số tháng bảo hành tối đa cho phép cấu hình (100 năm) — trừ trọn đời (0). */
export const MAX_WARRANTY_MONTHS = 1200;
/** Giá trị đặc biệt: bảo hành trọn đời, không tính ngày hết hạn. */
export const WARRANTY_LIFETIME_MONTHS = 0;

export const DEFAULT_ASSET_WARRANTY_CONFIG: AssetWarrantyConfig = {
  periods: [
    { id: 'p1', label: '1 tháng', months: 1 },
    { id: 'p2', label: '3 tháng', months: 3 },
    { id: 'p3', label: '6 tháng', months: 6 },
    { id: 'p4', label: '1 năm', months: 12 },
    { id: 'p5', label: '2 năm', months: 24 },
    { id: 'p6', label: '3 năm', months: 36 },
    { id: 'p7', label: '5 năm', months: 60 },
    { id: 'p8', label: '10 năm', months: 120 },
    { id: 'p9', label: 'Trọn đời', months: WARRANTY_LIFETIME_MONTHS },
  ],
};

export function mergeAssetWarrantyConfig(partial: Partial<AssetWarrantyConfig> | null | undefined): AssetWarrantyConfig {
  const d = DEFAULT_ASSET_WARRANTY_CONFIG;
  if (!partial || !Array.isArray(partial.periods) || partial.periods.length === 0) return { periods: d.periods.map((p) => ({ ...p })) };
  const valid = partial.periods.filter((p) =>
    p && typeof p.label === 'string' && p.label.trim() &&
    Number.isInteger(p.months) && p.months >= 0 && p.months <= MAX_WARRANTY_MONTHS
  );
  if (valid.length === 0) return { periods: d.periods.map((p) => ({ ...p })) };
  return { periods: valid.map((p, i) => ({ id: p.id || `p${i + 1}`, label: p.label.trim(), months: p.months })) };
}

export function mergeRecipientRule(type: RecipientRuleType, partial: Partial<RecipientRule> | null | undefined): RecipientRule {
  const d = DEFAULT_RECIPIENT_RULES[type];
  if (!partial) return { ...d, roles: [...d.roles], userIds: [...d.userIds] };
  return {
    roles: Array.isArray(partial.roles) ? partial.roles : d.roles,
    includeHrEditors: typeof partial.includeHrEditors === 'boolean' ? partial.includeHrEditors : d.includeHrEditors,
    userIds: Array.isArray(partial.userIds) ? partial.userIds : d.userIds,
  };
}

// ─── Merge helpers (nông, an toàn khi DB thiếu field) ────────────────────────
export function mergeScheduler(partial: Partial<SchedulerConfig> | null | undefined): SchedulerConfig {
  if (!partial) return { ...DEFAULT_SCHEDULER };
  return { ...DEFAULT_SCHEDULER, ...partial };
}

export function mergeHrAutomation(partial: Partial<HrAutomationConfig> | null | undefined): HrAutomationConfig {
  if (!partial) return { ...DEFAULT_HR_AUTOMATION };
  return { ...DEFAULT_HR_AUTOMATION, ...partial };
}

export function mergeReminder(type: ReminderType, partial: Partial<ReminderSetting> | null | undefined): ReminderSetting {
  const d = DEFAULT_REMINDERS[type];
  if (!partial) return { ...d };
  return {
    milestones: Array.isArray(partial.milestones) && partial.milestones.length >= 0
      ? partial.milestones
      : d.milestones,
  };
}

export function mergeSecurity(partial: Partial<SecurityConfig> | null | undefined): SecurityConfig {
  if (!partial) return { ...DEFAULT_SECURITY };
  const merged = { ...DEFAULT_SECURITY, ...partial };
  // Giá trị rác (0/âm/NaN — vd DB từng lưu sessionDays=0 do ô nhập bị bỏ trống)
  // sẽ làm cookie phiên hết hạn NGAY LẬP TỨC → toàn bộ đăng nhập sập. Luôn kẹp về mặc định.
  const posInt = (v: unknown, fallback: number, max: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= max ? Math.floor(n) : fallback;
  };
  return {
    sessionDays: posInt(merged.sessionDays, DEFAULT_SECURITY.sessionDays, 365),
    resetTokenHours: posInt(merged.resetTokenHours, DEFAULT_SECURITY.resetTokenHours, 720),
  };
}

export function mergeTicket(partial: Partial<TicketConfig> | null | undefined): TicketConfig {
  if (!partial) return { ...DEFAULT_TICKET };
  return { ...DEFAULT_TICKET, ...partial };
}

// ─── Cấu hình SSO (sso.fadoai.com) ───────────────────────────────────────────
export interface SsoConfig {
  /**
   * Domain email do Zimbra quản (vd 'fadogroup.com.au'): user các domain này KHÔNG
   * tạo local user bên SSO (họ đăng nhập SSO bằng chính mật khẩu Zimbra).
   * Rỗng = không phân loại trước; SSO tự từ chối và hệ thống đánh dấu skipped_zimbra.
   */
  zimbraDomains: string[];
  /** Tự đồng bộ sang SSO khi tạo/sửa/khóa user trên trang Người Dùng. */
  autoSyncEnabled: boolean;
}

export const DEFAULT_SSO: SsoConfig = {
  zimbraDomains: [],
  autoSyncEnabled: true,
};

export function mergeSsoConfig(partial: Partial<SsoConfig> | null | undefined): SsoConfig {
  const d = DEFAULT_SSO;
  if (!partial) return { zimbraDomains: [...d.zimbraDomains], autoSyncEnabled: d.autoSyncEnabled };
  const domains = Array.isArray(partial.zimbraDomains)
    ? partial.zimbraDomains
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)
    : [...d.zimbraDomains];
  return {
    zimbraDomains: domains,
    autoSyncEnabled: typeof partial.autoSyncEnabled === 'boolean' ? partial.autoSyncEnabled : d.autoSyncEnabled,
  };
}
