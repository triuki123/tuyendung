import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import * as attendanceService from '@/lib/services/attendanceService';
import { autoResolveAdjustments, AttendanceAdjustment } from '@/lib/services/attendanceAdjustmentService';
import {
  sendAttendanceCheckoutNotification,
  sendAdjustmentAutoCancelledNotification,
} from '@/lib/services/notificationsService';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const userName = decodeIdentityHeader(request.headers.get('x-current-user-name')) ?? 'Nhân sự';
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    // Hỗ trợ cả multipart (có ảnh) lẫn JSON (tương thích cũ)
    let lat: number | undefined, lng: number | undefined, notes: string | undefined;
    let photo: Buffer | undefined, photo_mime: string | undefined;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      lat = fd.get('lat') ? parseFloat(fd.get('lat') as string) : undefined;
      lng = fd.get('lng') ? parseFloat(fd.get('lng') as string) : undefined;
      notes = (fd.get('notes') as string) ?? undefined;
      const photoFile = fd.get('photo') as File | null;
      if (photoFile && photoFile.size > 0) {
        photo = Buffer.from(await photoFile.arrayBuffer());
        photo_mime = photoFile.type || 'image/jpeg';
      }
    } else {
      const body = await request.json().catch(() => ({}));
      lat = body.lat ?? undefined;
      lng = body.lng ?? undefined;
      notes = body.notes ?? undefined;
    }

    const record = await attendanceService.recordAttendance({
      user_id: userId,
      event_type: 'check_out',
      type: 'app',
      lat, lng, photo, photo_mime, notes,
    });

    // Cập nhật sheet stats ngay (fire-and-forget — không block response)
    attendanceService.refreshSheetStatsAsync(userId, record.recorded_at).catch(console.error);

    // Thông báo qua engine (in-app + Telegram cá nhân hoá trong templates.ts)
    sendAttendanceCheckoutNotification(userId, 'app', userName).catch(console.error);

    // Auto-resolve Bù Công conflict
    const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    autoResolveAdjustments(userId, todayVN, 'check_out')
      .then(r => r.cancelled.forEach(adj => notifyAutoCancelledApp(adj).catch(console.error)))
      .catch(console.error);

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (err) {
    console.error('POST /api/attendance/check-out error:', err);
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
