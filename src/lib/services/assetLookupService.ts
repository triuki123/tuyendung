import { query, queryOne } from '@/lib/db';

export type AssetType = 'hardware' | 'domain' | 'email' | 'software';
export type LookupScope = 'none' | 'subordinates' | 'company' | 'system';

export interface LookedUpAsset {
  id: string;
  type: AssetType;
  code: string | null;
  name: string;
  category_name: string | null;
  status: string | null;
  value: number | null;
  assigned_to: string | null;
  assigned_user_name: string | null;
  company_id: string | null;
  created_at: string;
}

/**
 * 4 nguồn tài sản hợp nhất cho Tra Cứu Tài Sản.
 * - resp: cột người phụ trách (so khớp users.id, kiểu TEXT)
 * - company: cột công ty (ép ::text để so sánh đồng nhất)
 */
interface AssetSource {
  type: AssetType;
  select: string;
  resp: string;
  company: string;
}

const SOURCES: AssetSource[] = [
  {
    type: 'hardware',
    resp: 'a.assigned_to::text',
    company: 'a.company_id::text',
    select: `
      SELECT a.id::text AS id, 'hardware' AS type, a.code, a.name,
             COALESCE(ac.name, a.category) AS category_name,
             a.status, a.value,
             a.assigned_to::text AS assigned_to,
             COALESCE(a.assigned_to_name, u.name) AS assigned_user_name,
             a.company_id::text AS company_id, a.created_at
      FROM assets a
      LEFT JOIN asset_categories ac ON ac.name = a.category
      LEFT JOIN users u ON u.id::text = a.assigned_to::text`,
  },
  {
    type: 'domain',
    resp: 'd.manager_user_id::text',
    company: 'd.owner_company_id::text',
    select: `
      SELECT d.id::text AS id, 'domain' AS type, d.domainname AS code, d.domainname AS name,
             'Tên miền' AS category_name, d.status, d.cost AS value,
             d.manager_user_id AS assigned_to, u.name AS assigned_user_name,
             d.owner_company_id::text AS company_id, d.created_at
      FROM domains d
      LEFT JOIN users u ON u.id = d.manager_user_id`,
  },
  {
    type: 'email',
    resp: 'e.user_id::text',
    company: 'e.company_id::text',
    select: `
      SELECT e.id::text AS id, 'email' AS type, e.emailaddress AS code, e.emailaddress AS name,
             'Tài khoản email' AS category_name, e.status, NULL::numeric AS value,
             e.user_id AS assigned_to, u.name AS assigned_user_name,
             e.company_id::text AS company_id, e.created_at
      FROM email_accounts e
      LEFT JOIN users u ON u.id = e.user_id`,
  },
  {
    type: 'software',
    resp: 's.manager_user_id::text',
    company: 's.company_id::text',
    select: `
      SELECT s.id::text AS id, 'software' AS type, s.softwarename AS code, s.softwarename AS name,
             'Phần mềm' AS category_name, s.status, s.totalcost AS value,
             s.manager_user_id AS assigned_to, u.name AS assigned_user_name,
             s.company_id::text AS company_id, s.created_at
      FROM software s
      LEFT JOIN users u ON u.id = s.manager_user_id`,
  },
];

/** Chạy 1 điều kiện WHERE trên cả 4 nguồn rồi gộp kết quả */
async function runAll(
  buildWhere: (src: AssetSource) => { where: string; params: any[] },
): Promise<LookedUpAsset[]> {
  const lists = await Promise.all(
    SOURCES.map(async (src) => {
      const { where, params } = buildWhere(src);
      const sql = `${src.select} ${where ? `WHERE ${where}` : ''} ORDER BY name ASC`;
      try {
        return await query<LookedUpAsset>(sql, params);
      } catch (err) {
        // 1 nguồn lỗi (vd migration chưa chạy) không làm hỏng toàn bộ tra cứu
        console.error(`asset-lookup source ${src.type} error:`, err);
        return [] as LookedUpAsset[];
      }
    }),
  );
  return lists.flat();
}

/** Tài sản được gán trực tiếp cho user */
async function getMine(userId: string): Promise<LookedUpAsset[]> {
  return runAll((src) => ({ where: `${src.resp} = $1`, params: [userId] }));
}

/** ID cấp dưới (đệ quy) — Phase 4 cải tổ: theo org_assignments (hợp nhất kiêm nhiệm). */
async function getSubordinateIds(managerId: string): Promise<string[]> {
  const { getOrgSubtreeUserIds } = await import('@/lib/services/orgStructureService');
  return getOrgSubtreeUserIds(managerId);
}

/**
 * Tài sản nhìn thấy theo role:
 * - super_admin → toàn hệ thống
 * - admin       → toàn bộ công ty của họ
 * - quản lý (có cấp dưới) → của mình + cấp dưới
 * - user        → chỉ của mình
 *
 * Trả về { mine, others, scope }: tab1 = của tôi, tab2 = phần còn lại được phép xem
 * (đã loại trùng với "của tôi").
 */
export async function getVisibleAssets(
  userId: string,
  role: string | null,
): Promise<{ mine: LookedUpAsset[]; others: LookedUpAsset[]; scope: LookupScope }> {
  const mine = await getMine(userId);

  if (role === 'super_admin') {
    const others = await runAll((src) => ({
      where: `${src.resp} IS DISTINCT FROM $1`,
      params: [userId],
    }));
    return { mine, others, scope: 'system' };
  }

  if (role === 'admin') {
    const me = await queryOne<{ company_id: string | null }>(
      `SELECT company_id FROM users WHERE id = $1`,
      [userId],
    );
    const companyId = me?.company_id || '';
    const others = companyId
      ? await runAll((src) => ({
          where: `${src.company} = $1 AND ${src.resp} IS DISTINCT FROM $2`,
          params: [companyId, userId],
        }))
      : [];
    return { mine, others, scope: 'company' };
  }

  // Người thường: là quản lý nếu có cấp dưới
  const subIds = await getSubordinateIds(userId);
  if (subIds.length > 0) {
    const others = await runAll((src) => ({
      where: `${src.resp} = ANY($1)`,
      params: [subIds],
    }));
    return { mine, others, scope: 'subordinates' };
  }

  return { mine, others: [], scope: 'none' };
}
