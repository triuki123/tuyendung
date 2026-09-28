import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { query, queryOne, execute, buildInsert, buildUpdateById, withTransaction, User, AuditLog } from '@/lib/db';
import { buildDataFilter, DataAccessLevel } from '@/lib/permissions';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';
import { getEffectiveRolePermissions, type UserModulePermissions } from '@/lib/modules';
import { normalizeRole } from '@/lib/rolePolicy';
import { trySyncAssignments, deactivateAllAssignments } from '@/lib/services/orgStructureService';

/**
 * Trường "Hồ Sơ Nhân Sự" — thông tin cá nhân nhân sự điền ở form Onboarding,
 * lưu vào cột bảng users (migration 099). children_count xử lý riêng (kiểu số).
 */
const PERSONAL_HR_FIELDS = [
  'personal_email', 'date_of_birth', 'gender', 'nationality', 'ethnicity', 'religion',
  'marital_status', 'education_level', 'major',
  'national_id', 'national_id_issue_date', 'national_id_issue_place', 'temporary_address',
  'vehicle_type', 'vehicle_plate', 'vehicle_model',
  'emergency_contact_name', 'emergency_contact_relationship',
  'emergency_contact_phone', 'emergency_contact_address',
  'emergency_contact_2_name', 'emergency_contact_2_relationship',
  'emergency_contact_2_phone', 'emergency_contact_2_address',
] as const;

/**
 * Trường "Chế Độ & Đãi Ngộ" — phụ cấp + BHXH + đơn vị trả lương (migration 121).
 * Dùng cho xuất bảng công. Phân loại để ép kiểu đúng khi lưu DB.
 */
const BENEFITS_BOOL_FIELDS = ['meal_allowance_enabled', 'parking_allowance_enabled'] as const;
const BENEFITS_INT_FIELDS = [
  'meal_allowance_rate', 'parking_allowance_rate', 'travel_allowance_rate',
  'social_insurance_base',
] as const;
const BENEFITS_TEXT_FIELDS = ['social_insurance_unit', 'salary_entity', 'cost_center_code'] as const;

/**
 * Ngày đầu KỲ CÔNG hiện tại của 1 user (YYYY-MM-DD) — mốc hiệu lực khi bật
 * "Mặc Định Đủ Công". Import động để tránh vòng import với attendanceService.
 */
