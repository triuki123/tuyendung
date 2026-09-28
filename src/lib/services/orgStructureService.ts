import { query, queryOne, execute, withTransaction } from '@/lib/db';

/**
 * NGUỒN SỰ THẬT DUY NHẤT về cơ cấu tổ chức (bảng org_assignments — migration 223).
 *
 * Mô hình "một người – nhiều phân công":
 *  - Mỗi user có thể có nhiều phân công active (kiêm nhiệm nội bộ + đa công ty).
 *  - Đúng 1 phân công CHÍNH (is_primary) trên mỗi công ty (unique partial index).
 *  - department_id NULL = phân công CẤP CÔNG TY (tường minh, không phải "thiếu dữ liệu").
 *  - org_role: head / deputy / assistant / member — do UI khai báo, KHÔNG suy luận.
 *
 * Giai đoạn dual-write (Phase 2): cột org đơn lẻ trên users + user_company_memberships
 * vẫn là nơi ghi gốc; syncAssignmentsForUser() phản chiếu sang org_assignments.
 * Các module tiêu thụ sẽ chuyển dần sang đọc từ service này (Phase 4).
 * Thiết kế đầy đủ: docs/technical/org-structure-overhaul-plan.md
 */

export type OrgRole = 'head' | 'deputy' | 'assistant' | 'member';

export interface OrgAssignment {
  id: string;
  user_id: string;
  company_id: string;
  department_id: string | null;
  sub_department_id: string | null;
  /** Chức danh canonical — bảng positions (migration 225). */
  position_id: string | null;
  /** LEGACY — bảng job_titles gần như không có dữ liệu thật; giữ tương thích, sẽ gỡ Phase 6. */
  job_title_id: string | null;
  org_role: OrgRole;
  manager_id: string | null;
  is_primary: boolean;
  is_active: boolean;
  note?: string | null;
}

/** Tất cả phân công đang hiệu lực của user (mọi công ty, hoặc lọc theo 1 công ty). */
export async function getUserAssignments(
  userId: string,
  companyId?: string
): Promise<OrgAssignment[]> {
  const params: string[] = [userId];
  let sql = `SELECT * FROM org_assignments WHERE user_id::text = $1 AND is_active = true`;
  if (companyId) {
    params.push(companyId);
    sql += ` AND company_id::text = $2`;
  }
  sql += ` ORDER BY is_primary DESC, created_at`;
  return query<OrgAssignment>(sql, params);
}

/** Phân công CHÍNH của user tại 1 công ty (null nếu chưa được phân công). */
export async function getPrimaryAssignment(
  userId: string,
  companyId: string
): Promise<OrgAssignment | null> {
  return queryOne<OrgAssignment>(
    `SELECT * FROM org_assignments
      WHERE user_id::text = $1 AND company_id::text = $2
        AND is_primary AND is_active`,
    [userId, companyId]
  );
}

/**
 * Cấp bậc hiệu lực của user tại 1 công ty = cấp CAO NHẤT (số nhỏ nhất) trong các
 * phân công active có chức danh (positions.rank). Không có → null (người gọi tự quyết fallback).
 */
export async function getRank(userId: string, companyId: string): Promise<number | null> {
  const row = await queryOne<{ rank: number | null }>(
    `SELECT MIN(pos."rank")::int AS rank
       FROM org_assignments oa
       JOIN positions pos ON pos.id = oa.position_id
      WHERE oa.user_id::text = $1 AND oa.company_id::text = $2 AND oa.is_active`,
    [userId, companyId]
  );
  return row?.rank ?? null;
}

/**
 * Tập user_id trong cây báo cáo dưới managerId (đệ quy theo org_assignments.manager_id,
 * mọi phân công active — quyền của người kiêm nhiệm là HỢP NHẤT các vai trò).
 * Không bao gồm chính managerId. Giới hạn độ sâu 20 chống vòng lặp dữ liệu bẩn.
 */
export async function getOrgSubtreeUserIds(
  managerId: string,
  companyId?: string
): Promise<string[]> {
  const params: string[] = [managerId];
  let companyFilter = '';
  if (companyId) {
    params.push(companyId);
    companyFilter = ' AND oa.company_id::text = $2';
  }
  const rows = await query<{ user_id: string }>(
    `WITH RECURSIVE subtree AS (
       SELECT oa.user_id, 1 AS depth
         FROM org_assignments oa
        WHERE oa.manager_id::text = $1 AND oa.is_active${companyFilter}
       UNION
       SELECT oa.user_id, s.depth + 1
         FROM org_assignments oa
         JOIN subtree s ON oa.manager_id = s.user_id
        WHERE oa.is_active AND s.depth < 20${companyFilter}
     )
     SELECT DISTINCT user_id FROM subtree`,
    params
  );
  return rows.map((r) => r.user_id).filter((id) => id !== managerId);
}

/** Trưởng (head) đang hiệu lực của 1 đơn vị. unit cấp công ty: chỉ truyền companyId. */
export async function getUnitHead(unit: {
  companyId: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}): Promise<OrgAssignment | null> {
  return queryOne<OrgAssignment>(
    `SELECT * FROM org_assignments
      WHERE company_id::text = $1
        AND department_id IS NOT DISTINCT FROM $2::uuid
        AND sub_department_id IS NOT DISTINCT FROM $3::uuid
        AND org_role = 'head' AND is_active
      ORDER BY is_primary DESC LIMIT 1`,
    [unit.companyId, unit.departmentId ?? null, unit.subDepartmentId ?? null]
  );
}

// ---------------------------------------------------------------------------
// DUAL-WRITE (Phase 2): phản chiếu users + user_company_memberships → org_assignments
// ---------------------------------------------------------------------------

interface TargetAssignment {
  company_id: string;
  department_id: string | null;
  sub_department_id: string | null;
  position_id: string | null;
  job_title_id: string | null;
  manager_id: string | null;
}

/**
 * Đồng bộ các phân công CHÍNH của user từ nguồn ghi hiện hành:
 *  - users.(company_id, department_id, sub_department_id, job_title_id, manager_id) → công ty chính
 *  - user_company_memberships active → mỗi công ty phụ 1 phân công chính
 * Quy tắc:
 *  - Upsert theo (user, company): có rồi thì UPDATE các cột org, GIỮ NGUYÊN org_role
 *    (org_role là dữ liệu khai báo qua UI, không bị ghi đè bởi sync).
 *  - Phân công chính ở công ty không còn trong nguồn → is_active = false.
 *  - Phân công KHÔNG-primary (kiêm nhiệm thêm qua UI mới) không bị đụng tới.
 * An toàn gọi lặp (idempotent). Người gọi nên bọc try/catch để dual-write lỗi
 * không làm gãy luồng nghiệp vụ gốc trong giai đoạn chuyển tiếp.
 */
