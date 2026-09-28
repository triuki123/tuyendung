import { query, queryOne, execute, buildInsert, withTransaction } from '@/lib/db';
import { distanceMeters } from '@/lib/warehouse/workerAuth';
import { getWarehouse } from '@/lib/services/warehouseService';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';

/**
 * Chấm công công nhân kho: check-in/out GPS + ảnh mặt, bảng công tháng,
 * cảnh báo quên check-out, purge ảnh quá hạn.
 */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Ngày hiện tại theo giờ VN, dạng YYYY-MM-DD */
export function vnToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

export interface CheckResult {
  ok: boolean;
  error?: string;
  /** 'OPEN_SESSION' = còn đợt chưa check-out — client phải hỏi công nhân khai giờ ra đợt trước. */
  code?: 'OPEN_SESSION';
  /** Đợt đang mở (khi code = 'OPEN_SESSION') để client hiển thị giờ vào. */
  openSession?: any;
  distance?: number;
  attendance?: any;
}

/** Lưu ảnh chấm công — dual-write: có S3 → MinIO (media_id), chưa cấu hình → BYTEA cũ */
export async function savePhoto(workerId: string, content: Buffer, mime: string): Promise<string> {
  const id = newId('wph');
  const media = await uploadBufferAsMedia({
    buffer: content, mimeType: mime, scope: 'warehouse_photos', originalName: `${id}.jpg`, sourceId: id,
  });
  await execute(
    `INSERT INTO warehouse_photos (id, worker_id, content, mime_type, size_bytes, media_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, workerId, media ? null : content, mime, content.length, media?.id ?? null]
  );
  return id;
}

export async function getPhoto(id: string): Promise<{ content: Buffer; mime_type: string } | null> {
  const row = await queryOne<{ content: Buffer | null; mime_type: string; media_id: string | null }>(
    `SELECT content, mime_type, media_id FROM warehouse_photos WHERE id = $1`, [id]
  );
  if (!row) return null;
  // Dual-read: có media_id → MinIO; không → BYTEA cũ
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { content: m.buffer, mime_type: m.mimeType || row.mime_type };
  }
  if (!row.content) return null;
  return { content: row.content, mime_type: row.mime_type };
}

/**
 * Kiểm tra vị trí: method 'qr' bỏ qua GPS (đã quét QR tại cổng),
 * 'gps' bắt buộc trong bán kính kho.
 */
async function validateLocation(
  warehouseId: string,
  method: 'gps' | 'qr',
  lat: number | null,
  lng: number | null
): Promise<{ ok: boolean; error?: string; distance?: number }> {
  if (method === 'qr') return { ok: true };
  const wh = await getWarehouse(warehouseId);
  if (!wh) return { ok: false, error: 'Không tìm thấy kho' };
  if (wh.lat == null || wh.lng == null) return { ok: true }; // kho chưa cấu hình GPS → không chặn
  if (lat == null || lng == null) return { ok: false, error: 'Không lấy được vị trí GPS. Hãy bật định vị hoặc quét QR tại cổng.' };
  const d = distanceMeters(lat, lng, wh.lat, wh.lng);
  if (d > wh.radius_m) {
    return { ok: false, distance: Math.round(d), error: `Bạn đang cách kho ${Math.round(d)}m — ngoài phạm vi cho phép (${wh.radius_m}m).` };
  }
  return { ok: true, distance: Math.round(d) };
}

/** Các đợt chấm công HÔM NAY của 1 công nhân, theo thứ tự thời gian. */
async function getTodaySessions(workerId: string): Promise<any[]> {
  return query(
    `SELECT * FROM warehouse_attendance WHERE worker_id = $1 AND work_date = $2
     ORDER BY check_in_at ASC NULLS LAST`,
    [workerId, vnToday()]
  );
}

/**
 * Check-in — hành vi theo attendance_mode của kho:
 *  - 'shift' (mặc định): 1 đợt/ngày như cũ. Đã check-in → chặn.
 *  - 'flex' (nhiều đợt): mỗi check-in mở một ĐỢT mới. Nếu còn đợt chưa check-out:
 *      + không có declaredCheckoutAt → trả code OPEN_SESSION để client hỏi công nhân
 *        khai giờ ra của đợt trước;
 *      + có declaredCheckoutAt → đóng đợt cũ bằng giờ tự khai (declared_status='pending',
 *        CHỜ quản lý duyệt mới tính giờ) rồi mở đợt mới.
 */
export async function checkIn(input: {
  workerId: string; warehouseId: string; shiftId: string | null;
  photoBuffer: Buffer; photoMime: string;
  lat: number | null; lng: number | null; method: 'gps' | 'qr';
  declaredCheckoutAt?: string | null;
}): Promise<CheckResult> {
  const loc = await validateLocation(input.warehouseId, input.method, input.lat, input.lng);
  if (!loc.ok) return { ok: false, error: loc.error, distance: loc.distance };

  const wh = await getWarehouse(input.warehouseId);
  const mode: 'shift' | 'flex' = (wh as any)?.attendance_mode === 'flex' ? 'flex' : 'shift';
  const today = vnToday();
  const sessions = await getTodaySessions(input.workerId);

  if (mode === 'shift') {
    if (sessions.some((s) => s.check_in_at)) {
      return { ok: false, error: 'Hôm nay bạn đã check-in rồi.' };
    }
  } else {
    const open = sessions.find((s) => s.check_in_at && !s.check_out_at);
    if (open) {
      if (!input.declaredCheckoutAt) {
        return {
          ok: false,
          code: 'OPEN_SESSION',
          error: 'Bạn còn đợt làm việc chưa check-out. Hãy khai giờ ra của đợt trước để tiếp tục.',
          openSession: { id: open.id, check_in_at: open.check_in_at, session_no: open.session_no },
        };
      }
      const declared = new Date(input.declaredCheckoutAt);
      const inAt = new Date(open.check_in_at);
      if (Number.isNaN(declared.getTime()) || declared <= inAt || declared > new Date()) {
        return { ok: false, error: 'Giờ ra tự khai không hợp lệ — phải sau giờ vào của đợt trước và không ở tương lai.' };
      }
      // Đóng đợt cũ bằng giờ TỰ KHAI — chờ quản lý duyệt (declared_status='pending').
      await execute(
        `UPDATE warehouse_attendance SET
           check_out_at = $2, check_out_method = 'declared',
           declared_checkout = TRUE, declared_status = 'pending', missing_checkout = FALSE
         WHERE id = $1`,
        [open.id, declared.toISOString()]
      );
    }
  }

  const sessionNo = sessions.length + 1;
  // Upload MinIO TRƯỚC transaction DB (thứ tự bắt buộc: storage trước → insert sau)
  const inMedia = await uploadBufferAsMedia({
    buffer: input.photoBuffer, mimeType: input.photoMime, scope: 'warehouse_photos', originalName: 'check-in.jpg',
  });
  return withTransaction(async (client) => {
    const photoId = newId('wph');
    await client.query(
      `INSERT INTO warehouse_photos (id, worker_id, content, mime_type, size_bytes, media_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [photoId, input.workerId, inMedia ? null : input.photoBuffer, input.photoMime, input.photoBuffer.length, inMedia?.id ?? null]
    );
    const { rows } = await client.query(
      `INSERT INTO warehouse_attendance
         (id, warehouse_id, worker_id, work_date, shift_id, session_no, check_in_at, check_in_photo_id,
          check_in_lat, check_in_lng, check_in_method)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)
       RETURNING *`,
      [newId('wat'), input.warehouseId, input.workerId, today, input.shiftId, sessionNo,
       photoId, input.lat, input.lng, input.method]
    );
    return { ok: true, distance: loc.distance, attendance: rows[0] };
  });
}

