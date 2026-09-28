import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import { query } from '@/lib/db';
import { getCompanyMemberUserIds } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

// Phòng Hành Chính Nhân Sự — chỉ HCNS hoặc super_admin được tổng hợp/xuất toàn nhân sự.
const HCNS_DEPT_ID = '74ab7673-13d6-404f-a576-5f4e87f8f7fa';
const MAX_RANGE_DAYS = 92; // trần khoảng ngày (~1 quý) để tránh truy vấn quá lớn

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Nhãn cột gộp cho bù công quên check-in/out (cả bù công thường và đặc biệt). */
const BU_CONG_LABEL = 'Bù công (Quên Check-in/out)';

/** Fallback nhãn cho các loại công đặc biệt cũ chưa có trong danh mục leave_types. */
const ADJUSTMENT_FALLBACK_LABELS: Record<string, string> = {
  cong_tac: 'Đi công tác',
  wfh: 'Làm việc tại nhà',
  lam_theo_ca: 'Làm việc theo ca',
};

interface LeaveRow {
  user_id: string;
  user_name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  mode: string;       // 'day' | 'hour'
  day_part: string | null;
  type_name: string;
  sort_order: number | null;
}

interface AdjustmentRow {
  user_id: string;
  user_name: string;
  work_date: string; // YYYY-MM-DD
  adjustment_type: string;
  day_part: string | null;
  type_name: string | null;
  sort_order: number | null;
}

export interface LeaveDayExportRow {
  date: string; // YYYY-MM-DD
  user_name: string;
  values: Record<string, number>;
}

