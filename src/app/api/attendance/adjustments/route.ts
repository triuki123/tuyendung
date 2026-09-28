import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/attendanceAdjustmentService';
import { queryOne } from '@/lib/db';
import { sendAdjustmentSubmittedNotification } from '@/lib/services/notificationsService';
import { sendApprovalRequest } from '@/lib/telegram/sendApproval';
import { getPayrollPeriodForDate } from '@/lib/config/attendanceConfig';
import { resolveAttendanceConfigForUser } from '@/lib/services/attendanceSettingsService';

/** GET — lấy đề xuất bù công theo vai trò */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    const { searchParams } = new URL(request.url);

    const month    = searchParams.get('month')    ? parseInt(searchParams.get('month')!)  : undefined;
    const year     = searchParams.get('year')     ? parseInt(searchParams.get('year')!)   : undefined;
    const status   = searchParams.get('status')   as svc.AdjustmentStatus | undefined;
    const selfOnly = searchParams.get('selfOnly') === '1';

    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    // selfOnly=1: luôn trả về dữ liệu của chính user (dùng bởi FingerprintMonthlyTable)
    if (selfOnly) {
      const data = await svc.getUserAdjustments(userId, month, year);
      return NextResponse.json({ success: true, data, view: 'self' });
    }

    // Đa Công Ty: role + công ty theo công ty đang làm việc.
    const { getEffectiveContext } = await import('@/lib/services/userCompanyService');
    const ctx = await getEffectiveContext(userId, activeCompany || null);
    const role = ctx?.role ?? 'user';
    const companyId = ctx?.company_id ?? activeCompany ?? null;

    if (role === 'super_admin' || role === 'admin') {
      const data = await svc.getAllAdjustments({
        status, month, year,
        companyId: role === 'super_admin' ? null : companyId,
      });
      return NextResponse.json({ success: true, data, view: 'all' });
    }

    // Quản lý: cấp dưới (đệ quy) + nhân sự được ủy quyền duyệt (đã gộp trong service).
    if (role === 'manager') {
      const data = await svc.getTeamAdjustments(userId, { status, month, year, companyId });
      return NextResponse.json({ success: true, data, view: 'team' });
    }

    // Nhân viên thường ĐƯỢC ỦY QUYỀN duyệt → thấy đơn của người mình duyệt + của mình.
    const { getDelegatedTargetIds } = await import('@/lib/services/leaveDelegationService');
    const delegated = await getDelegatedTargetIds(userId);
    if (delegated.length > 0) {
      const [team, own] = await Promise.all([
        svc.getTeamAdjustments(userId, { status, month, year, companyId }),
        svc.getUserAdjustments(userId, month, year),
      ]);
      const seen = new Set(team.map((t) => t.id));
      return NextResponse.json({
        success: true,
        data: [...team, ...own.filter((o) => !seen.has(o.id))],
        view: 'team',
      });
    }

    // Nhân viên thường → chỉ xem của mình
    const data = await svc.getUserAdjustments(userId, month, year);
    return NextResponse.json({ success: true, data, view: 'self' });
  } catch (err) {
    console.error('GET /api/attendance/adjustments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — nhân viên gửi đề xuất bù công */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json();
    const { adjustment_type, work_date, end_date, requested_checkin, requested_checkout, reason, on_behalf_of, day_part } = body;

    if (!adjustment_type || !work_date || !reason) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }

    // Hợp lệ loại: CẤU TRÚC (bù công/bù giờ) HOẶC code loại nghỉ đang bật "Áp dụng cho Bù công".
    if (!(svc.STRUCTURAL_ADJ_TYPES as readonly string[]).includes(adjustment_type)) {
      const { getAdjustmentApplicableTypes } = await import('@/lib/services/leaveTypeService');
      const wm = await getAdjustmentApplicableTypes(activeCompany || null);
      if (!wm.some((t) => t.code === adjustment_type)) {
        return NextResponse.json({ error: 'Loại bù công không hợp lệ hoặc chưa được bật áp dụng cho Bù công' }, { status: 400 });
      }
    }

    let targetUserId = userId;
    if (on_behalf_of && on_behalf_of !== userId) {
      const { getEffectiveContext } = await import('@/lib/services/userCompanyService');
      const ctx = await getEffectiveContext(userId, activeCompany || null);
      const role = ctx?.role ?? 'user';
      const companyId = ctx?.company_id ?? activeCompany ?? null;

      if (role !== 'super_admin' && role !== 'admin' && role !== 'manager') {
        return NextResponse.json({ error: 'Không có quyền tạo bù công hộ nhân viên' }, { status: 403 });
      }

      if (role === 'manager') {
        const { getOrgSubtreeUserIds } = await import('@/lib/services/attendanceService');
        const subtree = await getOrgSubtreeUserIds(userId, companyId);
        if (!subtree.includes(on_behalf_of)) {
          return NextResponse.json({ error: 'Bạn chỉ có thể tạo bù công cho nhân viên thuộc phạm vi quản lý' }, { status: 403 });
        }
      }

      targetUserId = on_behalf_of;
    }

    // ── Nhánh NHIỀU NGÀY: 3 chế độ công đặc biệt + Bù Công, khi có end_date > work_date ──
    // (end_date == work_date = 1 ngày → KHÔNG vào batch, tránh bị skip cuối tuần/lễ)
    const allowMultiDay = svc.isMultiDayType(adjustment_type);

    if (end_date && allowMultiDay && end_date > work_date) {
      return handleBatch(targetUserId, {
        adjustment_type, start_date: work_date, end_date,
        requested_checkin, requested_checkout, reason,
      });
    }

    // Cấu hình theo công ty user, hiệu lực tại work_date.
    const cfg = await resolveAttendanceConfigForUser(targetUserId, work_date);

    // Check deadline theo KỲ CÔNG chứa work_date (mặc định 28/N-1 → 27/N), không phải tháng lịch.
    // VD: 30/05 thuộc kỳ công tháng 6 → deadline 27/06, không phải 27/05.
    const period = getPayrollPeriodForDate(work_date, cfg);
    const deadline = await svc.getMonthDeadline(period.month, period.year, cfg);
    if (new Date() > deadline) {
      return NextResponse.json({
        error: `Đã quá hạn nộp bảng công tháng ${period.month} (deadline: ${deadline.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} 17:00)`
      }, { status: 400 });
    }

    // Check 19h rule — Bù Công và Bù Giờ Vào chỉ được gửi sau 19:00 ngày đó
    if (adjustment_type === 'bu_cong' || adjustment_type === 'bu_checkin') {
      const now = new Date();
      const todayVN = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      if (work_date === todayVN) {
        // Lấy giờ VN dùng toLocaleTimeString — KHÔNG dùng offset thủ công (sai khi TZ đã set)
        const hourVN = parseInt(
          now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false })
        );
        if (hourVN < cfg.adjustmentSameDayEarliestHour) {
          return NextResponse.json({
            error: `Bù Công / Bù Giờ Vào chỉ được gửi sau ${cfg.adjustmentSameDayEarliestHour}:00 của ngày cần bù`
          }, { status: 400 });
        }
      }
    }

    // Check duplicate
    const existing = await svc.getDayAdjustment(targetUserId, work_date, adjustment_type);

    if (existing && existing.status !== 'rejected' && existing.status !== 'cancelled') {
      return NextResponse.json({
        error: 'Bạn đã có đề xuất cho ngày và loại này rồi'
      }, { status: 409 });
    }

    const data = await svc.createAdjustment({
      user_id: targetUserId,
      adjustment_type,
      work_date,
      requested_checkin,
      requested_checkout,
      reason,
      day_part: day_part === 'morning' || day_part === 'afternoon' ? day_part : null,
    });


    // Upsert không trả bản ghi = không có gì được lưu (không nên coi là thành công).
    if (!data) {
      return NextResponse.json({
        error: 'Không lưu được đề xuất (có thể đã được xử lý). Vui lòng tải lại trang và thử lại.'
      }, { status: 409 });
    }

    // Gửi Telegram cho Quản Lý Trực Tiếp (async, không block response)
    notifyDirectManager(data).catch(console.error);

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/attendance/adjustments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * Xử lý tạo bù công NHIỀU NGÀY (chế độ công đặc biệt).
 * Áp deadline theo kỳ công của ngày bắt đầu (sớm nhất, dễ rơi vào kỳ đã chốt nhất).
 * Trả về danh sách ngày đã tạo + ngày bị bỏ qua (CN/lễ/đã có).
 */