async function currentPeriodStartForUser(userId: string): Promise<string> {
  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  try {
    const { resolveAttendanceConfigForUser } = await import('@/lib/services/attendanceSettingsService');
    const { getPayrollPeriodForDate, getPayrollPeriodDates } = await import('@/lib/config/attendanceConfig');
    const cfg = await resolveAttendanceConfigForUser(userId, todayVN);
    const period = getPayrollPeriodForDate(todayVN, cfg);
    const { startDate } = getPayrollPeriodDates(period.month, period.year, cfg);
    return `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
  } catch {
    return todayVN; // cấu hình lỗi → hiệu lực từ hôm nay, không hồi tố
  }
}

export async function getUsers(filters?: { role?: string; department?: string; status?: string; company_id?: string }) {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters?.role) {
    conditions.push(`u.role = $${idx++}`);
    params.push(filters.role);
  }
  if (filters?.department) {
    conditions.push(`u.department = $${idx++}`);
    params.push(filters.department);
  }
  if (filters?.status) {
    conditions.push(`u.status = $${idx++}`);
    params.push(filters.status);
  } else {
    conditions.push(`u.status = $${idx++}`);
    params.push('active');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  let users = await query<any>(
    `SELECT u.id, u.name, u.email, u.role, u.company_id, u.department, u.department_id,
            u.phone, u.status, u.last_login, u.last_active, u.created_at, u.updated_at, u.avatar,
            u.position, u.position_id, u.sub_department_id, u.job_title_id, u.manager_id,
            u.bio, u.telegram_chat_id, u.telegram_enabled, u.module_permissions,
            u.sso_user_id, u.sso_sync_status, u.sso_sync_error,
            u.hire_date, u.employment_type, u.employee_code, u.employment_type_id, u.probation_duration_days,
            u.bank_account_no, u.bank_name, u.bank_account_name,
            u.home_address, u.work_location, u.work_start_time, u.deduct_lunch, u.diligence_enabled,
            u.default_full_attendance,
            to_char(u.default_full_attendance_from, 'YYYY-MM-DD') AS default_full_attendance_from,
            u.personal_email, u.date_of_birth, u.gender, u.nationality, u.ethnicity, u.religion,
            u.marital_status, u.children_count, u.education_level, u.major,
            u.national_id, u.national_id_issue_date, u.national_id_issue_place, u.temporary_address,
            u.vehicle_type, u.vehicle_plate, u.vehicle_model,
            u.emergency_contact_name, u.emergency_contact_relationship,
            u.emergency_contact_phone, u.emergency_contact_address,
            u.emergency_contact_2_name, u.emergency_contact_2_relationship,
            u.emergency_contact_2_phone, u.emergency_contact_2_address,
            u.meal_allowance_enabled, u.meal_allowance_rate,
            u.parking_allowance_enabled, u.parking_allowance_rate, u.travel_allowance_rate,
            u.social_insurance_unit, u.social_insurance_base, u.social_insurance_deduction,
            u.salary_entity, u.cost_center_code,
            m.name as manager_name,
            u.created_by, u.updated_by,
            cb.name as created_by_name, ub.name as updated_by_name,
            COALESCE(ucm.list, '[]'::json) AS company_memberships
     FROM users u
     LEFT JOIN users m ON u.manager_id = m.id
     LEFT JOIN users cb ON cb.id::text = u.created_by::text
     LEFT JOIN users ub ON ub.id::text = u.updated_by::text
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
         'company_id', mm.company_id,
         'role', mm.role,
         'department_id', mm.department_id,
         'sub_department_id', mm.sub_department_id,
         'position_id', mm.position_id,
         'job_title_id', mm.job_title_id,
         'manager_id', mm.manager_id,
         'module_permissions', mm.module_permissions,
         'is_active', mm.is_active
       )) AS list
       FROM user_company_memberships mm
       WHERE mm.user_id = u.id AND mm.is_active = true
     ) ucm ON TRUE
     ${where}`,
    params
  );

  if (!users || users.length === 0) return [];

  // client-side company_id filtering to handle orphaned references
  let filteredUsers = users;
  if (filters?.company_id) {
    if (filters.company_id === 'undefined') {
      const companies = await query<{ id: string }>(`SELECT id FROM companies WHERE is_active = true`);
      const validCompanyIds = companies.map(c => c.id);
      filteredUsers = users.filter((u: any) => !u.company_id || !validCompanyIds.includes(u.company_id));
    } else {
      filteredUsers = users.filter((u: any) => u.company_id === filters.company_id);
    }
  }

  return attachTagsToUsers(filteredUsers);
}

/**
 * Get visible users based on the caller's data access level.
 */
export async function getVisibleUsers(
  currentUserId: string,
  currentUserRole: string,
  currentUserCompanyId: string | null,
  filters?: { role?: string; department?: string; status?: string; company_id?: string }
) {
  const dataFilter = buildDataFilter(currentUserRole, currentUserId, currentUserCompanyId);

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (dataFilter.level === 'admin') {
    if (dataFilter.companyId) {
      // Đa Công Ty: "user thuộc công ty" = company_id chính = X HOẶC có membership active ở X.
      conditions.push(
        `(u.company_id = $${idx} OR EXISTS (
            SELECT 1 FROM user_company_memberships m
             WHERE m.user_id = u.id AND m.company_id = $${idx} AND m.is_active = true
          ))`
      );
      params.push(dataFilter.companyId);
      idx++;
    } else {
      // Admin without company sees nobody
      conditions.push(`u.id = $${idx++}`);
      params.push('00000000-0000-0000-0000-000000000000');
    }
  } else if (dataFilter.level === 'manager') {
    // Manager: bản thân + cấp dưới (đệ quy) TRONG công ty đang làm việc.
    const subordinateIds = await getOrgSubtreeUserIds(currentUserId, currentUserCompanyId);
    const allIds = [currentUserId, ...subordinateIds];
    conditions.push(`u.id::text = ANY($${idx++}::text[])`);
    params.push(allIds);
  } else if (dataFilter.level === 'user') {
    conditions.push(`u.id = $${idx++}`);
    params.push(dataFilter.userId);
  }
  // super_admin: không thêm điều kiện scope → thấy toàn hệ thống

  if (filters?.role) {
    conditions.push(`u.role = $${idx++}`);
    params.push(filters.role);
  }
  if (filters?.department) {
    conditions.push(`u.department = $${idx++}`);
    params.push(filters.department);
  }
  if (filters?.status) {
    conditions.push(`u.status = $${idx++}`);
    params.push(filters.status);
  } else {
    conditions.push(`u.status = $${idx++}`);
    params.push('active');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const users = await query<any>(
    `SELECT u.id, u.name, u.email, u.role, u.company_id, u.department, u.department_id,
            u.phone, u.status, u.last_login, u.last_active, u.created_at, u.updated_at, u.avatar,
            u.position, u.position_id, u.sub_department_id, u.job_title_id, u.manager_id,
            u.bio, u.telegram_chat_id, u.telegram_enabled, u.module_permissions,
            u.sso_user_id, u.sso_sync_status, u.sso_sync_error,
            u.hire_date, u.employment_type, u.employee_code, u.employment_type_id, u.probation_duration_days,
            u.bank_account_no, u.bank_name, u.bank_account_name,
            u.home_address, u.work_location, u.work_start_time, u.deduct_lunch, u.diligence_enabled,
            u.default_full_attendance,
            to_char(u.default_full_attendance_from, 'YYYY-MM-DD') AS default_full_attendance_from,
            u.personal_email, u.date_of_birth, u.gender, u.nationality, u.ethnicity, u.religion,
            u.marital_status, u.children_count, u.education_level, u.major,
            u.national_id, u.national_id_issue_date, u.national_id_issue_place, u.temporary_address,
            u.vehicle_type, u.vehicle_plate, u.vehicle_model,
            u.emergency_contact_name, u.emergency_contact_relationship,
            u.emergency_contact_phone, u.emergency_contact_address,
            u.emergency_contact_2_name, u.emergency_contact_2_relationship,
            u.emergency_contact_2_phone, u.emergency_contact_2_address,
            u.meal_allowance_enabled, u.meal_allowance_rate,
            u.parking_allowance_enabled, u.parking_allowance_rate, u.travel_allowance_rate,
            u.social_insurance_unit, u.social_insurance_base, u.social_insurance_deduction,
            u.salary_entity, u.cost_center_code,
            m.name as manager_name,
            u.created_by, u.updated_by,
            cb.name as created_by_name, ub.name as updated_by_name,
            COALESCE(ucm.list, '[]'::json) AS company_memberships
     FROM users u
     LEFT JOIN users m ON u.manager_id = m.id
     LEFT JOIN users cb ON cb.id::text = u.created_by::text
     LEFT JOIN users ub ON ub.id::text = u.updated_by::text
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
         'company_id', mm.company_id,
         'role', mm.role,
         'department_id', mm.department_id,
         'sub_department_id', mm.sub_department_id,
         'position_id', mm.position_id,
         'job_title_id', mm.job_title_id,
         'manager_id', mm.manager_id,
         'module_permissions', mm.module_permissions,
         'is_active', mm.is_active
       )) AS list
       FROM user_company_memberships mm
       WHERE mm.user_id = u.id AND mm.is_active = true
     ) ucm ON TRUE
     ${where}`,
    params
  );

  if (!users || users.length === 0) return [];

  return attachTagsToUsers(users);
}

export async function getUserById(id: string) {
  const data = await queryOne<any>(`SELECT * FROM users WHERE id = $1`, [id]);
  if (!data) return data;

  const userTags = await query<{ user_id: string; tag_id: string; id: string; name: string; color: string }>(
    `SELECT ut.user_id, ut.tag_id, t.id, t.name, t.color
     FROM user_tags ut
     JOIN tags t ON t.id = ut.tag_id
     WHERE ut.user_id = $1 AND t.is_active = true`,
    [id]
  );

  const tags = userTags.map(row => ({ id: row.id, name: row.name, color: row.color }));
  return { ...data, tags };
}

export async function getUserByEmail(email: string) {
  return queryOne<any>(`SELECT * FROM users WHERE email = $1`, [email]);
}

/** Tra user theo email không phân biệt hoa/thường (SSO trả email đã lowercase). */
export async function getUserByEmailInsensitive(email: string) {
  // TRIM cả hai vế: dữ liệu cũ có bản ghi email dính khoảng trắng đầu/cuối. Nếu chỉ trim
  // đầu vào, email sạch từ SSO sẽ KHÔNG khớp bản ghi bẩn → user bị từ chối đăng nhập
  // ("Tài khoản chưa được cấp") dù tài khoản tồn tại. Bảng users nhỏ nên bỏ index là chấp nhận được.
  return queryOne<any>(
    `SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
    [email.trim()]
  );
}

