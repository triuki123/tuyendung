/**
 * Báo cáo tuyển dụng tự động — gửi tới bộ phận Tuyển dụng/C&B qua Telegram (P4).
 * Nội dung soạn qua engine (event recruitment.weeklyReport) → admin sửa template qua UI,
 * hưởng outbox/retry/rate-limit. Số liệu lấy từ dashboard tổng hợp + delta 7 ngày.
 */
import { query, queryOne } from '@/lib/db';
import { getReminderDepartmentIds } from './hrSettingsService';
import { getRecruitmentDashboard } from './recruitmentDashboardService';
import { renderNotification } from './notificationTemplateService';
import { notify } from '@/lib/notifications/engine';

const ONB_SCOPE = `(form_id IS NULL OR form_id IN (SELECT id FROM form_templates WHERE form_type = 'onboarding'))`;

/** Tính các biến số liệu cho template báo cáo tuần. */
export async function buildWeeklyReportVars(): Promise<Record<string, string | number>> {
  const [dash, weekly] = await Promise.all([
    getRecruitmentDashboard(),
    queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '7 days') AS new_submissions,
         COUNT(*) FILTER (WHERE approved_at  >= NOW() - INTERVAL '7 days') AS approved_week
       FROM onboarding_submissions WHERE ${ONB_SCOPE}`
    ),
  ]);

  const newSub = parseInt(weekly?.new_submissions || '0', 10);
  const approvedWeek = parseInt(weekly?.approved_week || '0', 10);
  const req = dash.requisitions;
  const agingCount = req.aging.filter((a) => a.days_open > 30).length;

  return {
    newSub,
    approvedWeek,
    processing: dash.funnel.submitted + dash.funnel.confirmed + dash.funnel.sent_to_admin,
    reqOpen: req.open,
    reqOnHold: req.onHold,
    totalFilled: req.totalFilled,
    totalTarget: req.totalTarget,
    avgTimeToFill: req.avgTimeToFill,
    agingLine: agingCount > 0
      ? `⚠️ ${agingCount} vị trí tồn đọng > 30 ngày — cần ưu tiên!`
      : '✅ Không có vị trí tồn đọng',
    probationPassRate: dash.quality.probationPassRate,
    headcount: dash.workforce.headcount,
    leavers12m: dash.turnover.leavers12m,
    turnoverRate: dash.turnover.turnoverRate,
    forecastNextMonth: dash.forecastNextMonth,
  };
}

/** Soạn nội dung báo cáo tuần (preview) — render từ template engine. */
export async function buildWeeklyReportText(): Promise<string> {
  const vars = await buildWeeklyReportVars();
  const rendered = await renderNotification('recruitment_weekly_report', vars);
  return rendered?.telegram ?? `📊 Báo cáo tuyển dụng tuần — Hồ sơ mới ${vars.newSub}, đã duyệt ${vars.approvedWeek}.`;
}

/** Gửi báo cáo tuần tới bộ phận Tuyển dụng/C&B (qua engine — outbox/retry). */
export async function runWeeklyRecruitmentReport(): Promise<{ recipients: number; sent: number }> {
  const deptIds = await getReminderDepartmentIds();
  if (deptIds.length === 0) {
    console.warn('[RecruitmentReport] Chưa cấu hình phòng ban nhận báo cáo — bỏ qua.');
    return { recipients: 0, sent: 0 };
  }
  const recipients = await query<{ id: string }>(
    `SELECT id::text AS id
       FROM users
      WHERE status='active' AND department_id::text = ANY($1::text[])
        AND telegram_chat_id IS NOT NULL AND telegram_enabled = true`,
    [deptIds]
  );
  if (recipients.length === 0) return { recipients: 0, sent: 0 };

  const vars = await buildWeeklyReportVars();
  await notify('recruitment.weeklyReport', vars, { recipients: recipients.map(r => r.id) });
  console.log(`[RecruitmentReport] Đã đẩy báo cáo tuần cho ${recipients.length} người (qua outbox).`);
  return { recipients: recipients.length, sent: recipients.length };
}
