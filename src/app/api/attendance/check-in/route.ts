import { NextRequest, NextResponse } from 'next/server';
import * as attendanceService from '@/lib/services/attendanceService';
import { decodeIdentityHeader } from '@/lib/authCookie';
import { autoResolveAdjustments, AttendanceAdjustment } from '@/lib/services/attendanceAdjustmentService';
import {
  sendAttendanceCheckinNotification,
  sendAdjustmentAutoCancelledNotification,
} from '@/lib/services/notificationsService';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const userName = decodeIdentityHeader(request.headers.get('x-current-user-name')) ?? 'Nhân sự';
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    const formData = await request.formData();
    const lat = formData.get('lat') ? parseFloat(formData.get('lat') as string) : undefined;
    const lng = formData.get('lng') ? parseFloat(formData.get('lng') as string) : undefined;
    const notes = (formData.get('notes') as string) ?? undefined;
    const photoFile = formData.get('photo') as File | null;

    let photo: Buffer | undefined;
    let photo_mime: string | undefined;
    if (photoFile && photoFile.size > 0) {
      photo = Buffer.from(await photoFile.arrayBuffer());
      photo_mime = photoFile.type || 'image/jpeg';
    }

    const record = await attendanceService.recordAttendance({
      user_id: userId,
      event_type: 'check_in',
      type: 'app',
      lat, lng, photo, photo_mime, notes,
    });

    // Cập nhật sheet stats ngay (fire-and-forget — không block response)
    attendanceService.refreshSheetStatsAsync(userId, record.recorded_at).catch(console.error);

    // Thông báo qua engine (in-app + Telegram cá nhân hoá trong templates.ts)
    sendAttendanceCheckinNotification(userId, 'app', userName).catch(console.error);

    // Auto-resolve Bù Công conflict (hôm nay sau 19:00)
    const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    autoResolveAdjustments(userId, todayVN, 'check_in')
      .then(r => r.cancelled.forEach(adj => notifyAutoCancelledApp(adj).catch(console.error)))
      .catch(console.error);

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (err) {
    console.error('POST /api/attendance/check-in error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

async function notifyAutoCancelledApp(adj: AttendanceAdjustment) {
  try {
    const { queryOne } = await import('@/lib/db');
    const emp = await queryOne<{ manager_id: string | null }>(
      `SELECT manager_id FROM users WHERE id::text = $1`, [adj.user_id]
    );
    // In-app + Telegram qua engine (nội dung cá nhân hoá trong templates.ts)
    await sendAdjustmentAutoCancelledNotification({
      employeeId:     adj.user_id,
      managerId:      emp?.manager_id,
      employeeName:   adj.user_name ?? undefined,
      adjustmentType: adj.adjustment_type,
      workDate:       adj.work_date,
      adjustmentId:   adj.id,
    }).catch(console.error);
  } catch (e) { console.error('notifyAutoCancelledApp error:', e); }
}
