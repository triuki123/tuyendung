import { query, queryOne, execute } from '@/lib/db';

export interface MachineMapping {
  id: string;
  machine_id: string;
  employee_code: string;
  user_id: string;
  effective_from?: string;
  effective_to?: string | null;
  user_name?: string;
  user_email?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Nhóm punch CHƯA có mapping (suy ra từ device_punches LEFT JOIN mappings).
 * Trong Projection Model không còn bảng attendance_unmatched — "chưa khớp" chỉ là
 * những (machine_id, employee_code) có punch nhưng chưa được gán user.
 */
export interface UnmatchedRecord {
  id: string;            // composite "machine_id|employee_code" để resolve
  machine_id: string;
  employee_code: string;
  event_type: string;    // suy ra theo giờ của punch gần nhất (chỉ để hiển thị)
  recorded_at: string;   // punch gần nhất
  resolved: boolean;     // luôn false (chưa map)
  punch_count: number;   // số punch của mã này
}

/**
 * Tra cứu user_id sở hữu mã TẠI MỘT THỜI ĐIỂM (temporal).
 * atTime mặc định = hiện tại. Dùng punch_time khi xử lý dữ liệu máy để gán đúng
 * người sở hữu mã tại lúc chấm (giải quyết tái sử dụng mã).
 */
export async function lookupUserId(
  machineId: string,
  employeeCode: string,
  atTime?: string
): Promise<string | null> {
  const at = atTime ?? new Date().toISOString();
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM attendance_machine_mappings
     WHERE machine_id = $1 AND employee_code = $2
       AND $3 >= effective_from
       AND (effective_to IS NULL OR $3 < effective_to)
     ORDER BY effective_from DESC
     LIMIT 1`,
    [machineId, employeeCode, at]
  );
  return row?.user_id ?? null;
}

/** Lấy tất cả mapping ĐANG HIỆU LỰC (effective_to IS NULL), kèm tên user */
export async function getAllMappings(machineId?: string, companyId?: string | null): Promise<MachineMapping[]> {
  const params: string[] = [];
  const conditions: string[] = ['m.effective_to IS NULL'];
  if (machineId) {
    params.push(machineId);
    conditions.push(`m.machine_id = $${params.length}`);
  }
  if (companyId) {
    params.push(companyId);
    conditions.push(`am.company_id::text = $${params.length}`);
  }
  return query<MachineMapping>(
    `SELECT m.*, u.name AS user_name, u.email AS user_email
     FROM attendance_machine_mappings m
     LEFT JOIN users u ON u.id::text = m.user_id::text
     LEFT JOIN attendance_machines am ON am.id = m.machine_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.machine_id, m.employee_code`,
    params
  );
}

/** Lịch sử chủ sở hữu của 1 mã (mọi giai đoạn, mới nhất trước) */
export async function getMappingHistory(machineId: string, employeeCode: string): Promise<MachineMapping[]> {
  return query<MachineMapping>(
    `SELECT m.*, u.name AS user_name, u.email AS user_email
     FROM attendance_machine_mappings m
     LEFT JOIN users u ON u.id::text = m.user_id::text
     WHERE m.machine_id = $1 AND m.employee_code = $2
     ORDER BY m.effective_from DESC`,
    [machineId, employeeCode]
  );
}

/** Lấy mapping của một user cụ thể */
export async function getUserMappings(userId: string): Promise<MachineMapping[]> {
  return query<MachineMapping>(
    `SELECT * FROM attendance_machine_mappings WHERE user_id = $1 ORDER BY machine_id`,
    [userId]
  );
}

export type MappingMode = 'assign' | 'correct' | 'handover';

/**
 * Gán mã ↔ nhân viên theo mô hình TEMPORAL (effective dating). 3 chế độ:
 *
 * - 'assign'   : mã chưa có chủ → tạo mapping mở, effective_from = 1970 (bao trùm toàn bộ
 *                lịch sử punch của mã về cho nhân viên này).
 * - 'correct'  : SỬA GÁN NHẦM → mapping hiện tại gán sai người ngay từ đầu → cập nhật user_id
 *                trên giai đoạn đang mở (toàn bộ punch của giai đoạn chuyển sang người đúng).
 * - 'handover' : BÀN GIAO mã cho người mới từ ngày effective_from → đóng giai đoạn cũ
 *                (effective_to = mốc bàn giao) và mở giai đoạn mới cho người mới.
 *                Punch TRƯỚC mốc → người cũ; SAU mốc → người mới (tự động đúng).
 *
 * Trả về { mapping, oldUserId } — oldUserId để caller refresh stats cả 2 người.
 */
export async function upsertMapping(data: {
  machine_id: string;
  employee_code: string;
  user_id: string;
  mode?: MappingMode;
  effective_from?: string;  // bắt buộc cho 'handover'
  created_by?: string;
}): Promise<{ mapping: MachineMapping; oldUserId: string | null }> {
  const mode = data.mode ?? 'assign';

  // Giai đoạn đang mở hiện tại (nếu có)
  const open = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM attendance_machine_mappings
     WHERE machine_id = $1 AND employee_code = $2 AND effective_to IS NULL`,
    [data.machine_id, data.employee_code]
  );
  const oldUserId = open?.user_id ?? null;

