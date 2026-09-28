import { NextRequest, NextResponse } from 'next/server';
import {
  getResolvedSettings, saveReminderSetting, saveSecurityConfig, saveTicketConfig,
  saveSchedulerConfig, saveHrAutomationConfig, saveRecipientRule, saveSchedulerJob,
  saveAccountEmailConfig, saveAssetWarrantyConfig, saveLegalReminderConfig, saveSsoConfig,
} from '@/lib/services/systemSettingsService';
import {
  DEFAULT_REMINDERS, DEFAULT_RECIPIENT_RULES, DEFAULT_SCHEDULER_JOBS, MAX_WARRANTY_MONTHS,
  ReminderType, RecipientRuleType, SchedulerJobKey, mergeSsoConfig,
} from '@/lib/config/systemConfig';

const ALLOWED_RECIPIENT_ROLES = ['user', 'manager', 'admin', 'super_admin'];

export const dynamic = 'force-dynamic';

function isSuperAdmin(request: NextRequest): boolean {
  return (request.headers.get('x-current-user-role') || '') === 'super_admin';
}

/** GET /api/system-config — cấu hình đã resolve (Nhắc nhở + Bảo mật). Mọi user đăng nhập đọc được. */
export async function GET(request: NextRequest) {
  try {
    if (!request.headers.get('x-current-user-id')) {
      return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });
    }
    const data = await getResolvedSettings();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/system-config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT /api/system-config — lưu (super_admin). Body: { reminders?: {type, milestones}[], security?: {...} } */
