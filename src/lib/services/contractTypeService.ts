import { query, queryOne, buildUpdateById } from '@/lib/db';

/** Loại hợp đồng (lookup editable). */
export interface ContractType {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  code_template: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Lấy danh sách loại HĐ. all=true → kèm cả inactive (cho trang cài đặt). */
export async function listContractTypes(all = false): Promise<ContractType[]> {
  return query<ContractType>(
    `SELECT id, name, description, code, code_template, sort_order, is_active, created_at, updated_at
       FROM contract_types
      ${all ? '' : 'WHERE is_active = true'}
      ORDER BY sort_order ASC, name ASC`
  );
}

export async function createContractType(data: {
  name: string;
  description?: string | null;
  code?: string | null;
  code_template?: string | null;
  sort_order?: number;
}): Promise<ContractType> {
  const id = `ctype_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return queryOne<ContractType>(
    `INSERT INTO contract_types (id, name, description, code, code_template, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
    [
      id,
      data.name.trim(),
      data.description ?? null,
      data.code?.trim() || null,
      data.code_template?.trim() || null,
      data.sort_order ?? 0,
    ]
  ) as Promise<ContractType>;
}

export async function updateContractType(
  id: string,
  data: Partial<Pick<ContractType, 'name' | 'description' | 'code' | 'code_template' | 'sort_order' | 'is_active'>>
): Promise<ContractType | null> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) updateData.name = String(data.name).trim();
  if (data.description !== undefined) updateData.description = data.description || null;
  if (data.code !== undefined) updateData.code = (data.code && String(data.code).trim()) || null;
  if (data.code_template !== undefined) updateData.code_template = (data.code_template && String(data.code_template).trim()) || null;
  if (typeof data.sort_order === 'number') updateData.sort_order = data.sort_order;
  if (typeof data.is_active === 'boolean') updateData.is_active = data.is_active;

  const { text, params } = buildUpdateById('contract_types', id, updateData);
  return queryOne<ContractType>(text, params);
}

/** Xóa mềm (is_active=false). */
export async function deactivateContractType(id: string): Promise<ContractType | null> {
  const { text, params } = buildUpdateById('contract_types', id, {
    is_active: false,
    updated_at: new Date().toISOString(),
  });
  return queryOne<ContractType>(text, params);
}
