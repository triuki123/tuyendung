/**
 * overtimeUtils.ts
 * Pure utility functions for overtime calculation — no server dependencies.
 * Can be imported safely in both client and server components.
 */

import { DEFAULT_ATTENDANCE_CONFIG } from '@/lib/config/attendanceConfig';

type OvertimeBracketConfig = { eveningStartMin: number; eveningEndMin: number; nightEndMin: number };

export interface OvertimeBrackets {
  eveningHours: number; // 17:30 – 22:00
  nightHours: number;   // 22:00 – 07:00 next day
  totalHours: number;
}

interface OvertimeCalcOptions {
  /** Chủ nhật / ngày lễ: cho phép tính tăng ca từ đầu ngày thay vì khóa từ 17:30. */
  allowDaytime?: boolean;
}

export function hasSpecialDaytimeOvertime(
  startTime: string,
  eveningHours: number,
  brackets: OvertimeBracketConfig = DEFAULT_ATTENDANCE_CONFIG.overtimeBrackets,
): boolean {
  if (eveningHours <= 0) return false;
  const [hh, mm] = startTime.split(':').map(Number);
  const startMins = (hh ?? 0) * 60 + (mm ?? 0);
  return startMins < brackets.eveningStartMin;
}

/**
 * Tính số giờ tăng ca trong từng khung giờ.
 *
 * Khung Tối  (evening): 17:30 – 22:00
 * Khung Đêm  (night)  : 22:00 – 07:00 ngày hôm sau
 *
 * @param startTime  "HH:MM"
 * @param endTime    "HH:MM" (có thể qua nửa đêm, tối đa 07:00+1)
 *
 * Ví dụ:
 *   17:30–21:30  → evening=4h,  night=0h
 *   20:00–23:00  → evening=2h,  night=1h
 *   22:00–02:00  → evening=0h,  night=4h
 *   17:30–00:30  → evening=4.5h, night=2.5h
 */
export function calculateOvertimeBrackets(
  startTime: string,
  endTime: string,
  brackets: OvertimeBracketConfig = DEFAULT_ATTENDANCE_CONFIG.overtimeBrackets,
  opts: OvertimeCalcOptions = {}
): OvertimeBrackets {
  const toMins = (t: string): number => {
    const parts = t.split(':').map(Number);
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  };

  const startMins = toMins(startTime);
  let endMins = toMins(endTime);

  // Nếu end_time ≤ start_time → end là ngày hôm sau
  if (endMins <= startMins) endMins += 24 * 60;

  const B1_START = brackets.eveningStartMin; // mặc định 1050 — 17:30
  const B1_END   = brackets.eveningEndMin;   // mặc định 1320 — 22:00
  const B2_END   = brackets.nightEndMin;     // mặc định 1860 — 07:00+1

  // Ngày thường: chỉ tính từ mốc OT tối.
  // Chủ nhật / ngày lễ: cho phép tính từ đầu ngày, toàn bộ phần trước 22:00 được gom vào bracket 1.
  const effectiveDayStart = opts.allowDaytime ? 0 : B1_START;
  const bracket1Start = opts.allowDaytime ? 0 : B1_START;

  // Giới hạn vào cửa sổ hợp lệ
  const effStart = Math.max(startMins, effectiveDayStart);
  const effEnd   = Math.min(endMins, B2_END);

  if (effEnd <= effStart) {
    return { eveningHours: 0, nightHours: 0, totalHours: 0 };
  }

  // Bracket 1: [B1_START, B1_END)
  const b1Mins = Math.max(0, Math.min(effEnd, B1_END) - Math.max(effStart, bracket1Start));

  // Bracket 2: [B1_END, B2_END)
  const b2Mins = Math.max(0, Math.min(effEnd, B2_END) - Math.max(effStart, B1_END));

  const round2 = (n: number): number => Math.round((n / 60) * 100) / 100;

  return {
    eveningHours: round2(b1Mins),
    nightHours:   round2(b2Mins),
    totalHours:   round2(b1Mins + b2Mins),
  };
}

/**
 * Format giờ tăng ca thành chuỗi đọc được.
 * Ví dụ: 2.5 → "2h30", 4 → "4h", 0.75 → "45p"
 */
export function fmtOTHours(h: number): string {
  if (h <= 0) return '0h';
  const hours = Math.floor(h);
  const mins  = Math.round((h - hours) * 60);
  if (hours === 0) return `${mins}p`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${String(mins).padStart(2, '0')}`;
}
