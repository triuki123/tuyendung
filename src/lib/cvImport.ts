export const CV_IMPORT_FIELDS = {
  candidate_name: 'Họ tên', candidate_email: 'Email', candidate_phone: 'Số điện thoại',
  position_applied: 'Vị trí ứng tuyển', current_title: 'Chức danh hiện tại', industry: 'Ngành nghề',
  location: 'Khu vực / nơi ở', education_level: 'Học vấn / trường học', education_degree: 'Bằng cấp',
  years_experience: 'Số năm kinh nghiệm', expected_salary: 'Lương mong muốn', skills: 'Kỹ năng', languages: 'Ngoại ngữ',
  gender: 'Giới tính', date_of_birth: 'Ngày sinh', employment_type: 'Hình thức làm việc', job_search_status: 'Trạng thái tìm việc',
} as const;
export type CvImportField = keyof typeof CV_IMPORT_FIELDS;
export interface CvExtractionEvidence { source: 'label' | 'header' | 'content' | 'filename' | 'timeline'; confidence: 'high' | 'review'; text: string }
export interface ExtractedCvCandidateData {
  candidate_name: string; candidate_email: string; candidate_phone: string; position_applied: string;
  current_title: string; industry: string | null; location: string; education_level: string; education_degree: string | null;
  years_experience: number | null; expected_salary: number | null; skills: string[]; languages: string[];
  gender: string | null; date_of_birth: string | null; employment_type: string | null; job_search_status: string | null;
  extracted: boolean; method: 'text' | 'ocr' | 'unreadable'; warnings: string[];
  evidence: Partial<Record<CvImportField, CvExtractionEvidence>>; missing_fields: CvImportField[];
}
export function cvExtractionFormValues(data: ExtractedCvCandidateData): Record<CvImportField, string> {
  return Object.fromEntries(Object.keys(CV_IMPORT_FIELDS).map(key => {
    const value = data[key as CvImportField];
    return [key, Array.isArray(value) ? value.join(', ') : value == null ? '' : String(value)];
  })) as Record<CvImportField, string>;
}
