import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

// Calculate status based on renewal date
function calculateStatus(renewalDate: string): 'active' | 'expiring' | 'expired' {
  if (!renewalDate) return 'active';

  const expDate = new Date(renewalDate);
  const today = new Date();
  const daysLeft = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'expiring';
  return 'active';
}

export interface Software {
  id: string;
  softwarename: string;
  vendor: string;
  category: string;
  licensetype: string;
  totallicenses: number;
  usedlicenses: number;
  unitcost: number;
  purchasedate: string;
  renewaldate: string;
  department: string;
  manager: string;
  company_id: string | null;
  manager_user_id: string | null;
  department_id: string | null;
  sub_department_id: string | null;
  status: 'active' | 'expiring' | 'expired';
  notes: string;
  totalcost: number;
  licensesavailable: number;
  usagepercentage: number;
  created_at: string;
  updated_at: string;
}

// Convert from client format to database format
function toDatabaseFormat(data: any) {
  return {
    softwarename: data.name || data.softwarename || '',
    vendor: data.vendor || '',
    category: data.category || 'productivity',
    licensetype: data.licenseType || data.licensetype || 'subscription',
    totallicenses: parseInt(data.totalLicenses) || parseInt(data.totallicenses) || 0,
    usedlicenses: parseInt(data.usedLicenses) || parseInt(data.usedlicenses) || 0,
    unitcost: parseFloat(data.unitCost) || parseFloat(data.unitcost) || 0,
    purchasedate: data.purchaseDate || data.purchasedate || '',
    renewaldate: data.renewalDate || data.renewaldate || '',
    department: data.department || '',
    manager: data.manager || '',
    company_id: data.companyId || data.company_id || null,
    manager_user_id: data.managerUserId || data.manager_user_id || null,
    department_id: data.departmentId || data.department_id || null,
    sub_department_id: data.subDepartmentId || data.sub_department_id || null,
    status: data.status || 'active',
    notes: data.notes || '',
    totalcost: parseFloat(data.unitCost) * (parseInt(data.totallicenses) || 0) || 0,
    licensesavailable: (parseInt(data.totallicenses) || 0) - (parseInt(data.usedlicenses) || 0),
    usagepercentage: (parseInt(data.usedlicenses) || 0) / (parseInt(data.totallicenses) || 1) * 100 || 0,
  };
}

// Convert from database format to client format
function toClientFormat(data: any): any {
  const calculatedStatus = calculateStatus(data.renewaldate);

  return {
    id: data.id,
    name: data.softwarename,
    vendor: data.vendor,
    category: data.category,
    licenseType: data.licensetype,
    totalLicenses: data.totallicenses,
    usedLicenses: data.usedlicenses,
    unitCost: data.unitcost,
    renewalDate: data.renewaldate,
    purchaseDate: data.purchasedate,
    department: data.department,
    manager: data.manager,
    companyId: data.company_id || null,
    managerUserId: data.manager_user_id || null,
    departmentId: data.department_id || null,
    subDepartmentId: data.sub_department_id || null,
    status: calculatedStatus,
    notes: data.notes,
    totalCost: data.totalcost,
    licensesAvailable: data.licensesavailable,
    usagePercentage: data.usagepercentage,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function getSoftware(filters?: {
  status?: string;
  category?: string;
  companyId?: string;
  managerUserIds?: string[];
}) {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.category) {
    conditions.push(`category = $${idx++}`);
    params.push(filters.category);
  }
  if (filters?.companyId) {
    conditions.push(`company_id::text = $${idx++}`);
    params.push(filters.companyId);
  }
  if (filters?.managerUserIds) {
    conditions.push(`manager_user_id::text = ANY($${idx++}::text[])`);
    params.push(filters.managerUserIds);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const data = await query<any>(`SELECT * FROM software ${where}`, params);
  return (data || []).map(toClientFormat);
}

export async function getSoftwareById(id: string) {
  const data = await queryOne<any>(`SELECT * FROM software WHERE id = $1`, [id]);
  return data ? toClientFormat(data) : null;
}

export async function createSoftware(softwareData: any): Promise<any> {
  const now = new Date().toISOString();
  const formatData = toDatabaseFormat(softwareData);
  const newSoftware = { ...formatData, created_at: now, updated_at: now };

  const { text, params } = buildInsert('software', newSoftware);
  const data = await queryOne<any>(text, params);
  if (!data) throw new Error('Failed to create software');
  return toClientFormat(data);
}

export async function updateSoftware(id: string, softwareData: any): Promise<any> {
  const now = new Date().toISOString();
  const formatData = toDatabaseFormat(softwareData);
  const updateData = { ...formatData, updated_at: now };

  const { text, params } = buildUpdateById('software', id, updateData);
  const data = await queryOne<any>(text, params);
  if (!data) throw new Error('Failed to update software');
  return toClientFormat(data);
}

export async function deleteSoftware(id: string): Promise<void> {
  await execute(`DELETE FROM software WHERE id = $1`, [id]);
}
