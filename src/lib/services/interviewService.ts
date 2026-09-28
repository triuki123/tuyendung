/**
 * Lịch phỏng vấn (theo VỊ TRÍ / application). Đặt lịch, liệt kê, huỷ/hoàn tất.
 * Thông báo người phỏng vấn qua engine (in-app + Telegram).
 */
import { query, queryOne, execute } from '@/lib/db';
import { randomUUID } from 'node:crypto';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface InterviewSchedule {
  id: string; application_id: string; cv_id: string; requisition_id: string;
  round_label: string; scheduled_at: string; duration_min: number;
  mode: string; location: string | null; meeting_link: string | null;
  interviewer_ids: string[]; interviewer_names: string[];
  status: string; note: string | null; room_booking_id: string | null; created_at: string;
}

/** Bản ghi lịch dùng cho lịch tuyển dụng tổng hợp. */
export interface InterviewCalendarItem extends InterviewSchedule {
  candidate_name: string | null;
  requisition_title: string | null;
}

const SELECT = `
  SELECT s.id, s.application_id, s.cv_id, s.requisition_id, s.round_label, s.scheduled_at,
         s.duration_min, s.mode, s.location, s.meeting_link, s.interviewer_ids, s.status, s.note,
         s.room_booking_id, s.created_at,
         (SELECT cv.candidate_name FROM hr_cv_pool cv WHERE cv.id = s.cv_id) AS candidate_name,
         (SELECT r.title FROM requisitions r WHERE r.id = s.requisition_id) AS requisition_title,
         COALESCE(ARRAY(
           SELECT u.name FROM users u WHERE u.id::text = ANY(s.interviewer_ids)
         ), '{}') AS interviewer_names
    FROM hr_interview_schedules s`;

/** Cộng phút vào 'HH:MM' → 'HH:MM' (kẹp trong ngày). */
function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + minutes;
  if (total >= 24 * 60) total = 24 * 60 - 1; // không tràn sang ngày sau
  const nh = Math.floor(total / 60), nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/** Có trùng phòng trong khung giờ không (chỉ tính booking đang giữ chỗ). */