export async function createUser(userData: any, createdBy?: string): Promise<User> {
  if (userData.module_permissions && typeof userData.module_permissions !== 'object') {
    throw new Error('Invalid module_permissions format');
  }

  // Kiểm tra email trùng trước khi insert
  if (userData.email) {
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [userData.email.trim()]
    );
    if (existing) {
      const err = new Error(`Email "${userData.email}" đã được sử dụng bởi tài khoản khác`);
      (err as any).code = 'EMAIL_DUPLICATE';
      throw err;
    }
  }

  const now = new Date().toISOString();
  const newUser: any = {
    // Pre-existing bug (predates SSO work, verified against base commit aae7f8ef): createUser
    // never set "id" và cột users.id (TEXT PRIMARY KEY) không có DEFAULT trong DB → mọi lần tạo
    // user qua API đều lỗi "null value in column id". Sinh id ở đây (đồng bộ cách addAuditLog dùng).
    id: randomUUID(),
    email: userData.email,
    name: userData.name,
    // Chỉ SSO: user thường KHÔNG giữ bcrypt hash local (mật khẩu sống bên SSO).
    // Riêng super_admin giữ hash để break-glass khi SSO sự cố.
    password: userData.password && (userData.role || 'user') === 'super_admin'
      ? await bcrypt.hash(userData.password, 10)
      : null,
    role: userData.role || 'user',
    department: userData.department || '',
    // company_id là UUID — chuỗi rỗng sẽ gây "invalid input syntax for type uuid"
    company_id: userData.company_id || null,
    position: userData.position || '',
    avatar: getInitials(userData.name),
    phone: userData.phone || '',
    bio: userData.bio || '',
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  // Các cột *_id kiểu UUID: '' phải đổi thành null, nếu không pg báo "invalid input syntax for type uuid"
  if (userData.position_id !== undefined) newUser.position_id = userData.position_id || null;
  if (userData.sub_department_id !== undefined) newUser.sub_department_id = userData.sub_department_id || null;
  // department luu UUID phong ban dang chuoi -> mirror sang department_id (uuid)
  // de loc nhan su theo don vi. Chi gan khi la UUID hop le.
  if (userData.department_id !== undefined) newUser.department_id = userData.department_id || null;
  else if (isValidUUID(userData.department)) newUser.department_id = userData.department;
  if (userData.job_title_id !== undefined) newUser.job_title_id = userData.job_title_id || null;
  // Quản lý trực tiếp: trước đây createUser BỎ QUA manager_id (chỉ updateUser xử lý)
  // → chọn quản lý lúc thêm mới bị mất âm thầm, phải mở Chỉnh Sửa lưu lại lần nữa.
  if (userData.manager_id !== undefined) newUser.manager_id = userData.manager_id || null;
  // Hồ Sơ Nhân Sự — thông tin cá nhân (đồng bộ với updateUser; chỉ gán khi có giá trị).
  for (const f of PERSONAL_HR_FIELDS) {
    if (userData[f] !== undefined && userData[f] !== null && userData[f] !== '') newUser[f] = userData[f];
  }
  if (userData.children_count !== undefined && userData.children_count !== null && userData.children_count !== '') {
    newUser.children_count = Number(userData.children_count);
  }
  // Cột HR sẵn có (hire_date/bank/địa chỉ...) cũng truyền qua nếu form điền khi tạo.
  for (const f of ['hire_date', 'employment_type', 'employment_type_id', 'bank_account_no', 'bank_name', 'bank_account_name', 'home_address', 'work_location', 'work_start_time'] as const) {
    if (userData[f] !== undefined && userData[f] !== null && userData[f] !== '') newUser[f] = userData[f];
  }
  // Chế Độ & Đãi Ngộ (migration 121) — ép kiểu đúng theo nhóm.
  for (const f of BENEFITS_BOOL_FIELDS) {
    if (userData[f] !== undefined) newUser[f] = Boolean(userData[f]);
  }
  for (const f of BENEFITS_INT_FIELDS) {
    if (userData[f] !== undefined && userData[f] !== null && userData[f] !== '' && !isNaN(Number(userData[f]))) {
      newUser[f] = Math.round(Number(userData[f])); // cột INTEGER (đồng) — làm tròn
    }
  }
  for (const f of BENEFITS_TEXT_FIELDS) {
    if (userData[f] !== undefined && userData[f] !== null && userData[f] !== '') newUser[f] = userData[f];
  }
  // Mặc Định Đủ Công — người mới bật ngay thì hiệu lực từ hôm nay (không có kỳ cũ để hồi tố).
  if (userData.default_full_attendance === true) {
    newUser.default_full_attendance = true;
    newUser.default_full_attendance_from = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  }
  // Nếu không truyền module_permissions → áp template mặc định của role
  if (!userData.module_permissions || Object.keys(userData.module_permissions).length === 0) {
    const role = normalizeRole(newUser.role as string);
    if (['user', 'manager', 'admin'].includes(role)) {
      const tmpl = await queryOne<{ module_permissions: object }>(
        `SELECT module_permissions FROM role_permission_templates WHERE role = $1`,
        [role]
      );
      newUser.module_permissions = getEffectiveRolePermissions(
        role,
        (tmpl?.module_permissions as UserModulePermissions) || {}
      );
    } else {
      newUser.module_permissions = getEffectiveRolePermissions(role, {});
    }
  } else {
    newUser.module_permissions = getEffectiveRolePermissions(
      normalizeRole(newUser.role as string),
      userData.module_permissions
    );
  }

  if (createdBy && isValidUUID(createdBy)) {
    newUser.created_by = createdBy;
    newUser.updated_by = createdBy;
  }

  const { text, params } = buildInsert('users', newUser);
  const data = await queryOne<any>(text, params);
  if (!data) throw new Error('Failed to create user');

  if (data.id && createdBy && isValidUUID(createdBy)) {
    const permCount = userData.module_permissions ? Object.keys(userData.module_permissions).length : 0;
    await addAuditLog('CREATE', data.id, `Created user: ${newUser.name} (${permCount} modules configured)`, createdBy);
  }

  // Dual-write cơ cấu tổ chức → org_assignments (không làm gãy luồng gốc nếu lỗi)
  if (data.id) await trySyncAssignments(data.id);

  // Đồng bộ sang SSO (không chặn luồng tạo user nếu SSO lỗi — badge trên trang Users).
  if (data.id) {
    try {
      const { syncUserToSso } = await import('@/lib/services/ssoProvisioningService');
      const r = await syncUserToSso(
        { id: String(data.id), email: data.email, name: data.name, phone: data.phone, status: data.status },
        { password: userData.password || undefined }
      );
      // Form không nhập mật khẩu → SSO đã tạo bằng mật khẩu tự sinh → email cho user.
      if (r.generatedPassword) {
        try {
          const { sendSsoInitialPasswordEmail } = await import('@/lib/services/emailService');
          await sendSsoInitialPasswordEmail(data.email, data.name || data.email, r.generatedPassword);
        } catch (e) {
          console.error('Gửi email mật khẩu SSO ban đầu (create) lỗi:', (e as Error).message);
        }
      }
    } catch (e) {
      console.error('SSO sync (create) error:', (e as Error).message);
    }
  }

  delete data.password;
  data.tags = [];
  return data as User;
}

