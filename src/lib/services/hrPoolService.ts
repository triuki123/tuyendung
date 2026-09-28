/**
 * HR Pool Service — Kho CV & Kho JD (module Nguồn Nhân Lực)
 */

import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { extractCvDocument, normalizeSearch } from './cvExtract';
import { inferIndustryFromCandidate, inferIndustryFromPosition } from '@/lib/cvIndustry';
import type { CvImportField } from '@/lib/cvImport';
export { inferIndustryFromPosition } from '@/lib/cvIndustry';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';
import type { CvAdvancedFilter, CvFilterOptions } from '@/lib/cvFilters';
import { CV_EDUCATION_LEVELS, normalizeCvEducationDegree } from '@/lib/cvFilters';
import { createHash } from 'node:crypto';

export class DuplicateCvError extends Error {
  constructor() { super('CV trùng với hồ sơ đã có (email, số điện thoại hoặc nội dung tệp). Hệ thống từ chối tải lên; hãy cập nhật hồ sơ hiện có.'); this.name = 'DuplicateCvError'; }
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Kho CV (ATS)
// ─────────────────────────────────────────────────────────────────────────────

export interface CvMeta {
  id: string;
  candidate_name: string;
  candidate_email: string | null;
  candidate_phone: string | null;
  position_applied: string | null;
  industry: string | null;
  source: string | null;
  status: string;
  note: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_by_name?: string | null;
  created_at: string;
  uploaded_at: string;
  updated_at: string;
  // Trường có cấu trúc (ATS / nền tảng tìm kiếm AI)
  skills: string[];
  years_experience: number | null;
  current_title: string | null;
  education_level: string | null;
  education_degree: string | null;
  expected_salary: number | null;
  location: string | null;
  languages: string[];
  rating: number | null;
  tags: string[];
  has_content: boolean;      // đã trích xuất được nội dung text chưa
  employment_type: string | null;
  gender: string | null;
  date_of_birth: string | null;
  job_search_status: string | null;
  last_activity_at: string;
  is_viewed: boolean;
}

// Cột nhẹ cho list/return — KHÔNG kéo content/content_text (nặng).
const CV_COLUMNS = `id, candidate_name, candidate_email, candidate_phone, position_applied, industry,
  source, status, note, file_name, mime_type, size_bytes, uploaded_by,
  (SELECT u.name FROM users u WHERE u.id::text = uploaded_by LIMIT 1) AS uploaded_by_name, created_at, created_at AS uploaded_at, updated_at,
  skills, years_experience, current_title, education_level, education_degree, expected_salary, location,
  languages, rating, tags, employment_type, gender, date_of_birth, job_search_status, last_activity_at,
  (content_text IS NOT NULL AND content_text <> '') AS has_content`;

/** Ép kiểu numeric (pg trả NUMERIC/BIGINT dạng string) + đảm bảo mảng không null. */
function mapCv(r: any): CvMeta {
  return {
    ...r,
    size_bytes: r.size_bytes == null ? null : Number(r.size_bytes),
    years_experience: r.years_experience == null ? null : Number(r.years_experience),
    expected_salary: r.expected_salary == null ? null : Number(r.expected_salary),
    rating: r.rating == null ? null : Number(r.rating),
    skills: r.skills || [],
    languages: r.languages || [],
    tags: r.tags || [],
    has_content: r.has_content === true,
    is_viewed: r.is_viewed === true,
  };
}

export interface CvSearchFilter extends CvAdvancedFilter {
  keyword?: string;          // tìm full-text không dấu (tên, vị trí, kỹ năng, nội dung CV)
  status?: string;
  skills?: string[];         // phải có TẤT CẢ kỹ năng (AND)
  anySkills?: string[];      // có BẤT KỲ kỹ năng nào (OR)
  minExperience?: number;
  maxExperience?: number;
  source?: string;
  minRating?: number;
  position?: string;         // khớp vị trí ứng tuyển / chức danh
  industry?: string;         // thư mục ngành nghề; chuỗi rỗng = chưa phân loại
  requisitionId?: string;    // chỉ ứng viên đã liên kết với yêu cầu tuyển dụng này
  limit?: number;
}

/**
 * Tìm kiếm ứng viên theo filter có cấu trúc — dùng chung cho UI lọc và
 * endpoint /api/hr/cv/search (nền cho Phase 2 AI/Telegram).
 */
export async function searchCvs(filter: CvSearchFilter = {}, viewerId?: string | null): Promise<CvMeta[]> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: any[] = [];
  const p = (v: any) => { params.push(v); return `$${params.length}`; };

