import { query } from '@/lib/db';

/**
 * Thống kê hiệu suất phòng họp: tỉ lệ nhận phòng, no-show, giờ cao điểm, theo từng phòng.
 * Tính trên cửa sổ N ngày gần nhất (mặc định 30). booking_date là TEXT 'YYYY-MM-DD'.
 */

export interface RoomStat {
  room_name: string;
  bookings: number;
  hours: number;        // tổng giờ đặt
  checkedIn: number;    // số buổi đã nhận phòng
  noShow: number;       // đã duyệt nhưng không nhận, đã qua giờ
  checkInRate: number;  // %
}

export interface RoomAnalytics {
  days: number;
  from: string;
  totalBookings: number;
  occupying: number;        // số buổi "chiếm phòng" (approved/confirmed/checked_in)
  checkedIn: number;
  noShow: number;
  checkInRate: number;      // % nhận phòng trên số đã qua giờ
  totalHours: number;
  peakHours: { hour: number; count: number }[];   // phân bố theo giờ bắt đầu
  byRoom: RoomStat[];
}

const OCCUPYING = ['approved', 'confirmed', 'checked_in'];

function todayVN(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function nowMinVN(): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const h = p.find(x => x.type === 'hour')?.value ?? '0';
  const m = p.find(x => x.type === 'minute')?.value ?? '0';
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}
function toMin(t: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}
function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export async function getRoomAnalytics(days = 30, companyId: string | null = null): Promise<RoomAnalytics> {
  const today = todayVN();
  const from = addDaysISO(today, -Math.max(1, days) + 1);
  const nowMin = nowMinVN();
  const params: any[] = [from, today];
  const companyFilter = companyId
    ? `AND EXISTS (
         SELECT 1 FROM users u
         WHERE u.id::text = room_bookings.requested_by::text
           AND u.company_id::text = $3::text
       )`
    : '';
  if (companyId) params.push(companyId);

  const rows = await query<{ room_name: string; booking_date: string; start_time: string; end_time: string; status: string; checked_in_at: string | null }>(
    `SELECT room_name, booking_date, start_time, end_time, status, checked_in_at
       FROM room_bookings
      WHERE booking_date >= $1 AND booking_date <= $2
        AND status <> 'cancelled' AND status <> 'rejected'
        ${companyFilter}`,
    params,
  );

  const peak = new Array(24).fill(0);
  const roomMap = new Map<string, RoomStat>();
  let totalHours = 0, checkedIn = 0, noShow = 0, occupying = 0;

  for (const r of rows) {
    const s = toMin(r.start_time); const e = toMin(r.end_time);
    const dur = s != null && e != null && e > s ? (e - s) / 60 : 0;
    totalHours += dur;
    if (s != null) peak[Math.floor(s / 60)]++;

    const isOcc = OCCUPYING.includes(r.status);
    if (isOcc) occupying++;
    const isCheckedIn = !!r.checked_in_at;
    if (isCheckedIn) checkedIn++;

    // qua giờ = ngày trước hôm nay, hoặc hôm nay mà đã qua end_time
    const isPast = r.booking_date < today || (r.booking_date === today && e != null && e <= nowMin);
    const isNoShow = isOcc && !isCheckedIn && isPast;
    if (isNoShow) noShow++;

    const st = roomMap.get(r.room_name) ?? { room_name: r.room_name, bookings: 0, hours: 0, checkedIn: 0, noShow: 0, checkInRate: 0 };
    st.bookings++; st.hours += dur;
    if (isCheckedIn) st.checkedIn++;
    if (isNoShow) st.noShow++;
    roomMap.set(r.room_name, st);
  }

  const passedOcc = checkedIn + noShow; // số buổi chiếm phòng đã qua giờ
  const byRoom = [...roomMap.values()].map(st => ({
    ...st,
    hours: Math.round(st.hours * 10) / 10,
    checkInRate: st.checkedIn + st.noShow > 0 ? Math.round((st.checkedIn / (st.checkedIn + st.noShow)) * 100) : 0,
  })).sort((a, b) => b.bookings - a.bookings);

  return {
    days, from,
    totalBookings: rows.length,
    occupying,
    checkedIn,
    noShow,
    checkInRate: passedOcc > 0 ? Math.round((checkedIn / passedOcc) * 100) : 0,
    totalHours: Math.round(totalHours * 10) / 10,
    peakHours: peak.map((count, hour) => ({ hour, count })).filter(x => x.count > 0),
    byRoom,
  };
}