  // BÀN GIAO: đóng giai đoạn cũ tại mốc, mở giai đoạn mới
  if (mode === 'handover' && open) {
    const handoverAt = data.effective_from ?? new Date().toISOString();
    await execute(
      `UPDATE attendance_machine_mappings SET effective_to = $2, updated_at = NOW() WHERE id = $1`,
      [open.id, handoverAt]
    );
    const mapping = await queryOne<MachineMapping>(
      `INSERT INTO attendance_machine_mappings (machine_id, employee_code, user_id, effective_from, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.machine_id, data.employee_code, data.user_id, handoverAt, data.created_by ?? null]
    ) as MachineMapping;
    return { mapping, oldUserId: oldUserId !== data.user_id ? oldUserId : null };
  }

  // SỬA GÁN NHẦM: đổi user trên giai đoạn đang mở
  if (mode === 'correct' && open) {
    const mapping = await queryOne<MachineMapping>(
      `UPDATE attendance_machine_mappings SET user_id = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [open.id, data.user_id]
    ) as MachineMapping;
    return { mapping, oldUserId: oldUserId !== data.user_id ? oldUserId : null };
  }

  // GÁN MỚI (chưa có giai đoạn mở) — bao trùm toàn bộ lịch sử
  const mapping = await queryOne<MachineMapping>(
    `INSERT INTO attendance_machine_mappings (machine_id, employee_code, user_id, effective_from, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.machine_id, data.employee_code, data.user_id,
     data.effective_from ?? '1970-01-01 00:00:00+00', data.created_by ?? null]
  ) as MachineMapping;
  return { mapping, oldUserId: oldUserId !== data.user_id ? oldUserId : null };
}

/**
 * Gỡ mã: NHẢ SẠCH TOÀN BỘ — xóa MỌI giai đoạn của mã (machine_id, employee_code),
 * kể cả các giai đoạn đã đóng (bàn giao trước đây). Sau khi gỡ, mã trở về trạng thái
 * CHƯA GÁN, không người dùng nào còn giữ lịch sử gán mã này.
 *
 * Dữ liệu punch trong device_punches KHÔNG bị xóa — chỉ ẩn khỏi mọi user (JOIN rỗng).
 * Gắn lại mã cho người khác → punch hiện lại đầy đủ cho người mới ngay.
 *
 * Trả { userId } = chủ hiện tại (tương thích cũ) và { userIds } = mọi user từng
 * gắn với mã (để caller refresh stats cho tất cả).
 */
export async function deleteMapping(
  id: string,
  companyId?: string | null
): Promise<{ deleted: boolean; userId: string | null; userIds: string[] }> {
  // Xác định mã (machine_id, employee_code) từ dòng được chọn + kiểm công ty.
  const target = await queryOne<{ machine_id: string; employee_code: string; user_id: string }>(
    `SELECT m.machine_id, m.employee_code, m.user_id
       FROM attendance_machine_mappings m
       LEFT JOIN attendance_machines am ON am.id = m.machine_id
      WHERE m.id = $1 ${companyId ? 'AND am.company_id::text = $2' : ''}`,
    companyId ? [id, companyId] : [id]
  );
  if (!target) return { deleted: false, userId: null, userIds: [] };

  // Mọi user từng gắn với mã này (mọi giai đoạn) — để refresh stats sau khi gỡ.
  const affected = await query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM attendance_machine_mappings
      WHERE machine_id = $1 AND employee_code = $2`,
    [target.machine_id, target.employee_code]
  );
  const userIds = affected.map((a) => a.user_id).filter(Boolean);

  // Xóa TOÀN BỘ giai đoạn của mã → nhả sạch, không giữ lịch sử gán.
  await execute(
    `DELETE FROM attendance_machine_mappings WHERE machine_id = $1 AND employee_code = $2`,
    [target.machine_id, target.employee_code]
  );
  return { deleted: true, userId: target.user_id, userIds };
}