export async function updateUser(id: string, userData: any, updatedBy?: string): Promise<User | null> {
  const user = await getUserById(id);
  if (!user) return null;

  // Kiểm tra email trùng khi thay đổi email (loại trừ chính user này)
  if (userData.email && userData.email.trim().toLowerCase() !== user.email?.toLowerCase()) {
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
      [userData.email.trim(), id]
    );
    if (existing) {
      const err = new Error(`Email "${userData.email}" đã được sử dụng bởi tài khoản khác`);
      (err as any).code = 'EMAIL_DUPLICATE';
      throw err;
    }
  }

  const now = new Date().toISOString();
  const changes: string[] = [];

  if (userData.name && userData.name !== user.name) changes.push(`name: ${user.name} → ${userData.name}`);
  if (userData.email && userData.email !== user.email) changes.push(`email: ${user.email} → ${userData.email}`);
  if (userData.phone && userData.phone !== user.phone) changes.push(`phone: ${user.phone} → ${userData.phone}`);
  if (userData.position && userData.position !== user.position) changes.push(`position: ${user.position} → ${userData.position}`);
  if (userData.department && userData.department !== user.department) changes.push(`department: ${user.department} → ${userData.department}`);
  if (userData.role && userData.role !== user.role) changes.push(`role: ${user.role} → ${userData.role}`);
  if (userData.bio && userData.bio !== user.bio) changes.push(`bio: updated`);
  if (userData.avatar !== undefined && userData.avatar !== user.avatar) changes.push(`avatar: updated`);
  if (userData.status && userData.status !== user.status) changes.push(`status: ${user.status} → ${userData.status}`);
  if (userData.manager_id !== undefined && userData.manager_id !== user.manager_id) changes.push(`manager_id: ${user.manager_id || 'none'} → ${userData.manager_id || 'none'}`);
  if (userData.tags && JSON.stringify(userData.tags) !== JSON.stringify(user.tags)) changes.push(`tags: updated`);
  if (userData.module_permissions && JSON.stringify(userData.module_permissions) !== JSON.stringify(user.module_permissions)) changes.push(`permissions: updated`);
  if (userData.telegram_chat_id !== undefined && userData.telegram_chat_id !== user.telegram_chat_id) changes.push(`telegram_chat_id: ${user.telegram_chat_id ? '***' : 'empty'} → ${userData.telegram_chat_id ? '***' : 'empty'}`);
  if (userData.telegram_enabled !== undefined && userData.telegram_enabled !== user.telegram_enabled) changes.push(`telegram_enabled: ${user.telegram_enabled} → ${userData.telegram_enabled}`);
  if (userData.diligence_enabled !== undefined && userData.diligence_enabled !== (user as any).diligence_enabled) changes.push(`diligence_enabled: ${(user as any).diligence_enabled} → ${userData.diligence_enabled}`);
  if (userData.default_full_attendance !== undefined && userData.default_full_attendance !== (user as any).default_full_attendance) changes.push(`default_full_attendance: ${(user as any).default_full_attendance} → ${userData.default_full_attendance}`);
  if (userData.preferred_language !== undefined && userData.preferred_language !== user.preferred_language) changes.push(`preferred_language: ${user.preferred_language} → ${userData.preferred_language}`);
  if (userData.preferred_theme !== undefined && userData.preferred_theme !== user.preferred_theme) changes.push(`preferred_theme: ${user.preferred_theme} → ${userData.preferred_theme}`);
  if (userData.hire_date !== undefined && userData.hire_date !== user.hire_date) changes.push(`hire_date: updated`);
  if (userData.employment_type !== undefined && userData.employment_type !== user.employment_type) changes.push(`employment_type: ${user.employment_type} → ${userData.employment_type}`);
  if (userData.bank_account_no !== undefined) changes.push(`bank_account: updated`);
  if (userData.home_address !== undefined && userData.home_address !== user.home_address) changes.push(`home_address: updated`);
  if (userData.work_location !== undefined && userData.work_location !== user.work_location) changes.push(`work_location: ${user.work_location} → ${userData.work_location}`);

  if (!isValidUUID(id)) {
    console.log('Updating mock user:', id);
    return { ...user, ...userData, updated_at: now, id: user.id, created_at: user.created_at } as User;
  }

  const updateData: any = { updated_at: now };
  if (userData.name) updateData.name = userData.name;
  if (userData.email) updateData.email = userData.email;
  if (userData.phone !== undefined) updateData.phone = userData.phone;
  if (userData.position) updateData.position = userData.position;
  if (userData.position_id) updateData.position_id = userData.position_id;
  if (userData.department_id !== undefined) {
    updateData.department_id = userData.department_id || null;
    // department là cột TEXT cũ. Khi người dùng xóa phòng ban, cần xóa luôn cột này
    // để form không fallback hiển thị lại giá trị cũ ở lần mở tiếp theo.
    if (!userData.department_id) {
      updateData.department = '';

    } else if (userData.department !== undefined) {
      updateData.department = userData.department || '';

    }
  } else if (userData.department !== undefined) {
    updateData.department = userData.department || '';
    if (isValidUUID(userData.department)) updateData.department_id = userData.department;
  }
  if (userData.role) updateData.role = userData.role;
  if (userData.bio !== undefined) updateData.bio = userData.bio;
  if (userData.avatar !== undefined) updateData.avatar = userData.avatar;
  if (userData.status) {
    updateData.status = userData.status;
    // Kích hoạt lại → xóa ngày nghỉ việc.
    if (userData.status === 'active') updateData.left_date = null;
  }
  if (userData.company_id) updateData.company_id = userData.company_id;
  if (userData.sub_department_id !== undefined) updateData.sub_department_id = userData.sub_department_id || null;
  if (userData.job_title_id !== undefined) updateData.job_title_id = userData.job_title_id || null;
  if (userData.manager_id !== undefined) updateData.manager_id = userData.manager_id || null;
  if (userData.module_permissions !== undefined || (userData.role && userData.role !== user.role)) {
    const targetRole = normalizeRole((userData.role || user.role) as string);
    const explicitPermissions =
      userData.module_permissions !== undefined ? userData.module_permissions : {};
    updateData.module_permissions = getEffectiveRolePermissions(targetRole, explicitPermissions);
  }
  if (userData.telegram_chat_id !== undefined) updateData.telegram_chat_id = userData.telegram_chat_id || null;
  if (userData.telegram_enabled !== undefined) updateData.telegram_enabled = userData.telegram_enabled;
  if (userData.preferred_language !== undefined) updateData.preferred_language = userData.preferred_language;
  if (userData.preferred_theme !== undefined) updateData.preferred_theme = userData.preferred_theme;
  // Dashboard tuỳ biến per-user (JSONB, null = mặc định)
  if (userData.dashboard_layout !== undefined) {
    updateData.dashboard_layout = userData.dashboard_layout === null ? null : JSON.stringify(userData.dashboard_layout);
  }
  if (userData.hire_date !== undefined) updateData.hire_date = userData.hire_date || null;
  if (userData.employment_type !== undefined) updateData.employment_type = userData.employment_type || null;
  if (userData.employment_type_id !== undefined) updateData.employment_type_id = userData.employment_type_id || null;
  if (userData.employee_code !== undefined) updateData.employee_code = userData.employee_code || null;
  if (userData.probation_duration_days !== undefined) {
    updateData.probation_duration_days = userData.probation_duration_days ? Number(userData.probation_duration_days) : null;
  }
  // Tự động tính probation_end_date khi cập nhật hire_date hoặc probation_duration_days
  if ((userData.hire_date !== undefined || userData.probation_duration_days !== undefined)) {
    const hireDate = (userData.hire_date !== undefined ? userData.hire_date : (await queryOne<any>('SELECT hire_date FROM users WHERE id::text = $1', [id]))?.hire_date) as string | null;
    const durationDays = userData.probation_duration_days
      ? Number(userData.probation_duration_days)
      : null;
    if (hireDate && durationDays) {
      const d = new Date(hireDate);
      d.setDate(d.getDate() + durationDays);
      updateData.probation_end_date = d.toISOString().slice(0, 10);
    } else if (!durationDays) {
      updateData.probation_end_date = null;
    }
  }
  if (userData.bank_account_no !== undefined) updateData.bank_account_no = userData.bank_account_no || null;
  if (userData.bank_name !== undefined) updateData.bank_name = userData.bank_name || null;
  if (userData.bank_account_name !== undefined) updateData.bank_account_name = userData.bank_account_name || null;
  if (userData.home_address !== undefined) updateData.home_address = userData.home_address || null;
  if (userData.work_location !== undefined) updateData.work_location = userData.work_location || null;
  if (userData.work_start_time !== undefined) updateData.work_start_time = userData.work_start_time || null; // Giờ Làm Việc: giờ vào ca (chấm công + minigame Solace)
  if (userData.deduct_lunch !== undefined) updateData.deduct_lunch = userData.deduct_lunch === false ? false : true; // Trừ nghỉ trưa (mặc định true; false = ca xuyên trưa như tài xế)
  if (userData.diligence_enabled !== undefined) updateData.diligence_enabled = userData.diligence_enabled === true; // Theo Dõi Chuyên Cần (mặc định false — nhạy cảm, super_admin bật riêng từng người)
  // Mặc Định Đủ Công (migration 306): bật → chốt mốc hiệu lực = đầu KỲ CÔNG hiện tại
  // để bảng công các kỳ đã chốt không đổi hồi tố. Tắt → xoá mốc.
  if (userData.default_full_attendance !== undefined) {
    const turnOn = userData.default_full_attendance === true;
    const wasOn = (user as any).default_full_attendance === true;
    updateData.default_full_attendance = turnOn;
    if (turnOn && !wasOn) {
      updateData.default_full_attendance_from = await currentPeriodStartForUser(id);
    } else if (!turnOn) {
      updateData.default_full_attendance_from = null;
    }
  }
  // Hồ Sơ Nhân Sự — thông tin cá nhân map từ form Onboarding (cột migration 099).
  // '' → null để cột DATE không lỗi; children_count ép số nguyên.
  for (const f of PERSONAL_HR_FIELDS) {
    if (userData[f] !== undefined) updateData[f] = userData[f] || null;
  }
  if (userData.children_count !== undefined) {
    updateData.children_count =
      userData.children_count === '' || userData.children_count === null
        ? null
        : Number(userData.children_count);
  }
  // Chế Độ & Đãi Ngộ (migration 121) — bool giữ nguyên, số '' → null, text '' → null.
  for (const f of BENEFITS_BOOL_FIELDS) {
    if (userData[f] !== undefined) updateData[f] = Boolean(userData[f]);
  }
  for (const f of BENEFITS_INT_FIELDS) {
    if (userData[f] !== undefined) {
      updateData[f] = userData[f] === '' || userData[f] === null || isNaN(Number(userData[f]))
        ? null
        : Math.round(Number(userData[f]));
    }
  }
  // Trích trừ BHXH là TỶ LỆ % (cho số lẻ, vd 10.5) — kẹp về 0..100 để không lưu giá trị vô lý.
  if (userData.social_insurance_deduction !== undefined) {
    const raw = userData.social_insurance_deduction;
    const n = typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number(raw);
    updateData.social_insurance_deduction =
      raw === '' || raw === null || !Number.isFinite(n)
        ? null
        : parseFloat(Math.min(100, Math.max(0, n)).toFixed(2));
  }
  for (const f of BENEFITS_TEXT_FIELDS) {
    if (userData[f] !== undefined) updateData[f] = userData[f] || null;
  }
  if (userData.password) {
    // Chỉ SSO: hash local chỉ dành cho super_admin (break-glass); user thường → NULL.
    const targetRole = normalizeRole((userData.role || user.role) as string);
    updateData.password = targetRole === 'super_admin' ? await bcrypt.hash(userData.password, 10) : null;
  }
  if (updatedBy && isValidUUID(updatedBy)) updateData.updated_by = updatedBy;

  const { text, params } = buildUpdateById('users', id, updateData);
  const data = await queryOne<any>(text, params);
  if (!data) throw new Error('Failed to update user');

  // Dual-write cơ cấu tổ chức khi có thay đổi liên quan (công ty/đơn vị/chức danh/quản lý/trạng thái)
  if (
    ['company_id', 'department_id', 'department', 'sub_department_id', 'job_title_id', 'manager_id', 'status']
      .some((f) => userData[f] !== undefined)
  ) {
    await trySyncAssignments(id);
  }

  // Đồng bộ SSO: profile/trạng thái đổi → PATCH; đổi mật khẩu → reset bên SSO.
  try {
    const sso = await import('@/lib/services/ssoProvisioningService');
    const emailChanged = userData.email && userData.email.trim().toLowerCase() !== user.email?.toLowerCase();
    if (emailChanged && user.sso_user_id) {
      // SSO không có API đổi email — đánh dấu để admin xử lý tay, không auto tạo tài khoản trùng.
      await sso.markSsoSyncStatus(id, 'error', 'Email đã đổi — cần cập nhật tay bên SSO rồi bấm Đồng bộ SSO');
    } else if (['name', 'phone', 'status', 'email'].some((f) => userData[f] !== undefined)) {
      await sso.syncUserToSso({ id, email: data.email, name: data.name, phone: data.phone, status: data.status });
    }
    if (userData.password) {
      const r = await sso.resetSsoPasswordForUser(id, userData.password);
      if (r.status === 'error' && r.error !== 'User chưa liên kết SSO') {
        console.error('SSO reset password (update) error:', r.error);
      }
    }
  } catch (e) {
    console.error('SSO sync (update) error:', (e as Error).message);
  }

  if (changes.length > 0) {
    if (updatedBy && isValidUUID(updatedBy)) {
      await addAuditLog('UPDATE', id, `Updated: ${changes.join(', ')}`, updatedBy);
    } else {
      console.log(`User ${id} updated with changes: ${changes.join(', ')}`);
    }
  }

  const userTags = await query<any>(
    `SELECT ut.user_id, ut.tag_id, t.id, t.name, t.color
     FROM user_tags ut
     JOIN tags t ON t.id = ut.tag_id
     WHERE ut.user_id = $1`,
    [id]
  );
  delete data.password;
  data.tags = userTags.map((row: any) => ({ id: row.id, name: row.name, color: row.color }));

  return data as User;
}

