/**
 * KPI & Đánh Giá — bộ chỉ tiêu mẫu theo công ty, gắn chức danh/phòng ban hoặc toàn công ty.
 * Dùng để giao KPI nhanh cho hàng loạt nhân viên, vẫn tùy chỉnh riêng được ở từng phiếu (kpiAssignmentService).
 */
import crypto from 'crypto';
import { query, queryOne, execute, withTransaction } from '@/lib/db';

export type KpiTemplateScope = 'company' | 'department' | 'sub_department' | 'job_title';
export type KpiTargetType = 'number' | 'percent' | 'boolean' | 'scale';

export interface KpiTemplateItemInput {
  name: string;
  description?: string | null;
  weight: number;
  target_type: KpiTargetType;
  target_value?: string | null;
  unit?: string | null;
  category?: string | null;
}

export interface KpiTemplateItem extends KpiTemplateItemInput {
  id: string;
  template_id: string;
  sort_order: number;
}

export type KpiIntegrationSourceKey = 'attendance' | 'task';
export interface KpiTemplateIntegrationSource {
  source: KpiIntegrationSourceKey;
  enabled: boolean;
  weight: number;
}

export interface KpiTemplate {
  id: string;
  company_id: string;
  name: string;
  scope_type: KpiTemplateScope;
  scope_id: string | null;
  is_active: boolean;
  /** Chấm công/Task có tính tham khảo vào KPI của bộ chỉ tiêu NÀY không — cấu hình theo từng mẫu, không phải toàn công ty. */
  integration_sources: KpiTemplateIntegrationSource[];
  created_by: string | null;
  created_at: string;
}

export async function listTemplates(companyId: string): Promise<KpiTemplate[]> {
  return query<KpiTemplate>(
    `SELECT * FROM kpi_templates WHERE company_id = $1 ORDER BY created_at DESC`,
    [companyId]
  );
}

export async function getTemplateWithItems(templateId: string, companyId: string) {
  const tpl = await queryOne<KpiTemplate>(
    `SELECT * FROM kpi_templates WHERE id = $1 AND company_id = $2`,
    [templateId, companyId]
  );
  if (!tpl) return null;
  const items = await query<KpiTemplateItem>(
    `SELECT * FROM kpi_template_items WHERE template_id = $1 ORDER BY sort_order, created_at`,
    [templateId]
  );
  return { ...tpl, items };
}

/**
 * Tìm template phù hợp nhất cho 1 nhân viên: ưu tiên chức danh > BỘ PHẬN > PHÒNG BAN > toàn
 * công ty. Bộ phận nằm DƯỚI phòng ban (1 phòng ban có nhiều bộ phận) nên là phạm vi hẹp hơn,
 * ưu tiên trước phòng ban khi cả hai đều có mẫu riêng.
 */
export async function findBestTemplateForEmployee(
  companyId: string,
  departmentId: string | null,
  jobTitleId: string | null,
  subDepartmentId?: string | null
): Promise<KpiTemplate | null> {
  if (jobTitleId) {
    const t = await queryOne<KpiTemplate>(
      `SELECT * FROM kpi_templates WHERE company_id = $1 AND scope_type = 'job_title' AND scope_id = $2 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [companyId, jobTitleId]
    );
    if (t) return t;
  }
  if (subDepartmentId) {
    const t = await queryOne<KpiTemplate>(
      `SELECT * FROM kpi_templates WHERE company_id = $1 AND scope_type = 'sub_department' AND scope_id = $2 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [companyId, subDepartmentId]
    );
    if (t) return t;
  }
  if (departmentId) {
    const t = await queryOne<KpiTemplate>(
      `SELECT * FROM kpi_templates WHERE company_id = $1 AND scope_type = 'department' AND scope_id = $2 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [companyId, departmentId]
    );
    if (t) return t;
  }
  return queryOne<KpiTemplate>(
    `SELECT * FROM kpi_templates WHERE company_id = $1 AND scope_type = 'company' AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [companyId]
  );
}

export async function createTemplate(
  companyId: string,
  data: { name: string; scope_type: KpiTemplateScope; scope_id?: string | null; items: KpiTemplateItemInput[]; integration_sources?: KpiTemplateIntegrationSource[] },
  createdBy: string
): Promise<KpiTemplate> {
  return withTransaction(async (client) => {
    const id = 'kpt_' + crypto.randomBytes(8).toString('hex');
    const { rows } = await client.query(
      `INSERT INTO kpi_templates (id, company_id, name, scope_type, scope_id, integration_sources, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, companyId, data.name, data.scope_type, data.scope_id ?? null, JSON.stringify(data.integration_sources || []), createdBy]
    );
    let order = 0;
    for (const item of data.items) {
      const itemId = 'kti_' + crypto.randomBytes(8).toString('hex');
      await client.query(
        `INSERT INTO kpi_template_items (id, template_id, name, description, weight, target_type, target_value, unit, category, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [itemId, id, item.name, item.description ?? null, item.weight, item.target_type, item.target_value ?? null, item.unit ?? null, item.category ?? null, order++]
      );
    }
    return rows[0];
  });
}

export async function updateTemplate(
  templateId: string,
  companyId: string,
  data: { name?: string; is_active?: boolean; items?: KpiTemplateItemInput[]; integration_sources?: KpiTemplateIntegrationSource[]; scope_type?: KpiTemplateScope; scope_id?: string | null }
): Promise<KpiTemplate | null> {
  return withTransaction(async (client) => {
    const sets: string[] = [];
    const params: any[] = [];
    if (data.name !== undefined) { params.push(data.name); sets.push(`name = $${params.length}`); }
    if (data.is_active !== undefined) { params.push(data.is_active); sets.push(`is_active = $${params.length}`); }
    if (data.scope_type !== undefined) { params.push(data.scope_type); sets.push(`scope_type = $${params.length}`); }
    if (data.scope_id !== undefined) { params.push(data.scope_id); sets.push(`scope_id = $${params.length}`); }
    if (data.integration_sources !== undefined) { params.push(JSON.stringify(data.integration_sources)); sets.push(`integration_sources = $${params.length}`); }
    if (sets.length) {
      sets.push('updated_at = NOW()');
      params.push(templateId, companyId);
      await client.query(
        `UPDATE kpi_templates SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND company_id = $${params.length}`,
        params
      );
    }
    if (data.items) {
      await client.query(`DELETE FROM kpi_template_items WHERE template_id = $1`, [templateId]);
      let order = 0;
      for (const item of data.items) {
        const itemId = 'kti_' + crypto.randomBytes(8).toString('hex');
        await client.query(
          `INSERT INTO kpi_template_items (id, template_id, name, description, weight, target_type, target_value, unit, category, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [itemId, templateId, item.name, item.description ?? null, item.weight, item.target_type, item.target_value ?? null, item.unit ?? null, item.category ?? null, order++]
        );
      }
    }
    const { rows } = await client.query(`SELECT * FROM kpi_templates WHERE id = $1 AND company_id = $2`, [templateId, companyId]);
    return rows[0] || null;
  });
}

export async function deleteTemplate(templateId: string, companyId: string): Promise<boolean> {
  const n = await execute(`DELETE FROM kpi_templates WHERE id = $1 AND company_id = $2`, [templateId, companyId]);
  return n > 0;
}