export async function syncAssignmentsForUser(userId: string): Promise<void> {
  const u = await queryOne<any>(
    `SELECT id, status, company_id, department_id, sub_department_id, position_id, job_title_id, manager_id
       FROM users WHERE id::text = $1`,
    [userId]
  );
  if (!u) return;

  const targets: TargetAssignment[] = [];
  if (u.status === 'active' && u.company_id) {
    targets.push({
      company_id: u.company_id,
      department_id: u.department_id ?? null,
      sub_department_id: u.sub_department_id ?? null,
      position_id: u.position_id ?? null,
      job_title_id: u.job_title_id ?? null,
      manager_id: u.manager_id ?? null,
    });
  }
  if (u.status === 'active') {
    const memberships = await query<any>(
      `SELECT company_id, department_id, sub_department_id, position_id, job_title_id, manager_id
         FROM user_company_memberships
        WHERE user_id::text = $1 AND is_active = true`,
      [userId]
    );
    for (const m of memberships) {
      if (!m.company_id || m.company_id === u.company_id) continue;
      targets.push({
        company_id: m.company_id,
        department_id: m.department_id ?? null,
        sub_department_id: m.sub_department_id ?? null,
        position_id: m.position_id ?? null,
        job_title_id: m.job_title_id ?? null,
        manager_id: m.manager_id ?? null,
      });
    }
  }

  const { randomUUID } = await import('crypto');
  for (const t of targets) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM org_assignments
        WHERE user_id::text = $1 AND company_id::text = $2 AND is_primary AND is_active`,
      [userId, t.company_id]
    );
    if (existing) {
      await execute(
        `UPDATE org_assignments
            SET department_id = $2, sub_department_id = $3, position_id = $4,
                job_title_id = $5, manager_id = $6, updated_at = now()
          WHERE id = $1`,
        [existing.id, t.department_id, t.sub_department_id, t.position_id, t.job_title_id, t.manager_id]
      );
    } else {
      await execute(
        `INSERT INTO org_assignments
           (id, user_id, company_id, department_id, sub_department_id, position_id, job_title_id,
            org_role, manager_id, is_primary, is_active, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'member',$8,true,true,'dual-write sync')`,
        [randomUUID(), userId, t.company_id, t.department_id, t.sub_department_id, t.position_id, t.job_title_id, t.manager_id]
      );
    }
  }

  // Công ty không còn tư cách (mất membership / đổi công ty chính) → tắt TOÀN BỘ
  // phân công tại đó (kể cả kiêm nhiệm) — bất biến "phân công đòi hỏi tư cách công ty".
  const keepIds = targets.map((t) => t.company_id);
  await execute(
    `UPDATE org_assignments SET is_active = false, updated_at = now()
      WHERE user_id::text = $1 AND is_active
        AND NOT (company_id::text = ANY($2::text[]))`,
    [userId, keepIds]
  );
}

/** Tắt TOÀN BỘ phân công của user (offboarding / deactivate). */
export async function deactivateAllAssignments(userId: string): Promise<void> {
  await execute(
    `UPDATE org_assignments SET is_active = false, updated_at = now()
      WHERE user_id::text = $1 AND is_active`,
    [userId]
  );
}

/**
 * Gọi sync trong luồng ghi nghiệp vụ: nuốt lỗi (log) để giai đoạn dual-write
 * không bao giờ làm gãy luồng gốc (tạo/sửa user, duyệt onboarding...).
 */
export async function trySyncAssignments(userId: string): Promise<void> {
  try {
    await syncAssignmentsForUser(userId);
  } catch (err) {
    console.error('orgStructureService.syncAssignmentsForUser error (dual-write):', err);
  }
}

// ---------------------------------------------------------------------------
// CRUD phân công (UI tab "Phân Công" — Phase 3)
// ---------------------------------------------------------------------------

export interface OrgAssignmentDetailed extends OrgAssignment {
  company_name: string | null;
  department_name: string | null;
  sub_department_name: string | null;
  /** false = phòng ban đã xóa mềm — UI gắn nhãn "(đã xóa)". */
  department_active: boolean;
  /** false = bộ phận đã xóa mềm — UI gắn nhãn "(đã xóa)". */
  sub_department_active: boolean;
  position_name: string | null;
  position_rank: number | null;
  manager_name: string | null;
}

/** Danh sách phân công của user kèm tên đơn vị/chức danh/quản lý để hiển thị. */
export async function listAssignmentsDetailed(userId: string): Promise<OrgAssignmentDetailed[]> {
  return query<OrgAssignmentDetailed>(
    `SELECT oa.*,
            c.name  AS company_name,
            d.name  AS department_name,
            sd.name AS sub_department_name,
            -- Cờ đơn vị ĐÃ BỊ XÓA MỀM (is_active=false): phân công vẫn trỏ tới nhưng
            -- UI phải gắn nhãn "(đã xóa)" — nếu không, đơn vị chết hiện như còn sống.
            COALESCE(d.is_active, TRUE)  AS department_active,
            COALESCE(sd.is_active, TRUE) AS sub_department_active,
            pos.name AS position_name,
            pos."rank" AS position_rank,
            m.name  AS manager_name
       FROM org_assignments oa
       LEFT JOIN companies c        ON c.id  = oa.company_id
       LEFT JOIN departments d      ON d.id  = oa.department_id
       LEFT JOIN sub_departments sd ON sd.id = oa.sub_department_id
       LEFT JOIN positions pos      ON pos.id = oa.position_id
       LEFT JOIN users m            ON m.id  = oa.manager_id
      WHERE oa.user_id::text = $1 AND oa.is_active = true
      ORDER BY oa.is_primary DESC, oa.created_at`,
    [userId]
  );
}

export interface AssignmentInput {
  company_id: string;
  department_id?: string | null;
  sub_department_id?: string | null;
  position_id?: string | null;
  /** LEGACY — chỉ giữ tương thích; UI mới dùng position_id. */
  job_title_id?: string | null;
  org_role?: OrgRole;
  manager_id?: string | null;
  is_primary?: boolean;
  note?: string | null;
}

/**
 * Sau khi UI sửa phân công CHÍNH, phản chiếu ngược về nguồn ghi cũ
 * (users nếu là công ty chính, user_company_memberships nếu công ty phụ)
 * để các module CHƯA chuyển đổi (Phase 4) vẫn thấy dữ liệu đúng.
 */
async function reverseSyncPrimary(userId: string, companyId: string): Promise<void> {
  const a = await getPrimaryAssignment(userId, companyId);
  if (!a) return;
  const u = await queryOne<any>(`SELECT company_id FROM users WHERE id::text = $1`, [userId]);
  if (!u) return;
  if (u.company_id === companyId) {
    await execute(
      `UPDATE users
          SET department_id = $2, sub_department_id = $3, position_id = $4,
              manager_id = $5, department = $6, updated_at = now()
        WHERE id::text = $1`,
      [userId, a.department_id, a.sub_department_id, a.position_id, a.manager_id,
       a.department_id ? String(a.department_id) : '']
    );
  } else {
    await execute(
      `UPDATE user_company_memberships
          SET department_id = $3, sub_department_id = $4, position_id = $5,
              manager_id = $6, updated_at = now()
        WHERE user_id::text = $1 AND company_id::text = $2`,
      [userId, companyId, a.department_id, a.sub_department_id, a.position_id, a.manager_id]
    );
  }
}

/**
 * LIÊN KẾT ĐA CÔNG TY ⇄ PHÂN CÔNG (bất biến của hệ thống):
 *  - Đa Công Ty (user_company_memberships) = TƯ CÁCH TÀI KHOẢN tại công ty (role + quyền module).
 *  - Phân công (org_assignments) = VỊ TRÍ TỔ CHỨC tại công ty.
 *  - Ràng buộc: phân công tại công ty X đòi hỏi tư cách tại X. Tạo phân công ở công ty
 *    chưa có tư cách → TỰ tạo membership tối thiểu (role 'user', chưa cấp module) để
 *    admin cấp quyền sau ở tab Đa Công Ty. Gỡ tư cách → mọi phân công tại đó tự tắt
 *    (xem syncAssignmentsForUser).
 */
async function ensureCompanyMembership(userId: string, companyId: string): Promise<boolean> {
  const u = await queryOne<{ company_id: string | null }>(
    `SELECT company_id FROM users WHERE id::text = $1`, [userId]
  );
  if (u?.company_id === companyId) return false; // công ty chính — tư cách sẵn có
  const m = await queryOne<{ id: string }>(
    `SELECT id FROM user_company_memberships
      WHERE user_id::text = $1 AND company_id::text = $2 AND is_active = true`,
    [userId, companyId]
  );
  if (m) return false;
  const { randomUUID } = await import('crypto');
  await execute(
    `INSERT INTO user_company_memberships
       (id, user_id, company_id, role, is_active, updated_at)
     VALUES ($1, $2, $3, 'user', true, now())
     ON CONFLICT (user_id, company_id) DO UPDATE SET is_active = true, updated_at = now()`,
    [randomUUID(), userId, companyId]
  );
  return true;
}

/** Tạo phân công mới (kiêm nhiệm). is_primary=true sẽ hạ phân công chính cũ cùng công ty. */
export async function createAssignment(
  userId: string,
  input: AssignmentInput
): Promise<OrgAssignment & { membership_created?: boolean }> {
  // Phân công ở công ty chưa có tư cách → tự tạo membership tối thiểu (liên kết Đa Công Ty)
  const membershipCreated = await ensureCompanyMembership(userId, input.company_id);
  const { randomUUID } = await import('crypto');
  const id = randomUUID();
  if (input.is_primary) {
    await execute(
      `UPDATE org_assignments SET is_primary = false, updated_at = now()
        WHERE user_id::text = $1 AND company_id::text = $2 AND is_primary AND is_active`,
      [userId, input.company_id]
    );
  }
  const row = await queryOne<OrgAssignment>(
    `INSERT INTO org_assignments
       (id, user_id, company_id, department_id, sub_department_id, position_id, job_title_id,
        org_role, manager_id, is_primary, is_active, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)
     RETURNING *`,
    [
      id, userId, input.company_id,
      input.department_id || null, input.sub_department_id || null,
      input.position_id || null, input.job_title_id || null,
      input.org_role || 'member', input.manager_id || null,
      input.is_primary === true, input.note || null,
    ]
  );
  if (!row) throw new Error('Không tạo được phân công');
  if (row.is_primary) await reverseSyncPrimary(userId, input.company_id);
  if (row.org_role === 'head') await afterHeadChange(row, true);
  return { ...row, membership_created: membershipCreated };
}

/** Cập nhật phân công. Đặt is_primary=true sẽ hạ phân công chính cũ cùng công ty. */
export async function updateAssignment(
  assignmentId: string,
  patch: Partial<AssignmentInput>
): Promise<OrgAssignment | null> {
  const current = await queryOne<OrgAssignment>(
    `SELECT * FROM org_assignments WHERE id = $1 AND is_active`,
    [assignmentId]
  );
  if (!current) return null;

  if (patch.is_primary === true && !current.is_primary) {
    await execute(
      `UPDATE org_assignments SET is_primary = false, updated_at = now()
        WHERE user_id = $1 AND company_id = $2 AND is_primary AND is_active AND id <> $3`,
      [current.user_id, current.company_id, assignmentId]
    );
  }

  const row = await queryOne<OrgAssignment>(
    `UPDATE org_assignments
        SET department_id     = $2,
            sub_department_id = $3,
            position_id       = $4,
            job_title_id      = $5,
            org_role          = $6,
            manager_id        = $7,
            is_primary        = $8,
            note              = $9,
            updated_at        = now()
      WHERE id = $1
      RETURNING *`,
    [
      assignmentId,
      patch.department_id !== undefined ? patch.department_id || null : current.department_id,
      patch.sub_department_id !== undefined ? patch.sub_department_id || null : current.sub_department_id,
      patch.position_id !== undefined ? patch.position_id || null : current.position_id,
      patch.job_title_id !== undefined ? patch.job_title_id || null : current.job_title_id,
      patch.org_role || current.org_role,
      patch.manager_id !== undefined ? patch.manager_id || null : current.manager_id,
      patch.is_primary !== undefined ? patch.is_primary : current.is_primary,
      patch.note !== undefined ? patch.note : current.note ?? null,
    ]
  );
  if (row?.is_primary) await reverseSyncPrimary(row.user_id, row.company_id);
  if (row && (row.org_role === 'head' || current.org_role === 'head')) {
    // Trở thành head → hạ head cũ; thôi làm head / đổi đơn vị → sync lại cột head_id cả 2 phía
    await afterHeadChange(row, row.org_role === 'head');
    if (current.org_role === 'head' &&
        (current.department_id !== row.department_id || current.sub_department_id !== row.sub_department_id)) {
      await afterHeadChange(current, false);
    }
  }
  return row;
}

/**
 * Kết thúc phân công (is_active=false).
 *
 * Với phân công CHÍNH phải gỡ tận gốc, nếu không dual-write sẽ TỰ TẠO LẠI từ hồ sơ:
 *  - chính tại CÔNG TY CHÍNH (users.company_id) → CHẶN, hướng dẫn đổi công ty ở
 *    tab Thông Tin (kết thúc ở đây đồng nghĩa gỡ người khỏi công ty chính — quyết
 *    định lớn, phải làm ở hồ sơ).
 *  - chính tại CÔNG TY PHỤ → tắt luôn tư cách Đa Công Ty (membership) của công ty
 *    đó — nguồn gốc sinh ra phân công — rồi mới tắt phân công.
 * Không tự chọn phân công chính thay thế — màn "Sức khoẻ tổ chức" sẽ cảnh báo.
 */
export async function endAssignment(assignmentId: string): Promise<boolean> {
  const current = await queryOne<OrgAssignment>(
    `SELECT * FROM org_assignments WHERE id = $1 AND is_active`,
    [assignmentId]
  );
  if (!current) return false;

  if (current.is_primary) {
    const u = await queryOne<{ company_id: string | null }>(
      `SELECT company_id::text AS company_id FROM users WHERE id = $1`,
      [current.user_id]
    );
    if (u?.company_id && u.company_id === String(current.company_id)) {
      throw new Error(
        'Đây là phân công CHÍNH tại công ty chính của người này — không thể kết thúc tại đây. ' +
        'Muốn chuyển công ty, hãy đổi "Công Ty" ở tab Thông Tin; phân công sẽ tự cập nhật theo.'
      );
    }
    // Công ty phụ: gỡ tư cách Đa Công Ty để dual-write không tạo lại phân công
    await execute(
      `UPDATE user_company_memberships SET is_active = false, updated_at = now()
        WHERE user_id = $1 AND company_id = $2 AND is_active`,
      [current.user_id, current.company_id]
    );
  }

  const n = await execute(
    `UPDATE org_assignments SET is_active = false, updated_at = now() WHERE id = $1 AND is_active`,
    [assignmentId]
  );
  if (n > 0 && current.org_role === 'head') await afterHeadChange(current, false);
  return n > 0;
}

// ---------------------------------------------------------------------------
// Trưởng đơn vị — đồng bộ HAI CHIỀU giữa org_assignments (org_role='head')
// và cột denormalized head_id trên companies/departments/sub_departments
// ---------------------------------------------------------------------------

interface UnitRef {
  companyId: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}

/**
 * Chuẩn hoá UnitRef: bộ phận truyền thiếu departmentId cha (UI có chỗ chỉ gửi
 * company + sub) → tự tra từ sub_departments để mọi phép khớp đơn vị nhất quán.
 */
async function normalizeUnit(unit: UnitRef): Promise<UnitRef> {
  if (unit.subDepartmentId && !unit.departmentId) {
    const r = await queryOne<{ department_id: string | null }>(
      `SELECT department_id::text AS department_id FROM sub_departments WHERE id::text = $1`,
      [unit.subDepartmentId]
    );
    return { ...unit, departmentId: r?.department_id ?? null };
  }
  return unit;
}

/** Cập nhật cột head_id denormalized của đơn vị theo head hiện hành trong org_assignments. */
async function syncUnitHeadColumn(unit: UnitRef): Promise<void> {
  const head = await getUnitHead(unit);
  const headId = head?.user_id ?? null;
  if (unit.subDepartmentId) {
    await execute(`UPDATE sub_departments SET head_id = $2 WHERE id::text = $1`, [unit.subDepartmentId, headId]);
  } else if (unit.departmentId) {
    await execute(`UPDATE departments SET head_id = $2 WHERE id::text = $1`, [unit.departmentId, headId]);
  } else {
    // companies.head_id là TEXT (migration 138)
    await execute(`UPDATE companies SET head_id = $2 WHERE id::text = $1`, [unit.companyId, headId ? String(headId) : null]);
  }
}

/**
 * Gán TRƯỞNG cho 1 đơn vị (từ trang Cơ Cấu Tổ Chức hoặc bất kỳ luồng nào ghi head_id):
 *  - hạ head cũ của đơn vị xuống member,
 *  - user mới: nâng phân công sẵn có tại đơn vị lên head, hoặc tạo phân công mới
 *    (không phải phân công chính — không đụng vai trò chính hiện tại của user),
 *  - đồng bộ cột head_id denormalized.
 * userId = null → chỉ gỡ head hiện tại.
 */
export async function setUnitHead(rawUnit: UnitRef, userId: string | null): Promise<void> {
  const unit = await normalizeUnit(rawUnit);
  // Quy tắc "Phân công trước, gán chức sau": chỉ người ĐÃ có phân công active tại
  // công ty mới được gán làm trưởng đơn vị (UI cũng chỉ liệt kê những người này).
  if (userId) {
    const hasAssignment = await queryOne<{ id: string }>(
      `SELECT id FROM org_assignments
        WHERE user_id::text = $1 AND company_id::text = $2 AND is_active LIMIT 1`,
      [userId, unit.companyId]
    );
    if (!hasAssignment) {
      throw new Error(
        'Người này chưa được phân công tại công ty — hãy thêm phân công trong hồ sơ người dùng (tab Phân Công) trước khi gán làm trưởng đơn vị.'
      );
    }
  }

  // 1. Hạ head cũ (khác user mới) xuống member
  await execute(
    `UPDATE org_assignments SET org_role = 'member', updated_at = now()
      WHERE company_id::text = $1
        AND department_id IS NOT DISTINCT FROM $2::uuid
        AND sub_department_id IS NOT DISTINCT FROM $3::uuid
        AND org_role = 'head' AND is_active
        AND ($4::text IS NULL OR user_id::text <> $4)`,
    [unit.companyId, unit.departmentId ?? null, unit.subDepartmentId ?? null, userId]
  );

  if (userId) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM org_assignments
        WHERE user_id::text = $1 AND company_id::text = $2
          AND department_id IS NOT DISTINCT FROM $3::uuid
          AND sub_department_id IS NOT DISTINCT FROM $4::uuid
          AND is_active`,
      [userId, unit.companyId, unit.departmentId ?? null, unit.subDepartmentId ?? null]
    );
    if (existing) {
      await execute(
        `UPDATE org_assignments SET org_role = 'head', updated_at = now() WHERE id = $1`,
        [existing.id]
      );
    } else {
      const { randomUUID } = await import('crypto');
      await execute(
        `INSERT INTO org_assignments
           (id, user_id, company_id, department_id, sub_department_id,
            org_role, is_primary, is_active, note)
         VALUES ($1,$2,$3,$4,$5,'head',false,true,'gán trưởng từ trang Cơ Cấu Tổ Chức')`,
        [randomUUID(), userId, unit.companyId, unit.departmentId ?? null, unit.subDepartmentId ?? null]
      );
    }
  }

  await syncUnitHeadColumn(unit);
}

