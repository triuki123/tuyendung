/** Kiểu dữ liệu dùng chung của Theo Dõi Chuyên Cần (khớp API /api/attendance/diligence). */

export interface LeaveByType {
  code: string;
  name: string;
  days: number;
  hours: number;
  count: number;
}

export interface DiligenceMetrics {
  workDays: number;
  presentDays: number;
  fullDays: number;
  onTimeDays: number;
  lateDays: number;
  lateMinutesTotal: number;
  earlyLeaveDays: number;
  earlyLeaveMinutesTotal: number;
  earlyArriveDays: number;
  stayLateDays: number;
  missingPunchDays: number;
  absentDays: number;
  leaveDays: number;
  leaveByType: LeaveByType[];
  overtimeCount: number;
  overtimeHours: number;
  adjustmentCount: number;
  totalMinutes: number;
  avgCheckIn: string | null;
  avgCheckOut: string | null;
  onTimeRate: number;
  attendanceRate: number;
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
}

export interface DiligenceUserRow {
  user_id: string;
  name: string;
  email: string;
  employee_code: string | null;
  role: string;
  company_id: string | null;
  company_name: string | null;
  department_id: string | null;
  department_name: string | null;
  sub_department_name: string | null;
  metrics: DiligenceMetrics;
}

/** Bỏ dấu tiếng Việt + lowercase để tìm kiếm không dấu. */
export function normalizeVN(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd');
}

export const GRADE_STYLE: Record<string, { badge: string; bar: string; label: string }> = {
  'A+': { badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400', bar: 'bg-emerald-500', label: 'Xuất sắc' },
  A:    { badge: 'border-teal-500/30 bg-teal-500/15 text-teal-400',          bar: 'bg-teal-500',    label: 'Tốt' },
  B:    { badge: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-400',    bar: 'bg-indigo-500',  label: 'Khá' },
  C:    { badge: 'border-amber-500/30 bg-amber-500/15 text-amber-400',       bar: 'bg-amber-500',   label: 'Trung bình' },
  D:    { badge: 'border-rose-500/30 bg-rose-500/15 text-rose-400',          bar: 'bg-rose-500',    label: 'Cần cải thiện' },
};

/** Đổi phút → chuỗi "3g 25p" gọn. */
export function fmtMinutes(mins: number): string {
  if (!mins) return '0p';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}g ${m}p`;
  if (h) return `${h}g`;
  return `${m}p`;
}