  if (filter.status) where.push(`status = ${p(filter.status)}`);
  if (filter.source) where.push(`source ILIKE ${p('%' + filter.source + '%')}`);
  if (typeof filter.minRating === 'number') where.push(`rating >= ${p(filter.minRating)}`);
  if (typeof filter.minExperience === 'number') where.push(`years_experience >= ${p(filter.minExperience)}`);
  if (typeof filter.maxExperience === 'number') where.push(`years_experience <= ${p(filter.maxExperience)}`);
  if (typeof filter.minSalary === 'number') where.push(`expected_salary >= ${p(filter.minSalary)}`);
  if (typeof filter.maxSalary === 'number') where.push(`expected_salary <= ${p(filter.maxSalary)}`);
  if (typeof filter.minAge === 'number') where.push(`EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth)) >= ${p(filter.minAge)}`);
  if (typeof filter.maxAge === 'number') where.push(`EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth)) <= ${p(filter.maxAge)}`);
  if (filter.gender) where.push(`gender = ${p(filter.gender)}`);
  if (filter.employmentTypes?.length) where.push(`employment_type = ANY(${p(filter.employmentTypes)}::text[])`);
  if (filter.jobSearchStatuses?.length) where.push(`job_search_status = ANY(${p(filter.jobSearchStatuses)}::text[])`);
  if (filter.educationLevels?.length) where.push(`education_degree = ANY(${p(filter.educationLevels.map(normalizeCvEducationDegree))}::text[])`);
  if (filter.languages?.length) where.push(`EXISTS (SELECT 1 FROM unnest(languages) language WHERE LOWER(BTRIM(language)) = ANY(${p(filter.languages.map(value => value.trim().toLowerCase()))}::text[]))`);
  // Upload time is immutable. Editing, rating or viewing cannot make an old CV
  // appear to have been uploaded recently.
  const timeColumn = filter.sortBy === 'uploaded' ? 'created_at' : 'updated_at';
  if (filter.updatedWithinDays) where.push(`${timeColumn} >= NOW() - (${p(filter.updatedWithinDays)}::int * INTERVAL '1 day')`);
  const viewedExpression = viewerId
    ? `EXISTS (SELECT 1 FROM hr_cv_views v WHERE v.cv_id = hr_cv_pool.id AND v.user_id = ${p(viewerId)})`
    : 'FALSE';
  if (filter.onlyUnviewed) {
    if (!viewerId) throw new Error('Cần đăng nhập để lọc hồ sơ chưa xem');
    where.push(`NOT (${viewedExpression})`);
  }

  if (filter.skills && filter.skills.length) where.push(`skills @> ${p(filter.skills)}::text[]`);
  if (filter.anySkills && filter.anySkills.length) where.push(`skills && ${p(filter.anySkills)}::text[]`);

  if (filter.position) {
    const ph = p('%' + filter.position + '%');
    where.push(`(position_applied ILIKE ${ph} OR current_title ILIKE ${ph})`);
  }

  if (filter.industry !== undefined) {
    if (filter.industry) where.push(`LOWER(BTRIM(industry)) = LOWER(BTRIM(${p(filter.industry)}))`);
    else where.push(`(industry IS NULL OR BTRIM(industry) = '')`);
  }

  if (filter.requisitionId) {
    where.push(`EXISTS (SELECT 1 FROM hr_applications a WHERE a.cv_id = hr_cv_pool.id AND a.requisition_id = ${p(filter.requisitionId)})`);
  }

  // keyword: chuẩn hoá không dấu → tách từng từ → AND trên search_text
  if (filter.keyword && filter.keyword.trim()) {
    const terms = normalizeSearch(filter.keyword).split(' ').filter(Boolean).slice(0, 12);
    const rawTerms = filter.keyword.trim().split(/\s+/).filter(Boolean).slice(0, 12);
    for (const [index, term] of terms.entries()) {
      const normalized = p('%' + term + '%');
      const raw = p('%' + (rawTerms[index] || term) + '%');
      // search_text covers accent-insensitive matching and extracted CV contents.
      // Structured-column fallbacks keep old rows searchable before search_text was
      // introduced/backfilled, especially for an exact accented name query.
      where.push(`(
        search_text ILIKE ${normalized}
        OR candidate_name ILIKE ${raw}
        OR candidate_email ILIKE ${raw}
        OR candidate_phone ILIKE ${raw}
        OR position_applied ILIKE ${raw}
        OR current_title ILIKE ${raw}
        OR location ILIKE ${raw}
        OR source ILIKE ${raw}
        OR array_to_string(skills, ' ') ILIKE ${raw}
        OR array_to_string(tags, ' ') ILIKE ${raw}
      )`);
    }
  }

  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
  const rows = await query<any>(
    `SELECT ${CV_COLUMNS}, ${viewedExpression} AS is_viewed FROM hr_cv_pool
      WHERE ${where.join(' AND ')}
      ORDER BY ${filter.sortBy ? `${timeColumn} DESC NULLS LAST, id DESC` : 'rating DESC NULLS LAST, years_experience DESC NULLS LAST, created_at DESC'}
      LIMIT ${limit}`,
    params
  );
  return rows.map(mapCv);
}

/** Danh sách CV (tương thích cũ): lọc theo status nếu có. */
export async function listCvs(status?: string, viewerId?: string | null): Promise<CvMeta[]> {
  return searchCvs(status ? { status } : {}, viewerId);
}

export async function getCvById(id: string, viewerId?: string | null): Promise<CvMeta | null> {
  const r = await queryOne<any>(
    `SELECT ${CV_COLUMNS}, ${viewerId ? 'EXISTS (SELECT 1 FROM hr_cv_views v WHERE v.cv_id = hr_cv_pool.id AND v.user_id = $2)' : 'FALSE'} AS is_viewed
       FROM hr_cv_pool WHERE id = $1 AND deleted_at IS NULL`,
    viewerId ? [id, viewerId] : [id]
  );
  return r ? mapCv(r) : null;
}