export async function deactivateUser(id: string, deactivatedBy?: string): Promise<User | null> {
  const now = new Date().toISOString();
  // left_date = ngày nghỉ việc (turnover). Chỉ set nếu chưa có (giữ ngày nghỉ gốc).
  const updateData: any = { status: 'inactive', updated_at: now, left_date: now.slice(0, 10) };
  if (deactivatedBy && isValidUUID(deactivatedBy)) updateData.updated_by = deactivatedBy;

  const { text, params } = buildUpdateById('users', id, updateData);
  const data = await queryOne<any>(text, params);
  if (!data) throw new Error('Failed to deactivate user');

  if (deactivatedBy && isValidUUID(deactivatedBy)) {
    await addAuditLog('DEACTIVATE', id, `Deactivated user`, deactivatedBy);
  }

  // Nghỉ việc → tắt toàn bộ phân công trong org_assignments
  try {
    await deactivateAllAssignments(id);
  } catch (err) {
    console.error('deactivateAllAssignments error (dual-write):', err);
  }

  // Khóa cả bên SSO — user hết đăng nhập được ngay.
  try {
    const { setSsoStatusForUser } = await import('@/lib/services/ssoProvisioningService');
    await setSsoStatusForUser(id, 'inactive');
  } catch (e) {
    console.error('SSO deactivate error:', (e as Error).message);
  }

  delete data.password;
  return data as User;
}

