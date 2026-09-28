import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import { query, queryOne } from '@/lib/db';
import { getDailyClockRange, type DailyClockRow } from '@/lib/services/attendanceService';
import { resolveAttendanceConfigForUser } from '@/lib/services/attendanceSettingsService';
import { getCompanyMemberUserIds } from '@/lib/services/userCompanyService';
import { getLeaveColumnLabels, getRangeExportColumns } from '@/lib/services/rangeExportConfigService';
import {
  BU_CHECKIN_LABEL, BU_CONG_LABEL, resolveRangeColumns, type ResolvedRangeColumn,
} from '@/lib/rangeExportCatalog';

export const dynamic = 'force-dynamic';

// Phòng Hành Chính Nhân Sự — chỉ HCNS hoặc super_admin được tổng hợp/xuất toàn nhân sự.
const HCNS_DEPT_ID = '74ab7673-13d6-404f-a576-5f4e87f8f7fa';
const MAX_RANGE_DAYS = 366; // trần khoảng ngày để tránh truy vấn quá lớn

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Một ngày trong file xuất: giờ chấm + ngày công quy đổi + giá trị các cột nghỉ/bù công. */
export interface ExportRangeDay extends DailyClockRow {
  /** Ngày công = giờ công thực tế ÷ ngưỡng đủ công (8h). 0 nếu không có chấm. */
  work_days: number;
  /** Phần giờ vượt ngưỡng đủ công. */
  over_hours: number;
  /** Phần giờ thiếu so với ngưỡng đủ công (chỉ tính ngày CÓ chấm công). */
  short_hours: number;
  /** Nhãn cột nghỉ/bù công → 1 (cả ngày) hoặc 0.5 (nửa buổi). */
  values: Record<string, number>;
}

export interface ExportRangeEmployee {
  userId: string;
  name: string;
  employeeCode: string | null;
  company: string | null;
  department: string | null;
  /** Ngưỡng đủ 1 công (giờ) theo cấu hình công ty của nhân sự này. */
  standardHours: number;
  days: ExportRangeDay[];
}

interface LeaveRow {
  user_id: string;
  start_date: string;
  end_date: string;
  mode: string;
  day_part: string | null;
  type_name: string;
}

interface AdjustmentRow {
  user_id: string;
  work_date: string;
  adjustment_type: string;
  day_part: string | null;
  type_name: string | null;
}