/**
 * Gán danh sách PHÓ đơn vị (một đơn vị có thể nhiều Phó — khác Trưởng chỉ 1):
 *  - user trong danh sách: nâng phân công sẵn có tại đơn vị lên 'deputy'
 *    (không đụng người đang là head), hoặc tạo phân công marker nếu chưa có tại đơn vị
 *    (vẫn đòi hỏi ĐÃ có phân công tại công ty — quy tắc "Phân công trước, gán chức sau").
 *  - deputy hiện tại KHÔNG còn trong danh sách → hạ xuống member.
 */
export async function setUnitDeputies(unit: UnitRef, userIds: string[]): Promise<void> {
  return setUnitRoleMembers(unit, 'deputy', userIds);
}

/** Gán danh sách TRỢ LÝ đơn vị (nhiều người, đồng cấp hỗ trợ) — cùng cơ chế Phó. */
export async function setUnitAssistants(unit: UnitRef, userIds: string[]): Promise<void> {
  return setUnitRoleMembers(unit, 'assistant', userIds);
}

const ROLE_LABEL: Record<string, string> = { deputy: 'Phó đơn vị', assistant: 'Trợ lý đơn vị' };

// ---------------------------------------------------------------------------
// Người giữ CHỨC VỤ CẤP CÔNG TY (Giám Đốc, GĐĐH, Founder, Cố Vấn...) —
// = org_assignment cấp công ty (department NULL) mang position_id, org_role='member',
// KHÔNG primary. Không đụng phân công chính/phòng ban của họ.
// ---------------------------------------------------------------------------