/**
 * XOÁ CỨNG tài khoản — không hồi phục. Gỡ tài sản đang gán (tránh dangling),
 * rồi DELETE FROM users (các FK liên quan đã CASCADE/SET NULL trong schema).
 * Chỉ gọi sau khi đã xác thực mật khẩu admin + quyền ở tầng API.
 */
export async function hardDeleteUser(id: string): Promise<boolean> {
  // SSO không có xóa cứng → khóa vĩnh viễn bên SSO sau khi xóa local.
  const ssoRow = await queryOne<{ sso_user_id: string | null }>(
    `SELECT sso_user_id FROM users WHERE id::text = $1`, [id]
  );
  const deleted = await withTransaction(async (client) => {
    await client.query(
      `UPDATE assets SET assigned_to = NULL, assigned_to_name = NULL, updated_at = NOW()
        WHERE assigned_to::text = $1`,
      [id]
    );
    const res = await client.query(`DELETE FROM users WHERE id::text = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  });
  if (deleted && ssoRow?.sso_user_id) {
    try {
      // setSsoStatus (hàm thô, không qua *ForUser) không tự tôn trọng toggle autoSyncEnabled
      // → phải tự check ở đây để tắt toggle là tắt được TOÀN BỘ đường gọi SSO, kể cả hard-delete.
      const { getSsoConfig } = await import('@/lib/services/systemSettingsService');
      const cfg = await getSsoConfig();
      if (cfg.autoSyncEnabled) {
        const { setSsoStatus } = await import('@/lib/services/ssoProvisioningService');
        await setSsoStatus(ssoRow.sso_user_id, 'inactive');
      }
    } catch (e) {
      console.error('SSO hard-delete (khóa SSO) error:', (e as Error).message);
    }
  }
  return deleted;
}

export async function addAuditLog(action: string, userId: string, details: string, performedBy: string) {
  try {
    const { randomUUID } = await import('crypto');
    // Cột details là JSONB → phải truyền JSON hợp lệ (chuỗi bọc trong dấu nháy JSON),
    // không truyền chuỗi thường (gây "invalid input syntax for type json").
    await execute(
      `INSERT INTO audit_logs (id, action, "userId", details, "performedBy", timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), action, userId, JSON.stringify(details), performedBy, new Date().toISOString()]
    );
  } catch (err: any) {
    console.error('Audit log error:', err.message);
  }
}

