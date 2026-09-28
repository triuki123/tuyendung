/**
 * Hồ Sơ Năng Lực DOANH NGHIỆP — mỗi công ty có NHIỀU biến thể (vd Tiếng Anh/Trung), dùng chung.
 * Bảng company_ecards (nhiều dòng / công ty). Nhân viên trỏ QR danh bạ sang biến thể công ty.
 * Chỉ người có quyền biên tập (ho-so-nang-luc / super_admin) sửa.
 */
import crypto from 'crypto';
import { queryOne, query, execute } from '@/lib/db';
import type { PublicProfile } from './ecardService';

export interface CompanyEcard {
  id: string;
  company_id: string;
  slug: string;
  title: string | null;
  is_public: boolean;
  display_name: string | null;
  logo_url: string | null;
  headline: string | null;
  bio: string | null;
  theme: string | null;
  template: string;
  cover_url: string | null;
  cover_position: number;
  skills: string[];
  experiences: any[];
  education: any[];
  certifications: any[];
  projects: any[];
  highlights: any[];
  expertise: any[];
  clients: any[];
  testimonials: any[];
  locations: any[];
  socials: Record<string, string>;
  visibility: Record<string, boolean>;
  section_order: string[];
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface CompanyListItem {
  company_id: string;
  company_name: string;
  company_logo: string | null;
  variant_count: number;
}

export interface CompanyVariantSummary {
  id: string;
  slug: string;
  title: string;
  is_public: boolean;
}

const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function genSlug(len = 10): string {
  const b = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;
export function isValidSlug(s: string): boolean { return typeof s === 'string' && SLUG_RE.test(s); }

/** Slug đã dùng ở company_ecards HOẶC user_ecard_variants chưa (dùng chung /card/[slug]). */
async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const clash = await queryOne(
    `SELECT 1 FROM company_ecards WHERE slug = $1 AND ($2::text IS NULL OR id <> $2)
     UNION ALL SELECT 1 FROM user_ecard_variants WHERE slug = $1 LIMIT 1`,
    [slug, exceptId ?? null]
  );
  return !!clash;
}

/** Danh sách công ty + số biến thể hồ sơ (cho picker tab Doanh Nghiệp). */
/**
 * @param companyIds Giới hạn theo công ty được phép biên soạn. null = mọi công ty
 *   (chỉ vai hiệu lực super_admin). Mảng rỗng = không có công ty nào.
 */
export async function listCompanies(companyIds?: string[] | null): Promise<CompanyListItem[]> {
  if (Array.isArray(companyIds) && companyIds.length === 0) return [];
  const scoped = Array.isArray(companyIds);
  return query<CompanyListItem>(
    `SELECT c.id::text AS company_id, c.name AS company_name,
            COALESCE(c.logo_urls->>'full_light', c.logo_url) AS company_logo,
            COUNT(e.id)::int AS variant_count
       FROM public.companies c
       LEFT JOIN public.company_ecards e ON e.company_id = c.id
      WHERE c.is_active IS NOT FALSE
        ${scoped ? 'AND c.id = ANY($1::uuid[])' : ''}
      GROUP BY c.id, c.name, c.logo_urls, c.logo_url
      ORDER BY c.name`,
    scoped ? [companyIds] : []
  );
}

/** Biến thể hồ sơ của 1 công ty. */
export async function listCompanyVariants(companyId: string): Promise<CompanyVariantSummary[]> {
  return query<CompanyVariantSummary>(
    `SELECT id, slug, COALESCE(NULLIF(title,''), 'Mặc định') AS title, is_public
       FROM company_ecards WHERE company_id = $1::uuid
      ORDER BY created_at`,
    [companyId]
  );
}

export async function getCompanyVariantById(id: string): Promise<CompanyEcard | null> {
  return queryOne<CompanyEcard>('SELECT * FROM company_ecards WHERE id = $1', [id]);
}

/**
 * Biến thể hồ sơ năng lực DOANH NGHIỆP đang public, cho mọi công ty mà user thuộc về
 * (company chính + org_assignments active). Dùng để hiện chip QR "HSNL - <Công ty>" trong thẻ nhân viên.
 * Trả về cùng shape với VariantSummary của user để modal render chung.
 */
export interface CompanyVariantForUser {
  id: string; scope: 'company'; company_id: string; company_name: string | null; slug: string; title: string; is_public: boolean;
}
export async function listPublicCompanyVariantsForUser(userId: string): Promise<CompanyVariantForUser[]> {
  return query<CompanyVariantForUser>(
    `SELECT e.id, 'company'::text AS scope, e.company_id::text AS company_id,
            c.name AS company_name, e.slug,
            COALESCE(NULLIF(e.title, ''), 'HSNL - ' || c.name) AS title,
            e.is_public
       FROM company_ecards e
       JOIN public.companies c ON c.id = e.company_id
      WHERE e.is_public = true
        AND e.company_id::text IN (
              SELECT u.company_id::text FROM public.users u WHERE u.id = $1 AND u.company_id IS NOT NULL
              UNION
              SELECT oa.company_id::text FROM public.org_assignments oa
               WHERE oa.user_id = $1 AND oa.is_active AND oa.company_id IS NOT NULL
            )
      ORDER BY c.name, e.created_at`,
    [userId]
  );
}

/** Tạo biến thể mới cho 1 công ty. Slug tùy chọn (không có thì tự sinh). */
export async function createCompanyVariant(input: { companyId: string; slug?: string; title?: string | null }): Promise<CompanyEcard> {
  let slug = (input.slug || '').trim().toLowerCase();
  if (slug) {
    if (!isValidSlug(slug)) throw new Error('Slug không hợp lệ (chữ thường/số/gạch, 2-60 ký tự)');
    if (await slugTaken(slug)) throw new Error('Slug đã được dùng, chọn slug khác');
  } else {
    for (let i = 0; i < 8; i++) { slug = genSlug(); if (!(await slugTaken(slug))) break; }
  }
  const id = 'cev_' + crypto.randomBytes(10).toString('hex');
  const row = await queryOne<CompanyEcard>(
    `INSERT INTO company_ecards (id, company_id, slug, title) VALUES ($1, $2::uuid, $3, $4) RETURNING *`,
    [id, input.companyId, slug, input.title || null]
  );
  return row!;
}

const JSON_FIELDS = new Set(['skills', 'experiences', 'education', 'certifications', 'projects', 'socials', 'visibility', 'section_order', 'highlights', 'expertise', 'clients', 'testimonials', 'locations']);
const UPDATABLE = ['title', 'slug', 'is_public', 'display_name', 'logo_url', 'headline', 'bio', 'theme', 'cover_url', 'cover_position', 'template',
  'skills', 'experiences', 'education', 'certifications', 'projects', 'socials', 'visibility', 'section_order',
  'highlights', 'expertise', 'clients', 'testimonials', 'locations'];

export async function updateCompanyVariant(id: string, patch: Record<string, any>): Promise<CompanyEcard> {
  if (patch.slug !== undefined) {
    const slug = String(patch.slug).trim().toLowerCase();
    if (!isValidSlug(slug)) throw new Error('Slug không hợp lệ');
    if (await slugTaken(slug, id)) throw new Error('Slug đã được dùng');
    patch.slug = slug;
  }
  const cols: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const k of UPDATABLE) {
    if (patch[k] === undefined) continue;
    cols.push(`"${k}" = $${i++}`);
    vals.push(JSON_FIELDS.has(k) ? JSON.stringify(patch[k]) : patch[k]);
  }
  if (cols.length === 0) return (await getCompanyVariantById(id))!;
  vals.push(id);
  const row = await queryOne<CompanyEcard>(
    `UPDATE company_ecards SET ${cols.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
    vals
  );
  if (!row) throw new Error('Không tìm thấy biến thể');
  return row;
}

export async function deleteCompanyVariant(id: string): Promise<void> {
  await execute('DELETE FROM company_ecards WHERE id = $1', [id]);
}

export async function incrementCompanyView(slug: string): Promise<void> {
  await execute('UPDATE company_ecards SET view_count = view_count + 1 WHERE slug = $1', [slug]);
}

/** Slug 1 biến thể public của công ty (cho nhân viên trỏ QR) — lấy cái công khai đầu tiên. */
export async function getCompanyEcardSlug(companyId: string): Promise<string | null> {
  const row = await queryOne<{ slug: string }>(
    `SELECT slug FROM company_ecards WHERE company_id = $1::uuid AND is_public = true ORDER BY created_at LIMIT 1`,
    [companyId]
  );
  return row?.slug ?? null;
}

/** Hồ sơ public theo slug — trả về dạng PublicProfile (kind='company'). */
export async function getPublicCompanyProfileBySlug(slug: string): Promise<PublicProfile | null> {
  const row = await queryOne<any>(
    `SELECT e.*,
            COALESCE(e.display_name, c.name) AS company_display,
            COALESCE(e.logo_url, c.logo_urls->>'full_light', c.logo_url) AS company_logo_resolved
       FROM company_ecards e
       JOIN public.companies c ON c.id = e.company_id
      WHERE e.slug = $1 AND e.is_public = true
      LIMIT 1`,
    [slug]
  );
  if (!row) return null;
  let logo: string | null = row.company_logo_resolved ?? null;
  if (logo) logo = logo.replace(/^\/api\/companies\/([^/]+)\/logo/, '/api/public/company-logo/$1');
  return {
    ...(row as object),
    kind: 'company',
    name: row.company_display || 'Công ty',
    email: null,
    phone: null,
    avatar: logo,
    job_title: null,
    dept_name: null,
    sub_dept_name: null,
    company_name: null,
    company_logo: null,
  } as unknown as PublicProfile;
}
