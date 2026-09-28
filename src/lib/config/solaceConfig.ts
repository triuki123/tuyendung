/**
 * Cấu hình module SOLACE — định nghĩa kiểu + giá trị MẶC ĐỊNH + hàm merge.
 *
 * Lưu trong bảng system_settings (key/value JSONB) với các key `solace.*`.
 * Mọi merge đều đắp partial (từ DB) lên DEFAULT → seed rỗng KHÔNG đổi hành vi.
 * Tiền: BIGINT theo đồng VND. Giờ: chuỗi "HH:MM" (24h, giờ VN).
 */

// ─── Giờ hoạt động quán ──────────────────────────────────────────────────────
/** Lịch 1 ngày trong tuần. closed = nghỉ cả ngày. */
export interface DaySchedule {
  closed: boolean;
  openTime: string;   // "HH:MM"
  closeTime: string;  // "HH:MM"
}
export interface OperatingConfig {
  openTime: string;   // "HH:MM" — mở bán (dùng khi KHÔNG bật lịch theo thứ)
  closeTime: string;  // "HH:MM" — đóng bán (dùng khi KHÔNG bật lịch theo thứ)
  forceOpen: boolean; // true = mở bán bất kể khung giờ (nút "Mở quán")
  useWeeklySchedule: boolean;  // true = áp lịch theo thứ (weekly) thay cho openTime/closeTime
  weekly: DaySchedule[];       // 7 phần tử, index 0=Chủ Nhật … 6=Thứ 7 (khớp Date.getDay)
  shiftRemindHour: number;    // giờ (0–23) nhắc nếu chưa kết ca (mỗi tối)
  autoCloseShift: boolean;    // true = tự kết ca nếu quên
  shiftAutoCloseHour: number; // giờ (0–23) rạng sáng tự kết ca ngày hôm trước
}
// Lịch mặc định khớp quán: T2–T6 cả ngày, T7 sáng, CN nghỉ. CHỈ áp khi useWeeklySchedule=true.
export const DEFAULT_WEEKLY: DaySchedule[] = [
  { closed: true,  openTime: '07:00', closeTime: '16:00' }, // 0 CN — nghỉ
  { closed: false, openTime: '07:00', closeTime: '16:00' }, // 1 T2
  { closed: false, openTime: '07:00', closeTime: '16:00' }, // 2 T3
  { closed: false, openTime: '07:00', closeTime: '16:00' }, // 3 T4
  { closed: false, openTime: '07:00', closeTime: '16:00' }, // 4 T5
  { closed: false, openTime: '07:00', closeTime: '16:00' }, // 5 T6
  { closed: false, openTime: '07:00', closeTime: '11:00' }, // 6 T7 — sáng
];
export const DEFAULT_OPERATING: OperatingConfig = {
  openTime: '06:30',
  closeTime: '17:30',
  forceOpen: false,
  useWeeklySchedule: false,
  weekly: DEFAULT_WEEKLY,
  shiftRemindHour: 21,
  autoCloseShift: true,
  shiftAutoCloseHour: 3,
};
export const WEEKDAY_LABELS = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/** Thứ trong tuần theo giờ VN (0=CN … 6=T7) — khớp Date.getDay. */
export function vnDow(d: Date = new Date()): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

/** Khung giờ hiệu lực của 1 ngày (theo thứ nếu bật lịch tuần, ngược lại dùng khung chung). */
export function effectiveHours(cfg: OperatingConfig, dow: number): DaySchedule {
  if (cfg.useWeeklySchedule && Array.isArray(cfg.weekly) && cfg.weekly[dow]) {
    return cfg.weekly[dow];
  }
  return { closed: false, openTime: cfg.openTime, closeTime: cfg.closeTime };
}

// ─── Công nợ ─────────────────────────────────────────────────────────────────
export interface DebtConfig {
  enabled: boolean;   // cho phép mua ghi nợ
  limit: number;      // hạn mức nợ tối đa / người (đồng)
}
export const DEFAULT_DEBT: DebtConfig = {
  enabled: true,
  limit: 200_000,
};

// ─── Minigame quà tặng ───────────────────────────────────────────────────────
export interface MinigameConfig {
  enabled: boolean;          // bật/tắt minigame
  earlyMinutes: number;      // phải check-in sớm trước giờ vào làm ít nhất X phút
  dailyLimit: number;        // số quà tối đa / người / ngày
  defaultWorkStart: string;  // giờ vào làm mặc định ("HH:MM") khi user chưa cấu hình
  voucherValidMinutes: number; // mã thưởng có hạn dùng trong X phút kể từ lúc nhận
  rewardProductIds: string[];  // pool món thưởng (id sản phẩm) — khách chọn 1 trong số này
}
export const DEFAULT_MINIGAME: MinigameConfig = {
  enabled: false,
  earlyMinutes: 15,
  dailyLimit: 1,
  defaultWorkStart: '08:00',
  voucherValidMinutes: 120,
  rewardProductIds: [],
};