export interface CvIndustryFolder { id: string; name: string; count: number }

export async function getCvFilterOptions(): Promise<CvFilterOptions> {
  const rows = await query<{ key: keyof CvFilterOptions; value: string }>(`
    WITH visible AS (SELECT industry, skills, languages FROM hr_cv_pool WHERE deleted_at IS NULL)
    SELECT DISTINCT 'industries' AS key, BTRIM(industry) AS value FROM visible WHERE NULLIF(BTRIM(industry), '') IS NOT NULL
    UNION SELECT 'industries', name FROM hr_cv_industries WHERE deleted_at IS NULL
    UNION SELECT 'skills', BTRIM(value) FROM visible CROSS JOIN LATERAL unnest(skills) AS value
    UNION SELECT 'languages', BTRIM(value) FROM visible CROSS JOIN LATERAL unnest(languages) AS value
    ORDER BY value`);
  const result: CvFilterOptions = { industries: [], skills: [], languages: [], educationLevels: [...CV_EDUCATION_LEVELS] };
  for (const { key, value } of rows) if (value) result[key].push(value);
  return result;
}

export async function markCvViewed(id: string, viewerId: string): Promise<boolean> {
  const row = await queryOne(`INSERT INTO hr_cv_views (cv_id, user_id)
    SELECT id, $2 FROM hr_cv_pool WHERE id = $1 AND deleted_at IS NULL
    ON CONFLICT (cv_id, user_id) DO UPDATE SET viewed_at = NOW() RETURNING cv_id`, [id, viewerId]);
  return Boolean(row);
}

export async function listCvIndustries(): Promise<CvIndustryFolder[]> {
  const rows = await query<any>(
    `SELECT i.id, i.name, COUNT(c.id)::int AS count
       FROM hr_cv_industries i
       LEFT JOIN hr_cv_pool c ON LOWER(BTRIM(c.industry)) = LOWER(i.name) AND c.deleted_at IS NULL
      WHERE i.deleted_at IS NULL
      GROUP BY i.id, i.name, i.created_at
      UNION ALL
     SELECT '__unclassified' AS id, '' AS name, COUNT(*)::int AS count
       FROM hr_cv_pool
      WHERE deleted_at IS NULL AND (industry IS NULL OR BTRIM(industry) = '')
      ORDER BY name`
  );
  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}

export async function createCvIndustry(name: string, createdBy: string | null): Promise<CvIndustryFolder> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!clean) throw new Error('Tên thư mục không hợp lệ');
  const existing = await queryOne<any>(
    `SELECT id, name, 0::int AS count FROM hr_cv_industries WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL`, [clean]
  );
  if (existing) return { ...existing, count: 0 };
  const row = await queryOne<any>(
    `INSERT INTO hr_cv_industries (id, name, created_by) VALUES ($1,$2,$3) RETURNING id, name, 0::int AS count`,
    [genId('cvi'), clean, createdBy]
  );
  return row;
}

export async function renameCvIndustry(id: string, name: string): Promise<CvIndustryFolder> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!clean) throw new Error('Tên thư mục không hợp lệ');
  return withTransaction(async (client) => {
    const current = await client.query(`SELECT name FROM hr_cv_industries WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
    if (!current.rows[0]) throw new Error('Thư mục không tồn tại');
    const duplicate = await client.query(`SELECT id FROM hr_cv_industries WHERE LOWER(name) = LOWER($1) AND id <> $2 AND deleted_at IS NULL`, [clean, id]);
    if (duplicate.rows[0]) throw new Error('Tên thư mục đã tồn tại');
    const oldName = current.rows[0].name;
    await client.query(`UPDATE hr_cv_industries SET name = $1 WHERE id = $2`, [clean, id]);
    const moved = await client.query(`UPDATE hr_cv_pool SET industry = $1, updated_at = NOW() WHERE LOWER(BTRIM(industry)) = LOWER($2) AND deleted_at IS NULL RETURNING id`, [clean, oldName]);
    return { id, name: clean, count: moved.rowCount || 0 };
  });
}

export async function deleteCvIndustry(id: string): Promise<number> {
  return withTransaction(async (client) => {
    const current = await client.query(`SELECT name FROM hr_cv_industries WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
    if (!current.rows[0]) throw new Error('Thư mục không tồn tại');
    const moved = await client.query(`UPDATE hr_cv_pool SET industry = NULL, updated_at = NOW() WHERE LOWER(BTRIM(industry)) = LOWER($1) AND deleted_at IS NULL RETURNING id`, [current.rows[0].name]);
    await client.query(`UPDATE hr_cv_industries SET deleted_at = NOW() WHERE id = $1`, [id]);
    return moved.rowCount || 0;
  });
}

export async function moveCvsToIndustry(ids: string[], industry: string): Promise<number> {
  const clean = industry.trim();
  const folder = await queryOne(`SELECT id FROM hr_cv_industries WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL`, [clean]);
  if (!folder) throw new Error('Thư mục đích không tồn tại');
  const uniqueIds = [...new Set(ids)].slice(0, 500);
  const result = await query<{ id: string }>(
    `UPDATE hr_cv_pool SET industry = $1, updated_at = NOW()
      WHERE id = ANY($2::text[]) AND deleted_at IS NULL RETURNING id`, [clean, uniqueIds]
  );
  for (const row of result) await refreshSearchText(row.id);
  return result.length;
}