export interface CompanyPositionHolder { id: string; name: string; avatar: string | null }

/** { position_id → danh sách người giữ chức vụ cấp công ty đó }. */
export async function getCompanyPositionHolders(
  companyId: string
): Promise<Record<string, CompanyPositionHolder[]>> {
  const rows = await query<{ position_id: string; id: string; name: string; avatar: string | null }>(
    `SELECT oa.position_id::text AS position_id, u.id::text AS id, u.name, u.avatar
       FROM org_assignments oa
       JOIN users u ON u.id = oa.user_id AND u.status = 'active'
      WHERE oa.company_id::text = $1 AND oa.department_id IS NULL AND oa.sub_department_id IS NULL
        AND oa.position_id IS NOT NULL AND oa.is_active
      ORDER BY u.name`,
    [companyId]
  );
  const out: Record<string, CompanyPositionHolder[]> = {};
  for (const r of rows) {
    (out[r.position_id] ||= []).push({ id: r.id, name: r.name, avatar: r.avatar });
  }
  return out;
}

/** Thay TOÀN BỘ người giữ 1 chức vụ cấp công ty. Chỉ đụng assignment cấp công ty KHÔNG primary. */
export async function setCompanyPositionHolders(
  companyId: string, positionId: string, userIds: string[]
): Promise<void> {
  // Gỡ người không còn trong danh sách (chỉ holder cấp công ty không-primary của đúng chức vụ này).
  await execute(
    `UPDATE org_assignments SET is_active = false, updated_at = now()
      WHERE company_id::text = $1 AND department_id IS NULL AND sub_department_id IS NULL
        AND position_id::text = $2 AND is_active AND NOT is_primary
        AND ($3::text[] IS NULL OR NOT (user_id::text = ANY($3)))`,
    [companyId, positionId, userIds.length ? userIds : null]
  );
  // Thêm người mới (nếu chưa có holder active cho chức vụ này).
  for (const uid of userIds) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM org_assignments
        WHERE company_id::text = $1 AND department_id IS NULL AND sub_department_id IS NULL
          AND position_id::text = $2 AND user_id::text = $3 AND is_active LIMIT 1`,
      [companyId, positionId, uid]
    );
    if (!existing) {
      const { randomUUID } = await import('crypto');
      await execute(
        `INSERT INTO org_assignments
           (id, user_id, company_id, department_id, sub_department_id, position_id,
            org_role, is_primary, is_active, note)
         VALUES ($1, $2::uuid, $3::uuid, NULL, NULL, $4::uuid, 'member', false, true, 'chức vụ cấp công ty')`,
        [randomUUID(), uid, companyId, positionId]
      );
    }
  }
}

/**
 * Cơ chế chung gán vai trò NHIỀU-NGƯỜI của đơn vị (deputy/assistant):
 * user trong danh sách được nâng lên vai trò đó; ai đang giữ vai trò mà không còn
 * trong danh sách → hạ về member. Trưởng (head) không bao giờ bị hạ bởi hàm này.
 */
async function setUnitRoleMembers(
  rawUnit: UnitRef,
  role: 'deputy' | 'assistant',
  userIds: string[]
): Promise<void> {
  const unit = await normalizeUnit(rawUnit);
  const clean = [...new Set(userIds.filter(Boolean))];

  // Quy tắc phân công trước: mọi user phải có phân công active tại công ty
  for (const uid of clean) {
    const has = await queryOne<{ id: string }>(
      `SELECT id FROM org_assignments
        WHERE user_id::text = $1 AND company_id::text = $2 AND is_active LIMIT 1`,
      [uid, unit.companyId]
    );
    if (!has) {
      const u = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id::text = $1`, [uid]);
      throw new Error(
        `"${u?.name ?? uid}" chưa được phân công tại công ty — hãy thêm phân công trong hồ sơ người dùng trước khi gán làm ${ROLE_LABEL[role]}.`
      );
    }
  }

  // Hạ người giữ vai trò này mà không còn trong danh sách
  await execute(
    `UPDATE org_assignments SET org_role = 'member', updated_at = now()
      WHERE company_id::text = $1
        AND department_id IS NOT DISTINCT FROM $2::uuid
        AND sub_department_id IS NOT DISTINCT FROM $3::uuid
        AND org_role = $4 AND is_active
        AND NOT (user_id::text = ANY($5::text[]))`,
    [unit.companyId, unit.departmentId ?? null, unit.subDepartmentId ?? null, role, clean]
  );

  for (const uid of clean) {
    const existing = await queryOne<{ id: string; org_role: string }>(
      `SELECT id, org_role FROM org_assignments
        WHERE user_id::text = $1 AND company_id::text = $2
          AND department_id IS NOT DISTINCT FROM $3::uuid
          AND sub_department_id IS NOT DISTINCT FROM $4::uuid
          AND is_active`,
      [uid, unit.companyId, unit.departmentId ?? null, unit.subDepartmentId ?? null]
    );
    if (existing) {
      // Không hạ cấp người đang là Trưởng — Trưởng ưu tiên hơn Phó/Trợ lý
      if (existing.org_role !== 'head' && existing.org_role !== role) {
        await execute(
          `UPDATE org_assignments SET org_role = $2, updated_at = now() WHERE id = $1`,
          [existing.id, role]
        );
      }
    } else {
      const { randomUUID } = await import('crypto');
      await execute(
        `INSERT INTO org_assignments
           (id, user_id, company_id, department_id, sub_department_id,
            org_role, is_primary, is_active, note)
         VALUES ($1,$2,$3,$4,$5,$6,false,true,$7)`,
        [randomUUID(), uid, unit.companyId, unit.departmentId ?? null, unit.subDepartmentId ?? null, role,
         `gán ${ROLE_LABEL[role]} từ trang Cơ Cấu Tổ Chức`]
      );
    }
  }
}