// ─── Ca làm (cho minigame "đến sớm") ─────────────────────────────────────────
export interface ShiftDef {
  id: string;
  label: string;      // vd "Ca 8:00"
  startTime: string;  // "HH:MM" — giờ vào làm
}
export const DEFAULT_SHIFTS: ShiftDef[] = [
  { id: 'shift-0800', label: 'Ca 8:00', startTime: '08:00' },
  { id: 'shift-0830', label: 'Ca 8:30', startTime: '08:30' },
];

// ─── Ca BÁN HÀNG (cho mở/đóng phiên ca POS) ──────────────────────────────────
// KHÁC ShiftDef ở trên (giờ-vào-làm minigame). Đây là khung ca bán: Sáng/Chiều.
export interface SalesShiftDef {
  id: string;
  label: string;      // "Ca Sáng" / "Ca Chiều"
  startTime: string;  // "HH:MM" — đầu khung ca
  endTime: string;    // "HH:MM" — cuối khung ca
}
export const DEFAULT_SALES_SHIFTS: SalesShiftDef[] = [
  { id: 'morning',   label: 'Ca Sáng',  startTime: '07:00', endTime: '11:00' },
  { id: 'afternoon', label: 'Ca Chiều', startTime: '11:01', endTime: '16:00' },
];
export function mergeSalesShifts(list?: SalesShiftDef[] | null): SalesShiftDef[] {
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_SALES_SHIFTS;
  return list
    .filter(s => s && typeof s.id === 'string' && typeof s.label === 'string')
    .map(s => ({ id: s.id, label: s.label, startTime: s.startTime || '00:00', endTime: s.endTime || '23:59' }));
}
/** Gợi ý ca theo giờ "HH:MM" (giờ VN): ca có khung chứa giờ hiện tại, không thì ca có giờ đầu gần nhất phía trước. */
export function suggestSalesShiftId(shifts: SalesShiftDef[], hhmm: string): string | null {
  if (shifts.length === 0) return null;
  const inWindow = shifts.find(s => hhmm >= s.startTime && hhmm <= s.endTime);
  if (inWindow) return inWindow.id;
  // Trước giờ mở ca đầu → ca đầu; sau giờ đóng ca cuối → ca cuối.
  const sorted = [...shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (hhmm < sorted[0].startTime) return sorted[0].id;
  return sorted[sorted.length - 1].id;
}

// ─── Tài khoản ngân hàng (VietQR chuyển khoản) ───────────────────────────────
export interface BankConfig {
  bankBin: string;     // mã BIN ngân hàng (napas), vd "970436" (Vietcombank)
  accountNo: string;   // số tài khoản nhận
  accountName: string; // tên chủ tài khoản
}
export const DEFAULT_BANK: BankConfig = {
  bankBin: '',
  accountNo: '',
  accountName: '',
};

// ─── Người nhận thông báo ────────────────────────────────────────────────────
export interface RecipientsConfig {
  order: string[];       // userIds nhận thông báo có Đơn mới
  shiftClose: string[];  // userIds nhận thông báo Kết ca
  operators: string[];   // userIds NHÂN VIÊN VẬN HÀNH: nhận nút điều khiển đơn qua bot Telegram
}
export const DEFAULT_RECIPIENTS: RecipientsConfig = {
  order: [],
  shiftClose: [],
  operators: [],
};

// ─── Ví ──────────────────────────────────────────────────────────────────────
export interface WalletConfig {
  lowBalanceThreshold: number; // báo "số dư thấp" khi ví vừa tụt xuống dưới mức này (0 = tắt)
}
export const DEFAULT_WALLET: WalletConfig = {
  lowBalanceThreshold: 20_000,
};
export function mergeWallet(p?: Partial<WalletConfig> | null): WalletConfig {
  return { ...DEFAULT_WALLET, ...(p ?? {}) };
}

// ─── Giao hàng (trong toà nhà) ───────────────────────────────────────────────
export interface DeliveryConfig {
  enabled: boolean;   // cho phép giao tận nơi (tầng/phòng)
  fee: number;        // phí giao cố định (đồng)
}
export const DEFAULT_DELIVERY: DeliveryConfig = {
  enabled: true,
  fee: 0,
};
export function mergeDelivery(p?: Partial<DeliveryConfig> | null): DeliveryConfig {
  return { ...DEFAULT_DELIVERY, ...(p ?? {}) };
}

// ─── Hàng tồn ────────────────────────────────────────────────────────────────
export interface InventoryConfig {
  allowNegativeStock: boolean; // cho bán khi tồn âm (chỉ cảnh báo)
}
export const DEFAULT_INVENTORY: InventoryConfig = {
  allowNegativeStock: true,
};

// ─── Hoá đơn (in bill) ───────────────────────────────────────────────────────
export interface ReceiptConfig {
  shopName: string;    // tên quán in trên đầu bill
  subtitle: string;    // dòng phụ dưới tên quán (để trống = ẩn)
  address: string;     // địa chỉ (để trống = ẩn)
  taxId: string;       // MST / mã số thuế (để trống = ẩn)
  footer: string;      // dòng cảm ơn cuối bill (để trống = ẩn)
  printWidth: number;  // số cột khi in cầu native (32 cho khổ 58mm, 48 cho 80mm)
}
export const DEFAULT_RECEIPT: ReceiptConfig = {
  shopName: 'SOLACE',
  subtitle: 'Quán cà phê nội bộ FADO Group',
  address: '',
  taxId: '',
  footer: 'Cảm ơn & hẹn gặp lại!',
  printWidth: 32,
};
export function mergeReceipt(p?: Partial<ReceiptConfig> | null): ReceiptConfig {
  const m = { ...DEFAULT_RECEIPT, ...(p ?? {}) };
  m.printWidth = Number.isInteger(m.printWidth) && m.printWidth >= 24 && m.printWidth <= 64 ? m.printWidth : DEFAULT_RECEIPT.printWidth;
  return m;
}

// ─── Merge helpers (đắp partial lên default) ─────────────────────────────────
export function mergeOperating(p?: Partial<OperatingConfig> | null): OperatingConfig {
  const m = { ...DEFAULT_OPERATING, ...(p ?? {}) };
  const clampHour = (h: number, d: number) => Number.isInteger(h) && h >= 0 && h <= 23 ? h : d;
  m.shiftRemindHour = clampHour(m.shiftRemindHour, DEFAULT_OPERATING.shiftRemindHour);
  m.shiftAutoCloseHour = clampHour(m.shiftAutoCloseHour, DEFAULT_OPERATING.shiftAutoCloseHour);
  m.autoCloseShift = !!m.autoCloseShift;
  m.useWeeklySchedule = !!m.useWeeklySchedule;
  // Chuẩn hoá weekly về đúng 7 phần tử (đắp default cho thiếu/sai).
  const wk = Array.isArray(m.weekly) ? m.weekly : [];
  m.weekly = DEFAULT_WEEKLY.map((d, i) => {
    const v = wk[i];
    if (!v || typeof v !== 'object') return { ...d };
    return {
      closed: !!v.closed,
      openTime: typeof v.openTime === 'string' && v.openTime ? v.openTime : d.openTime,
      closeTime: typeof v.closeTime === 'string' && v.closeTime ? v.closeTime : d.closeTime,
    };
  });
  return m;
}
export function mergeDebt(p?: Partial<DebtConfig> | null): DebtConfig {
  return { ...DEFAULT_DEBT, ...(p ?? {}) };
}
export function mergeMinigame(p?: Partial<MinigameConfig> | null): MinigameConfig {
  return { ...DEFAULT_MINIGAME, ...(p ?? {}) };
}
export function mergeBank(p?: Partial<BankConfig> | null): BankConfig {
  return { ...DEFAULT_BANK, ...(p ?? {}) };
}
export function mergeRecipients(p?: Partial<RecipientsConfig> | null): RecipientsConfig {
  return { ...DEFAULT_RECIPIENTS, ...(p ?? {}) };
}
export function mergeInventory(p?: Partial<InventoryConfig> | null): InventoryConfig {
  return { ...DEFAULT_INVENTORY, ...(p ?? {}) };
}
export function mergeShifts(p?: ShiftDef[] | null): ShiftDef[] {
  return Array.isArray(p) && p.length > 0 ? p : DEFAULT_SHIFTS;
}

/** Kiểm tra hiện tại quán có đang mở bán không (theo giờ VN + forceOpen). */
export function isShopOpen(cfg: OperatingConfig, nowHHMM: string, dow?: number): boolean {
  if (cfg.forceOpen) return true;
  const h = effectiveHours(cfg, dow ?? vnDow());
  if (h.closed) return false;
  return nowHHMM >= h.openTime && nowHHMM <= h.closeTime;
}