export async function PUT(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được sửa cấu hình hệ thống' }, { status: 403 });
    }
    const actor = request.headers.get('x-current-user-id');
    const body = await request.json();

    // Nhắc nhở
    if (Array.isArray(body.reminders)) {
      for (const r of body.reminders) {
        const type = r.type as ReminderType;
        if (!(type in DEFAULT_REMINDERS)) {
          return NextResponse.json({ error: `Loại nhắc không hợp lệ: ${r.type}` }, { status: 400 });
        }
        const ms = r.milestones;
        if (!Array.isArray(ms) || ms.some((n: unknown) => !Number.isInteger(n) || (n as number) < 0 || (n as number) > 365)) {
          return NextResponse.json({ error: `Mốc nhắc không hợp lệ cho ${r.type} (số nguyên 0–365)` }, { status: 400 });
        }
        // chuẩn hoá: bỏ trùng + sort giảm dần
        const norm = Array.from(new Set(ms as number[])).sort((a, b) => b - a);
        await saveReminderSetting(type, norm, actor);
      }
    }

    // Nhắc Pháp Chế nâng cao (mốc quá hạn + mốc tuân thủ)
    if (body.legalReminder) {
      const lr = body.legalReminder;
      const overdue = lr.overdueMilestones;
      const compliance = lr.complianceMilestones;
      // Quá hạn: ≥1 (0 vô nghĩa — "quá hạn 0 ngày" chính là đúng hạn, đã có nhắc trước hạn lo)
      if (!Array.isArray(overdue) || overdue.some((n: unknown) => !Number.isInteger(n) || (n as number) < 1 || (n as number) > 365)) {
        return NextResponse.json({ error: 'Mốc nhắc quá hạn không hợp lệ (số nguyên 1–365 ngày sau hạn)' }, { status: 400 });
      }
      // Tuân thủ: cho phép 0 = nhắc đúng ngày hạn nộp
      if (!Array.isArray(compliance) || compliance.some((n: unknown) => !Number.isInteger(n) || (n as number) < 0 || (n as number) > 365)) {
        return NextResponse.json({ error: 'Mốc nhắc tuân thủ không hợp lệ (số nguyên 0–365 ngày trước hạn)' }, { status: 400 });
      }
      await saveLegalReminderConfig({
        overdueMilestones: Array.from(new Set(overdue as number[])).sort((a, b) => a - b),
        complianceMilestones: Array.from(new Set(compliance as number[])).sort((a, b) => b - a),
      }, actor);
    }

    // Bảo mật
    if (body.security) {
      const s = body.security;
      const sessionDays = Number(s.sessionDays);
      const resetTokenHours = Number(s.resetTokenHours);
      if (!Number.isInteger(sessionDays) || sessionDays < 1 || sessionDays > 365) {
        return NextResponse.json({ error: 'Thời hạn phiên phải trong khoảng 1–365 ngày' }, { status: 400 });
      }
      if (!Number.isInteger(resetTokenHours) || resetTokenHours < 1 || resetTokenHours > 168) {
        return NextResponse.json({ error: 'Hạn token reset phải trong khoảng 1–168 giờ' }, { status: 400 });
      }
      await saveSecurityConfig({ sessionDays, resetTokenHours }, actor);
    }

    // Ticket
    if (body.ticket) {
      const t = body.ticket;
      const autoCloseDays = Number(t.autoCloseDays);
      const autoArchiveDays = Number(t.autoArchiveDays);
      if (!Number.isInteger(autoCloseDays) || autoCloseDays < 1 || autoCloseDays > 365) {
        return NextResponse.json({ error: 'Số ngày tự đóng phải trong khoảng 1–365' }, { status: 400 });
      }
      if (!Number.isInteger(autoArchiveDays) || autoArchiveDays < 1 || autoArchiveDays > 365) {
        return NextResponse.json({ error: 'Số ngày tự lưu trữ phải trong khoảng 1–365' }, { status: 400 });
      }
      await saveTicketConfig({ autoCloseDays, autoArchiveDays }, actor);
    }

    // Scheduler (khung giờ/tần suất các scheduler HR)
    if (body.scheduler) {
      const s = body.scheduler;
      const morningHour = Number(s.morningHour);
      const eveningHour = Number(s.eveningHour);
      const windowMinutes = Number(s.windowMinutes);
      const checkIntervalMinutes = Number(s.checkIntervalMinutes);
      const hourOk = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;
      if (!hourOk(morningHour) || !hourOk(eveningHour)) {
        return NextResponse.json({ error: 'Giờ chạy phải trong khoảng 0–23' }, { status: 400 });
      }
      if (morningHour === eveningHour) {
        return NextResponse.json({ error: 'Giờ sáng và giờ chiều không được trùng nhau' }, { status: 400 });
      }
      if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 59) {
        return NextResponse.json({ error: 'Cửa sổ phút phải trong khoảng 1–59' }, { status: 400 });
      }
      if (!Number.isInteger(checkIntervalMinutes) || checkIntervalMinutes < 1 || checkIntervalMinutes > 60) {
        return NextResponse.json({ error: 'Chu kỳ quét phải trong khoảng 1–60 phút' }, { status: 400 });
      }
      // cửa sổ không được rộng hơn chu kỳ quét → tránh bỏ lỡ hoặc chạy 2 lần/cửa sổ
      if (windowMinutes > checkIntervalMinutes) {
        return NextResponse.json({ error: 'Cửa sổ phút không được lớn hơn chu kỳ quét' }, { status: 400 });
      }
      await saveSchedulerConfig({ morningHour, eveningHour, windowMinutes, checkIntervalMinutes }, actor);
    }

    // Khung giờ chạy từng scheduler job (mỗi job 1 giờ; job ranged có thêm endHour)
    if (Array.isArray(body.schedulerJobs)) {
      const hourOk = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;
      for (const j of body.schedulerJobs) {
        const key = j.key as SchedulerJobKey;
        if (!(key in DEFAULT_SCHEDULER_JOBS)) {
          return NextResponse.json({ error: `Scheduler không hợp lệ: ${j.key}` }, { status: 400 });
        }
        const hour = Number(j.hour);
        if (!hourOk(hour)) {
          return NextResponse.json({ error: `Giờ chạy phải trong khoảng 0–23 (${j.key})` }, { status: 400 });
        }
        const hasRange = DEFAULT_SCHEDULER_JOBS[key].endHour !== undefined;
        let endHour: number | undefined;
        if (hasRange) {
          endHour = Number(j.endHour);
          if (!hourOk(endHour)) {
            return NextResponse.json({ error: `Giờ kết thúc phải trong khoảng 0–23 (${j.key})` }, { status: 400 });
          }
          if (endHour < hour) {
            return NextResponse.json({ error: `Giờ kết thúc phải ≥ giờ bắt đầu (${j.key})` }, { status: 400 });
          }
        }
        await saveSchedulerJob(key, hasRange ? { hour, endHour } : { hour }, actor);
      }
    }

    // Tự động hoá HR (ngưỡng đánh giá thử việc)
    if (body.hrAutomation) {
      const h = body.hrAutomation;
      const evaluationAutoCreateDaysBefore = Number(h.evaluationAutoCreateDaysBefore);
      const evaluationLookupDays = Number(h.evaluationLookupDays);
      const onboardingDraftLeadDays = Number(h.onboardingDraftLeadDays);
      const contractReminderEscalateAfter = Number(h.contractReminderEscalateAfter);
      const evaluationAutoArchiveDays = Number(h.evaluationAutoArchiveDays) || 0;
      const dayOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= 90;
      const leadOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= 30;
      const escOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= 10;
      if (!dayOk(evaluationAutoCreateDaysBefore) || !dayOk(evaluationLookupDays)) {
        return NextResponse.json({ error: 'Ngưỡng ngày đánh giá phải trong khoảng 1–90' }, { status: 400 });
      }
      if (!leadOk(onboardingDraftLeadDays)) {
        return NextResponse.json({ error: 'Số ngày tạo nháp trước phải trong khoảng 1–30' }, { status: 400 });
      }
      if (!escOk(contractReminderEscalateAfter)) {
        return NextResponse.json({ error: 'Số lần nhắc trước khi báo cáo phải trong khoảng 1–10' }, { status: 400 });
      }
      if (!Number.isInteger(evaluationAutoArchiveDays) || evaluationAutoArchiveDays < 0 || evaluationAutoArchiveDays > 365) {
        return NextResponse.json({ error: 'Số ngày tự lưu trữ phải trong khoảng 0–365 (0 = tắt)' }, { status: 400 });
      }
      await saveHrAutomationConfig({ evaluationAutoCreateDaysBefore, evaluationLookupDays, onboardingDraftLeadDays, contractReminderEscalateAfter, evaluationAutoArchiveDays }, actor);
    }

    // Email cấp tài khoản nhân sự mới (mật khẩu Zimbra mặc định)
    if (body.accountEmail) {
      const p = body.accountEmail.zimbraDefaultPassword;
      if (typeof p !== 'string' || !p.trim() || p.trim().length > 100) {
        return NextResponse.json({ error: 'Mật khẩu Zimbra mặc định không hợp lệ (1–100 ký tự)' }, { status: 400 });
      }
      await saveAccountEmailConfig({ zimbraDefaultPassword: p.trim() }, actor);
    }

    // SSO (domain Zimbra + bật/tắt auto-sync)
    if (body.sso) {
      const s = body.sso;
      if (!Array.isArray(s.zimbraDomains) || s.zimbraDomains.some((d: unknown) => typeof d !== 'string')) {
        return NextResponse.json({ error: 'Danh sách domain Zimbra không hợp lệ' }, { status: 400 });
      }
      if (typeof s.autoSyncEnabled !== 'boolean') {
        return NextResponse.json({ error: 'autoSyncEnabled phải là true/false' }, { status: 400 });
      }
      await saveSsoConfig(mergeSsoConfig(s), actor);
    }

    // Quy tắc người nhận (đánh giá & bảo trì)
    if (Array.isArray(body.recipientRules)) {
      for (const r of body.recipientRules) {
        const type = r.type as RecipientRuleType;
        if (!(type in DEFAULT_RECIPIENT_RULES)) {
          return NextResponse.json({ error: `Loại người nhận không hợp lệ: ${r.type}` }, { status: 400 });
        }
        const roles = Array.isArray(r.roles) ? r.roles : [];
        if (roles.some((x: unknown) => typeof x !== 'string' || !ALLOWED_RECIPIENT_ROLES.includes(x))) {
          return NextResponse.json({ error: `Vai trò không hợp lệ cho ${r.type}` }, { status: 400 });
        }
        const userIds = Array.isArray(r.userIds) ? r.userIds.filter((x: unknown) => typeof x === 'string') : [];
        const includeHrEditors = !!r.includeHrEditors;
        // hr_general/room_booking cho phép RỖNG (rỗng = không gửi in-app / fallback env), giống hành vi cũ.
        const requiresOne = type === 'evaluation' || type === 'asset_maintenance';
        if (requiresOne && roles.length === 0 && userIds.length === 0 && !includeHrEditors) {
          return NextResponse.json({ error: `Phải chọn ít nhất 1 người nhận cho ${r.type}` }, { status: 400 });
        }
        await saveRecipientRule(type, {
          roles: Array.from(new Set(roles)) as string[],
          includeHrEditors,
          userIds: Array.from(new Set(userIds)) as string[],
        }, actor);
      }
    }

    // Thời hạn bảo hành tài sản
    if (body.assetWarranty) {
      const periods = body.assetWarranty.periods;
      if (!Array.isArray(periods) || periods.length === 0) {
        return NextResponse.json({ error: 'Cần ít nhất 1 thời hạn bảo hành' }, { status: 400 });
      }
      for (const p of periods) {
        if (typeof p?.label !== 'string' || !p.label.trim()) {
          return NextResponse.json({ error: 'Tên thời hạn không được để trống' }, { status: 400 });
        }
        // 0 = trọn đời (không có ngày hết hạn); tối đa 1200 tháng (100 năm).
        const months = Number(p.months);
        if (!Number.isInteger(months) || months < 0 || months > MAX_WARRANTY_MONTHS) {
          return NextResponse.json({ error: `Số tháng phải trong khoảng 0–${MAX_WARRANTY_MONTHS}, 0 = trọn đời (${p.label})` }, { status: 400 });
        }
      }
      await saveAssetWarrantyConfig({
        periods: periods.map((p: { id?: string; label: string; months: number }, i: number) => ({
          id: p.id || `p${i + 1}`, label: p.label.trim(), months: Number(p.months),
        })),
      }, actor);
    }

    const data = await getResolvedSettings();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/system-config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