export async function getAuditLogs(userId?: string): Promise<AuditLog[]> {
  if (userId) {
    return query<AuditLog>(`SELECT * FROM audit_logs WHERE "userId" = $1 ORDER BY timestamp DESC`, [userId]);
  }
  return query<AuditLog>(`SELECT * FROM audit_logs ORDER BY timestamp DESC`);
}

export async function updateLastLogin(id: string) {
  try {
    await execute(`UPDATE users SET last_login = $1 WHERE id = $2`, [new Date().toISOString(), id]);
  } catch (err: any) {
    console.error('Update last login error:', err.message);
  }
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  // Chỉ SSO: user thường không giữ mật khẩu local (password = NULL). bcrypt.compare(x, null)
  // sẽ THROW → chặn trước với thông báo rõ, hướng người dùng đổi mật khẩu tại SSO.
  if (!user.password) {
    throw new Error('Tài khoản này đăng nhập qua SSO — vui lòng đổi mật khẩu tại hệ thống SSO.');
  }
  if (!(await bcrypt.compare(oldPassword, user.password))) {
    throw new Error('Old password is incorrect');
  }

  const now = new Date().toISOString();
  const updateData: any = { password: await bcrypt.hash(newPassword, 10), updated_at: now };
  if (isValidUUID(userId)) updateData.updated_by = userId;

  const { text, params } = buildUpdateById('users', userId, updateData);
  await execute(text, params);

  if (isValidUUID(userId)) {
    await addAuditLog('CHANGE_PASSWORD', userId, 'User changed password', userId);
  }
  return true;
}

