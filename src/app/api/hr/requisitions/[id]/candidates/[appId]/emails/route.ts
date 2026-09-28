import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { queryOne } from '@/lib/db';
import { getApplication } from '@/lib/services/applicationService';
import { sendRecruitmentEmail, listSentEmailsForCv } from '@/lib/services/recruitmentEmailService';
import { renderTemplate } from '@/lib/services/emailTemplateService';

export const dynamic = 'force-dynamic';

function canView(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return (
    role === 'manager' || role === 'admin' || role === 'super_admin' ||
    checkUnitAccess(request, 'recruitment-order', 'view') ||
    checkUnitAccess(request, 'hr-requisitions', 'view') ||
    checkUnitAccess(request, 'hr-cv', 'view')
  );
}

const MODE_LABEL: Record<string, string> = { onsite: 'Trực tiếp', online: 'Online', phone: 'Điện thoại' };

/** Biến ngữ cảnh để render mẫu (ứng viên, vị trí, công ty, lịch phỏng vấn gần nhất, người gửi). */
async function buildVars(reqId: string, appId: string, cvId: string, senderId: string | null) {
  const cv = await queryOne<{ candidate_name: string | null; candidate_email: string | null }>(
    `SELECT candidate_name, candidate_email FROM hr_cv_pool WHERE id = $1`, [cvId]);
  const req = await queryOne<{ title: string | null; company_name: string | null }>(
    `SELECT r.title, c.name AS company_name
       FROM requisitions r LEFT JOIN companies c ON c.id::text = r.company_id::text
      WHERE r.id = $1`, [reqId]);
  const itv = await queryOne<{ scheduled_at: string; mode: string; location: string | null; meeting_link: string | null }>(
    `SELECT scheduled_at, mode, location, meeting_link FROM hr_interview_schedules
      WHERE application_id = $1 AND status = 'scheduled' ORDER BY scheduled_at DESC LIMIT 1`, [appId]);
  const sender = senderId ? await queryOne<{ name: string | null }>(`SELECT name FROM users WHERE id::text = $1`, [senderId]) : null;

  return {
    vars: {
      ung_vien: cv?.candidate_name || '',
      vi_tri: req?.title || '',
      cong_ty: req?.company_name || 'Công ty',
      thoi_gian: itv ? new Date(itv.scheduled_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '',
      hinh_thuc: itv ? (MODE_LABEL[itv.mode] || itv.mode) : '',
      dia_diem: itv ? (itv.mode === 'online' ? (itv.meeting_link || '') : (itv.location || '')) : '',
      nguoi_gui: sender?.name || 'Bộ phận Tuyển dụng',
    },
    candidateEmail: cv?.candidate_email || '',
  };
}

/** GET — lịch sử email đã gửi cho ứng viên này. */
export async function GET(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });
    return NextResponse.json({ success: true, data: await listSentEmailsForCv(app.cv_id) });
  } catch (err) {
    console.error('GET emails error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — gửi email cho ứng viên. Body: { to?, subject, body_html, template_id?, render? }. */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });

    const b = await request.json();
    const senderId = request.headers.get('x-current-user-id');
    const { vars, candidateEmail } = await buildVars(params.id, params.appId, app.cv_id, senderId);

    const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const to = (typeof b.to === 'string' && b.to.trim()) ? b.to.trim() : candidateEmail;
    if (!to || !EMAIL_RE.test(to)) {
      return NextResponse.json({ error: 'Ứng viên chưa có email hợp lệ — nhập email người nhận' }, { status: 400 });
    }
    // CC: nhiều email ngăn cách bởi dấu phẩy / chấm phẩy / xuống dòng. Bỏ email sai.
    const cc = typeof b.cc === 'string'
      ? b.cc.split(/[,;\n]+/).map((s: string) => s.trim()).filter((s: string) => s)
      : [];
    const invalidCc = cc.filter((e: string) => !EMAIL_RE.test(e));
    if (invalidCc.length > 0) {
      return NextResponse.json({ error: `Email CC không hợp lệ: ${invalidCc.join(', ')}` }, { status: 400 });
    }
    if (!b.subject?.trim() || !b.body_html?.trim()) {
      return NextResponse.json({ error: 'Thiếu tiêu đề hoặc nội dung' }, { status: 400 });
    }

    // Override biến do HR điền tay ở màn soạn (ưu tiên hơn giá trị suy từ lịch PV).
    // Chỉ nhận các key biến hợp lệ, giá trị chuỗi không rỗng.
    const ALLOWED_VARS = new Set(['ung_vien', 'vi_tri', 'cong_ty', 'thoi_gian', 'hinh_thuc', 'dia_diem', 'nguoi_gui']);
    if (b.overrides && typeof b.overrides === 'object') {
      for (const [k, v] of Object.entries(b.overrides as Record<string, unknown>)) {
        if (ALLOWED_VARS.has(k) && typeof v === 'string' && v.trim()) {
          (vars as Record<string, string>)[k] = v.trim();
        }
      }
    }

    // render === false → nội dung đã render sẵn ở client; mặc định render biến ở server cho chắc.
    const subject = b.render === false ? b.subject : renderTemplate(b.subject, vars);
    const html = b.render === false ? b.body_html : renderTemplate(b.body_html, vars);

    try {
      await sendRecruitmentEmail({
        to, cc, subject, html,
        cvId: app.cv_id, applicationId: params.appId, requisitionId: params.id,
        templateId: typeof b.template_id === 'string' ? b.template_id : null, sentBy: senderId,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Gửi email thất bại' }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: await listSentEmailsForCv(app.cv_id) });
  } catch (err) {
    console.error('POST emails error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
