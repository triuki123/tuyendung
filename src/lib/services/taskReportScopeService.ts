/**
 * Phân giải phạm vi xuất Báo Cáo Công Việc theo RBAC tối thượng.
 *
 * Cấu trúc quyền:
 *  - super_admin: chọn bất kỳ user / bộ phận / phòng ban / công ty / toàn hệ thống
 *  - admin: chọn trong phạm vi công ty được gắn
 *  - manager: chọn bất kỳ ai trong cây cấp dưới (đệ quy) — gồm bản thân
 *  - user: chỉ bản thân
 *
 * Cung cấp 2 hàm chính:
 *  - getScopeOptions: trả danh sách target hợp lệ để chọn trong UI
 *  - resolveTargetMembers: từ target được chọn → trả danh sách user_id, đồng thời
 *    kiểm tra target có nằm trong phạm vi của caller không (chống tự ý mở rộng).
 */
import { query, queryOne } from '@/lib/db';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

export type Role = 'super_admin' | 'admin' | 'manager' | 'user';
export type TargetType = 'self' | 'user' | 'sub_department' | 'department' | 'company' | 'all';

export interface ScopeOption {
  type: TargetType;
  id: string;
  label: string;
  group: string;
}

export interface ScopeOptionsResult {
  defaultTarget: { type: TargetType; id: string; label: string };
  options: ScopeOption[];
}

export interface ResolvedMembers {
  memberIds: string[];
  targetLabel: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lấy id user trong 1 sub_department. */
async function userIdsInSubDepartment(subDepartmentId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE sub_department_id = $1 AND status = 'active'`,
    [subDepartmentId]
  );
  return rows.map(r => r.id);
}

/** Lấy id user trong 1 department (gồm cả ai gán cột department TEXT cũ). */
async function userIdsInDepartment(departmentId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE status = 'active'
       AND (department_id::text = $1 OR NULLIF(department, '') = $1)`,
    [departmentId]
  );
  return rows.map(r => r.id);
}