/** Phát hiện trùng theo email hoặc SĐT (bỏ qua chính nó nếu excludeId). */
export async function findDuplicateCvs(
  email?: string | null,
  phone?: string | null,
  excludeId?: string
): Promise<Pick<CvMeta, 'id' | 'candidate_name' | 'candidate_email' | 'candidate_phone' | 'status'>[]> {
  const ors: string[] = [];
  const params: any[] = [];
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  if (email && email.trim()) ors.push(`LOWER(candidate_email) = LOWER(${p(email.trim())})`);
  if (phone && phone.trim()) ors.push(`regexp_replace(candidate_phone,'\\D','','g') = ${p(phone.replace(/\D/g, ''))}`);
  if (ors.length === 0) return [];
  let sql = `SELECT id, candidate_name, candidate_email, candidate_phone, status
             FROM hr_cv_pool WHERE deleted_at IS NULL AND (${ors.join(' OR ')})`;
  if (excludeId) { sql += ` AND id <> ${p(excludeId)}`; }
  return query(sql, params);
}

export async function createCv(data: {
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  positionApplied?: string;
  industry?: string;
  source?: string;
  note?: string;
  fileName?: string;
  mimeType?: string;
  buffer?: Buffer;
  uploadedBy: string | null;
  // Trường cấu trúc (HR nhập tay — nếu trống sẽ dùng gợi ý tự động)
  skills?: string[];
  yearsExperience?: number | null;
  currentTitle?: string;
  educationLevel?: string;
  educationDegree?: string | null;
  expectedSalary?: number | null;
  location?: string;
  languages?: string[];
  tags?: string[];
  employmentType?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  jobSearchStatus?: string | null;
  manualFields?: CvImportField[];
  industryMode?: 'auto' | 'manual';
}): Promise<CvMeta> {
  if (data.buffer && (data.buffer.length <= 0 || data.buffer.length > 20 * 1024 * 1024)) {
    throw new Error('Kích thước tệp CV không hợp lệ (tối đa 20MB)');
  }

  const document = data.buffer ? await extractCvDocument(data.buffer, data.mimeType, data.fileName) : null;
  const contentText = document?.text || '', auto = document?.data;
  const choose = <T>(key: CvImportField, value: T | null | undefined, fallback?: T | null): T | null => {
    if (data.manualFields?.includes(key)) return value ?? null;
    return value != null && value !== '' && (!Array.isArray(value) || value.length) ? value : fallback ?? null;
  };
  const name = choose('candidate_name', data.candidateName, auto?.candidate_name)?.trim();
  if (!name) throw new Error('Chưa nhận diện được tên ứng viên. Vui lòng nhập tên trước khi lưu.');
  const email = choose('candidate_email', data.candidateEmail, auto?.candidate_email);
  const phone = choose('candidate_phone', data.candidatePhone, auto?.candidate_phone);
  const position = choose('position_applied', data.positionApplied, auto?.position_applied);
  const currentTitle = choose('current_title', data.currentTitle, auto?.current_title);
  const location = choose('location', data.location, auto?.location);
  const educationLevel = choose('education_level', data.educationLevel, auto?.education_level);
  const educationDegree = choose('education_degree', data.educationDegree, auto?.education_degree || normalizeCvEducationDegree(data.educationLevel));
  const salary = choose('expected_salary', data.expectedSalary, auto?.expected_salary);
  const skills = dedupeStr(choose('skills', data.skills, auto?.skills) || []);
  const years = choose('years_experience', data.yearsExperience, auto?.years_experience);
  const languages = dedupeStr(choose('languages', data.languages, auto?.languages) || []);
  const tags = dedupeStr(data.tags || []);
  const industry = data.industryMode === 'manual' || data.manualFields?.includes('industry')
    ? data.industry?.trim() || null
    : data.industryMode === 'auto' ? inferIndustryFromCandidate(position, languages)
      : data.industry?.trim() || inferIndustryFromCandidate(position, languages);

  const searchText = normalizeSearch(
    name, position, industry, currentTitle, location,
    skills.join(' '), languages.join(' '), tags.join(' '), data.note, contentText
  );

  const id = genId('cv');

  // Dual-write: có S3 → media_id + content NULL; chưa cấu hình → BYTEA như cũ.
  // (Trích xuất text ở trên vẫn dùng buffer trong RAM, không phụ thuộc nơi lưu.)
  const row = await withTransaction(async client => {
    // Serialize duplicate checking and insertion, including concurrent batch uploads.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hr-cv-create-dedup'))");
    const emails = [...new Set([email, auto?.candidate_email].filter(Boolean).map(value => value!.trim().toLowerCase()))];
    const phones = [...new Set([phone, auto?.candidate_phone].filter(Boolean).map(value => value!.replace(/\D/g, '').replace(/^84(?=\d{9}$)/, '0')))];
    const duplicate = await client.query(`SELECT id FROM hr_cv_pool WHERE deleted_at IS NULL AND (
      LOWER(BTRIM(candidate_email)) = ANY($1::text[])
      OR regexp_replace(regexp_replace(candidate_phone,'\\D','','g'),'^84(?=[0-9]{9}$)','0') = ANY($2::text[])
      OR ($3 <> '' AND LOWER(regexp_replace(content_text,'\\s+','','g')) = $3)
      OR ($4 <> '' AND md5(content) = $4)
    ) LIMIT 1`, [emails, phones, contentText.toLowerCase().replace(/\s+/g, ''), data.buffer ? createHash('md5').update(data.buffer).digest('hex') : '']);
    if (duplicate.rows.length) throw new DuplicateCvError();
    // Compare object-storage files too, including legacy extraction differences.
    if (data.buffer) {
      const stored = await client.query('SELECT media_id FROM hr_cv_pool WHERE deleted_at IS NULL AND size_bytes=$1 AND media_id IS NOT NULL', [data.buffer.length]);
      for (const previous of stored.rows) {
        const original = await getMediaBuffer(previous.media_id);
        if (original?.buffer.equals(data.buffer)) throw new DuplicateCvError();
      }
    }
    const media = data.buffer
    ? await uploadBufferAsMedia({
        buffer: data.buffer,
        mimeType: data.mimeType || 'application/octet-stream',
        scope: 'hr_cv_pool',
        originalName: data.fileName,
        uploaderId: data.uploadedBy,
        sourceId: id,
      })
    : null;

    if (industry) await client.query(`INSERT INTO hr_cv_industries (id, name, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [genId('cvi'), industry, data.uploadedBy]);
    const inserted = await client.query<any>(
    `INSERT INTO hr_cv_pool
       (id, candidate_name, candidate_email, candidate_phone, position_applied, industry, source, note,
        file_name, mime_type, size_bytes, content, uploaded_by,
        content_text, search_text, skills, years_experience, current_title, education_level,
        expected_salary, location, languages, tags, extracted_at, media_id,
        employment_type, gender, date_of_birth, job_search_status, education_degree)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
             $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
     RETURNING ${CV_COLUMNS}`,
    [
      id, name, nn(email), nn(phone),
      nn(position), industry, nn(data.source), nn(data.note),
      data.fileName ?? null, data.mimeType ?? null, data.buffer?.length ?? null,
      media ? null : (data.buffer ?? null), data.uploadedBy,
      contentText || null, searchText || null, skills, years,
      nn(currentTitle), nn(educationLevel), salary,
      nn(location), languages, tags, contentText ? new Date().toISOString() : null,
      media ? media.id : null,
      choose('employment_type', data.employmentType, auto?.employment_type), choose('gender', data.gender, auto?.gender),
      choose('date_of_birth', data.dateOfBirth, auto?.date_of_birth), choose('job_search_status', data.jobSearchStatus, auto?.job_search_status), educationDegree,
    ]
    );
    return inserted.rows[0];
  });
  return mapCv(row);
}

export async function updateCv(
  id: string,
  data: {
    candidateName?: string; candidateEmail?: string; candidatePhone?: string;
    positionApplied?: string; industry?: string | null; source?: string; status?: string; note?: string;
    skills?: string[]; yearsExperience?: number | null; currentTitle?: string;
    educationLevel?: string; educationDegree?: string | null; expectedSalary?: number | null; location?: string;
    languages?: string[]; rating?: number | null; tags?: string[];
    employmentType?: string | null; gender?: string | null; dateOfBirth?: string | null; jobSearchStatus?: string | null;
    changedBy?: string | null;   // người thực hiện (ghi lịch sử khi đổi giai đoạn)
  }
): Promise<CvMeta | null> {
  // Lấy status hiện tại để ghi lịch sử nếu có thay đổi giai đoạn
  let oldStatus: string | null = null;
  if (data.status !== undefined) {
    const cur = await queryOne<{ status: string }>(`SELECT status FROM hr_cv_pool WHERE id = $1 AND deleted_at IS NULL`, [id]);
    oldStatus = cur?.status ?? null;
  }

  const sets: string[] = ['updated_at = NOW()', 'last_activity_at = NOW()'];
  const params: any[] = [];
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  const map: Record<string, any> = {
    candidate_name: data.candidateName, candidate_email: data.candidateEmail,
    candidate_phone: data.candidatePhone, position_applied: data.positionApplied,
    industry: data.industry,
    source: data.source, status: data.status, note: data.note,
    skills: data.skills && dedupeStr(data.skills), years_experience: data.yearsExperience,
    current_title: data.currentTitle, education_level: data.educationLevel,
    education_degree: data.educationDegree !== undefined ? data.educationDegree
      : normalizeCvEducationDegree(data.educationLevel) || undefined,
    expected_salary: data.expectedSalary, location: data.location,
    languages: data.languages && dedupeStr(data.languages), rating: data.rating,
    tags: data.tags && dedupeStr(data.tags),
    employment_type: data.employmentType, gender: data.gender, date_of_birth: data.dateOfBirth,
    job_search_status: data.jobSearchStatus,
  };
  for (const [col, val] of Object.entries(map)) {
    if (val !== undefined) sets.push(`${col} = ${p(val)}`);
  }

  const updated = await queryOne<any>(
    `UPDATE hr_cv_pool SET ${sets.join(', ')} WHERE id = ${p(id)} AND deleted_at IS NULL RETURNING id`,
    params
  );
  if (!updated) return null;

  // Ghi lịch sử khi đổi giai đoạn
  if (data.status !== undefined && data.status !== oldStatus) {
    await execute(
      `INSERT INTO hr_cv_stage_history (id, cv_id, from_status, to_status, changed_by) VALUES ($1,$2,$3,$4,$5)`,
      [genId('cvh'), id, oldStatus, data.status, data.changedBy ?? null]
    );
  }

  // Cập nhật search_text nếu có thay đổi trường liên quan tìm kiếm
  await refreshSearchText(id);
  return getCvById(id, data.changedBy);
}

/** Dựng lại search_text từ trạng thái hiện tại của bản ghi (gồm content_text). */
async function refreshSearchText(id: string): Promise<void> {
  const r = await queryOne<any>(
    `SELECT candidate_name, position_applied, industry, current_title, location, skills, languages, tags, note, content_text
       FROM hr_cv_pool WHERE id = $1`, [id]
  );
  if (!r) return;
  const searchText = normalizeSearch(
    r.candidate_name, r.position_applied, r.industry, r.current_title, r.location,
    (r.skills || []).join(' '), (r.languages || []).join(' '), (r.tags || []).join(' '),
    r.note, r.content_text
  );
  await execute(`UPDATE hr_cv_pool SET search_text = $1 WHERE id = $2`, [searchText || null, id]);
}

export async function getCvContent(id: string): Promise<{ file_name: string; mime_type: string | null; content: Buffer } | null> {
  const row = await queryOne<{ file_name: string; mime_type: string | null; content: Buffer | null; media_id: string | null }>(
    `SELECT file_name, mime_type, content, media_id FROM hr_cv_pool WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!row) return null;
  // Dual-read: file mới nằm trên MinIO (media_id), file cũ vẫn là BYTEA.
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { file_name: row.file_name, mime_type: row.mime_type, content: m.buffer };
  }
  if (!row.content) return null;
  return { file_name: row.file_name, mime_type: row.mime_type, content: row.content };
}

/** Lấy nội dung text CV (cho xem nhanh / Phase 2 AI). */
export async function getCvText(id: string): Promise<string | null> {
  const r = await queryOne<{ content_text: string | null }>(
    `SELECT content_text FROM hr_cv_pool WHERE id = $1 AND deleted_at IS NULL`, [id]
  );
  return r?.content_text ?? null;
}

export async function deleteCv(id: string): Promise<boolean> {
  const row = await queryOne<{ media_id: string | null }>(
    `UPDATE hr_cv_pool SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING media_id`,
    [id]
  );
  if (!row) return false;
  // File CV không được copy-chia-sẻ sang bảng khác → xoá mềm media best-effort.
  if (row.media_id) await softDeleteMedia(row.media_id).catch(() => {});
  return true;
}

const nn = (v?: string | null) => (v && v.trim() ? v.trim() : null);
const dedupeStr = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];

