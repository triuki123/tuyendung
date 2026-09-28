import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Trạng thái chuẩn hoá chung cho cả 3 nguồn đơn. */
type UnifiedStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface MyRequestItem {
  id: string;
  kind: 'leave' | 'adjustment' | 'overtime';
  sub_type: string;
  sub_label: string;
  start_date: string;          // YYYY-MM-DD
  end_date: string;            // YYYY-MM-DD
  day_part: 'morning' | 'afternoon' | null;
  amount_days: number | null;
  amount_hours: number | null;
  reason: string | null;
  status: UnifiedStatus;
  raw_status: string;
  approver_name: string | null;
  decided_at: string | null;
  reject_reason: string | null;
  created_at: string;
  /** Mọi id record thuộc đơn này — đơn bù công theo LÔ (batch_id) gộp N ngày thành 1 dòng, hủy phải hủy đủ N id. */
  ids: string[];
}

/** TIMESTAMPTZ qua node-pg là JS Date — chuẩn hóa về ISO để sort/hiển thị đúng (String(Date) sort theo tên thứ!). */
function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/** Nhãn tiếng Việt cho các loại bù công / công đặc biệt. */
const ADJ_LABELS: Record<string, string> = {
  bu_cong: 'Bù công',
  bu_checkin: 'Bù giờ vào',
  bu_checkout: 'Bù giờ ra',
  bu_cong_dac_biet: 'Bù công đặc thù',
  cong_tac: 'Công tác',
  wfh: 'Làm từ xa',
  lam_theo_ca: 'Làm theo ca',
};

/** Map trạng thái gốc của từng bảng về trạng thái chuẩn (cả 3 bảng đã dùng chung bộ giá trị). */
function normalizeStatus(s: string): UnifiedStatus {
  if (s === 'pending' || s === 'approved' || s === 'rejected' || s === 'cancelled') return s;
  return 'pending';
}

