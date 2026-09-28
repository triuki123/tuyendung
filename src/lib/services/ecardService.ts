/**
 * E-card + Hồ sơ năng lực public — HỖ TRỢ ĐA BIẾN THỂ.
 * - Mỗi user có thể có 1 hồ sơ 'personal' (Cá Nhân) + N hồ sơ 'company' (mỗi công ty được gán 1).
 * - Bảng: user_ecard_variants (id PK, slug UNIQUE, partial unique index chống trùng scope).
 * - Không auto-tạo: chỉ tạo khi super_admin bấm "Thêm biến thể".
 * - getPublicProfileBySlug trộn dữ liệu curated + dữ liệu SỐNG (tên/avatar/chức danh/công ty).
 */
import crypto from 'crypto';
import { queryOne, query, execute } from '@/lib/db';

export interface ExperienceItem { title?: string; org?: string; period?: string; desc?: string }
export interface EducationItem { school?: string; degree?: string; period?: string }
export interface CertItem { name?: string; issuer?: string; year?: string }
export interface ProjectItem { name?: string; desc?: string; url?: string; image?: string }
export interface HighlightItem { label?: string; value?: string }
export interface ExpertiseItem { name?: string; desc?: string }
export interface ClientItem { name?: string; logo?: string }
export interface TestimonialItem { quote?: string; author?: string; role?: string }
export interface LocationItem { label?: string; address?: string; phone?: string }

export type EcardScope = 'personal' | 'company';

