export const CV_WORK_TYPES = [
  ['full_time', 'Toàn thời gian'], ['part_time', 'Bán thời gian'], ['contract', 'Hợp đồng'],
  ['internship', 'Thực tập'], ['freelance', 'Freelance'], ['remote', 'Từ xa'],
  ['hybrid', 'Kết hợp'], ['onsite', 'Tại văn phòng'],
] as const;
export const CV_GENDERS = [['male', 'Nam'], ['female', 'Nữ'], ['other', 'Khác']] as const;
export const CV_EDUCATION_LEVELS = [
  'Chưa tốt nghiệp THPT', 'Tốt nghiệp THPT', 'Chứng chỉ nghề', 'Trung cấp',
  'Cao đẳng', 'Đại học', 'Sau đại học',
] as const;
export const CV_TIME_RANGES = [
  ['', 'Tất cả'], ['1', 'Trong vòng 1 ngày'], ['7', '1 Tuần gần đây'],
  ['30', '1 Tháng gần đây'], ['60', '2 Tháng gần đây'],
] as const;

/** Explicit qualifications only: never infer a degree from an institution name. */
export function normalizeCvEducationDegree(value?: string | null): string | null {
  const normalized = (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
  const aliases = [
    ['chua tot nghiep thpt', 'below high school'], ['tot nghiep thpt', 'thpt', 'high school'],
    ['chung chi nghe', 'vocational certificate'], ['trung cap', 'intermediate'],
    ['cao dang', 'college', 'associate degree'], ['dai hoc', 'cu nhan', 'ky su', 'bachelor', 'bachelor degree'],
    ['sau dai hoc', 'thac si', 'tien si', 'postgraduate', 'master', 'doctorate', 'phd'],
  ];
  const index = aliases.findIndex(values => values.includes(normalized));
  return index >= 0 ? CV_EDUCATION_LEVELS[index] : null;
}

/** Infer the selected degree from the Học vấn / Trường học content convention. */
export function inferCvEducationDegree(value?: string | null): string | null {
  const normalized = (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
  if (/\b(?:thac si|tien si|masters?|phd|doctorate|postgraduate)\b/.test(normalized)) return 'Sau đại học';
  if (/\b(?:dai hoc|university|cu nhan|bachelor)\b/.test(normalized)) return 'Đại học';
  if (/\b(?:cao dang|college|associate degree)\b/.test(normalized)) return 'Cao đẳng';
  if (/\b(?:trung cap|intermediate)\b/.test(normalized)) return 'Trung cấp';
  return normalizeCvEducationDegree(value);
}

export function formatCvUploadTime(value?: string | null): string {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date) : 'Chưa có thông tin';
}
export const CV_JOB_SEARCH_STATUSES = [
  ['actively_looking', 'Đang tìm việc'], ['open_to_offers', 'Sẵn sàng nhận cơ hội'], ['not_looking', 'Chưa tìm việc'],
] as const;

export interface CvAdvancedFilter {
  sortBy?: 'updated' | 'uploaded';
  updatedWithinDays?: number;
  minExperience?: number;
  maxExperience?: number;
  employmentTypes?: string[];
  gender?: string;
  languages?: string[];
  minSalary?: number;
  maxSalary?: number;
  minAge?: number;
  maxAge?: number;
  educationLevels?: string[];
  jobSearchStatuses?: string[];
  onlyUnviewed?: boolean;
  skills?: string[];
  minRating?: number;
  requisitionId?: string;
}

export interface CvFilterOptions {
  industries: string[];
  skills: string[];
  languages: string[];
  educationLevels: string[];
}

export function countCvFilters(filter: CvAdvancedFilter): number {
  return [filter.updatedWithinDays, filter.minExperience != null || filter.maxExperience != null,
    filter.employmentTypes?.length, filter.gender, filter.languages?.length,
    filter.minSalary != null || filter.maxSalary != null, filter.minAge != null || filter.maxAge != null,
    filter.educationLevels?.length, filter.jobSearchStatuses?.length, filter.onlyUnviewed,
    filter.skills?.length, filter.minRating, filter.requisitionId].filter(Boolean).length;
}

/** Reject invalid ranges/types before they reach SQL or a saved-filter preset. */
export function parseCvAdvancedFilter(input: unknown): CvAdvancedFilter {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Bộ lọc không hợp lệ');
  const body = input as Record<string, unknown>;
  const filter: CvAdvancedFilter = {};
  for (const [key, max] of [['minExperience', 80], ['maxExperience', 80], ['minSalary', 1e12],
    ['maxSalary', 1e12], ['minAge', 100], ['maxAge', 100], ['minRating', 5], ['updatedWithinDays', 3650]] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max
      || (['minAge', 'maxAge', 'updatedWithinDays', 'minRating'].includes(key) && !Number.isInteger(value))) {
      throw new Error('Giá trị số trong bộ lọc không hợp lệ');
    }
    filter[key] = value;
  }
  for (const [min, max, label] of [['minExperience', 'maxExperience', 'kinh nghiệm'],
    ['minSalary', 'maxSalary', 'mức lương'], ['minAge', 'maxAge', 'độ tuổi']] as const) {
    if (filter[min] != null && filter[max] != null && filter[min]! > filter[max]!) {
      throw new Error(`Khoảng ${label}: giá trị từ phải nhỏ hơn hoặc bằng giá trị đến`);
    }
  }
  for (const key of ['employmentTypes', 'languages', 'educationLevels', 'jobSearchStatuses', 'skills'] as const) {
    if (body[key] === undefined) continue;
    if (!Array.isArray(body[key]) || body[key].length > 50 || body[key].some(value => typeof value !== 'string' || value.length > 160)) {
      throw new Error('Danh sách tiêu chí không hợp lệ');
    }
    const values = [...new Set((body[key] as string[]).map(value => value.trim()).filter(Boolean))];
    if (key === 'employmentTypes' && values.some(value => !CV_WORK_TYPES.some(([code]) => code === value))) throw new Error('Hình thức làm việc không hợp lệ');
    if (key === 'jobSearchStatuses' && values.some(value => !CV_JOB_SEARCH_STATUSES.some(([code]) => code === value))) throw new Error('Trạng thái tìm việc không hợp lệ');
    if (key === 'educationLevels') {
      const degrees = values.map(normalizeCvEducationDegree);
      if (degrees.some(value => !value)) throw new Error('Bằng cấp không hợp lệ');
      if (degrees.length) filter.educationLevels = [...new Set(degrees as string[])];
    } else if (values.length) filter[key] = values;
  }
  if (body.gender !== undefined && body.gender !== '') {
    if (!CV_GENDERS.some(([code]) => code === body.gender)) throw new Error('Giới tính không hợp lệ');
    filter.gender = body.gender as string;
  }
  if (body.sortBy !== undefined) {
    // Old saved presets migrate to the new upload-time criterion.
    if (body.sortBy !== 'updated' && body.sortBy !== 'uploaded' && body.sortBy !== 'activity') throw new Error('Cách sắp xếp không hợp lệ');
    filter.sortBy = body.sortBy === 'activity' ? 'uploaded' : body.sortBy;
  }
  if (body.onlyUnviewed !== undefined) {
    if (typeof body.onlyUnviewed !== 'boolean') throw new Error('Tiêu chí hồ sơ chưa xem không hợp lệ');
    filter.onlyUnviewed = body.onlyUnviewed;
  }
  if (body.requisitionId !== undefined) {
    if (typeof body.requisitionId !== 'string' || body.requisitionId.length > 160) throw new Error('Yêu cầu tuyển dụng không hợp lệ');
    if (body.requisitionId) filter.requisitionId = body.requisitionId;
  }
  return filter;
}