/** Cộng ngày vào chuỗi YYYY-MM-DD (thuần chuỗi, không lệch múi giờ). */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * POST /api/attendance/export-range
 * Body: { userIds: string[], from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 * Trả giờ vào/ra theo từng ngày trong khoảng cho các nhân sự được chọn — để client
 * dựng file Excel/CSV tải về. Ngày trống → giờ vào/ra rỗng.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const deptId = decodeIdentityHeader(request.headers.get('x-current-user-dept'));
    const role = request.headers.get('x-current-user-role') ?? '';
    const activeCompany = request.headers.get('x-current-user-company');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    // Quyền:
    //  - super_admin / HCNS (HR tập trung) → xuất mọi nhân sự.
    //  - admin / manager → CHỈ nhân sự trong công ty đang làm việc (chống rò rỉ chéo).
    //  - còn lại → cấm.
    const isHCNS = deptId === HCNS_DEPT_ID;
    const isSuperAdmin = role === 'super_admin';
    const isCentral = isHCNS || isSuperAdmin;
    if (!isCentral && role !== 'admin' && role !== 'manager') {
      return NextResponse.json({ error: 'Bạn không có quyền xuất dữ liệu chấm công' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const userIds: string[] = Array.isArray(body.userIds) ? body.userIds.filter((x: unknown) => typeof x === 'string') : [];
    const from: string = body.from;
    const to: string = body.to;

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
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json({ error: 'Ngày không hợp lệ (định dạng YYYY-MM-DD)' }, { status: 400 });
    }
    if (from > to) return NextResponse.json({ error: 'Ngày bắt đầu phải trước ngày kết thúc' }, { status: 400 });

    const spanDays = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày` }, { status: 400 });
    }

    // Neo cấu hình chấm công vào giữa khoảng để chọn đúng cấu hình theo công ty/thời điểm.
    const anchor = new Date((new Date(from).getTime() + new Date(to).getTime()) / 2)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

    // ── 1. Bố cục cột: lấy từ tab "Cấu Hình Xuất Dữ Liệu Công" (chưa cấu hình →
    //       layout mặc định). Cột `leave_all` bung theo danh mục nghỉ áp dụng cho
    //       công ty của nhóm nhân sự được chọn.
    const [configCols, leaveLabels] = await Promise.all([
      getRangeExportColumns(),
      getLeaveColumnLabels(userIds),
    ]);
    const layout: ResolvedRangeColumn[] = resolveRangeColumns(configCols, leaveLabels);

    // ── 2. Đơn nghỉ đã duyệt giao với khoảng ngày ──
    const leaveRows = await query<LeaveRow>(
      `SELECT lr.user_id::text    AS user_id,
              lr.start_date::text AS start_date,
              lr.end_date::text   AS end_date,
              lr.mode,
              lr.day_part,
              lt.name             AS type_name
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.status = 'approved'
          AND lr.user_id::text = ANY($1)
          AND lr.start_date <= $3::date
          AND lr.end_date   >= $2::date`,
      [userIds, from, to]
    );

    // ── 3. Bù công / công đặc biệt đã duyệt (GỒM cả bu_checkin/bu_checkout) ──
    const adjRows = await query<AdjustmentRow>(
      `SELECT aa.user_id::text   AS user_id,
              aa.work_date::text AS work_date,
              aa.adjustment_type,
              aa.day_part,
              lt.name            AS type_name
         FROM attendance_adjustments aa
         LEFT JOIN leave_types lt ON lt.code = aa.adjustment_type
        WHERE aa.status = 'approved'
          AND aa.user_id::text = ANY($1)
          AND aa.work_date BETWEEN $2::date AND $3::date`,
      [userIds, from, to]
    );

    // ── 4. Gom về map: user|ngày → { nhãn cột: giá trị } ──
    const valueMap = new Map<string, Record<string, number>>();
    const addValue = (uid: string, date: string, label: string, value: number) => {
      const key = `${uid}|${date}`;
      const row = valueMap.get(key) ?? {};
      row[label] = (row[label] ?? 0) + value;
      valueMap.set(key, row);
    };

    for (const r of leaveRows) {
      // Nửa buổi (day_part) hoặc nghỉ theo giờ (mode='hour') → 0.5; còn lại 1/ngày.
      const perDay = r.day_part || r.mode === 'hour' ? 0.5 : 1;
      // Bung từng ngày trong phần giao [from, to].
      let d = r.start_date > from ? r.start_date : from;
      const last = r.end_date < to ? r.end_date : to;
      while (d <= last) {
        addValue(r.user_id, d, r.type_name, perDay);
        d = addDays(d, 1);
      }
    }

    for (const r of adjRows) {
      const t = r.adjustment_type;
      const label =
        t === 'bu_checkin' || t === 'bu_checkout' ? BU_CHECKIN_LABEL
        : t === 'bu_cong' || t === 'bu_cong_dac_biet' ? BU_CONG_LABEL
        : r.type_name;
      if (!label) continue; // loại lạ không có trong danh mục → bỏ, tránh sinh cột rác
      addValue(r.user_id, r.work_date, label, r.day_part ? 0.5 : 1);
    }

    // ── 5. Ghép giờ chấm + ngày công quy đổi + giá trị cột cho từng nhân sự ──
    const employees: ExportRangeEmployee[] = [];
    for (const uid of userIds) {
      const u = await queryOne<{ name: string; employee_code: string | null; company: string | null; dept: string | null }>(
        `SELECT u.name, u.employee_code, c.name AS company, d.name AS dept
           FROM users u
           LEFT JOIN companies c   ON c.id::text = u.company_id::text
           LEFT JOIN departments d ON d.id::text = u.department_id::text
          WHERE u.id::text = $1`,
        [uid]
      );
      if (!u) continue;
      const cfg = await resolveAttendanceConfigForUser(uid, anchor);
      const days = await getDailyClockRange(uid, from, to, cfg);
      // Ngưỡng đủ công theo cấu hình công ty của chính nhân sự này (mặc định 8h).
      const standardHours = cfg.fullWorkdayMinutes / 60;
      const r2 = (n: number) => Math.round(n * 100) / 100;

      employees.push({
        userId: uid,
        name: u.name,
        employeeCode: u.employee_code,
        company: u.company,
        department: u.dept,
        standardHours,
        days: days.map((d) => ({
          ...d,
          // Ngày công = GIỜ CHẤM THỰC TẾ ÷ ngưỡng đủ công. Đơn nghỉ/bù công KHÔNG cộng
          // vào đây — chúng nằm ở các cột riêng để HCNS truy ngược được nguồn số.
          work_days: d.total_hours > 0 ? r2(d.total_hours / standardHours) : 0,
          over_hours: d.total_hours > standardHours ? r2(d.total_hours - standardHours) : 0,
          // Chỉ tính thiếu giờ cho ngày CÓ chấm công; ngày nghỉ hẳn đã có cột nghỉ riêng.
          short_hours: d.total_hours > 0 && d.total_hours < standardHours ? r2(standardHours - d.total_hours) : 0,
          values: valueMap.get(`${uid}|${d.date}`) ?? {},
        })),
      });
    }

    // Giữ thứ tự theo tên cho file đẹp.
    employees.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    return NextResponse.json({ success: true, from, to, layout, employees });
  } catch (err) {
    console.error('POST /api/attendance/export-range error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