async function handleBatch(userId: string, input: {
  adjustment_type: svc.AdjustmentType;
  start_date: string;
  end_date: string;
  requested_checkin?: string;
  requested_checkout?: string;
  reason: string;
}) {
  // Cấu hình theo công ty user, hiệu lực tại ngày bắt đầu.
  const cfg = await resolveAttendanceConfigForUser(userId, input.start_date);

  // Deadline theo kỳ công chứa ngày bắt đầu.
  const period = getPayrollPeriodForDate(input.start_date, cfg);
  const deadline = await svc.getMonthDeadline(period.month, period.year, cfg);
  if (new Date() > deadline) {
    return NextResponse.json({
      error: `Đã quá hạn nộp bảng công tháng ${period.month} (deadline: ${deadline.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} 17:00)`
    }, { status: 400 });
  }

  // Tách 'HH:mm' từ ISO (vd "2026-06-21T08:30:00+07:00" → "08:30"); mặc định 1 ngày công.
  const timeOf = (iso?: string, fallback = '08:30') =>
    iso && iso.length >= 16 ? iso.slice(11, 16) : fallback;

  const res = await svc.createAdjustmentBatch({
    user_id: userId,
    adjustment_type: input.adjustment_type,
    start_date: input.start_date,
    end_date: input.end_date,
    checkin_time: timeOf(input.requested_checkin, '08:30'),
    checkout_time: timeOf(input.requested_checkout, '17:30'),
    reason: input.reason,
    cfg,
  });

  if (res.created.length === 0) {
    return NextResponse.json({
      error: 'Không có ngày làm việc hợp lệ trong khoảng đã chọn (toàn bộ là cuối tuần/ngày lễ hoặc đã có đề xuất).',
      skipped: res.skipped,
    }, { status: 409 });
  }

  // Gửi 1 thông báo gộp cho quản lý (không block response).
  notifyDirectManagerBatch(res.created, input.adjustment_type).catch(console.error);

  return NextResponse.json({
    success: true,
    batch: true,
    batch_id: res.batch_id,
    created: res.created,
    skipped: res.skipped,
  }, { status: 201 });
}