export function parseCvCandidateCriteria(body: Record<string, unknown>) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Thông tin ứng viên không hợp lệ');
  const result: { employmentType?: string | null; gender?: string | null; dateOfBirth?: string | null; jobSearchStatus?: string | null; educationDegree?: string | null } = {};
  if (body.education_degree !== undefined) {
    const value = body.education_degree;
    if (value === null || value === '') result.educationDegree = null;
    else {
      if (typeof value !== 'string') throw new Error('Bằng cấp không hợp lệ');
      const degree = normalizeCvEducationDegree(value);
      if (!degree) throw new Error('Bằng cấp không hợp lệ');
      result.educationDegree = degree;
    }
  }
  for (const [field, key, choices] of [['employment_type', 'employmentType', CV_WORK_TYPES],
    ['gender', 'gender', CV_GENDERS], ['job_search_status', 'jobSearchStatus', CV_JOB_SEARCH_STATUSES]] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null || value === '') result[key] = null;
    else if (typeof value === 'string' && choices.some(([code]) => code === value)) result[key] = value;
    else throw new Error('Thông tin tiêu chí ứng viên không hợp lệ');
  }
  if (body.date_of_birth !== undefined) {
    const value = body.date_of_birth;
    if (value === null || value === '') result.dateOfBirth = null;
    else {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ngày sinh không hợp lệ');
      const date = new Date(`${value}T00:00:00Z`);
      if (Number(value.slice(0, 4)) < 1 || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date > new Date()) throw new Error('Ngày sinh không hợp lệ');
      result.dateOfBirth = value;
    }
  }
  return result;
}