export interface EcardVariant {
  id: string;
  user_id: string;
  scope: EcardScope;
  company_id: string | null;
  slug: string;
  title: string | null;
  qr_mode: 'contact' | 'profile';
  is_public: boolean;
  headline: string | null;
  bio: string | null;
  theme: string | null;
  template: string;
  cover_url: string | null;
  cover_position: number;
  skills: string[];
  experiences: ExperienceItem[];
  education: EducationItem[];
  certifications: CertItem[];
  projects: ProjectItem[];
  highlights: HighlightItem[];
  expertise: ExpertiseItem[];
  clients: ClientItem[];
  testimonials: TestimonialItem[];
  locations: LocationItem[];
  socials: Record<string, string>;
  visibility: Record<string, boolean>;
  section_order: string[];
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface VariantSummary {
  id: string;
  scope: EcardScope;
  company_id: string | null;
  company_name: string | null;
  slug: string;
  title: string;
  is_public: boolean;
}

export interface PublicProfile extends EcardVariant {
  /** Loại hồ sơ: cá nhân (mặc định) hay công ty (dùng chung templates render). */
  kind?: 'person' | 'company';
  name: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  job_title: string | null;
  dept_name: string | null;
  sub_dept_name: string | null;
  company_name: string | null;
  company_logo: string | null;
}

function genId(): string {
  return 'uev_' + crypto.randomBytes(10).toString('hex');
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;
export function isValidSlug(s: string): boolean {
  return typeof s === 'string' && SLUG_RE.test(s);
}

/** Liệt kê variants của 1 user (kèm tên công ty). */
export async function listVariantsForUser(userId: string): Promise<VariantSummary[]> {
  const rows = await query<VariantSummary>(
    `SELECT v.id, v.scope, v.company_id, c.name AS company_name, v.slug,
            COALESCE(v.title,
                     CASE WHEN v.scope = 'personal' THEN 'Cá Nhân'
                          ELSE 'HSNL - ' || COALESCE(c.name, 'Công Ty') END) AS title,
            v.is_public
       FROM user_ecard_variants v
       LEFT JOIN companies c ON c.id = v.company_id
      WHERE v.user_id = $1
      ORDER BY (v.scope = 'personal') DESC, c.name NULLS LAST, v.created_at`,
    [userId]
  );
  return rows;
}

/** Lấy 1 variant theo id (không kiểm quyền). */
export async function getVariantById(id: string): Promise<EcardVariant | null> {
  return queryOne<EcardVariant>('SELECT * FROM user_ecard_variants WHERE id = $1', [id]);
}

/** Lấy variant Cá Nhân của 1 user (nếu có). */
export async function getPersonalVariant(userId: string): Promise<EcardVariant | null> {
  return queryOne<EcardVariant>(
    `SELECT * FROM user_ecard_variants WHERE user_id = $1 AND scope = 'personal'`,
    [userId]
  );
}

interface CreateVariantInput {
  user_id: string;
  scope: EcardScope;
  company_id?: string | null;
  slug: string;
  title?: string | null;
}

/** Tạo variant mới. Slug phải hợp lệ + duy nhất. */
export async function createVariant(input: CreateVariantInput): Promise<EcardVariant> {
  const { user_id, scope, slug, title } = input;
  const company_id = scope === 'company' ? (input.company_id || null) : null;
  if (scope === 'company' && !company_id) throw new Error('Thiếu công ty cho biến thể Công Ty');
  if (!isValidSlug(slug)) throw new Error('Slug không hợp lệ (chỉ chữ thường/số/gạch, 2-60 ký tự)');

  const dupSlug = await queryOne('SELECT 1 FROM user_ecard_variants WHERE slug = $1', [slug]);
  if (dupSlug) throw new Error('Slug đã được dùng, chọn slug khác');

  if (scope === 'personal') {
    const exists = await queryOne(
      `SELECT 1 FROM user_ecard_variants WHERE user_id = $1 AND scope = 'personal'`,
      [user_id]
    );
    if (exists) throw new Error('Hồ sơ Cá Nhân đã tồn tại cho nhân sự này');
  } else {
    const exists = await queryOne(
      `SELECT 1 FROM user_ecard_variants WHERE user_id = $1 AND scope = 'company' AND company_id = $2`,
      [user_id, company_id]
    );
    if (exists) throw new Error('Hồ sơ cho công ty này đã tồn tại');
  }

  const row = await queryOne<EcardVariant>(
    `INSERT INTO user_ecard_variants (id, user_id, scope, company_id, slug, title)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [genId(), user_id, scope, company_id, slug, title || null]
  );
  return row!;
}

const JSON_FIELDS = new Set(['skills', 'experiences', 'education', 'certifications', 'projects', 'socials', 'visibility', 'section_order', 'highlights', 'expertise', 'clients', 'testimonials', 'locations']);
const UPDATABLE = ['title', 'slug', 'qr_mode', 'is_public', 'headline', 'bio', 'theme', 'cover_url', 'cover_position', 'template',
  'skills', 'experiences', 'education', 'certifications', 'projects', 'socials', 'visibility', 'section_order',
  'highlights', 'expertise', 'clients', 'testimonials', 'locations'];

export async function updateVariant(id: string, patch: Record<string, any>): Promise<EcardVariant> {
  // Chống đổi slug thành trùng
  if (patch.slug !== undefined) {
    if (!isValidSlug(patch.slug)) throw new Error('Slug không hợp lệ');
    const clash = await queryOne('SELECT 1 FROM user_ecard_variants WHERE slug = $1 AND id <> $2', [patch.slug, id]);
    if (clash) throw new Error('Slug đã được dùng');
  }
  const cols: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const k of UPDATABLE) {
    if (patch[k] === undefined) continue;
    cols.push(`"${k}" = $${i++}`);
    vals.push(JSON_FIELDS.has(k) ? JSON.stringify(patch[k]) : patch[k]);
  }
  if (cols.length === 0) return (await getVariantById(id))!;
  vals.push(id);
  const row = await queryOne<EcardVariant>(
    `UPDATE user_ecard_variants SET ${cols.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
    vals
  );
  if (!row) throw new Error('Không tìm thấy biến thể');
  return row;
}

export async function deleteVariant(id: string): Promise<void> {
  await execute('DELETE FROM user_ecard_variants WHERE id = $1', [id]);
}

export async function incrementView(slug: string): Promise<void> {
  await execute('UPDATE user_ecard_variants SET view_count = view_count + 1 WHERE slug = $1', [slug]);
}

/** Hồ sơ public theo slug — resolve variant, join user/company theo scope. */
export async function getPublicProfileBySlug(slug: string): Promise<PublicProfile | null> {
  const row = await queryOne<PublicProfile>(
    `SELECT v.*,
            u.name, u.email, u.phone, u.avatar,
            COALESCE(pos_oa.name, pos.name)              AS job_title,
            COALESCE(d_oa.name, d1.name, d2.name)        AS dept_name,
            COALESCE(sd_oa.name, sd_u.name)              AS sub_dept_name,
            c.name                                       AS company_name,
            COALESCE(c.logo_urls->>'full_light', c.logo_url) AS company_logo
       FROM user_ecard_variants v
       JOIN public.users u ON u.id = v.user_id
       LEFT JOIN public.companies c
              ON c.id = COALESCE(v.company_id, u.company_id)
       LEFT JOIN public.org_assignments oa
              ON oa.user_id::text = u.id::text
             AND oa.company_id::text = COALESCE(v.company_id, u.company_id)::text
             AND oa.is_active
             AND (v.scope = 'company' OR oa.is_primary)
       LEFT JOIN public.positions pos_oa   ON pos_oa.id::text = oa.position_id::text
       LEFT JOIN public.departments d_oa   ON d_oa.id::text = oa.department_id::text
       LEFT JOIN public.positions pos      ON pos.id::text = u.position_id::text
       LEFT JOIN public.departments d1     ON d1.id::text = u.department_id::text
       LEFT JOIN public.departments d2     ON d2.id::text = NULLIF(u.department, '')
       LEFT JOIN public.sub_departments sd_oa ON sd_oa.id::text = oa.sub_department_id::text
       LEFT JOIN public.sub_departments sd_u  ON sd_u.id::text = u.sub_department_id::text
      WHERE v.slug = $1 AND v.is_public = true AND u.status = 'active'
      LIMIT 1`,
    [slug]
  );
  if (!row) return null;
  row.kind = 'person';
  if (row.avatar) row.avatar = row.avatar.replace(/^\/api\/users\/([^/]+)\/avatar/, '/api/public/user-avatar/$1');
  if (row.company_logo) row.company_logo = row.company_logo.replace(/^\/api\/companies\/([^/]+)\/logo/, '/api/public/company-logo/$1');
  return row;
}