/** Danh sách Phó hiện hành của 1 đơn vị. */
export async function getUnitDeputies(rawUnit: UnitRef): Promise<OrgAssignment[]> {
  const unit = await normalizeUnit(rawUnit);
  return query<OrgAssignment>(
    `SELECT * FROM org_assignments
      WHERE company_id::text = $1
        AND department_id IS NOT DISTINCT FROM $2::uuid
        AND sub_department_id IS NOT DISTINCT FROM $3::uuid
        AND org_role = 'deputy' AND is_active`,
    [unit.companyId, unit.departmentId ?? null, unit.subDepartmentId ?? null]
  );
}

/**
 * Bọc setUnitHead không ném lỗi (không làm gãy việc lưu đơn vị), nhưng TRẢ VỀ
 * message cảnh báo để API đính kèm response → UI toast cho người dùng biết
 * việc gán trưởng KHÔNG thành công (tránh "lưu ảo" âm thầm).
 */
export async function trySetUnitHead(unit: UnitRef, userId: string | null): Promise<string | null> {
  try {
    await setUnitHead(unit, userId);
    return null;
  } catch (err) {
    console.error('orgStructureService.setUnitHead error:', err);
    return err instanceof Error ? err.message : 'Không đồng bộ được trưởng đơn vị';
  }
}

/**
 * Sau khi 1 phân công đổi org_role liên quan 'head' (qua tab Phân Công):
 * đảm bảo mỗi đơn vị chỉ 1 head + đồng bộ cột head_id.
 */