/** Danh sách các máy đã có mapping */
export async function getDistinctMachines(companyId?: string | null): Promise<string[]> {
  const rows = await query<{ machine_id: string }>(
    `SELECT DISTINCT m.machine_id
       FROM attendance_machine_mappings m
       LEFT JOIN attendance_machines am ON am.id = m.machine_id
      ${companyId ? 'WHERE am.company_id::text = $1' : ''}
      ORDER BY m.machine_id`,
    companyId ? [companyId] : []
  );
  return rows.map(r => r.machine_id);
}

/** 1 dòng trong "Danh bạ mã chấm công" — mọi mã từng xuất hiện trên máy + trạng thái gán. */
export interface DeviceCodeEntry {
  machine_id: string;
  employee_code: string;
  punch_count: number;
  first_seen: string;
  last_seen: string;
  mapping_id: string | null;   // null = chưa gán
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
}

/**
 * Danh bạ mã chấm công: MỌI (machine_id, employee_code) từng có punch trong device_punches,
 * kèm số lần chấm, lần đầu/cuối, và mapping hiện tại (nếu có).
 * Đây là nguồn để admin gán mã "correct-by-construction" — chỉ chọn mã có thật.
 * Sắp xếp: chưa gán & nhiều punch lên trước (cần xử lý nhất).
 */
export async function getDeviceCodeDirectory(companyId?: string | null): Promise<DeviceCodeEntry[]> {
  const rows = await query<{
    machine_id: string;
    employee_code: string;
    punch_count: string;
    first_seen: string;
    last_seen: string;
    mapping_id: string | null;
    user_id: string | null;
    user_name: string | null;
    user_email: string | null;
  }>(
    `SELECT dp.machine_id,
            dp.employee_code,
            COUNT(*)            AS punch_count,
            MIN(dp.punch_time)  AS first_seen,
            MAX(dp.punch_time)  AS last_seen,
            m.id                AS mapping_id,
            m.user_id,
            u.name              AS user_name,
            u.email             AS user_email
       FROM device_punches dp
       LEFT JOIN attendance_machines am ON am.id = dp.machine_id
       LEFT JOIN attendance_machine_mappings m
         ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
         AND m.effective_to IS NULL
       LEFT JOIN users u ON u.id::text = m.user_id::text
      ${companyId ? 'WHERE am.company_id::text = $1' : ''}
      GROUP BY dp.machine_id, dp.employee_code, m.id, m.user_id, u.name, u.email
      ORDER BY (m.user_id IS NULL) DESC, COUNT(*) DESC`,
    companyId ? [companyId] : []
  );

  return rows.map((r) => ({
    machine_id:    r.machine_id,
    employee_code: r.employee_code,
    punch_count:   parseInt(r.punch_count, 10),
    first_seen:    r.first_seen,
    last_seen:     r.last_seen,
    mapping_id:    r.mapping_id,
    user_id:       r.user_id,
    user_name:     r.user_name,
    user_email:    r.user_email,
  }));
}

/**
 * Suy ra danh sách punch CHƯA có mapping từ device_punches.
 * Gom theo (machine_id, employee_code) — mỗi mã 1 dòng, kèm số lần & lần gần nhất.
 */
export async function getUnmatchedFromPunches(companyId?: string | null): Promise<UnmatchedRecord[]> {
  const rows = await query<{
    machine_id: string;
    employee_code: string;
    recorded_at: string;
    punch_count: string;
  }>(
    `SELECT dp.machine_id, dp.employee_code,
            MAX(dp.punch_time) AS recorded_at,
            COUNT(*)           AS punch_count
       FROM device_punches dp
       LEFT JOIN attendance_machines am ON am.id = dp.machine_id
       LEFT JOIN attendance_machine_mappings m
         ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
         AND m.effective_to IS NULL
      WHERE m.user_id IS NULL
        ${companyId ? 'AND am.company_id::text = $1' : ''}
      GROUP BY dp.machine_id, dp.employee_code
      ORDER BY MAX(dp.punch_time) DESC`,
    companyId ? [companyId] : []
  );

  return rows.map((r) => {
    // event_type suy ra theo giờ VN của punch gần nhất (chỉ để hiển thị)
    const h = parseInt(
      new Date(r.recorded_at).toLocaleString('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hour12: false,
      })
    );
    return {
      id:            `${r.machine_id}|${r.employee_code}`,
      machine_id:    r.machine_id,
      employee_code: r.employee_code,
      event_type:    h < 12 ? 'check_in' : 'check_out',
      recorded_at:   r.recorded_at,
      resolved:      false,
      punch_count:   parseInt(r.punch_count, 10),
    };
  });
}
