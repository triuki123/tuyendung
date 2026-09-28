import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

export interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  nguoiSuDung: string;
  congtyDonvi: string;
  phongban: string;
  userId: string | null;
  companyId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  createdDate: string;
  status: 'active' | 'locked' | 'archived';
  notes: string;
  created_at: string;
  updated_at: string;
}

// Convert from client format to database format (actual DB column names — lowercase)
function toDatabaseFormat(data: any) {
  return {
    emailaddress: data.email || '',
    emailprovider: (data.provider || '').toLowerCase(),
    initialpassword: data.initialpassword || 'changeme123',
    currentpassword: data.currentpassword || '',
    passwordchangeddate: data.passwordchangeddate || '',
    assigneduser: data.assigneduser || data.nguoiSuDung || '',
    nguoisudung: data.nguoiSuDung || '',
    userfullname: data.userfullname || '',
    userposition: data.userposition || '',
    congtydonvi: data.congtyDonvi || '',
    company: data.company || data.congtyDonvi || '',
    phongban: data.phongban || '',
    department: data.department || data.phongban || '',
    user_id: data.userId || data.user_id || null,
    company_id: data.companyId || data.company_id || null,
    department_id: data.departmentId || data.department_id || null,
    sub_department_id: data.subDepartmentId || data.sub_department_id || null,
    assigneddate: data.assignedDate || data.createdDate || '',
    createddate: data.createdDate || '',
    status: data.status || 'active',
    lastlogin: data.lastlogin || '',
    storagequota: data.storagequota || 0,
    storageused: data.storageused || 0,
    forwarding: data.forwarding || '',
    recoveryemail: data.recoveryemail || '',
    recoveryphone: data.recoveryphone || '',
    twofaenabled: data.twofaenabled || false,
    contactphone: data.contactphone || '',
    contactemail: data.contactemail || '',
    notes: data.notes || '',
    assigned_user: data.assigned_user || data.nguoiSuDung || '',
  };
}

// Convert from database format to client format
function toClientFormat(data: any): EmailAccount {
  return {
    id: data.id || data.ID || '',
    email: data.emailaddress || data.email || '',
    provider: data.emailprovider || data.provider || '',
    nguoiSuDung: data.nguoisudung || data.nguoiSuDung || '',
    congtyDonvi: data.congtydonvi || data.congtyDonvi || '',
    phongban: data.phongban || '',
    userId: data.user_id || null,
    companyId: data.company_id || null,
    departmentId: data.department_id || null,
    subDepartmentId: data.sub_department_id || null,
    createdDate: data.createddate || data.createdDate || '',
    status: (data.status || 'active') as 'active' | 'locked' | 'archived',
    notes: data.notes || '',
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function getEmailAccounts(filters?: {
  status?: string;
  provider?: string;
  nguoisudung?: string;
  congtydonvi?: string;
  phongban?: string;
  companyId?: string;
  userIds?: string[];
}) {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.provider) {
    conditions.push(`emailprovider = $${idx++}`);
    params.push(filters.provider);
  }
  if (filters?.nguoisudung) {
    conditions.push(`nguoisudung ILIKE $${idx++}`);
    params.push(`%${filters.nguoisudung}%`);
  }
  if (filters?.congtydonvi) {
    conditions.push(`congtydonvi ILIKE $${idx++}`);
    params.push(`%${filters.congtydonvi}%`);
  }
  if (filters?.phongban) {
    conditions.push(`phongban ILIKE $${idx++}`);
    params.push(`%${filters.phongban}%`);
  }
  if (filters?.companyId) {
    conditions.push(`company_id::text = $${idx++}`);
    params.push(filters.companyId);
  }
  if (filters?.userIds) {
    conditions.push(`user_id::text = ANY($${idx++}::text[])`);
    params.push(filters.userIds);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const data = await query<any>(`SELECT * FROM email_accounts ${where}`, params);
  return (data || []).map(toClientFormat);
}

export async function getEmailAccountById(id: string) {
  const data = await queryOne<any>(`SELECT * FROM email_accounts WHERE id = $1`, [id]);
  return data ? toClientFormat(data) : null;
}

export async function createEmailAccount(emailData: any): Promise<any> {
  const now = new Date().toISOString();
  const formatData = toDatabaseFormat(emailData);
  const newAccount = { ...formatData, created_at: now, updated_at: now };

  const { text, params } = buildInsert('email_accounts', newAccount);
  const data = await queryOne<any>(text, params);
  if (!data) throw new Error('Failed to create email account');
  return toClientFormat(data);
}

export async function updateEmailAccount(id: string, emailData: any): Promise<any> {
  const now = new Date().toISOString();
  const formatData = toDatabaseFormat(emailData);
  const updateData = { ...formatData, updated_at: now };

  const { text, params } = buildUpdateById('email_accounts', id, updateData);
  const data = await queryOne<any>(text, params);
  if (!data) throw new Error('Failed to update email account');
  return toClientFormat(data);
}

export async function deleteEmailAccount(id: string): Promise<void> {
  await execute(`DELETE FROM email_accounts WHERE id = $1`, [id]);
}