/**
 * GET /api/attendance/my-requests?month=&year=
 * Gộp mọi đơn liên quan chấm công CỦA CHÍNH user đăng nhập trong tháng dương lịch:
 * nghỉ phép + bù công/công đặc biệt + tăng ca. Không nhận userId từ query.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const now = new Date();
    let month = parseInt(searchParams.get('month') ?? '') || now.getMonth() + 1;
    let year = parseInt(searchParams.get('year') ?? '') || now.getFullYear();
    if (month < 1 || month > 12) month = now.getMonth() + 1;
    if (year < 2000 || year > 2100) year = now.getFullYear();

    const pad = (n: number) => String(n).padStart(2, '0');
    const monthStart = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`;

    // ── 1. Nghỉ phép ─────────────────────────────────────────────
    const leaves = await query<{
      id: string; sub_type: string; sub_label: string;
      start_date: string; end_date: string; day_part: string | null;
      total_days: number; total_hours: number | null; reason: string | null;
      status: string; approver_name: string | null;
      reviewed_at: string | null; review_note: string | null; created_at: string;
    }>(
      `SELECT lr.id,
              lt.code            AS sub_type,
              lt.name            AS sub_label,
              lr.start_date::text AS start_date,
              lr.end_date::text   AS end_date,
              lr.day_part,
              lr.total_days,
              lr.total_hours,
              lr.reason,
              lr.status,
              u.name             AS approver_name,
              lr.reviewed_at,
              lr.review_note,
              lr.created_at
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         LEFT JOIN users u   ON u.id::text = lr.reviewed_by
        WHERE lr.user_id = $1
          AND lr.start_date <= $3::date
          AND lr.end_date   >= $2::date
        ORDER BY lr.created_at DESC`,
      [userId, monthStart, monthEnd]
    );

    // ── 2. Bù công / công đặc biệt (mỗi bản ghi = 1 ngày) ────────
    const adjustments = await query<{
      id: string; batch_id: string | null; adjustment_type: string; work_date: string;
      day_part: string | null; reason: string | null; status: string;
      approver_name: string | null; reviewed_at: string | null;
      review_note: string | null; created_at: string; type_label: string | null;
    }>(
      `SELECT a.id,
              a.batch_id,
              a.adjustment_type,
              a.work_date::text AS work_date,
              a.day_part,
              a.reason,
              a.status,
              u.name AS approver_name,
              a.reviewed_at,
              a.review_note,
              a.created_at,
              lt.name AS type_label
         FROM attendance_adjustments a
         LEFT JOIN users u ON u.id::text = a.reviewed_by
         LEFT JOIN leave_types lt ON lt.code = a.adjustment_type
        WHERE a.user_id = $1
          AND a.work_date BETWEEN $2::date AND $3::date
        ORDER BY a.work_date ASC`,
      [userId, monthStart, monthEnd]
    );

    // ── 3. Tăng ca ───────────────────────────────────────────────
    const overtimes = await query<{
      id: string; work_date: string; start_time: string; end_time: string;
      evening_hours: string; night_hours: string; reason: string | null;
      status: string; approver_name: string | null; reviewed_at: string | null;
      review_note: string | null; created_at: string;
    }>(
      `SELECT o.id,
              o.work_date::text AS work_date,
              o.start_time,
              o.end_time,
              o.evening_hours,
              o.night_hours,
              o.reason,
              o.status,
              u.name AS approver_name,
              o.reviewed_at,
              o.review_note,
              o.created_at
         FROM attendance_overtime o
         LEFT JOIN users u ON u.id::text = o.reviewed_by
        WHERE o.user_id = $1
          AND o.work_date BETWEEN $2::date AND $3::date
        ORDER BY o.created_at DESC`,
      [userId, monthStart, monthEnd]
    );

    // Đơn đã HỦY: reviewed_by là NGƯỜI HỦY (service ghi đè khi cancel) — không phải người duyệt.
    const approverOf = (status: string, name: string | null) => (status === 'cancelled' ? null : name);
    // review_note đáng xem cả khi rejected LẪN cancelled (auto-cancel ghi lý do vào đây).
    const noteOf = (status: string, note: string | null) =>
      status === 'rejected' || status === 'cancelled' ? note : null;

    // Gộp bù công theo LÔ (batch_id): 1 lần xin công tác 5 ngày = 5 record → 1 dòng.
    const adjGroups = new Map<string, typeof adjustments>();
    for (const r of adjustments) {
      const key = r.batch_id || `single_${r.id}`;
      const arr = adjGroups.get(key);
      if (arr) arr.push(r);
      else adjGroups.set(key, [r]);
    }
    const adjItems: MyRequestItem[] = Array.from(adjGroups.values()).map((rows) => {
      const first = rows[0];
      const last = rows[rows.length - 1];
      const isHalf = (r: typeof first) => r.day_part === 'morning' || r.day_part === 'afternoon';
      // bu_checkin/bu_checkout chỉ vá 1 lượt quẹt — không phải "1 ngày công".
      const isPunchFix = first.adjustment_type === 'bu_checkin' || first.adjustment_type === 'bu_checkout';
      return {
        id: first.id,
        kind: 'adjustment',
        sub_type: first.adjustment_type,
        sub_label: ADJ_LABELS[first.adjustment_type] ?? first.type_label ?? first.adjustment_type,
        start_date: String(first.work_date).slice(0, 10),
        end_date: String(last.work_date).slice(0, 10),
        day_part: rows.length === 1 && isHalf(first) ? (first.day_part as 'morning' | 'afternoon') : null,
        amount_days: isPunchFix ? null : rows.reduce((s, r) => s + (isHalf(r) ? 0.5 : 1), 0),
        amount_hours: null,
        reason: first.reason,
        status: normalizeStatus(first.status),
        raw_status: first.status,
        approver_name: approverOf(first.status, first.approver_name),
        decided_at: toIso(first.reviewed_at),
        reject_reason: noteOf(first.status, first.review_note),
        created_at: toIso(first.created_at) ?? '',
        ids: rows.map((r) => r.id),
      };
    });

    const data: MyRequestItem[] = [
      ...leaves.map((r): MyRequestItem => ({
        id: r.id,
        kind: 'leave',
        sub_type: r.sub_type,
        sub_label: r.sub_label,
        start_date: String(r.start_date).slice(0, 10),
        end_date: String(r.end_date).slice(0, 10),
        day_part: r.day_part === 'morning' || r.day_part === 'afternoon' ? r.day_part : null,
        amount_days: r.total_days != null ? Number(r.total_days) : null,
        amount_hours: r.total_hours != null ? Number(r.total_hours) : null,
        reason: r.reason,
        status: normalizeStatus(r.status),
        raw_status: r.status,
        approver_name: approverOf(r.status, r.approver_name),
        decided_at: toIso(r.reviewed_at),
        reject_reason: noteOf(r.status, r.review_note),
        created_at: toIso(r.created_at) ?? '',
        ids: [r.id],
      })),
      ...adjItems,
      ...overtimes.map((r): MyRequestItem => ({
        id: r.id,
        kind: 'overtime',
        sub_type: 'overtime',
        sub_label: `Tăng ca ${r.start_time} – ${r.end_time}`,
        start_date: String(r.work_date).slice(0, 10),
        end_date: String(r.work_date).slice(0, 10),
        day_part: null,
        amount_days: null,
        amount_hours: Number(r.evening_hours) + Number(r.night_hours),
        reason: r.reason,
        status: normalizeStatus(r.status),
        raw_status: r.status,
        approver_name: approverOf(r.status, r.approver_name),
        decided_at: toIso(r.reviewed_at),
        reject_reason: noteOf(r.status, r.review_note),
        created_at: toIso(r.created_at) ?? '',
        ids: [r.id],
      })),
    ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // created_at đã là ISO → sort chuỗi chuẩn

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/attendance/my-requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
