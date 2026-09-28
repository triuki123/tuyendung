import { query, queryOne, execute } from '@/lib/db';

/**
 * Contact sau khi JOIN với users — tất cả thông tin người đại diện
 * được đọc trực tiếp từ users, không lưu duplicate vào contacts.
 */
export interface Contact {
  id: string;
  user_id: string | null;
  responsibility: string;   // "Bảo Trì Bảo Dưỡng Toà Nhà"
  note: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // — populated từ users JOIN —
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_department: string | null;
  user_sub_department: string | null;
  user_position: string | null;
  user_avatar: string | null;
  user_role: string | null;
  user_work_location: string | null;
  user_status: string | null;
}

/** User rút gọn dùng cho dropdown search */
export interface UserOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  department: string | null;
  sub_department: string | null;
  position: string | null;
  avatar: string | null;
  work_location: string | null;
  role: string;
  status: string;
}

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

/** Lấy tất cả đầu mối liên hệ, JOIN với users để lấy thông tin người đại diện */
export async function getAllContacts(search?: string): Promise<Contact[]> {
  const params: unknown[] = [true];
  let where = 'WHERE c.is_active = $1';

  if (search) {
    where += ` AND (
      c.responsibility ILIKE $2
      OR u.name ILIKE $2
      OR d.name ILIKE $2
      OR u.phone ILIKE $2
      OR u.email ILIKE $2
    )`;
    params.push(`%${search}%`);
  }

  return query<Contact>(
    `SELECT
       c.id,
       c.user_id,
       c.responsibility,
       c.note,
       c.is_active,
       c.sort_order,
       c.created_by,
       c.created_at,
       c.updated_at,
       u.name          AS user_name,
       u.email         AS user_email,
       u.phone         AS user_phone,
       d.name          AS user_department,
       sd.name         AS user_sub_department,
       COALESCE(p.name, u.position, '') AS user_position,
       u.avatar        AS user_avatar,
       u.role          AS user_role,
       NULL::text      AS user_work_location,
       u.status        AS user_status
     FROM contacts c
     LEFT JOIN users u          ON u.id::text = c.user_id
     LEFT JOIN departments d    ON d.id::text = u.department_id::text
     LEFT JOIN sub_departments sd ON sd.id::text = u.sub_department_id::text
     LEFT JOIN positions p      ON p.id::text = u.position_id::text
     ${where}
     ORDER BY c.sort_order ASC, c.responsibility ASC`,
    params
  );
}

/** Lấy chi tiết một liên hệ theo id */
export async function getContactById(id: string): Promise<Contact | null> {
  return queryOne<Contact>(
    `SELECT
       c.*,
       u.name          AS user_name,
       u.email         AS user_email,
       u.phone         AS user_phone,
       d.name          AS user_department,
       sd.name         AS user_sub_department,
       COALESCE(p.name, u.position, '') AS user_position,
       u.avatar        AS user_avatar,
       u.role          AS user_role,
       NULL::text      AS user_work_location,
       u.status        AS user_status
     FROM contacts c
     LEFT JOIN users u            ON u.id::text = c.user_id
     LEFT JOIN departments d      ON d.id::text = u.department_id::text
     LEFT JOIN sub_departments sd ON sd.id::text = u.sub_department_id::text
     LEFT JOIN positions p        ON p.id::text = u.position_id::text
     WHERE c.id = $1`,
    [id]
  );
}

/**
 * Tìm kiếm users cho dropdown "Người Đại Diện".
 * Chỉ lấy users active, sắp xếp theo tên.
 */
export async function searchUsersForContact(q: string): Promise<UserOption[]> {
  const trimmed = q.trim();

  // Khi q rỗng → trả tất cả users active, không cần filter text
  // JOIN departments + positions để lấy tên thay vì UUID
  // COALESCE để tương thích DB chưa có work_location column
  const baseSelect = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      co.name         AS company,
      d.name          AS department,
      sd.name         AS sub_department,
      COALESCE(p.name, u.position, '') AS position,
      u.avatar,
      NULL::text      AS work_location,
      u.role,
      u.status
    FROM users u
    LEFT JOIN companies      co ON co.id::text = u.company_id::text
    LEFT JOIN departments    d  ON d.id::text  = u.department_id::text
    LEFT JOIN sub_departments sd ON sd.id::text = u.sub_department_id::text
    LEFT JOIN positions      p  ON p.id::text  = u.position_id::text
  `;

  if (!trimmed) {
    // Trước đây LIMIT 50 → các nhân viên có tên xếp sau bị cắt → user phản ánh
    // dropdown thiếu, phải tìm mới ra. Bump lên 500 đủ cho FADO Group hiện tại
    // (~200 user active) + dư cho tăng trưởng. Payload nhỏ (mỗi row vài trăm
    // byte), 1 round-trip duy nhất khi mở dropdown — không cần phân trang.
    return query<UserOption>(
      `${baseSelect}
       WHERE u.status != 'inactive'
       ORDER BY u.name ASC
       LIMIT 500`,
      []
    );
  }

  const search = `%${trimmed}%`;
  return query<UserOption>(
    `${baseSelect}
     WHERE u.status != 'inactive'
       AND (
         u.name ILIKE $1
         OR u.email ILIKE $1
         OR COALESCE(d.name, '') ILIKE $1
         OR COALESCE(p.name, '') ILIKE $1
       )
     ORDER BY u.name ASC
     LIMIT 100`,
    [search]
  );
}

// ---------------------------------------------------------------------------
// WRITE
// ---------------------------------------------------------------------------

/** Tạo đầu mối liên hệ mới */
export async function createContact(data: {
  user_id?: string | null;
  responsibility: string;
  note?: string | null;
  sort_order?: number;
  created_by?: string;
}): Promise<Contact> {
  const id = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await execute(
    `INSERT INTO contacts (id, user_id, responsibility, note, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      data.user_id ?? null,
      data.responsibility,
      data.note ?? null,
      data.sort_order ?? 0,
      data.created_by ?? null,
    ]
  );
  return getContactById(id) as Promise<Contact>;
}

/** Cập nhật đầu mối liên hệ */
export async function updateContact(
  id: string,
  data: {
    user_id?: string | null;
    responsibility?: string;
    note?: string | null;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<Contact | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.user_id !== undefined)       { fields.push(`user_id = $${idx++}`);       params.push(data.user_id); }
  if (data.responsibility !== undefined) { fields.push(`responsibility = $${idx++}`); params.push(data.responsibility); }
  if (data.note !== undefined)           { fields.push(`note = $${idx++}`);           params.push(data.note); }
  if (data.sort_order !== undefined)     { fields.push(`sort_order = $${idx++}`);     params.push(data.sort_order); }
  if (data.is_active !== undefined)      { fields.push(`is_active = $${idx++}`);      params.push(data.is_active); }

  if (fields.length === 0) return getContactById(id);

  fields.push(`updated_at = NOW()`);
  params.push(id);

  await execute(
    `UPDATE contacts SET ${fields.join(', ')} WHERE id = $${idx}`,
    params
  );
  return getContactById(id);
}

/** Xóa đầu mối liên hệ */
export async function deleteContact(id: string): Promise<boolean> {
  const affected = await execute(`DELETE FROM contacts WHERE id = $1`, [id]);
  return affected > 0;
}