async function afterHeadChange(row: OrgAssignment, becameHead: boolean): Promise<void> {
  const unit: UnitRef = {
    companyId: row.company_id,
    departmentId: row.department_id,
    subDepartmentId: row.sub_department_id,
  };
  if (becameHead) {
    await execute(
      `UPDATE org_assignments SET org_role = 'member', updated_at = now()
        WHERE company_id = $1
          AND department_id IS NOT DISTINCT FROM $2::uuid
          AND sub_department_id IS NOT DISTINCT FROM $3::uuid
          AND org_role = 'head' AND is_active AND id <> $4`,
      [row.company_id, row.department_id, row.sub_department_id, row.id]
    );
  }
  await syncUnitHeadColumn(unit);
}

// ---------------------------------------------------------------------------
// ĐƠN VỊ ẨN (xoá mềm is_active=false) — soi tầng DB + xoá cứng an toàn
// ---------------------------------------------------------------------------

export interface HiddenUnit {
  unit_type: 'company' | 'department' | 'sub_department';
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  parent_name: string | null;          // phòng ban cha (với bộ phận)
  active_assignments: number;          // phân công active còn trỏ vào
  users_referencing: number;           // users.*_id còn trỏ vào
  child_units: number;                 // đơn vị con còn trong DB (với công ty)
}

/**
 * Liệt kê TOÀN BỘ đơn vị đã xoá mềm (is_active=false) còn nằm trong DB,
 * kèm số tham chiếu đang "ngầm gán" — để admin quyết định xoá cứng.
 */
export async function listHiddenUnits(companyId?: string): Promise<HiddenUnit[]> {
  const p: string[] = [];
  let f1 = '', f2 = '';
  if (companyId) {
    p.push(companyId);
    f1 = ` AND d.company_id::text = $1`;
    f2 = ` AND pd.company_id::text = $1`;
  }
  // Công ty ẩn (chỉ khi không lọc theo công ty, hoặc lọc trùng chính nó)
  const companies = await query<HiddenUnit>(
    `SELECT 'company' AS unit_type, c.id::text AS id, c.name,
            c.id::text AS company_id, c.name AS company_name,
            NULL AS parent_name,
            (SELECT count(*)::int FROM org_assignments oa
              WHERE oa.company_id = c.id AND oa.is_active) AS active_assignments,
            (SELECT count(*)::int FROM users u
              WHERE u.company_id = c.id AND u.status = 'active') AS users_referencing,
            (SELECT count(*)::int FROM departments d WHERE d.company_id = c.id) AS child_units
       FROM companies c
      WHERE c.is_active = false${companyId ? ` AND c.id::text = $1` : ''}
      ORDER BY c.name`,
    p
  );

  const depts = await query<HiddenUnit>(
    `SELECT 'department' AS unit_type, d.id::text AS id, d.name,
            d.company_id::text AS company_id, c.name AS company_name,
            NULL AS parent_name,
            (SELECT count(*)::int FROM org_assignments oa
              WHERE oa.department_id = d.id AND oa.is_active) AS active_assignments,
            (SELECT count(*)::int FROM users u
              WHERE u.department_id = d.id AND u.status = 'active') AS users_referencing,
            (SELECT count(*)::int FROM sub_departments sd WHERE sd.department_id = d.id) AS child_units
       FROM departments d
       LEFT JOIN companies c ON c.id = d.company_id
      WHERE d.is_active = false${f1}
      ORDER BY c.name NULLS FIRST, d.name`,
    p
  );
  const subs = await query<HiddenUnit>(
    `SELECT 'sub_department' AS unit_type, sd.id::text AS id, sd.name,
            pd.company_id::text AS company_id, c.name AS company_name,
            pd.name AS parent_name,
            (SELECT count(*)::int FROM org_assignments oa
              WHERE oa.sub_department_id = sd.id AND oa.is_active) AS active_assignments,
            (SELECT count(*)::int FROM users u
              WHERE u.sub_department_id::text = sd.id::text AND u.status = 'active') AS users_referencing,
            0 AS child_units
       FROM sub_departments sd
       LEFT JOIN departments pd ON pd.id = sd.department_id
       LEFT JOIN companies c ON c.id = pd.company_id
      WHERE sd.is_active = false${f2}
      ORDER BY c.name NULLS FIRST, sd.name`,
    p
  );
  return [...companies, ...depts, ...subs];
}

/**
 * XOÁ CỨNG 1 đơn vị ẩn — dọn sạch tham chiếu trước để không còn "ngầm gán":
 *  - org_assignments trỏ vào đơn vị: gỡ liên kết đơn vị (phân công thành cấp trên/công ty),
 *    riêng phân công marker (head/deputy không chức danh) thì tắt hẳn.
 *  - users.department_id / sub_department_id: đưa về NULL.
 *  - departments bị xoá: bộ phận con + đơn vị con cũng bị xoá cứng theo (đệ quy).
 * CHỈ cho xoá đơn vị đang is_active=false (xoá mềm trước, xoá cứng sau).
 */