export async function adminChangeUserPassword(
  adminId: string,
  targetUserId: string,
  newPassword: string
): Promise<boolean> {
  const admin = await getUserById(adminId);
  if (!admin || admin.role !== 'super_admin') {
    throw new Error('Only Super Admin can change other users passwords');
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) throw new Error('User not found');

  if (targetUser.email === 'admin@fadogroup.com.au') {
    throw new Error('Cannot change Admin Master password');
  }

  if (newPassword.length < 10) {
    throw new Error('Mật khẩu phải có ít nhất 10 ký tự');
  }

  const isTargetSuperAdmin = targetUser.role === 'super_admin';

  // Chỉ SSO: user thường (không phải super_admin) KHÔNG giữ hash local → mật khẩu của họ
  // sống DUY NHẤT bên SSO. Vì vậy với target không phải super_admin, phải đổi SSO THÀNH
  // CÔNG trước, TRƯỚC KHI đụng tới cột password local. Nếu làm ngược lại (đổi local trước,
  // SSO fail sau chỉ log) thì 1 lần reset lỗi (user chưa liên kết SSO / SSO tắt / SSO down)
  // sẽ null mất hash cũ mà không có gì thay thế, trong khi hàm vẫn trả về true → admin
  // tưởng đã đổi xong nhưng mật khẩu không đổi ở bất cứ đâu (I9 — silent no-op).
  // super_admin có hash local break-glass riêng → không phụ thuộc SSO, chỉ đồng bộ best-effort.
  if (!isTargetSuperAdmin) {
    const { resetSsoPasswordForUser } = await import('@/lib/services/ssoProvisioningService');
    const r = await resetSsoPasswordForUser(targetUserId, newPassword);
    if (r.status === 'error') {
      throw new Error(
        r.error === 'User chưa liên kết SSO'
          ? 'Tài khoản chưa liên kết SSO — hãy bấm "Đồng bộ SSO" cho người dùng này trước khi đổi mật khẩu.'
          : `Đổi mật khẩu SSO thất bại: ${r.error || 'Lỗi không rõ'}`
      );
    }
    if (r.status === 'disabled') {
      throw new Error('Đồng bộ SSO đang tắt (Cấu Hình Hệ Thống) — không thể đổi mật khẩu cho tài khoản chỉ dùng SSO.');
    }
  }

  const now = new Date().toISOString();
  // Chỉ SSO: hash local chỉ cho super_admin (break-glass); user thường → NULL (mật khẩu vừa
  // đổi THÀNH CÔNG bên SSO ở bước trên).
  const updateData: any = {
    password: isTargetSuperAdmin ? await bcrypt.hash(newPassword, 10) : null,
    updated_at: now,
  };
  if (isValidUUID(adminId)) updateData.updated_by = adminId;

  const { text, params } = buildUpdateById('users', targetUserId, updateData);
  await execute(text, params);

  if (isValidUUID(adminId)) {
    await addAuditLog('ADMIN_CHANGE_PASSWORD', targetUserId, `Password changed by admin: ${admin.name}`, adminId);
  }

  // super_admin: đồng bộ SSO best-effort (đã có hash local break-glass nên không chặn khi lỗi).
  if (isTargetSuperAdmin) {
    try {
      const { resetSsoPasswordForUser } = await import('@/lib/services/ssoProvisioningService');
      const r = await resetSsoPasswordForUser(targetUserId, newPassword);
      if (r.status === 'error' && r.error !== 'User chưa liên kết SSO') {
        console.error('SSO admin reset password error:', r.error);
      }
    } catch (e) {
      console.error('SSO admin reset password error:', (e as Error).message);
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function attachTagsToUsers(users: any[]): Promise<any[]> {
  const userIds = users.map((u: any) => u.id);
  let tagsByUserId: Record<string, Array<{ id: string; name: string; color: string }>> = {};

  try {
    const userTags = await query<any>(
      `SELECT ut.user_id, t.id, t.name, t.color
       FROM user_tags ut
       JOIN tags t ON t.id = ut.tag_id
       WHERE ut.user_id = ANY($1) AND t.is_active = true`,
      [userIds]
    );
    userTags.forEach((row: any) => {
      if (!tagsByUserId[row.user_id]) tagsByUserId[row.user_id] = [];
      tagsByUserId[row.user_id].push({ id: row.id, name: row.name, color: row.color });
    });
  } catch (err: any) {
    console.error('Error fetching tags:', err.message);
  }

  return users.map((user: any) => ({ ...user, tags: tagsByUserId[user.id] || [] }));
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
