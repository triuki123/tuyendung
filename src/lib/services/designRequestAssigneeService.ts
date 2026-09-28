import { query, queryOne } from '@/lib/db';

export type DesignAssignee = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  unit_name: string;
};

// Danh sách người thực hiện: toàn bộ nhân sự đang hoạt động thuộc công ty —
// KHÔNG lọc cứng theo tên phòng ban (trước đây match ILIKE 'thiết kế'/'design'
// nên phòng Social hay bất kỳ phòng nào khác không hiện lên). Người tạo yêu
// cầu tự chọn đúng người cần giao, giống cách chọn "Người phụ trách" ở các
// module khác.
const ASSIGNEE_FROM = `
  FROM users u
  LEFT JOIN user_company_memberships m
    ON m.user_id::text = u.id::text
   AND m.company_id::text = $1
   AND COALESCE(m.is_active, true)
  LEFT JOIN org_assignments oa
    ON oa.user_id::text = u.id::text
   AND oa.company_id::text = $1
   AND oa.is_primary
   AND oa.is_active
  LEFT JOIN departments d
    ON d.id::text = COALESCE(oa.department_id::text, m.department_id::text, u.department_id::text)
  LEFT JOIN sub_departments sd
    ON sd.id::text = COALESCE(oa.sub_department_id::text, m.sub_department_id::text, u.sub_department_id::text)
  WHERE u.status = 'active'
    AND (u.company_id::text = $1 OR m.user_id IS NOT NULL OR oa.user_id IS NOT NULL)`;

export async function getDesignAssignees(companyId: string): Promise<DesignAssignee[]> {
  return query<DesignAssignee>(
    `SELECT DISTINCT u.id::text AS id, u.name, u.email, u.avatar,
            COALESCE(sd.name, d.name, 'Chưa phân phòng ban') AS unit_name
       ${ASSIGNEE_FROM}
      ORDER BY u.name ASC`,
    [companyId]
  );
}

export async function getDesignAssignee(companyId: string, userId: string): Promise<DesignAssignee | null> {
  return queryOne<DesignAssignee>(
    `SELECT DISTINCT u.id::text AS id, u.name, u.email, u.avatar,
            COALESCE(sd.name, d.name, 'Chưa phân phòng ban') AS unit_name
       ${ASSIGNEE_FROM}
       AND u.id::text = $2
      LIMIT 1`,
    [companyId, userId]
  );
}