export async function hardDeleteHiddenUnit(
  unitType: 'company' | 'department' | 'sub_department',
  unitId: string
): Promise<{ deleted: boolean; cleaned_assignments: number; cleaned_users: number }> {
  if (unitType === 'company') {
    const c = await queryOne<any>(
      `SELECT id FROM companies WHERE id::text = $1 AND is_active = false`, [unitId]);
    if (!c) throw new Error('Công ty không tồn tại hoặc chưa được ẩn (is_active=false)');

    let na = 0, nu = 0;
    // 1. Xoá cứng toàn bộ phòng ban (kèm bộ phận) của công ty — đơn vị của công ty
    //    đã ẩn đều là rác, soft-delete trước rồi đi qua đường xoá chuẩn để dọn tham chiếu
    const depts = await query<{ id: string }>(
      `SELECT id::text AS id FROM departments WHERE company_id::text = $1`, [unitId]);
    for (const d of depts) {
      await execute(`UPDATE departments SET is_active = false WHERE id::text = $1`, [d.id]);
      const r = await hardDeleteHiddenUnit('department', d.id);
      na += r.cleaned_assignments; nu += r.cleaned_users;
    }
    // 2. Tắt mọi phân công còn lại tại công ty (cấp công ty/marker)
    na += await execute(
      `UPDATE org_assignments SET is_active = false, updated_at = now()
        WHERE company_id::text = $1 AND is_active`, [unitId]);
    // 3. Gỡ tư cách Đa Công Ty + đưa user chính của công ty về "chưa có công ty"
    //    (họ sẽ hiện ở Sức Khoẻ Tổ Chức để HR xếp lại chỗ)
    await execute(`DELETE FROM user_company_memberships WHERE company_id::text = $1`, [unitId]);
    nu += await execute(
      `UPDATE users SET company_id = NULL, company = '', updated_at = now()
        WHERE company_id::text = $1`, [unitId]);
    // 4. Xoá công ty — FK còn lại (positions, job_titles, tags...) do schema tự
    //    CASCADE/SET NULL; nếu bị chặn thì báo lỗi rõ thay vì xoá dở dang
    try {
      await execute(`DELETE FROM companies WHERE id::text = $1`, [unitId]);
    } catch (err: any) {
      throw new Error(
        `Không xoá được công ty: còn dữ liệu tham chiếu (${err?.constraint || err?.message}). ` +
        `Hãy kiểm tra tài sản/chức danh thuộc công ty này trước.`
      );
    }
    return { deleted: true, cleaned_assignments: na, cleaned_users: nu };
  }

  if (unitType === 'sub_department') {
    const sd = await queryOne<any>(
      `SELECT id FROM sub_departments WHERE id::text = $1 AND is_active = false`, [unitId]);
    if (!sd) throw new Error('Bộ phận không tồn tại hoặc chưa được xoá mềm (is_active=false)');

    const na = await execute(
      `UPDATE org_assignments SET is_active = CASE
            WHEN position_id IS NULL AND org_role IN ('head','deputy') THEN false
            ELSE is_active END,
          sub_department_id = NULL,
          org_role = CASE WHEN org_role IN ('head','deputy') THEN 'member' ELSE org_role END,
          updated_at = now()
        WHERE sub_department_id::text = $1`, [unitId]);
    const nu = await execute(
      `UPDATE users SET sub_department_id = NULL, updated_at = now()
        WHERE sub_department_id::text = $1`, [unitId]);
    await execute(`DELETE FROM sub_departments WHERE id::text = $1`, [unitId]);
    return { deleted: true, cleaned_assignments: na, cleaned_users: nu };
  }

  const d = await queryOne<any>(
    `SELECT id FROM departments WHERE id::text = $1 AND is_active = false`, [unitId]);
  if (!d) throw new Error('Phòng ban không tồn tại hoặc chưa được xoá mềm (is_active=false)');

  // Xoá cứng các bộ phận con trước (kể cả bộ phận con còn is_active — thuộc phòng đã ẩn thì cũng là rác)
  const subs = await query<{ id: string }>(
    `SELECT id::text AS id FROM sub_departments WHERE department_id::text = $1`, [unitId]);
  let na = 0, nu = 0;
  for (const s of subs) {
    await execute(`UPDATE sub_departments SET is_active = false WHERE id::text = $1`, [s.id]);
    const r = await hardDeleteHiddenUnit('sub_department', s.id);
    na += r.cleaned_assignments; nu += r.cleaned_users;
  }

  na += await execute(
    `UPDATE org_assignments SET is_active = CASE
          WHEN position_id IS NULL AND org_role IN ('head','deputy') THEN false
          ELSE is_active END,
        department_id = NULL, sub_department_id = NULL,
        org_role = CASE WHEN org_role IN ('head','deputy') THEN 'member' ELSE org_role END,
        updated_at = now()
      WHERE department_id::text = $1`, [unitId]);
  nu += await execute(
    `UPDATE users SET department_id = NULL, department = '', updated_at = now()
      WHERE department_id::text = $1`, [unitId]);
  await execute(`DELETE FROM departments WHERE id::text = $1`, [unitId]);
  return { deleted: true, cleaned_assignments: na, cleaned_users: nu };
}

/**
 * Chuyển 1 PHÒNG BAN (kèm toàn bộ nhân sự) thành 1 BỘ PHẬN trực thuộc phòng ban khác
 * — dùng khi lỡ tạo nhầm cấp. Re-point mọi tham chiếu (không xoá dữ liệu), trong 1 transaction.
 *
 * Điều kiện: cùng công ty, đích khác chính nó, và phòng ban nguồn KHÔNG còn bộ phận con
 * (bộ phận không được lồng thêm cấp). Người đứng đầu phòng ban cũ → đứng đầu bộ phận mới.
 */