const TYPE_LABELS: Record<string, string> = {
  bu_cong: 'Bù Công', bu_cong_dac_biet: 'Bù Công Đặc Thù', bu_checkin: 'Bù Giờ Vào', bu_checkout: 'Bù Giờ Ra',
  cong_tac: 'Công Tác', wfh: 'Làm Việc Tại Nhà', lam_theo_ca: 'Làm Theo Ca',
};

/** Thông báo gộp cho quản lý + người được ỦY QUYỀN duyệt khi nhân viên gửi bù công nhiều ngày. */
async function notifyDirectManagerBatch(created: svc.AttendanceAdjustment[], type: svc.AdjustmentType) {
  try {
    if (created.length === 0) return;
    const first = created[0];
    const employee = await queryOne<{ name: string; company_name: string | null }>(
      `SELECT u.name, c.name AS company_name
         FROM users u
         LEFT JOIN companies c ON c.id::text = u.company_id::text
        WHERE u.id::text = $1`,
      [first.user_id]
    );

    // Quản lý trực tiếp (ưu tiên phân công chính) ∪ người được ủy quyền duyệt.
    const { getApprovalRecipients } = await import('@/lib/services/leaveDelegationService');
    const recipients = await getApprovalRecipients(first.user_id);
    if (recipients.length === 0) return;

    const companyName = employee?.company_name ?? null;
    const dates = created.map((c) => String(c.work_date).split('T')[0]).sort();
    const fmt = (d: string) => new Date(d + 'T00:00:00+07:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const rangeText = dates.length === 1 ? fmt(dates[0]) : `${fmt(dates[0])} → ${fmt(dates[dates.length - 1])} (${dates.length} ngày)`;
    const typeLabel = TYPE_LABELS[type] ?? 'Bù Công';
    const employeeName = first.user_name ?? employee?.name ?? first.user_id;

    for (const approverId of recipients) {
      // In-app cho từng ngày (mỗi dòng là 1 đề xuất riêng để duyệt được từng cái).
      for (const adj of created) {
        sendAdjustmentSubmittedNotification({
          managerId:      approverId,
          employeeName,
          adjustmentType: adj.adjustment_type,
          workDate:       String(adj.work_date).split('T')[0],
          adjustmentId:   adj.id,
          companyName,
        }).catch(console.error);
      }

      // Telegram: 1 tin gộp kèm nút duyệt cả đợt.
      await sendApprovalRequest({
        type: 'adjbatch',
        id: first.batch_id ?? first.id,
        approverUserId: approverId,
        title: `Đề Xuất ${typeLabel} Nhiều Ngày`,
        lines: [
          ...(companyName ? [`🏢 Công ty: ${companyName}`] : []),
          `👤 Nhân viên: *${employeeName}*`,
          `📅 Khoảng: ${rangeText}`,
          `💬 Lý do: ${first.reason ?? ''}`,
        ],
      });
    }
  } catch (e) {
    console.error('[BùCông] notifyDirectManagerBatch error:', e);
  }
}

/**
 * Thông báo Bù Công cho Quản Lý Trực Tiếp + người được ỦY QUYỀN duyệt của nhân viên.
 * Không ai trong hai nhóm → bỏ qua.
 */
async function notifyDirectManager(adj: svc.AttendanceAdjustment) {
  try {
    const { queryOne } = await import('@/lib/db');
    const employee = await queryOne<{ name: string; company_name: string | null }>(
      `SELECT u.name, c.name AS company_name
         FROM users u
         LEFT JOIN companies c ON c.id::text = u.company_id::text
        WHERE u.id::text = $1`,
      [adj.user_id]
    );

    const { getApprovalRecipients } = await import('@/lib/services/leaveDelegationService');
    const recipients = await getApprovalRecipients(adj.user_id);
    if (recipients.length === 0) {
      console.log(`[BùCông] User ${adj.user_id} chưa có Quản Lý Trực Tiếp / người ủy quyền, bỏ qua thông báo`);
      return;
    }

    const companyName = employee?.company_name ?? null;
    const TYPE_LABELS: Record<string, string> = {
      bu_cong: 'Bù Công', bu_checkin: 'Bù Giờ Vào', bu_checkout: 'Bù Giờ Ra',
      cong_tac: 'Công Tác', wfh: 'Làm Việc Tại Nhà', lam_theo_ca: 'Làm Theo Ca',
    };
    const typeLabel = TYPE_LABELS[adj.adjustment_type] ?? 'Bù Công';
    const workDate = new Date(adj.work_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const employeeName = adj.user_name ?? employee?.name ?? adj.user_id;

    for (const approverId of recipients) {
      await sendAdjustmentSubmittedNotification({
        managerId:      approverId,
        employeeName,
        adjustmentType: adj.adjustment_type,
        workDate:       String(adj.work_date).split('T')[0],
        adjustmentId:   adj.id,
        companyName,
      }).catch(console.error);

      // Gửi kèm nút Duyệt / Từ chối ngay trên Telegram
      await sendApprovalRequest({
        type: 'adj',
        id: adj.id,
        approverUserId: approverId,
        title: `Đề Xuất ${typeLabel} Mới`,
        lines: [
          ...(companyName ? [`🏢 Công ty: ${companyName}`] : []),
          `👤 Nhân viên: *${employeeName}*`,
          `📅 Ngày: ${workDate}`,
          `💬 Lý do: ${adj.reason ?? ''}`,
        ],
      });
    }
  } catch (e) {
    console.error('[BùCông] notifyDirectManager error:', e);
  }
}
