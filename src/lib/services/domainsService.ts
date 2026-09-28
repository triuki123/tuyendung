import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';
import { sendDomainNotifications } from './notificationsService';

// Calculate status based on expiration date
function calculateStatus(expirationDate: string): 'active' | 'expiring' | 'expired' {
  if (!expirationDate) return 'active';

  const expDate = new Date(expirationDate);
  const today = new Date();
  const daysLeft = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'expiring';
  return 'active';
}

async function sendExpiringNotification(domain: any) {
  await sendDomainNotifications(domain);
}

export interface Domain {
  id: string;
  domainname: string;
  tld: string;
  registrar: string;
  registrationdate: string;
  expirationdate: string;
  autorenew: boolean;
  accountusername: string;
  accountpassword: string;
  ownercompany: string;
  manager: string;
  manager_user_id: string | null;
  owner_company_id: string | null;
  department_id: string | null;
  sub_department_id: string | null;
  cost: number;
  renewalcost: number;
  dnsprovider: string;
  sslcertificate: string;
  sslexpirydate: string;
  status: 'active' | 'expiring' | 'expired';
  notes: string;
  created_at: string;
  updated_at: string;
}

// Convert from client format to database format
function toDatabaseFormat(data: any) {
  return {
    domainname: data.domain || data.domainname || '',
    tld: data.tld || '',
    registrar: data.registrar || '',
    registrationdate: data.registrationDate || data.registrationdate || '',
    expirationdate: data.expirationDate || data.expirationdate || '',
    autorenew: data.autoRenewal || data.autorenew || false,
    accountusername: data.accountusername || '',
    accountpassword: data.accountpassword || '',
    ownercompany: data.ownercompany || '',
    manager: data.manager || '',
    manager_user_id: data.managerUserId || data.manager_user_id || null,
    owner_company_id: data.ownerCompanyId || data.owner_company_id || null,
    department_id: data.departmentId || data.department_id || null,
    sub_department_id: data.subDepartmentId || data.sub_department_id || null,
    cost: parseFloat(data.cost) || 0,
    renewalcost: parseFloat(data.renewalCost) || parseFloat(data.renewalcost) || 0,
    dnsprovider: data.dnsProvider || data.dnsprovider || '',
    sslcertificate: data.sslcertificate || '',
    sslexpirydate: data.sslexpirydate || '',
    status: data.status || 'active',
    notes: data.notes || '',
  };
}

// Convert from database format to client format
function toClientFormat(data: any): any {
  const calculatedStatus = calculateStatus(data.expirationdate);

  return {
    id: data.id,
    domain: data.domainname,
    tld: data.tld,
    registrar: data.registrar,
    registrationDate: data.registrationdate,
    expirationDate: data.expirationdate,
    autoRenewal: data.autorenew,
    accountUsername: data.accountusername,
    accountPassword: data.accountpassword,
    ownerCompany: data.ownercompany,
    manager: data.manager,
    managerUserId: data.manager_user_id || null,
    ownerCompanyId: data.owner_company_id || null,
    departmentId: data.department_id || null,
    subDepartmentId: data.sub_department_id || null,
    cost: data.cost,
    renewalCost: data.renewalcost,
    dnsProvider: data.dnsprovider,
    sslCertificate: data.sslcertificate,
    sslExpiryDate: data.sslexpirydate,
    status: calculatedStatus,
    notes: data.notes,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function getDomains(filters?: {
  status?: string;
  companyId?: string;
  managerUserIds?: string[];
}) {
  let sql = `SELECT * FROM domains`;
  const params: any[] = [];
  const conditions: string[] = [];
  let idx = 1;

  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.companyId) {
    conditions.push(`owner_company_id::text = $${idx++}`);
    params.push(filters.companyId);
  }
  if (filters?.managerUserIds) {
    conditions.push(`manager_user_id::text = ANY($${idx++}::text[])`);
    params.push(filters.managerUserIds);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  const data = await query<any>(sql, params);

  const domains = (data || []).map(toClientFormat);

  // Check for expiring domains and send notifications
  for (const domain of data || []) {
    const status = calculateStatus(domain.expirationdate);
    if (status === 'expiring') {
      await sendExpiringNotification(domain);
    }
  }

  return domains;
}

export async function getDomainById(id: string) {
  const data = await queryOne<any>(`SELECT * FROM domains WHERE id = $1`, [id]);

  if (data) {
    const status = calculateStatus(data.expirationdate);
    if (status === 'expiring') {
      await sendExpiringNotification(data);
    }
    return toClientFormat(data);
  }

  return null;
}

export async function getDomainByIdScoped(id: string, companyId?: string | null) {
  const params: any[] = [id];
  let sql = `SELECT * FROM domains WHERE id = $1`;
  if (companyId) {
    params.push(companyId);
    sql += ` AND owner_company_id::text = $2`;
  }
  const data = await queryOne<any>(sql, params);
  return data ? toClientFormat(data) : null;
}

export async function createDomain(domainData: any): Promise<any> {
  const now = new Date().toISOString();
  const formatData = toDatabaseFormat(domainData);
  const newDomain = { ...formatData, created_at: now, updated_at: now };

  const { text, params } = buildInsert('domains', newDomain);
  const data = await queryOne<any>(text, params);
  if (!data) throw new Error('Failed to create domain');
  return toClientFormat(data);
}

export async function updateDomain(id: string, domainData: any): Promise<any> {
  const now = new Date().toISOString();
  const formatData = toDatabaseFormat(domainData);
  const updateData = { ...formatData, updated_at: now };

  const { text, params } = buildUpdateById('domains', id, updateData);
  const data = await queryOne<any>(text, params);
  if (!data) throw new Error('Failed to update domain');

  const status = calculateStatus(data.expirationdate);
  if (status === 'expiring') {
    await sendExpiringNotification(data);
  }

  return toClientFormat(data);
}

export async function deleteDomain(id: string): Promise<void> {
  await execute(`DELETE FROM domains WHERE id = $1`, [id]);
}
