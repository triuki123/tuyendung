/**
 * Gom đơn nghỉ phép theo NGÀY cho bảng công.
 *
 * Trước đây mỗi bảng tự lọc `if (lr.mode !== 'day') continue` → nghỉ NỬA BUỔI và
 * nghỉ THEO GIỜ biến mất khỏi bảng công. Ngày nghỉ hết bằng 2 đơn nửa buổi
 * (vd sáng Phép năm + chiều Nghỉ không lương) hiện ra như ngày vắng không lý do,
 * rất dễ gây tranh cãi lúc chốt công.
 *
 * Ngoài ra map cũ gán `map[ngày] = đơn` nên 2 đơn cùng ngày thì đơn sau ghi đè
 * đơn trước — nay giữ MẢNG để hiện đủ.
 */

export interface LeaveRequestRow {
  mode: string;
  day_part: string | null;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status: string;
  type_name: string | null;
  type_color: string | null;
  /** 'company' | 'insurance' | 'unpaid' — 'unpaid' là nghỉ KHÔNG lương. */
  type_paid_by?: string | null;
  /** Lý do nhân sự khai khi tạo đơn — hiện ở tooltip chip + cột Ghi Chú. */
  reason?: string | null;
}

export interface LeaveOnDay {
  name: string;
  color: string;
  status: string;
  /** Đơn nghỉ NGUYÊN NGÀY (mode='day') */
  fullDay: boolean;
  /** Buổi nghỉ với đơn nửa buổi */
  part: 'morning' | 'afternoon' | null;
  /** Khung giờ với đơn nghỉ theo giờ, vd "13:00–17:30" */
  timeRange: string | null;
  /** false = nghỉ KHÔNG lương (không được tính công). */
  paid: boolean;
  /** Lý do trên đơn (nếu có). */
  reason: string | null;
  /** Phút trong ngày của giờ bắt đầu / kết thúc (đơn nghỉ theo giờ); null nếu không có */
  startMin: number | null;
  endMin: number | null;
}

export type LeaveDayMap = Record<string, LeaveOnDay[]>;

const DEFAULT_COLOR = '#22c55e';

/** Cắt "13:00:00" → "13:00"; giữ nguyên nếu đã gọn. */
function hhmm(t?: string | null): string {
  if (!t) return '';
  return String(t).slice(0, 5);
}