async function hasRoomConflict(roomName: string, date: string, start: string, end: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM room_bookings
      WHERE room_name = $1 AND booking_date = $2
        AND status IN ('approved','confirmed')
        AND NOT (end_time <= $3 OR start_time >= $4)`,
    [roomName, date, start, end],
  );
  return rows.length > 0;
}

function mapRow(r: any): InterviewSchedule {
  return {
    ...r,
    duration_min: Number(r.duration_min),
    interviewer_ids: r.interviewer_ids || [],
    interviewer_names: r.interviewer_names || [],
  };
}

/** Danh sách lịch phỏng vấn của 1 application (mới nhất trước). */
export async function listInterviews(applicationId: string): Promise<InterviewSchedule[]> {
  const rows = await query<any>(`${SELECT} WHERE s.application_id = $1 ORDER BY s.scheduled_at DESC`, [applicationId]);
  return rows.map(mapRow);
}

/** Lịch phỏng vấn toàn bộ kho tuyển dụng, giới hạn theo khoảng ngày để tải nhanh. */
export async function listInterviewCalendar(from: string, to: string): Promise<InterviewCalendarItem[]> {
  const rows = await query<any>(
    `${SELECT}
      WHERE s.scheduled_at >= $1::timestamptz AND s.scheduled_at < $2::timestamptz
      ORDER BY s.scheduled_at ASC`,
    [from, to],
  );
  return rows.map((row) => ({ ...mapRow(row), candidate_name: row.candidate_name || null, requisition_title: row.requisition_title || null }));
}

export async function getInterview(id: string): Promise<InterviewSchedule | null> {
  const r = await queryOne<any>(`${SELECT} WHERE s.id = $1`, [id]);
  return r ? mapRow(r) : null;
}

/**
 * Đặt lịch phỏng vấn mới.
 * `scheduledLocal` là chuỗi giờ ĐỊA PHƯƠNG (VN) dạng 'YYYY-MM-DDTHH:MM' — tránh lệch múi giờ.
 * Nếu onsite + có roomName → TỰ tạo 1 room_bookings (giữ chỗ), lưu room_booking_id; nếu trùng phòng → lỗi.
 */
export async function createInterview(
  applicationId: string,
  data: {
    cvId: string; requisitionId: string; roundLabel?: string;
    scheduledLocal: string; durationMin?: number; mode?: string;
    location?: string | null; roomName?: string | null; meetingLink?: string | null;
    interviewerIds?: string[]; note?: string | null; createdBy: string | null; allowRoomConflict?: boolean;
  },
): Promise<InterviewSchedule> {
  const durationMin = data.durationMin ?? 60;
  const mode = data.mode || 'onsite';
  const local = data.scheduledLocal;                 // 'YYYY-MM-DDTHH:MM'
  const bookingDate = local.slice(0, 10);            // YYYY-MM-DD
  const startTime = local.slice(11, 16);             // HH:MM
  const endTime = addMinutes(startTime, durationMin);
  const scheduledAt = `${local}:00+07:00`;           // timestamptz theo giờ VN

  // Onsite + chọn phòng → kiểm tra trùng TRƯỚC khi tạo gì (tránh lịch mồ côi).
  const roomName = mode === 'onsite' ? (data.roomName?.trim() || null) : null;
  if (roomName && !data.allowRoomConflict) {
    if (await hasRoomConflict(roomName, bookingDate, startTime, endTime)) {
      throw Object.assign(new Error(`Phòng "${roomName}" đã có lịch trùng khung ${startTime}–${endTime} ngày ${bookingDate}.`), { code: 'ROOM_CONFLICT' });
    }
  }

  // Người đặt (tên) cho booking phòng.
  let bookerName = 'Tuyển dụng';
  if (data.createdBy) {
    const u = await queryOne<{ name: string | null }>(`SELECT name FROM users WHERE id::text = $1`, [data.createdBy]);
    bookerName = u?.name || bookerName;
  }

  const id = genId('itv');
  let roomBookingId: string | null = null;

  // Tạo booking phòng (giữ chỗ = approved) trước, rồi lưu id vào lịch.
  if (roomName) {
    roomBookingId = randomUUID();
    const cv = await queryOne<{ candidate_name: string | null }>(`SELECT candidate_name FROM hr_cv_pool WHERE id = $1`, [data.cvId]);
    const req = await queryOne<{ title: string | null }>(`SELECT title FROM requisitions WHERE id = $1`, [data.requisitionId]);
    const purpose = `Phỏng vấn ${cv?.candidate_name || 'ứng viên'} — ${req?.title || 'tuyển dụng'} (${data.roundLabel || 'Vòng 1'})`;
    await execute(
      `INSERT INTO room_bookings
         (id, room_name, booking_date, start_time, end_time, purpose, status,
          requested_by, requested_by_name, num_participants, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'approved',$7,$8,$9,NOW(),NOW())`,
      [roomBookingId, roomName, bookingDate, startTime, endTime, purpose,
       data.createdBy, bookerName, Math.max(1, (data.interviewerIds?.length ?? 0) + 1)],
    );
  }

  await execute(
    `INSERT INTO hr_interview_schedules
       (id, application_id, cv_id, requisition_id, round_label, scheduled_at, duration_min,
        mode, location, meeting_link, interviewer_ids, note, room_booking_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id, applicationId, data.cvId, data.requisitionId, data.roundLabel || 'Vòng 1',
      scheduledAt, durationMin, mode,
      roomName ?? (data.location ?? null), data.meetingLink ?? null, data.interviewerIds ?? [],
      data.note ?? null, roomBookingId, data.createdBy,
    ],
  );
  const created = (await getInterview(id))!;

  // Thông báo người phỏng vấn (fire-and-forget) — in-app + Telegram qua engine.
  import('./notificationsService')
    .then((m) => m.sendInterviewNotification(created, 'scheduled'))
    .catch((e) => console.error('[createInterview] notify error:', e));

  return created;
}

/** Đổi trạng thái lịch (done/cancelled) → nếu huỷ thì báo người phỏng vấn. */
export async function updateInterviewStatus(id: string, status: 'done' | 'cancelled'): Promise<InterviewSchedule | null> {
  const n = await execute(
    `UPDATE hr_interview_schedules SET status = $1, updated_at = NOW() WHERE id = $2 AND status = 'scheduled'`,
    [status, id],
  );
  if (n === 0) return null;
  const updated = await getInterview(id);
  if (updated && status === 'cancelled') {
    // Huỷ luôn booking phòng đã giữ (nếu có).
    if (updated.room_booking_id) {
      await execute(
        `UPDATE room_bookings SET status = 'cancelled', cancellation_reason = 'Huỷ lịch phỏng vấn', updated_at = NOW()
          WHERE id = $1 AND status NOT IN ('cancelled','completed')`,
        [updated.room_booking_id],
      ).catch((e) => console.error('[updateInterviewStatus] cancel room error:', e));
    }
    import('./notificationsService')
      .then((m) => m.sendInterviewNotification(updated, 'cancelled'))
      .catch((e) => console.error('[updateInterviewStatus] notify error:', e));
  }
  return updated;
}