// ── ATS: liên kết yêu cầu tuyển dụng, ghi chú, lịch sử ───────────────────────

export interface CvApplication {
  id: string; cv_id: string; requisition_id: string; status: string | null; note: string | null;
  created_at: string; requisition_title: string | null; requisition_status: string | null;
}
export interface CvNote {
  id: string; cv_id: string; kind: string; rating: number | null; body: string | null;
  author_id: string | null; author_name: string | null; created_at: string;
}
export interface CvStageEvent {
  id: string; cv_id: string; from_status: string | null; to_status: string;
  note: string | null; changed_by: string | null; changed_by_name: string | null; created_at: string;
}

export async function listApplications(cvId: string): Promise<CvApplication[]> {
  return query<CvApplication>(
    `SELECT a.id, a.cv_id, a.requisition_id, a.status, a.note, a.created_at,
            r.title AS requisition_title, r.status AS requisition_status
       FROM hr_applications a
       LEFT JOIN requisitions r ON r.id = a.requisition_id
      WHERE a.cv_id = $1 ORDER BY a.created_at DESC`, [cvId]
  );
}
export async function linkRequisition(cvId: string, requisitionId: string, note: string | null, createdBy: string | null): Promise<CvApplication> {
  // Khóa độc quyền: CV đang phỏng vấn/offer/đã tuyển ở vị trí khác → chặn gắn mới.
  const { assertCvNotLocked } = await import('./applicationService');
  await assertCvNotLocked(cvId);

  const id = genId('app');
  // Khởi tạo ở 'screening' — hồ sơ vừa gắn coi như đang sàng lọc cho vị trí này.
  const inserted = await execute(
    `INSERT INTO hr_applications (id, cv_id, requisition_id, status, note, created_by)
     VALUES ($1,$2,$3,'screening',$4,$5) ON CONFLICT (cv_id, requisition_id) DO NOTHING`,
    [id, cvId, requisitionId, nn(note), createdBy]
  );
  // Chỉ thông báo cho người TẠO yêu cầu khi liên kết MỚI (tránh báo lại khi re-link)
  if (inserted > 0) {
    import('./notificationsService')
      .then((m) => m.sendCandidateLinkedNotification(requisitionId, cvId))
      .catch((e) => console.error('[linkRequisition] notify error:', e));
  }
  const row = await queryOne<CvApplication>(
    `SELECT a.id, a.cv_id, a.requisition_id, a.status, a.note, a.created_at,
            r.title AS requisition_title, r.status AS requisition_status
       FROM hr_applications a LEFT JOIN requisitions r ON r.id = a.requisition_id
      WHERE a.cv_id = $1 AND a.requisition_id = $2`, [cvId, requisitionId]
  );
  if (!row) throw new Error('Không liên kết được yêu cầu tuyển dụng');
  return row;
}
export async function unlinkRequisition(cvId: string, applicationId: string): Promise<boolean> {
  const n = await execute(`DELETE FROM hr_applications WHERE id = $1 AND cv_id = $2`, [applicationId, cvId]);
  return n > 0;
}