/** Cộng ngày vào chuỗi YYYY-MM-DD (thuần chuỗi, không lệch múi giờ). */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * POST /api/attendance/export-leave-days
 * Body: { userIds: string[], startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 * Báo cáo ngày-nghỉ/công-đặc-biệt: mỗi dòng = 1 nhân sự × 1 ngày có đơn ĐÃ DUYỆT,
 * giá trị (1 / 0.5) nằm vào cột theo LOẠI (cột động theo danh mục leave_types + loại bù công).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const deptId = decodeIdentityHeader(request.headers.get('x-current-user-dept'));
    const role = request.headers.get('x-current-user-role') ?? '';
    const activeCompany = request.headers.get('x-current-user-company');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    // Quyền: giống export-range.
    //  - super_admin / HCNS (HR tập trung) → xuất mọi nhân sự.
    //  - admin / manager → CHỈ nhân sự trong công ty đang làm việc (chống rò rỉ chéo).
    //  - còn lại → cấm.
    const isCentral = deptId === HCNS_DEPT_ID || role === 'super_admin';
    if (!isCentral && role !== 'admin' && role !== 'manager') {
      return NextResponse.json({ error: 'Bạn không có quyền xuất dữ liệu ngày nghỉ' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const userIds: string[] = Array.isArray(body.userIds) ? body.userIds.filter((x: unknown) => typeof x === 'string') : [];
    const startDate: string = body.startDate;
    const endDate: string = body.endDate;

    if (!userIds.length) return NextResponse.json({ error: 'Chưa chọn nhân sự' }, { status: 400 });

    // admin/manager: chặn xuất người ngoài công ty active.
    if (!isCentral) {
      if (!activeCompany) {
        return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
      }
      const allowed = new Set(await getCompanyMemberUserIds(activeCompany));
      if (userIds.some((id) => !allowed.has(id))) {
        return NextResponse.json({ error: 'Có nhân sự ngoài công ty đang làm việc của bạn' }, { status: 403 });
      }
    }

    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      return NextResponse.json({ error: 'Ngày không hợp lệ (định dạng YYYY-MM-DD)' }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: 'Ngày bắt đầu phải trước ngày kết thúc' }, { status: 400 });
    }
    const spanDays = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày` }, { status: 400 });
    }

    // ── 1. Đơn nghỉ phép đã duyệt giao với khoảng ngày ──
    const leaveRows = await query<LeaveRow>(
      `SELECT lr.user_id::text        AS user_id,
              u.name                  AS user_name,
              lr.start_date::text     AS start_date,
              lr.end_date::text       AS end_date,
              lr.mode,
              lr.day_part,
              lt.name                 AS type_name,
              lt.sort_order
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         JOIN users u        ON u.id::text = lr.user_id::text
        WHERE lr.status = 'approved'
          AND lr.user_id::text = ANY($1)
          AND lr.start_date <= $3::date
          AND lr.end_date   >= $2::date
        ORDER BY lr.start_date`,
      [userIds, startDate, endDate]
    );

    // ── 2. Bù công / công đặc biệt đã duyệt trong khoảng ──
    // bu_checkin/bu_checkout chỉ vá lượt quẹt (không phải ngày nghỉ/công đặc biệt) → bỏ qua.
    const adjRows = await query<AdjustmentRow>(
      `SELECT aa.user_id::text     AS user_id,
              u.name               AS user_name,
              aa.work_date::text   AS work_date,
              aa.adjustment_type,
              aa.day_part,
              lt.name              AS type_name,
              lt.sort_order
         FROM attendance_adjustments aa
         JOIN users u         ON u.id::text = aa.user_id::text
         LEFT JOIN leave_types lt ON lt.code = aa.adjustment_type
        WHERE aa.status = 'approved'
          AND aa.user_id::text = ANY($1)
          AND aa.work_date BETWEEN $2::date AND $3::date
          AND aa.adjustment_type NOT IN ('bu_checkin', 'bu_checkout')
        ORDER BY aa.work_date`,
      [userIds, startDate, endDate]
    );

    // ── 3. Gom dữ liệu: 1 dòng = 1 nhân sự × 1 ngày, cột động theo nhãn loại ──
    // sortInfo: nhãn → { group (0=nghỉ phép, 1=công đặc biệt), order } để sắp thứ tự cột.
    const sortInfo = new Map<string, { group: number; order: number }>();
    const rowMap = new Map<string, LeaveDayExportRow>();

    const addValue = (date: string, uid: string, userName: string, label: string, value: number) => {
      const key = `${date}|${uid}`;
      let row = rowMap.get(key);
      if (!row) { row = { date, user_name: userName, values: {} }; rowMap.set(key, row); }
      row.values[label] = (row.values[label] ?? 0) + value;
    };

    const registerColumn = (label: string, group: number, order: number) => {
      const cur = sortInfo.get(label);
      // Loại xuất hiện ở cả 2 luồng (WFH/Công tác) → ưu tiên vị trí nhóm nghỉ phép.
      if (!cur || group < cur.group || (group === cur.group && order < cur.order)) {
        sortInfo.set(label, { group, order });
      }
    };

    for (const r of leaveRows) {
      // Nửa buổi (day_part) hoặc nghỉ theo giờ (mode='hour') → 0.5; còn lại 1/ngày.
      const perDay = r.day_part || r.mode === 'hour' ? 0.5 : 1;
      registerColumn(r.type_name, 0, r.sort_order ?? 0);
      // Bung từng ngày trong phần giao [startDate, endDate].
      let d = r.start_date > startDate ? r.start_date : startDate;
      const last = r.end_date < endDate ? r.end_date : endDate;
      while (d <= last) {
        addValue(d, r.user_id, r.user_name, r.type_name, perDay);
        d = addDays(d, 1);
      }
    }

    for (const r of adjRows) {
      const isBuCong = r.adjustment_type === 'bu_cong' || r.adjustment_type === 'bu_cong_dac_biet';
      const label = isBuCong
        ? BU_CONG_LABEL
        : r.type_name ?? ADJUSTMENT_FALLBACK_LABELS[r.adjustment_type] ?? r.adjustment_type;
      // Bù công cuối bảng (group 2); công đặc biệt nhóm 1 (sau các loại nghỉ).
      registerColumn(label, isBuCong ? 2 : 1, r.sort_order ?? 0);
      addValue(r.work_date, r.user_id, r.user_name, label, r.day_part ? 0.5 : 1);
    }

    // ── 4. Thứ tự cột: loại nghỉ (sort_order/tên) → công đặc biệt → bù công cuối ──
    const columns = Array.from(sortInfo.entries())
      .sort((a, b) =>
        a[1].group - b[1].group ||
        a[1].order - b[1].order ||
        a[0].localeCompare(b[0], 'vi'))
      .map(([label]) => label);

    const rows = Array.from(rowMap.values())
      .sort((a, b) => a.date.localeCompare(b.date) || a.user_name.localeCompare(b.user_name, 'vi'));

    return NextResponse.json({ success: true, data: { startDate, endDate, columns, rows } });
  } catch (err) {
    console.error('POST /api/attendance/export-leave-days error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
