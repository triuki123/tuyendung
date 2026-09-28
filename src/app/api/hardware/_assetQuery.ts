import { queryOne } from '@/lib/db';

/**
 * Lấy 1 asset kèm TÊN (loại/công ty/phòng ban/bộ phận) — dùng chung cho GET/PUT/POST
 * để response luôn có *_name, tránh UI render UUID thô sau khi tạo/sửa.
 * Ép ::text cả hai vế vì assets.category/*_id có thể lệch kiểu (uuid vs text) với id bảng đích.
 */
export async function getAssetWithNames(id: string) {
  return queryOne(
    `SELECT a.*,
        ac.name AS category_name,
        co.name AS company_name,
        d.name  AS department_name,
        sd.name AS sub_department_name
      FROM assets a
      LEFT JOIN asset_categories ac ON ac.id::text = a.category::text
      LEFT JOIN companies co        ON co.id::text = a.company_id::text
      LEFT JOIN departments d       ON d.id::text  = a.department_id::text
      LEFT JOIN sub_departments sd  ON sd.id::text = a.sub_department_id::text
     WHERE a.id = $1`,
    [id]
  );
}