export async function convertDepartmentToSubDepartment(
  departmentId: string,
  targetDepartmentId: string,
): Promise<{ subDepartmentId: string; movedUsers: number; movedAssignments: number }> {
  if (departmentId === targetDepartmentId) throw new Error('Không thể chuyển vào chính nó');

  const src = await queryOne<{ id: string; company_id: string; name: string; code: string | null; description: string | null; head_id: string | null; is_active: boolean }>(
    `SELECT id::text AS id, company_id::text AS company_id, name, code, description, head_id::text AS head_id, is_active
       FROM departments WHERE id::text = $1`, [departmentId]);
  if (!src) throw new Error('Không tìm thấy phòng ban nguồn');

  const tgt = await queryOne<{ id: string; company_id: string; name: string; is_active: boolean }>(
    `SELECT id::text AS id, company_id::text AS company_id, name, is_active
       FROM departments WHERE id::text = $1`, [targetDepartmentId]);
  if (!tgt) throw new Error('Không tìm thấy phòng ban đích');
  if (tgt.is_active === false) throw new Error('Phòng ban đích đang bị ẩn');
  if (src.company_id !== tgt.company_id) throw new Error('Phải cùng một công ty');

  // Bộ phận không lồng cấp → phòng ban nguồn phải rỗng bộ phận con.
  const childCount = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM sub_departments WHERE department_id::text = $1`, [departmentId]);
  if (Number(childCount?.n ?? 0) > 0) {
    throw new Error('Phòng ban này còn bộ phận con — hãy xử lý các bộ phận con trước khi chuyển.');
  }

  const dup = await queryOne<{ id: string }>(
    `SELECT id FROM sub_departments WHERE department_id::text = $1 AND lower(name) = lower($2)`,
    [targetDepartmentId, src.name]);
  if (dup) throw new Error(`Phòng ban đích đã có bộ phận tên "${src.name}"`);

  return withTransaction(async (client) => {
    // 1. Tạo bộ phận mới dưới phòng ban đích, kế thừa tên/mã/mô tả + người đứng đầu.
    const created = await client.query<{ id: string }>(
      `INSERT INTO sub_departments (department_id, name, code, description, manager_id, head_id, is_active)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, $5::uuid, true)
       RETURNING id::text AS id`,
      [targetDepartmentId, src.name, src.code, src.description, src.head_id]);
    const newSub = created.rows[0].id;

    // 2. Nhân sự: về phòng ban đích + bộ phận mới (giữ chức vụ head qua org_assignments).
    const uRes = await client.query(
      `UPDATE users SET department_id = $2::uuid, sub_department_id = $3::uuid,
              department = $4, updated_at = now()
        WHERE department_id::text = $1`,
      [departmentId, targetDepartmentId, newSub, tgt.name]);

    // 3. Phân công (nguồn sự thật mới): re-point department + sub_department, GIỮ org_role
    //    ⇒ head phòng ban cũ thành head bộ phận mới.
    const aRes = await client.query(
      `UPDATE org_assignments SET department_id = $2::uuid, sub_department_id = $3::uuid, updated_at = now()
        WHERE department_id::text = $1`,
      [departmentId, targetDepartmentId, newSub]);

    // 4. Thẻ tổ chức gắn phòng ban cũ → chuyển sang bộ phận mới (đúng CHECK 1-target).
    await client.query(
      `UPDATE org_tag_assignments SET department_id = NULL, sub_department_id = $2::uuid
        WHERE department_id::text = $1`, [departmentId, newSub]).catch(() => {});

    // 5. Các liên kết phụ theo phòng ban → trỏ về phòng ban đích (khỏi mất liên kết khi xoá).
    for (const q of [
      `UPDATE email_accounts SET department_id = $2::uuid WHERE department_id::text = $1`,
      `UPDATE software SET department_id = $2::uuid WHERE department_id::text = $1`,
      `UPDATE assets SET division_id = $2::uuid WHERE division_id::text = $1`,
    ]) {
      await client.query(q, [departmentId, targetDepartmentId]).catch(() => {});
    }

    // 6. Xoá phòng ban cũ (mọi tham chiếu đã re-point ở trên).
    await client.query(`DELETE FROM departments WHERE id::text = $1`, [departmentId]);

    return { subDepartmentId: newSub, movedUsers: (uRes as { rowCount?: number }).rowCount ?? 0, movedAssignments: (aRes as { rowCount?: number }).rowCount ?? 0 };
  });
}

/**
 * Chuyển 1 BỘ PHẬN (kèm toàn bộ nhân sự) sang PHÒNG BAN khác — dùng khi lỡ gán nhầm
 * bộ phận vào phòng ban khác. Chỉ đổi phòng ban cha (re-point department_id), cùng công ty.
 */
export async function moveSubDepartmentToDepartment(
  subDepartmentId: string,
  targetDepartmentId: string,
): Promise<{ movedUsers: number; movedAssignments: number }> {
  const sub = await queryOne<{ id: string; department_id: string; name: string }>(
    `SELECT id::text AS id, department_id::text AS department_id, name
       FROM sub_departments WHERE id::text = $1`, [subDepartmentId]);
  if (!sub) throw new Error('Không tìm thấy bộ phận');
  if (sub.department_id === targetDepartmentId) throw new Error('Bộ phận đã thuộc phòng ban này');

  const [srcDept, tgtDept] = await Promise.all([
    queryOne<{ company_id: string }>(`SELECT company_id::text AS company_id FROM departments WHERE id::text = $1`, [sub.department_id]),
    queryOne<{ company_id: string; name: string; is_active: boolean }>(`SELECT company_id::text AS company_id, name, is_active FROM departments WHERE id::text = $1`, [targetDepartmentId]),
  ]);
  if (!tgtDept) throw new Error('Không tìm thấy phòng ban đích');
  if (tgtDept.is_active === false) throw new Error('Phòng ban đích đang bị ẩn');
  if (srcDept?.company_id && srcDept.company_id !== tgtDept.company_id) throw new Error('Phải cùng một công ty');

  const dup = await queryOne<{ id: string }>(
    `SELECT id FROM sub_departments WHERE department_id::text = $1 AND lower(name) = lower($2) AND id::text <> $3`,
    [targetDepartmentId, sub.name, subDepartmentId]);
  if (dup) throw new Error(`Phòng ban đích đã có bộ phận tên "${sub.name}"`);

  return withTransaction(async (client) => {
    await client.query(`UPDATE sub_departments SET department_id = $2::uuid, updated_at = now() WHERE id::text = $1`,
      [subDepartmentId, targetDepartmentId]);
    const uRes = await client.query(
      `UPDATE users SET department_id = $2::uuid, department = $3, updated_at = now() WHERE sub_department_id::text = $1`,
      [subDepartmentId, targetDepartmentId, tgtDept.name]);
    const aRes = await client.query(
      `UPDATE org_assignments SET department_id = $2::uuid, updated_at = now() WHERE sub_department_id::text = $1`,
      [subDepartmentId, targetDepartmentId]);
    return { movedUsers: (uRes as { rowCount?: number }).rowCount ?? 0, movedAssignments: (aRes as { rowCount?: number }).rowCount ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Sức khoẻ tổ chức (Phase 3) — dữ liệu cho màn kiểm tra của HR
// ---------------------------------------------------------------------------

export interface OrgHealthReport {
  usersWithoutPrimary: { id: string; name: string; email: string; company_name: string | null }[];
  unitsWithoutHead: { unit_type: 'company' | 'department' | 'sub_department'; id: string; name: string; company_name: string | null }[];
  positionsDefaultRank: { id: string; title: string; company_name: string | null; rank: number }[];
}

/** Tổng hợp các thiếu sót dữ liệu tổ chức để HR rà và bổ sung (không suy luận thay). */
export async function getOrgHealthReport(companyId?: string): Promise<OrgHealthReport> {
  const p: string[] = [];
  let userFilter = '';
  let unitFilter = '';
  let jtFilter = '';
  if (companyId) {
    p.push(companyId);
    userFilter = ` AND u.company_id::text = $1`;
    unitFilter = ` AND c.id::text = $1`;
    jtFilter = ` AND pos.company_id::text = $1`;
  }

  const usersWithoutPrimary = await query<any>(
    `SELECT u.id, u.name, u.email, c.name AS company_name
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
      WHERE u.status = 'active'${userFilter}
        AND NOT EXISTS (
          SELECT 1 FROM org_assignments oa
           WHERE oa.user_id = u.id AND oa.is_primary AND oa.is_active
        )
      ORDER BY c.name NULLS FIRST, u.name`,
    p
  );

  const unitsWithoutHead = await query<any>(
    `SELECT 'company' AS unit_type, c.id, c.name, NULL AS company_name
       FROM companies c
      WHERE c.is_active = true${unitFilter}
        AND NOT EXISTS (
          SELECT 1 FROM org_assignments oa
           WHERE oa.company_id = c.id AND oa.department_id IS NULL
             AND oa.org_role = 'head' AND oa.is_active
        )
     UNION ALL
     SELECT 'department', d.id, d.name, c.name
       FROM departments d JOIN companies c ON c.id = d.company_id
      WHERE d.is_active = true AND c.is_active = true${unitFilter}
        AND NOT EXISTS (
          SELECT 1 FROM org_assignments oa
           WHERE oa.department_id = d.id AND oa.sub_department_id IS NULL
             AND oa.org_role = 'head' AND oa.is_active
        )
     UNION ALL
     SELECT 'sub_department', sd.id, sd.name, c.name
       FROM sub_departments sd
       JOIN departments d ON d.id = sd.department_id
       JOIN companies c ON c.id = d.company_id
      WHERE sd.is_active = true AND d.is_active = true AND c.is_active = true${unitFilter}
        AND NOT EXISTS (
          SELECT 1 FROM org_assignments oa
           WHERE oa.sub_department_id = sd.id AND oa.org_role = 'head' AND oa.is_active
        )
      ORDER BY 1, 4 NULLS FIRST, 3`,
    p
  );

  // Chức danh chưa được HR XÁC NHẬN cấp bậc (rank_confirmed=false) và còn ở mức
  // mặc định 4 — HR lưu form có chọn cấp (kể cả chọn đúng Nhân viên=4) là hết cảnh báo.
  const positionsDefaultRank = await query<any>(
    `SELECT pos.id, pos.name AS title, c.name AS company_name, COALESCE(pos."rank", 4) AS rank
       FROM positions pos
       LEFT JOIN companies c ON c.id = pos.company_id
      WHERE pos.is_active = true${jtFilter}
        AND (pos."rank" IS NULL OR pos."rank" = 4)
        AND NOT COALESCE(pos.rank_confirmed, false)
        AND EXISTS (
          SELECT 1 FROM org_assignments oa WHERE oa.position_id = pos.id AND oa.is_active
        )
      ORDER BY c.name NULLS FIRST, pos.name`,
    p
  );

  return { usersWithoutPrimary, unitsWithoutHead, positionsDefaultRank };
}
