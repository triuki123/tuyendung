import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';
import { generateSlug } from '@/lib/slug-utils';

/** Bộ biến thể logo công ty. 'full_light' là biến thể CHÍNH (primary) + fallback. */
export type LogoVariant = 'full_light' | 'full_dark' | 'icon' | 'print';

export interface Company {
  id: string;
  name: string;
  code?: string;
  slug?: string;
  description?: string;
  logo_url?: string;                       // alias biến thể full_light (tương thích ngược)
  logo_urls?: Partial<Record<LogoVariant, string>>; // map biến thể → URL động
  website_url?: string;
  business_name?: string;
  tax_code?: string;
  address?: string;
  website?: string;
  invoice_address?: string;
  legal_representative?: string;
  phone?: string;
  email?: string;
  // Thông tin tra cứu masothue.com
  tax_address?: string;
  status?: string;
  international_name?: string;
  short_name?: string;
  activation_date?: string;
  managing_tax_office?: string;
  business_type?: string;
  main_business_line?: string;
  business_lines?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Chọn URL logo theo biến thể, tự fallback về biến thể chính (full_light) rồi logo_url cũ.
 * Dùng chung cho mọi consumer để áp fallback nhất quán ở tầng data.
 */
export function resolveCompanyLogo(
  company: Pick<Company, 'logo_urls' | 'logo_url'> | null | undefined,
  variant: LogoVariant = 'full_light'
): string | null {
  if (!company) return null;
  return company.logo_urls?.[variant] ?? company.logo_urls?.full_light ?? company.logo_url ?? null;
}

export interface CompanyInput {
  name: string;
  code?: string;
  slug?: string;
  description?: string;
  logo_url?: string;
  website_url?: string;
  business_name?: string;
  tax_code?: string;
  address?: string;
  website?: string;
  invoice_address?: string;
  legal_representative?: string;
  phone?: string;
  email?: string;
  tax_address?: string;
  status?: string;
  international_name?: string;
  short_name?: string;
  activation_date?: string;
  managing_tax_office?: string;
  business_type?: string;
  main_business_line?: string;
  business_lines?: string;
}

export const companiesService = {
  /**
   * Get all active companies
   */
  async getAllCompanies(includeInactive: boolean = false): Promise<Company[]> {
    if (includeInactive) {
      return query<Company>('SELECT * FROM companies ORDER BY name ASC');
    }
    return query<Company>(
      'SELECT * FROM companies WHERE is_active = $1 ORDER BY name ASC',
      [true]
    );
  },

  /**
   * Liệt kê công ty ĐÃ NGỪNG HOẠT ĐỘNG (is_active=false) kèm số dữ liệu đang dính:
   * nhân viên / phòng ban / chức vụ / tài sản — để admin biết impact trước khi xoá vĩnh viễn.
   * Ép ::text khi so khớp để an toàn với khác kiểu cột (company_id UUID/TEXT).
   */
  async getInactiveWithCounts(): Promise<Array<Company & {
    user_count: number; department_count: number; position_count: number; asset_count: number;
  }>> {
    return query<any>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM users u       WHERE u.company_id::text = c.id::text)::int       AS user_count,
              (SELECT COUNT(*) FROM departments d WHERE d.company_id::text = c.id::text)::int       AS department_count,
              (SELECT COUNT(*) FROM positions p   WHERE p.company_id::text = c.id::text)::int       AS position_count,
              (SELECT COUNT(*) FROM assets a      WHERE a.company_id::text = c.id::text)::int       AS asset_count
         FROM companies c
        WHERE c.is_active = false
        ORDER BY c.name ASC`
    );
  },

  /**
   * Get single company by ID
   */
  async getCompanyById(id: string): Promise<Company> {
    const row = await queryOne<Company>(
      'SELECT * FROM companies WHERE id = $1',
      [id]
    );
    if (!row) throw new Error(`Company not found: ${id}`);
    return row;
  },

  /**
   * Search companies by name or code
   */
  async searchCompanies(searchQuery: string): Promise<Company[]> {
    const pattern = `%${searchQuery}%`;
    return query<Company>(
      `SELECT * FROM companies
       WHERE is_active = $1 AND (name ILIKE $2 OR code ILIKE $3)
       ORDER BY name ASC`,
      [true, pattern, pattern]
    );
  },

  /**
   * Create a new company
   */
  async createCompany(input: CompanyInput & { created_by?: string }): Promise<Company> {
    const { created_by, ...companyData } = input;

    // Generate slug from name if not provided
    const slug = companyData.slug || generateSlug(companyData.name);

    // Clean up empty/EMPTY strings to null for optional fields
    const cleanedData = Object.entries(companyData).reduce((acc, [key, value]) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed && trimmed !== 'EMPTY') {
          acc[key] = trimmed;
        }
      } else if (value !== undefined && value !== null) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);

    const { text, params } = buildInsert('companies', {
      ...cleanedData,
      slug,
      is_active: true,
    });

    const row = await queryOne<Company>(text, params);
    if (!row) throw new Error('Failed to create company');

    if (created_by) {
      await this.addAuditLog({
        action: 'create',
        table: 'companies',
        record_id: row.id,
        changes: { created: { ...cleanedData, slug } },
        created_by,
      });
    }

    return row;
  },

  /**
   * Update a company
   */
  async updateCompany(id: string, updates: Partial<CompanyInput> & { updated_by?: string }): Promise<Company> {
    const { updated_by, ...updateData } = updates;

    const oldData = await this.getCompanyById(id);

    // Clean up empty/EMPTY strings to null for optional fields
    const cleanedData = Object.entries(updateData).reduce((acc, [key, value]) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed && trimmed !== 'EMPTY') {
          acc[key] = trimmed;
        }
      } else if (value !== undefined && value !== null) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);

    const { text, params } = buildUpdateById('companies', id, cleanedData);
    const row = await queryOne<Company>(text, params);
    if (!row) throw new Error(`Company not found: ${id}`);

    if (updated_by) {
      await this.addAuditLog({
        action: 'update',
        table: 'companies',
        record_id: id,
        changes: { before: oldData, after: cleanedData },
        created_by: updated_by,
      });
    }

    return row;
  },

  /**
   * Deactivate a company
   */
  async deactivateCompany(id: string, deactivated_by?: string): Promise<Company> {
    const { text, params } = buildUpdateById('companies', id, { is_active: false });
    const row = await queryOne<Company>(text, params);
    if (!row) throw new Error(`Company not found: ${id}`);

    if (deactivated_by) {
      await this.addAuditLog({
        action: 'deactivate',
        table: 'companies',
        record_id: id,
        changes: { is_active: false },
        created_by: deactivated_by,
      });
    }

    return row;
  },

  /**
   * Add audit log entry
   */
  async addAuditLog(log: {
    action: string;
    table: string;
    record_id: string;
    changes: any;
    created_by: string;
  }): Promise<void> {
    try {
      await execute(
        `INSERT INTO audit_logs (action, details, admin_id) VALUES ($1, $2, $3)`,
        [
          `${log.action}_${log.table}`,
          JSON.stringify({ table: log.table, record_id: log.record_id, changes: log.changes }),
          log.created_by,
        ]
      );
    } catch (err: any) {
      console.error('Audit log error:', err.message);
    }
  },
};
