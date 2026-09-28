/**
 * bookingConfig — khung giờ slot cố định cho luồng đặt phòng họp qua Telegram.
 * File thuần TS (không import DB) để dùng cả client lẫn server.
 *
 * Hiện là hằng số; có thể đưa ra system_settings + UI sau mà không đổi chữ ký
 * generateSlots/toMin (đã tách sẵn). Slot 08:30–17:30, bước 30 phút.
 */
export interface BookingSlotConfig {
  openTime: string;    // 'HH:MM' slot đầu
  closeTime: string;   // 'HH:MM' mốc đóng (slot kết thúc tối đa)
  stepMinutes: number; // bước slot (phút)
}

export const DEFAULT_BOOKING_SLOTS: BookingSlotConfig = {
  openTime: '08:30',
  closeTime: '17:30',
  stepMinutes: 30,
};

/** 'HH:MM' → số phút từ 00:00. Trả NaN nếu sai định dạng. */
export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return NaN;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Số phút → 'HH:MM' (24h, zero-pad). */
export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 'HHMM' (callback, vd '0830') → 'HH:MM'. */
export function compactToHHMM(c: string): string {
  return `${c.slice(0, 2)}:${c.slice(2, 4)}`;
}

/** Danh sách mốc slot từ open → close (bao gồm cả close), bước stepMinutes. */
export function generateSlots(cfg: BookingSlotConfig = DEFAULT_BOOKING_SLOTS): string[] {
  const start = toMin(cfg.openTime);
  const end = toMin(cfg.closeTime);
  const step = cfg.stepMinutes > 0 ? cfg.stepMinutes : 30;
  const out: string[] = [];
  for (let t = start; t <= end; t += step) out.push(minToHHMM(t));
  return out;
}