/** "13:30" → 810 phút. Trả null nếu không parse được. */
function toMinutes(t?: string | null): number | null {
  const s = hhmm(t);
  if (!s) return null;
  const [hh, mm] = s.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

/**
 * Dựng map ngày → danh sách đơn nghỉ có hiệu lực (đã duyệt hoặc chờ duyệt).
 * Nhận CẢ mode='day' lẫn mode='hour' (nửa buổi / theo giờ).
 */
export function buildLeaveDayMap(rows: LeaveRequestRow[]): LeaveDayMap {
  const map: LeaveDayMap = {};
  const push = (dateKey: string, entry: LeaveOnDay) => {
    (map[dateKey] ||= []).push(entry);
  };

  for (const lr of rows) {
    if (lr.status !== 'approved' && lr.status !== 'pending') continue;
    const name = lr.type_name ?? 'Nghỉ phép';
    const color = lr.type_color ?? DEFAULT_COLOR;
    // paid_by: 'company' | 'insurance' | 'unpaid'. Thiếu dữ liệu → coi như có lương
    // (an toàn hơn: không tự dưng cắt công của người ta vì thiếu một cột).
    const paid = lr.type_paid_by !== 'unpaid';
    const reason = lr.reason?.trim() || null;

    if (lr.mode === 'day') {
      // Nghỉ nguyên ngày có thể trải nhiều ngày → bung từng ngày.
      const s = new Date(String(lr.start_date).slice(0, 10) + 'T00:00:00Z').getTime();
      const e = new Date(String(lr.end_date).slice(0, 10) + 'T00:00:00Z').getTime();
      if (Number.isNaN(s) || Number.isNaN(e)) continue;
      for (let t = s; t <= e; t += 86400000) {
        push(new Date(t).toISOString().slice(0, 10), {
          name, color, status: lr.status, fullDay: true, part: null, timeRange: null,
          startMin: null, endMin: null, paid, reason,
        });
      }
      continue;
    }

    // Nghỉ nửa buổi / theo giờ — luôn nằm trong MỘT ngày (service đã chặn khác ngày).
    const dateKey = String(lr.start_date).slice(0, 10);
    if (!dateKey) continue;
    const part = lr.day_part === 'morning' || lr.day_part === 'afternoon' ? lr.day_part : null;
    const from = hhmm(lr.start_time);
    const to = hhmm(lr.end_time);
    push(dateKey, {
      name, color, status: lr.status, fullDay: false, part,
      timeRange: !part && from && to ? `${from}–${to}` : null,
      startMin: toMinutes(lr.start_time),
      endMin: toMinutes(lr.end_time),
      paid,
      reason,
    });
  }

  return map;
}

/** Nhãn hiển thị: "Phép năm (sáng)", "Nghỉ không lương (13:00–17:30)", "… · chờ duyệt". */
export function leaveLabel(l: LeaveOnDay): string {
  const scope =
    l.part === 'morning' ? ' (sáng)'
    : l.part === 'afternoon' ? ' (chiều)'
    : l.timeRange ? ` (${l.timeRange})`
    : '';
  return `${l.name}${scope}${l.status === 'pending' ? ' · chờ duyệt' : ''}`;
}

/** Nhãn ĐẦY ĐỦ kèm lý do — dùng cho tooltip/cột ghi chú: "Nghỉ không lương: Dạ em xin nghỉ...". */
export function leaveLabelFull(l: LeaveOnDay): string {
  return l.reason ? `${leaveLabel(l)}: ${l.reason}` : leaveLabel(l);
}

/**
 * Ngày coi như NGHỈ TRỌN: có đơn nguyên ngày, HOẶC phủ kín cả buổi sáng lẫn buổi chiều.
 * Đơn nghỉ theo giờ cũng tính (vd sáng Phép năm + chiều 13:00–17:30 = trọn ngày).
 */
export function isDayFullyOff(leaves: LeaveOnDay[], lunchStartMin = 720, lunchEndMin = 780): boolean {
  if (leaves.some(l => l.fullDay)) return true;
  const cols = leaves.map(l => leaveColumn(l, lunchStartMin, lunchEndMin));
  if (cols.includes('both')) return true;
  return cols.includes('morning') && cols.includes('afternoon');
}

/**
 * Đơn nghỉ này thuộc cột nào của bảng công.
 *  - 'morning'   → cột Giờ Vào
 *  - 'afternoon' → cột Giờ Ra
 *  - 'both'      → trải ngang cả hai (nghỉ nguyên ngày, hoặc nghỉ theo giờ vắt qua trưa)
 *
 * Mốc chia lấy từ KHUNG NGHỈ TRƯA trong cấu hình chấm công (mặc định 12:00–13:00),
 * không viết cứng — công ty đổi giờ nghỉ trưa thì tự khớp theo.
 */
export function leaveColumn(
  l: LeaveOnDay,
  lunchStartMin = 720,
  lunchEndMin = 780
): 'morning' | 'afternoon' | 'both' {
  if (l.fullDay) return 'both';
  if (l.part === 'morning') return 'morning';
  if (l.part === 'afternoon') return 'afternoon';
  // Nghỉ theo giờ không khai buổi → suy theo khung giờ so với mốc nghỉ trưa.
  if (l.startMin != null && l.endMin != null) {
    if (l.endMin <= lunchStartMin) return 'morning';
    if (l.startMin >= lunchEndMin) return 'afternoon';
    return 'both'; // vắt qua trưa
  }
  return 'both'; // thiếu dữ liệu giờ → an toàn nhất là hiện trọn dòng
}

/**
 * Ngày công được hưởng từ ĐƠN NGHỈ trong ngày (không tính giờ chấm công thực tế):
 *   - Nghỉ CÓ LƯƠNG nguyên ngày            → 1
 *   - Nghỉ CÓ LƯƠNG nửa buổi / theo giờ    → 0.5
 *   - Nghỉ KHÔNG lương                     → 0 (không cộng gì)
 * Nghỉ không lương cố ý không trả số âm: nó chỉ KHÔNG cộng công, chứ không trừ
 * phần công của giờ làm thực tế trong cùng ngày.
 */
export function leaveWorkCredit(leaves: LeaveOnDay[]): number {
  const paid = leaves.filter(l => l.paid);
  if (paid.length === 0) return 0;
  if (paid.some(l => l.fullDay)) return 1;
  return 0.5;
}

/** Chia danh sách đơn nghỉ trong ngày thành 3 nhóm theo cột hiển thị. */
export function splitLeavesByColumn(
  leaves: LeaveOnDay[],
  lunchStartMin = 720,
  lunchEndMin = 780
): { morning: LeaveOnDay[]; afternoon: LeaveOnDay[]; both: LeaveOnDay[] } {
  const out = { morning: [] as LeaveOnDay[], afternoon: [] as LeaveOnDay[], both: [] as LeaveOnDay[] };
  for (const l of leaves) out[leaveColumn(l, lunchStartMin, lunchEndMin)].push(l);
  return out;
}
