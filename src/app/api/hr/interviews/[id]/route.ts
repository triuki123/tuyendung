import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { withTransaction } from '@/lib/db';
import { randomUUID } from 'node:crypto';

function allowed(request: NextRequest, action: 'edit' | 'delete') {
  return ['admin','super_admin','manager'].includes(request.headers.get('x-current-user-role') || '') || checkUnitAccess(request, 'hr-requisitions', action);
}
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Lịch phỏng vấn', '/nguon-nhan-luc/lich-phong-van');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  if (!allowed(request, 'delete')) return NextResponse.json({ error: 'Không có quyền xoá lịch' }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > 2000) return NextResponse.json({ error: 'Nhập lý do huỷ lịch (tối đa 2000 ký tự).' }, { status: 400 });
    const found = await withTransaction(async c => {
      const row = (await c.query('SELECT * FROM hr_interview_schedules WHERE id=$1 FOR UPDATE', [params.id])).rows[0];
      if (!row) return false;
      const when = new Date(row.scheduled_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      await c.query("INSERT INTO hr_cv_notes (id,cv_id,kind,body,author_id) VALUES ($1,$2,'interview',$3,$4)", [randomUUID(), row.cv_id, `Huỷ và xoá lịch PV: ${row.round_label} · ${when}\nYêu cầu tuyển: ${row.requisition_id}\nLý do: ${reason}`, request.headers.get('x-current-user-id')]);
      if (row.room_booking_id) await c.query("UPDATE room_bookings SET status='cancelled', updated_at=NOW() WHERE id=$1", [row.room_booking_id]);
      await c.query('DELETE FROM hr_interview_schedules WHERE id=$1', [params.id]);
      return true;
    });
    return NextResponse.json(found ? { success: true } : { error: 'Lịch không còn tồn tại' }, { status: found ? 200 : 404 });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Không xoá được lịch' }, { status: 500 }); }
}
export const PUT = withRecruitmentUpdate(PUTHandler, 'Lịch phỏng vấn', '/nguon-nhan-luc/lich-phong-van');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  if (!allowed(request, 'edit')) return NextResponse.json({ error: 'Không có quyền sửa lịch' }, { status: 403 });
  try {
    const b = await request.json();
    const local = b.scheduled_at;
    const duration = Number(b.duration_min);
    if (typeof local !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !Number.isFinite(Date.parse(local + ':00+07:00')) || !Number.isInteger(duration) || duration < 15 || duration > 480 || typeof b.round_label !== 'string' || !b.round_label.trim()) return NextResponse.json({ error: 'Kiểm tra ngày giờ, tên vòng và thời lượng (15–480 phút).' }, { status: 400 });
    const start = local.slice(11), date = local.slice(0,10);
    const endMinutes = Number(start.slice(0,2))*60 + Number(start.slice(3)) + duration;
    if (endMinutes >= 1440) return NextResponse.json({ error: 'Lịch phải kết thúc trong cùng ngày.' }, { status: 400 });
    const end = `${String(Math.floor(endMinutes/60)).padStart(2,'0')}:${String(endMinutes%60).padStart(2,'0')}`;
    const result = await withTransaction(async c => {
      const row = (await c.query('SELECT * FROM hr_interview_schedules WHERE id=$1 FOR UPDATE', [params.id])).rows[0];
      if (!row) return { error: 'Lịch không còn tồn tại', status: 404 };
      if (row.status !== 'scheduled') return { error: 'Chỉ chỉnh sửa lịch đang đặt.', status: 409 };
      const location = typeof b.location === 'string' ? b.location.trim() : row.location;
      if (row.room_booking_id) {
        if (!location) return { error: 'Vui lòng chọn phòng họp.', status: 400 };
        const conflicts = await c.query("SELECT id FROM room_bookings WHERE room_name=$1 AND booking_date=$2 AND status IN ('approved','confirmed') AND id<>$3 AND NOT (end_time <= $4 OR start_time >= $5)", [location,date,row.room_booking_id,start,end]);
        if (conflicts.rowCount && b.allow_room_conflict !== true) return { error: 'Phòng đã có lịch trùng giờ. Bạn có muốn tiếp tục lưu?', code: 'ROOM_CONFLICT', status: 409 };
        await c.query('UPDATE room_bookings SET room_name=$1,booking_date=$2,start_time=$3,end_time=$4,updated_at=NOW() WHERE id=$5', [location,date,start,end,row.room_booking_id]);
      }
      await c.query('UPDATE hr_interview_schedules SET scheduled_at=$1,duration_min=$2,round_label=$3,note=$4,location=$5,meeting_link=$6,updated_at=NOW() WHERE id=$7', [local+':00+07:00',duration,b.round_label.trim(),typeof b.note==='string'?b.note:row.note,location,typeof b.meeting_link==='string'?b.meeting_link:row.meeting_link,params.id]);
      return { success: true, status: 200 };
    });
    return NextResponse.json(result, { status: result.status });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Không cập nhật được lịch' }, { status: 500 }); }
}