/**
 * Check-out — đóng đợt ĐANG MỞ mới nhất hôm nay. Kèm sản lượng công nhân TỰ KHAI
 * (outputs): lưu vào warehouse_output gắn đúng đợt, status='pending' chờ quản lý duyệt.
 */
export async function checkOut(input: {
  workerId: string; warehouseId: string;
  photoBuffer: Buffer; photoMime: string;
  lat: number | null; lng: number | null; method: 'gps' | 'qr';
  outputs?: { productId: string; quantity: number }[];
}): Promise<CheckResult> {
  const loc = await validateLocation(input.warehouseId, input.method, input.lat, input.lng);
  if (!loc.ok) return { ok: false, error: loc.error, distance: loc.distance };

  const today = vnToday();
  const sessions = await getTodaySessions(input.workerId);
  const open = [...sessions].reverse().find((s) => s.check_in_at && !s.check_out_at);
  if (!open) {
    if (!sessions.some((s) => s.check_in_at)) return { ok: false, error: 'Bạn chưa check-in hôm nay.' };
    return { ok: false, error: 'Không có đợt nào đang mở — hãy check-in trước.' };
  }

  // Upload MinIO TRƯỚC transaction DB (thứ tự bắt buộc: storage trước → insert sau)
  const outMedia = await uploadBufferAsMedia({
    buffer: input.photoBuffer, mimeType: input.photoMime, scope: 'warehouse_photos', originalName: 'check-out.jpg',
  });
  return withTransaction(async (client) => {
    const photoId = newId('wph');
    await client.query(
      `INSERT INTO warehouse_photos (id, worker_id, content, mime_type, size_bytes, media_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [photoId, input.workerId, outMedia ? null : input.photoBuffer, input.photoMime, input.photoBuffer.length, outMedia?.id ?? null]
    );
    const { rows } = await client.query(
      `UPDATE warehouse_attendance SET
         check_out_at = NOW(), check_out_photo_id = $2, check_out_lat = $3, check_out_lng = $4,
         check_out_method = $5, missing_checkout = FALSE
       WHERE id = $1 RETURNING *`,
      [open.id, photoId, input.lat, input.lng, input.method]
    );

    // Sản lượng tự khai của đợt này — chờ quản lý duyệt/sửa. entered_by NULL (công nhân
    // không phải user AssetFlow); source='worker' để phân biệt.
    for (const o of input.outputs ?? []) {
      const qty = Number(o.quantity);
      if (!o.productId || !Number.isFinite(qty) || qty <= 0) continue;
      await client.query(
        `INSERT INTO warehouse_output
           (id, warehouse_id, worker_id, product_id, work_date, quantity, attendance_id, source, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'worker', 'pending')
         ON CONFLICT (worker_id, product_id, work_date, COALESCE(attendance_id, ''))
         DO UPDATE SET quantity = $6, source = 'worker', status = 'pending', updated_at = NOW()`,
        [newId('wo'), input.warehouseId, input.workerId, o.productId, today, qty, open.id]
      );
    }

    return { ok: true, distance: loc.distance, attendance: rows[0] };
  });
}

/**
 * Trạng thái chấm công hôm nay: mọi đợt + đợt đang mở + tổng giờ các đợt đã đóng
 * (giờ tự khai chưa duyệt KHÔNG tính vào tổng).
 */
export async function getTodayAttendance(workerId: string): Promise<{
  sessions: any[]; open: any | null; total_hours: number;
}> {
  const sessions = await getTodaySessions(workerId);
  const open = [...sessions].reverse().find((s) => s.check_in_at && !s.check_out_at) ?? null;
  const total = sessions.reduce((sum, s) => {
    if (!s.check_in_at || !s.check_out_at) return sum;
    if (s.declared_status === 'pending' || s.declared_status === 'rejected') return sum;
    return sum + (new Date(s.check_out_at).getTime() - new Date(s.check_in_at).getTime()) / 3600000;
  }, 0);
  return { sessions, open, total_hours: Math.round(total * 10) / 10 };
}

/** Bảng công tháng của 1 công nhân — mỗi dòng 1 đợt, kèm sản lượng gắn với đợt đó. */
export async function getWorkerMonth(workerId: string, month: string): Promise<any[]> {
  return query(
    `SELECT a.*, s.name AS shift_name,
            (SELECT json_agg(json_build_object(
                      'product_name', p.name, 'unit', p.unit,
                      'quantity', o.quantity, 'status', o.status) ORDER BY p.name)
               FROM warehouse_output o JOIN warehouse_products p ON p.id = o.product_id
              WHERE o.attendance_id = a.id) AS outputs
     FROM warehouse_attendance a
     LEFT JOIN warehouse_shifts s ON s.id = a.shift_id
     WHERE a.worker_id = $1 AND to_char(a.work_date, 'YYYY-MM') = $2
     ORDER BY a.work_date, a.check_in_at NULLS LAST`,
    [workerId, month]
  );
}

/** Bảng công 1 ngày của cả kho (admin) — chế độ flex: nhiều dòng/người (mỗi dòng 1 đợt). */
export async function getWarehouseDay(warehouseId: string, date: string): Promise<any[]> {
  return query(
    `SELECT a.*, w.full_name, s.name AS shift_name
     FROM warehouse_attendance a
     JOIN warehouse_workers w ON w.id = a.worker_id
     LEFT JOIN warehouse_shifts s ON s.id = a.shift_id
     WHERE a.warehouse_id = $1 AND a.work_date = $2
     ORDER BY w.full_name, a.check_in_at NULLS LAST`,
    [warehouseId, date]
  );
}

/** Các đợt có giờ ra TỰ KHAI đang chờ duyệt của kho. */
export async function getPendingDeclared(warehouseId: string): Promise<any[]> {
  return query(
    `SELECT a.*, w.full_name FROM warehouse_attendance a
     JOIN warehouse_workers w ON w.id = a.worker_id
     WHERE a.warehouse_id = $1 AND a.declared_status = 'pending'
     ORDER BY a.work_date DESC, a.check_in_at`,
    [warehouseId]
  );
}

/**
 * Quản lý xử lý giờ ra TỰ KHAI: approve (giữ giờ khai) / reject (đợt không tính giờ)
 * / sửa giờ khác (checkOutAt) rồi coi như approved.
 */
export async function reviewDeclaredCheckout(input: {
  attendanceId: string;
  action: 'approved' | 'rejected';
  checkOutAt?: string | null;
  reviewedBy: string;
}): Promise<void> {
  const sets = [`declared_status = $2`, `adjusted_by = $3::uuid`];
  const params: any[] = [input.attendanceId, input.action, input.reviewedBy];
  if (input.action === 'approved' && input.checkOutAt) {
    params.push(input.checkOutAt);
    sets.push(`check_out_at = $${params.length}`, `check_out_method = 'manual'`);
  }
  await execute(
    `UPDATE warehouse_attendance SET ${sets.join(', ')} WHERE id = $1 AND declared_status = 'pending'`,
    params
  );
}

/** Ngày hôm qua (hoặc bất kỳ) ai có check-in mà không check-out → cần quản lý sửa */
export async function getMissingCheckouts(warehouseId: string, date: string): Promise<any[]> {
  return query(
    `SELECT a.*, w.full_name FROM warehouse_attendance a
     JOIN warehouse_workers w ON w.id = a.worker_id
     WHERE a.warehouse_id = $1 AND a.work_date = $2
       AND a.check_in_at IS NOT NULL AND a.check_out_at IS NULL
     ORDER BY w.full_name`,
    [warehouseId, date]
  );
}

/** Quản lý sửa tay giờ công (điền check-out sót, sửa giờ) */
export async function adjustAttendance(input: {
  attendanceId: string; checkInAt?: string | null; checkOutAt?: string | null;
  note?: string; adjustedBy: string;
}): Promise<void> {
  const sets: string[] = ['adjusted_by = $2::uuid', 'missing_checkout = FALSE'];
  const params: any[] = [input.attendanceId, input.adjustedBy];
  if (input.checkInAt !== undefined) { params.push(input.checkInAt); sets.push(`check_in_at = $${params.length}`); }
  if (input.checkOutAt !== undefined) { params.push(input.checkOutAt); sets.push(`check_out_at = $${params.length}, check_out_method = 'manual'`); }
  if (input.note !== undefined) { params.push(input.note); sets.push(`note = $${params.length}`); }
  await execute(`UPDATE warehouse_attendance SET ${sets.join(', ')} WHERE id = $1`, params);
}

/** Đánh dấu missing_checkout cho các bản ghi hôm trước chưa check-out (scheduler gọi) */
export async function flagMissingCheckouts(): Promise<number> {
  return execute(
    `UPDATE warehouse_attendance SET missing_checkout = TRUE
     WHERE work_date < $1 AND check_in_at IS NOT NULL AND check_out_at IS NULL AND missing_checkout = FALSE`,
    [vnToday()]
  );
}

/** Xóa ảnh chấm công quá hạn theo cấu hình từng kho. Trả số ảnh đã xóa. */
export async function purgeOldPhotos(): Promise<number> {
  const rows = await query<{ media_id: string | null }>(
    `DELETE FROM warehouse_photos p
     USING warehouse_workers w, warehouses wh
     WHERE p.worker_id = w.id AND w.warehouse_id = wh.id
       AND p.created_at < NOW() - (wh.photo_retention_days || ' days')::interval
     RETURNING p.media_id`
  );
  // Xoá mềm media kèm theo (best-effort — không chặn purge)
  for (const r of rows) {
    if (r.media_id) {
      try { await softDeleteMedia(r.media_id); } catch { /* nuốt lỗi */ }
    }
  }
  return rows.length;
}

/**
 * Chấm công của kho trong khoảng [from, to], GỘP THEO NGÀY (báo cáo ma trận ngày):
 * chế độ flex có nhiều đợt/ngày → hours = TỔNG giờ các đợt hợp lệ (giờ tự khai
 * pending/rejected không tính), check_in = đợt sớm nhất, check_out = đợt muộn nhất.
 */
export async function getRangeAttendance(warehouseId: string, from: string, to: string): Promise<any[]> {
  return query(
    `SELECT worker_id, work_date,
            MIN(check_in_at)  AS check_in_at,
            MAX(check_out_at) AS check_out_at,
            ROUND(SUM(
              CASE WHEN check_out_at IS NOT NULL
                    AND (declared_status IS NULL OR declared_status = 'approved')
                   THEN EXTRACT(EPOCH FROM (check_out_at - check_in_at)) / 3600.0
                   ELSE 0 END
            )::numeric, 1) AS hours
     FROM warehouse_attendance
     WHERE warehouse_id = $1 AND work_date BETWEEN $2 AND $3
     GROUP BY worker_id, work_date
     ORDER BY work_date`,
    [warehouseId, from, to]
  );
}

/** Chi tiết TỪNG ĐỢT trong khoảng [from, to] (sheet chi tiết của báo cáo). */
export async function getRangeSessionDetail(warehouseId: string, from: string, to: string): Promise<any[]> {
  return query(
    `SELECT a.worker_id, w.full_name, to_char(a.work_date, 'YYYY-MM-DD') AS day,
            a.session_no, a.check_in_at, a.check_out_at,
            a.check_in_method, a.check_out_method, a.declared_status,
            ROUND((EXTRACT(EPOCH FROM (a.check_out_at - a.check_in_at)) / 3600.0)::numeric, 2) AS hours,
            (SELECT json_agg(json_build_object('product', p.name, 'unit', p.unit,
                     'quantity', o.quantity, 'status', o.status) ORDER BY p.name)
               FROM warehouse_output o JOIN warehouse_products p ON p.id = o.product_id
              WHERE o.attendance_id = a.id) AS outputs
     FROM warehouse_attendance a
     JOIN warehouse_workers w ON w.id = a.worker_id
     WHERE a.warehouse_id = $1 AND a.work_date BETWEEN $2 AND $3
     ORDER BY a.work_date, w.full_name, a.session_no`,
    [warehouseId, from, to]
  );
}

/** Ngày nghỉ CÓ BÁO (đơn đã duyệt) trong khoảng, trải phẳng theo từng ngày */
export async function getRangeApprovedLeaveDays(warehouseId: string, from: string, to: string): Promise<{ worker_id: string; day: string }[]> {
  return query(
    `SELECT r.worker_id, to_char(d.day, 'YYYY-MM-DD') AS day
     FROM warehouse_leave_requests r
     CROSS JOIN LATERAL generate_series(r.from_date, r.to_date, interval '1 day') AS d(day)
     WHERE r.warehouse_id = $1 AND r.status = 'approved'
       AND d.day BETWEEN $2 AND $3`,
    [warehouseId, from, to]
  );
}

/** Ứng lương đã duyệt trong khoảng, gộp theo công nhân */
export async function getRangeApprovedAdvances(warehouseId: string, from: string, to: string): Promise<{ worker_id: string; total: number }[]> {
  return query(
    `SELECT worker_id, SUM(amount)::bigint AS total FROM warehouse_advances
     WHERE warehouse_id = $1 AND status = 'approved' AND decided_at::date BETWEEN $2 AND $3
     GROUP BY worker_id`,
    [warehouseId, from, to]
  );
}

/** Xóa 1 bản ghi chấm công + ảnh check-in/out kèm theo (phục vụ dọn dữ liệu test) */
export async function deleteAttendance(id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT check_in_photo_id, check_out_photo_id FROM warehouse_attendance WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return false;
    await client.query(`DELETE FROM warehouse_attendance WHERE id = $1`, [id]);
    const photoIds = [rows[0].check_in_photo_id, rows[0].check_out_photo_id].filter(Boolean);
    if (photoIds.length) {
      const del = await client.query(`DELETE FROM warehouse_photos WHERE id = ANY($1) RETURNING media_id`, [photoIds]);
      // Xoá mềm media kèm theo (best-effort)
      for (const r of del.rows as { media_id: string | null }[]) {
        if (r.media_id) {
          try { await softDeleteMedia(r.media_id); } catch { /* nuốt lỗi */ }
        }
      }
    }
    return true;
  });
}

/**
 * Tổng hợp công tháng cho cả kho: số NGÀY công (distinct ngày — flex có nhiều đợt/ngày),
 * tổng giờ (giờ tự khai pending/rejected không tính), số đợt quên checkout.
 */
export async function getMonthlySummary(warehouseId: string, month: string): Promise<any[]> {
  return query(
    `SELECT w.id AS worker_id, w.full_name, w.cccd, w.status,
            COUNT(DISTINCT a.work_date) FILTER (WHERE a.check_in_at IS NOT NULL) AS days_worked,
            ROUND(SUM(
              CASE WHEN a.check_out_at IS NOT NULL
                    AND (a.declared_status IS NULL OR a.declared_status = 'approved')
                   THEN EXTRACT(EPOCH FROM (a.check_out_at - a.check_in_at)) / 3600.0
                   ELSE 0 END
            )::numeric, 1) AS total_hours,
            COUNT(a.id) FILTER (WHERE a.check_in_at IS NOT NULL AND a.check_out_at IS NULL) AS missing_checkouts
     FROM warehouse_workers w
     LEFT JOIN warehouse_attendance a
       ON a.worker_id = w.id AND to_char(a.work_date, 'YYYY-MM') = $2
     WHERE w.warehouse_id = $1
     GROUP BY w.id, w.full_name, w.cccd, w.status
     HAVING COUNT(a.id) > 0 OR w.status = 'active'
     ORDER BY w.full_name`,
    [warehouseId, month]
  );
}