/** Lấy id user trong 1 công ty. */
async function userIdsInCompany(companyId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE company_id = $1 AND status = 'active'`,
    [companyId]
  );
  return rows.map(r => r.id);
}

/** Toàn bộ user active trong hệ thống. */
async function allUserIds(): Promise<string[]> {
  const rows = await query<{ id: string }>(`SELECT id FROM users WHERE status = 'active'`);
  return rows.map(r => r.id);
}

// ---------------------------------------------------------------------------
// getScopeOptions — trả các target hợp lệ để hiện trong dropdown UI
// ---------------------------------------------------------------------------

export async function getScopeOptions(
  callerId: string,
  callerRole: Role,
  callerCompanyId: string | null,
  callerName: string
): Promise<ScopeOptionsResult> {
  const options: ScopeOption[] = [];

  // 1) "Bản thân" — luôn có
  const selfLabel = `Bản thân — ${callerName}`;
  options.push({ type: 'self', id: callerId, label: selfLabel, group: 'Cá nhân' });
  const defaultTarget = { type: 'self' as TargetType, id: callerId, label: selfLabel };

  if (callerRole === 'user') {
    return { defaultTarget, options };
  }

  // 2) Người dùng — phạm vi theo role
  let usersScope: Array<{ id: string; name: string; email: string }>;
  if (callerRole === 'super_admin') {
    usersScope = await query(
      `SELECT id, name, email FROM users WHERE status = 'active' ORDER BY name`
    );
  } else if (callerRole === 'admin') {
    if (!callerCompanyId) {
      usersScope = [];
    } else {
      usersScope = await query(
        `SELECT id, name, email FROM users WHERE status = 'active' AND company_id = $1 ORDER BY name`,
        [callerCompanyId]
      );
    }
  } else {
    // manager
    const subIds = await getOrgSubtreeUserIds(callerId);
    if (subIds.length === 0) {
      usersScope = [];
    } else {
      usersScope = await query(
        `SELECT id, name, email FROM users WHERE id::text = ANY($1::text[]) AND status = 'active' ORDER BY name`,
        [subIds]
      );
    }
  }
  for (const u of usersScope) {
    if (u.id === callerId) continue; // đã có Bản thân
    options.push({
      type: 'user',
      id: u.id,
      label: u.name || u.email || u.id,
      group: 'Cá nhân',
    });
  }

  // 3) Bộ phận / Phòng ban / Công ty — chỉ super_admin & admin
  //    Manager không chọn theo đơn vị (chỉ subtree user).
  if (callerRole === 'super_admin' || callerRole === 'admin') {
    const companyClause = callerRole === 'admin' ? 'WHERE c.id = $1' : 'WHERE c.is_active = true';
    const companyParams = callerRole === 'admin' ? [callerCompanyId] : [];
    const companies = await query<{ id: string; name: string }>(
      `SELECT id, name FROM companies c ${companyClause} ORDER BY c.name`,
      companyParams as any
    );

    const departments = await query<{ id: string; name: string; company_name: string }>(
      `SELECT d.id, d.name, c.name AS company_name
         FROM departments d
         JOIN companies c ON c.id = d.company_id
        WHERE d.is_active = true
          ${callerRole === 'admin' ? 'AND d.company_id = $1' : ''}
        ORDER BY c.name, d.name`,
      callerRole === 'admin' ? ([callerCompanyId] as any) : []
    );

    const subDepartments = await query<{ id: string; name: string; department_name: string }>(
      `SELECT sd.id, sd.name, d.name AS department_name
         FROM sub_departments sd
         JOIN departments d ON d.id = sd.department_id
        WHERE sd.is_active = true
          ${callerRole === 'admin' ? 'AND d.company_id = $1' : ''}
        ORDER BY d.name, sd.name`,
      callerRole === 'admin' ? ([callerCompanyId] as any) : []
    );

    for (const sd of subDepartments) {
      options.push({
        type: 'sub_department',
        id: sd.id,
        label: `${sd.department_name} › ${sd.name}`,
        group: 'Bộ phận',
      });
    }
    for (const d of departments) {
      options.push({
        type: 'department',
        id: d.id,
        label: callerRole === 'super_admin' ? `${d.company_name} › ${d.name}` : d.name,
        group: 'Phòng ban',
      });
    }
    for (const c of companies) {
      options.push({ type: 'company', id: c.id, label: c.name, group: 'Công ty' });
    }
  }

  // 4) Toàn hệ thống — chỉ super_admin
  if (callerRole === 'super_admin') {
    options.push({ type: 'all', id: 'all', label: 'Toàn bộ hệ thống', group: 'Hệ thống' });
  }

  return { defaultTarget, options };
}

// ---------------------------------------------------------------------------
// resolveTargetMembers — phân giải target → user IDs, đồng thời check phạm vi
// ---------------------------------------------------------------------------

export async function resolveTargetMembers(
  target: { type: TargetType; id: string },
  callerId: string,
  callerRole: Role,
  callerCompanyId: string | null
): Promise<ResolvedMembers> {
  const { type, id } = target;

  // User role: chỉ self
  if (callerRole === 'user') {
    if (type !== 'self') {
      throw new Error('Người dùng chỉ được phép xuất báo cáo cho bản thân');
    }
    return { memberIds: [callerId], targetLabel: 'Bản thân' };
  }

  // self → luôn hợp lệ
  if (type === 'self') {
    return { memberIds: [callerId], targetLabel: 'Bản thân' };
  }

  // Phân giải target → memberIds, kèm authorization check
  let memberIds: string[];
  let targetLabel: string;

  if (type === 'all') {
    if (callerRole !== 'super_admin') {
      throw new Error('Chỉ Super Admin mới được xuất báo cáo toàn hệ thống');
    }
    memberIds = await allUserIds();
    targetLabel = 'Toàn bộ hệ thống';
  } else if (type === 'company') {
    if (callerRole === 'admin' && id !== callerCompanyId) {
      throw new Error('Admin chỉ được xuất báo cáo trong công ty được gắn');
    }
    if (callerRole === 'manager') {
      throw new Error('Quản lý không được chọn cấp công ty');
    }
    const co = await queryOne<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [id]);
    if (!co) throw new Error('Công ty không tồn tại');
    memberIds = await userIdsInCompany(id);
    targetLabel = `Công ty: ${co.name}`;
  } else if (type === 'department') {
    const dept = await queryOne<{ name: string; company_id: string }>(
      `SELECT name, company_id FROM departments WHERE id = $1`,
      [id]
    );
    if (!dept) throw new Error('Phòng ban không tồn tại');
    if (callerRole === 'admin' && dept.company_id !== callerCompanyId) {
      throw new Error('Phòng ban không thuộc công ty bạn quản lý');
    }
    if (callerRole === 'manager') {
      throw new Error('Quản lý không được chọn cấp phòng ban');
    }
    memberIds = await userIdsInDepartment(id);
    targetLabel = `Phòng ban: ${dept.name}`;
  } else if (type === 'sub_department') {
    const sd = await queryOne<{ name: string; department_company: string }>(
      `SELECT sd.name, d.company_id AS department_company
         FROM sub_departments sd
         JOIN departments d ON d.id = sd.department_id
        WHERE sd.id = $1`,
      [id]
    );
    if (!sd) throw new Error('Bộ phận không tồn tại');
    if (callerRole === 'admin' && sd.department_company !== callerCompanyId) {
      throw new Error('Bộ phận không thuộc công ty bạn quản lý');
    }
    if (callerRole === 'manager') {
      throw new Error('Quản lý không được chọn cấp bộ phận');
    }
    memberIds = await userIdsInSubDepartment(id);
    targetLabel = `Bộ phận: ${sd.name}`;
  } else if (type === 'user') {
    const u = await queryOne<{ name: string; company_id: string | null }>(
      `SELECT name, company_id FROM users WHERE id = $1`,
      [id]
    );
    if (!u) throw new Error('Người dùng không tồn tại');
    if (callerRole === 'admin' && u.company_id !== callerCompanyId) {
      throw new Error('Người dùng không thuộc công ty bạn quản lý');
    }
    if (callerRole === 'manager') {
      const subIds = await getOrgSubtreeUserIds(callerId);
      if (id !== callerId && !subIds.includes(id)) {
        throw new Error('Người dùng không thuộc đội nhóm bạn quản lý');
      }
    }
    memberIds = [id];
    targetLabel = `Cá nhân: ${u.name}`;
  } else {
    throw new Error(`Loại đối tượng không hợp lệ: ${type}`);
  }

  return { memberIds, targetLabel };
}
