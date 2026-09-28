'use client';

import { CV_IMPORT_FIELDS, cvExtractionFormValues } from '@/lib/cvImport';
import type { CvImportField, ExtractedCvCandidateData } from '@/lib/cvImport';

export default function CandidateExtractionReport({ data, values, manualFields = [] }: {
  data: ExtractedCvCandidateData; values?: Record<CvImportField, string>; manualFields?: string[];
}) {
  const fields = values || cvExtractionFormValues(data);
  const recognized = cvExtractionFormValues(data);
  const conflicts = manualFields.filter(key => ['candidate_name', 'candidate_email', 'candidate_phone', 'position_applied'].includes(key)
    && fields[key as CvImportField]?.trim() && recognized[key as CvImportField]?.trim()
    && fields[key as CvImportField].trim().toLowerCase() !== recognized[key as CvImportField].trim().toLowerCase());
  const present = Object.keys(CV_IMPORT_FIELDS).filter(key => fields[key as CvImportField]?.trim()).length;
  return <div className="cv-extraction-report">
    <p role="status">{data.extracted ? 'Đã đọc CV' : 'CV cần nhập thông tin thủ công'} · {present}/{Object.keys(CV_IMPORT_FIELDS).length} trường có thông tin</p>
    <p className="cv-extraction-help">Thông tin chưa có trong CV sẽ để trống. Vui lòng đối chiếu các trường cần kiểm tra trước khi lưu.</p>
    {conflicts.length > 0 && <p className="cv-extraction-warnings">Thông tin nhập tay khác nội dung CV: {conflicts.map(key => CV_IMPORT_FIELDS[key as CvImportField]).join(', ')}. Hệ thống giữ phần bạn đã sửa; vui lòng kiểm tra.</p>}
    {data.warnings.length > 0 && <ul className="cv-extraction-warnings">{[...new Set(data.warnings)].map(value => <li key={value}>{value}</li>)}</ul>}
    <details><summary>Kiểm tra thông tin tự điền</summary><dl>
      {(Object.entries(CV_IMPORT_FIELDS) as [CvImportField, string][]).map(([key, label]) => {
        const missing = !fields[key]?.trim(), manual = manualFields.includes(key), evidence = data.evidence[key];
        const status = missing ? 'Chưa có thông tin' : manual ? 'Đã sửa tay' : evidence?.confidence === 'high' ? 'Đã nhận diện' : 'Cần kiểm tra';
        return <div key={key} title={evidence?.text || undefined}><dt>{label}</dt><dd data-field-status={missing ? 'missing' : manual ? 'manual' : evidence?.confidence || 'review'}>{status}</dd></div>;
      })}
    </dl></details>
  </div>;
}