export async function listNotes(cvId: string): Promise<CvNote[]> {
  return query<CvNote>(
    `SELECT n.id, n.cv_id, n.kind, n.rating, n.body, n.author_id, u.name AS author_name, n.created_at
       FROM hr_cv_notes n LEFT JOIN users u ON u.id::text = n.author_id
      WHERE n.cv_id = $1 ORDER BY n.created_at DESC`, [cvId]
  );
}
export async function addNote(cvId: string, data: { kind?: string; rating?: number | null; body?: string | null; authorId: string | null }): Promise<CvNote> {
  const id = genId('cvn');
  await execute(
    `INSERT INTO hr_cv_notes (id, cv_id, kind, rating, body, author_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, cvId, data.kind || 'note', data.rating ?? null, nn(data.body), data.authorId]
  );
  await execute('UPDATE hr_cv_pool SET last_activity_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [cvId]);
  const row = await queryOne<CvNote>(
    `SELECT n.id, n.cv_id, n.kind, n.rating, n.body, n.author_id, u.name AS author_name, n.created_at
       FROM hr_cv_notes n LEFT JOIN users u ON u.id::text = n.author_id WHERE n.id = $1`, [id]
  );
  return row as CvNote;
}
export async function deleteNote(cvId: string, noteId: string): Promise<boolean> {
  const n = await execute(`DELETE FROM hr_cv_notes WHERE id = $1 AND cv_id = $2`, [noteId, cvId]);
  if (n) await execute('UPDATE hr_cv_pool SET last_activity_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [cvId]);
  return n > 0;
}

export async function listStageHistory(cvId: string): Promise<CvStageEvent[]> {
  return query<CvStageEvent>(
    `SELECT h.id, h.cv_id, h.from_status, h.to_status, h.note, h.changed_by,
            u.name AS changed_by_name, h.created_at
       FROM hr_cv_stage_history h LEFT JOIN users u ON u.id::text = h.changed_by
      WHERE h.cv_id = $1 ORDER BY h.created_at DESC`, [cvId]
  );
}

/**
 * Danh sách ứng viên đã liên kết với 1 yêu cầu tuyển dụng — bản RÚT GỌN, KHÔNG
 * kèm thông tin liên hệ (email/SĐT). Dùng cho phía NGƯỜI YÊU CẦU (không có quyền
 * hr-cv) để theo dõi tiến độ, tránh lộ PII.
 */
export interface RequisitionCandidate {
  id: string;                       // cv_id
  application_id: string;           // hr_applications.id (khóa thao tác per-vị-trí)
  candidate_name: string; current_title: string | null; position_applied: string | null;
  status: string;                   // trạng thái ứng tuyển CHO VỊ TRÍ NÀY (per-application)
  reject_reason: string | null;
  rating: number | null; years_experience: number | null; skills: string[];
  hired_elsewhere: string | null;   // tên vị trí khác nếu CV đã được tuyển ở đó (hiển thị chéo)
}
export async function listCandidatesForRequisition(reqId: string): Promise<RequisitionCandidate[]> {
  const rows = await query<any>(
    `SELECT c.id, a.id AS application_id, c.candidate_name, c.current_title, c.position_applied,
            a.status AS app_status, a.reject_reason, c.rating, c.years_experience, c.skills,
            (SELECT r2.title FROM hr_applications a2
               JOIN requisitions r2 ON r2.id = a2.requisition_id
              WHERE a2.cv_id = c.id AND a2.status = 'hired' AND a2.requisition_id <> $1
              LIMIT 1) AS hired_elsewhere
       FROM hr_cv_pool c
       JOIN hr_applications a ON a.cv_id = c.id
      WHERE a.requisition_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.rating DESC NULLS LAST, c.created_at DESC`,
    [reqId]
  );
  return rows.map((r) => ({
    id: r.id, application_id: r.application_id,
    candidate_name: r.candidate_name, current_title: r.current_title,
    position_applied: r.position_applied, status: r.app_status || 'screening',
    reject_reason: r.reject_reason ?? null,
    rating: r.rating == null ? null : Number(r.rating),
    years_experience: r.years_experience == null ? null : Number(r.years_experience),
    skills: r.skills || [],
    hired_elsewhere: r.hired_elsewhere ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Kho JD
// ─────────────────────────────────────────────────────────────────────────────

export interface JdMeta {
  id: string;
  title: string;
  department_name: string | null;
  description: string | null;
  status: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const JD_COLUMNS = `id, title, department_name, description, status, file_name, mime_type, size_bytes,
  created_by, created_at, updated_at`;

export async function listJds(status?: string): Promise<JdMeta[]> {
  if (status) {
    return query<JdMeta>(
      `SELECT ${JD_COLUMNS} FROM hr_jd_pool WHERE deleted_at IS NULL AND status = $1 ORDER BY created_at DESC`,
      [status]
    );
  }
  return query<JdMeta>(`SELECT ${JD_COLUMNS} FROM hr_jd_pool WHERE deleted_at IS NULL ORDER BY created_at DESC`);
}

export async function createJd(data: {
  title: string;
  departmentName?: string;
  description?: string;
  status?: string;
  fileName?: string;
  mimeType?: string;
  buffer?: Buffer;
  createdBy: string | null;
}): Promise<JdMeta> {
  if (data.buffer && (data.buffer.length <= 0 || data.buffer.length > 10 * 1024 * 1024)) {
    throw new Error('Kích thước tệp JD không hợp lệ (tối đa 10MB)');
  }
  const id = genId('jd');

  // Dual-write: có S3 → media_id + content NULL; chưa cấu hình → BYTEA như cũ.
  const media = data.buffer
    ? await uploadBufferAsMedia({
        buffer: data.buffer,
        mimeType: data.mimeType || 'application/octet-stream',
        scope: 'hr_jd_pool',
        originalName: data.fileName,
        uploaderId: data.createdBy,
        sourceId: id,
      })
    : null;

  const row = await queryOne<JdMeta>(
    `INSERT INTO hr_jd_pool
       (id, title, department_name, description, status, file_name, mime_type, size_bytes, content, created_by, media_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING ${JD_COLUMNS}`,
    [
      id, data.title.trim(), data.departmentName ?? null, data.description ?? null,
      data.status ?? 'active', data.fileName ?? null, data.mimeType ?? null,
      data.buffer?.length ?? null, media ? null : (data.buffer ?? null), data.createdBy,
      media ? media.id : null,
    ]
  );
  return row as JdMeta;
}

export async function updateJd(
  id: string,
  data: {
    title?: string;
    departmentName?: string | null;
    description?: string | null;
    status?: string;
    fileName?: string | null;
    mimeType?: string | null;
    buffer?: Buffer | null;
  }
): Promise<JdMeta | null> {
  if (data.buffer && (data.buffer.length <= 0 || data.buffer.length > 10 * 1024 * 1024)) {
    throw new Error('Kich thuoc tep JD khong hop le (toi da 10MB)');
  }
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  let i = 1;
  if (data.title !== undefined) { sets.push(`title = $${i++}`); params.push(data.title); }
  if (data.departmentName !== undefined) { sets.push(`department_name = $${i++}`); params.push(data.departmentName); }
  if (data.description !== undefined) { sets.push(`description = $${i++}`); params.push(data.description); }
  if (data.status !== undefined) { sets.push(`status = $${i++}`); params.push(data.status); }
  if (data.fileName !== undefined) { sets.push(`file_name = $${i++}`); params.push(data.fileName); }
  if (data.mimeType !== undefined) { sets.push(`mime_type = $${i++}`); params.push(data.mimeType); }
  let oldMediaId: string | null = null;
  if (data.buffer !== undefined) {
    // Đổi/xoá file → media cũ (nếu có) không còn được trỏ tới, xoá mềm best-effort sau khi update.
    const cur = await queryOne<{ media_id: string | null }>(
      `SELECT media_id FROM hr_jd_pool WHERE id = $1 AND deleted_at IS NULL`, [id]
    );
    oldMediaId = cur?.media_id ?? null;

    // Dual-write: có S3 → media_id + content NULL; chưa cấu hình → BYTEA như cũ.
    const media = data.buffer
      ? await uploadBufferAsMedia({
          buffer: data.buffer,
          mimeType: data.mimeType || 'application/octet-stream',
          scope: 'hr_jd_pool',
          originalName: data.fileName ?? null,
          sourceId: id,
        })
      : null;

    sets.push(`size_bytes = $${i++}`);
    params.push(data.buffer ? data.buffer.length : null);
    sets.push(`content = $${i++}`);
    params.push(media ? null : data.buffer);
    sets.push(`media_id = $${i++}`);
    params.push(media ? media.id : null);
  }
  params.push(id);
  const updated = await queryOne<JdMeta>(
    `UPDATE hr_jd_pool SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING ${JD_COLUMNS}`,
    params
  );
  if (updated && oldMediaId) await softDeleteMedia(oldMediaId).catch(() => {});
  return updated;
}

export async function getJdContent(id: string): Promise<{ file_name: string; mime_type: string | null; content: Buffer } | null> {
  const row = await queryOne<{ file_name: string; mime_type: string | null; content: Buffer | null; media_id: string | null }>(
    `SELECT file_name, mime_type, content, media_id FROM hr_jd_pool WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!row) return null;
  // Dual-read: file mới nằm trên MinIO (media_id), file cũ vẫn là BYTEA.
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { file_name: row.file_name, mime_type: row.mime_type, content: m.buffer };
  }
  if (!row.content) return null;
  return { file_name: row.file_name, mime_type: row.mime_type, content: row.content };
}

export async function deleteJd(id: string): Promise<boolean> {
  const row = await queryOne<{ media_id: string | null }>(
    `UPDATE hr_jd_pool SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING media_id`,
    [id]
  );
  if (!row) return false;
  // File JD không được copy-chia-sẻ sang bảng khác → xoá mềm media best-effort.
  if (row.media_id) await softDeleteMedia(row.media_id).catch(() => {});
  return true;
}
