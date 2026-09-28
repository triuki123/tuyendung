import { query, queryOne, buildUpdateById } from '@/lib/db';

/** Loại hồ sơ nhân sự (lookup editable). */
export interface HrDocumentType {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  onboarding_visible: boolean;
  onboarding_required: boolean;
  onboarding_multiple: boolean;
  created_at: string;
  updated_at: string;
}

export async function listHrDocumentTypes(all = false): Promise<HrDocumentType[]> {
  return query<HrDocumentType>(
    `SELECT id, name, description, sort_order, is_active,
            onboarding_visible, onboarding_required, onboarding_multiple,
            created_at, updated_at
       FROM hr_document_types
      ${all ? '' : 'WHERE is_active = true'}
      ORDER BY sort_order ASC, name ASC`
  );
}

export async function createHrDocumentType(data: {
  name: string;
  description?: string | null;
  sort_order?: number;
  onboarding_visible?: boolean;
  onboarding_required?: boolean;
  onboarding_multiple?: boolean;
}): Promise<HrDocumentType> {
  const id = `hdoc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return queryOne<HrDocumentType>(
    `INSERT INTO hr_document_types
       (id, name, description, sort_order, is_active,
        onboarding_visible, onboarding_required, onboarding_multiple)
     VALUES ($1, $2, $3, $4, true, $5, $6, $7) RETURNING *`,
    [
      id, data.name.trim(), data.description ?? null, data.sort_order ?? 0,
      data.onboarding_visible ?? true,
      data.onboarding_required ?? false,
      data.onboarding_multiple ?? false,
    ]
  ) as Promise<HrDocumentType>;
}

export async function updateHrDocumentType(
  id: string,
  data: Partial<Pick<HrDocumentType,
    'name' | 'description' | 'sort_order' | 'is_active'
    | 'onboarding_visible' | 'onboarding_required' | 'onboarding_multiple'>>
): Promise<HrDocumentType | null> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) updateData.name = String(data.name).trim();
  if (data.description !== undefined) updateData.description = data.description || null;
  if (typeof data.sort_order === 'number') updateData.sort_order = data.sort_order;
  if (typeof data.is_active === 'boolean') updateData.is_active = data.is_active;
  if (typeof data.onboarding_visible === 'boolean') updateData.onboarding_visible = data.onboarding_visible;
  if (typeof data.onboarding_required === 'boolean') updateData.onboarding_required = data.onboarding_required;
  if (typeof data.onboarding_multiple === 'boolean') updateData.onboarding_multiple = data.onboarding_multiple;

  const { text, params } = buildUpdateById('hr_document_types', id, updateData);
  return queryOne<HrDocumentType>(text, params);
}

export async function deactivateHrDocumentType(id: string): Promise<HrDocumentType | null> {
  const { text, params } = buildUpdateById('hr_document_types', id, {
    is_active: false,
    updated_at: new Date().toISOString(),
  });
  return queryOne<HrDocumentType>(text, params);
}
