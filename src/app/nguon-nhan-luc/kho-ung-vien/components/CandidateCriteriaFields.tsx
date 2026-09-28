'use client';

import React from 'react';
import { CV_GENDERS, CV_JOB_SEARCH_STATUSES, CV_WORK_TYPES } from '@/lib/cvFilters';

export default function CandidateCriteriaFields({ values, onChange, fieldClass }: {
  values: { gender: string; date_of_birth: string; employment_type: string; job_search_status: string };
  onChange: (key: 'gender' | 'date_of_birth' | 'employment_type' | 'job_search_status', value: string) => void;
  fieldClass: string;
}) {
  return <details className="rounded-xl border border-line p-3 text-xs text-muted-foreground">
    <summary className="cursor-pointer font-600 text-foreground">Thông tin bổ sung cho bộ lọc</summary>
    <p className="mt-2">Chỉ nhập thông tin ứng viên đã cung cấp. Có thể để trống.</p>
    <div className="mt-3 grid grid-cols-2 gap-3">
      <label>Hình thức làm việc<select aria-label="Hình thức làm việc của ứng viên" className={`${fieldClass} mt-1`} value={values.employment_type} onChange={event => onChange('employment_type', event.target.value)}>
        <option value="">Chưa có thông tin</option>{CV_WORK_TYPES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select></label>
      <label>Giới tính<select aria-label="Giới tính của ứng viên" className={`${fieldClass} mt-1`} value={values.gender} onChange={event => onChange('gender', event.target.value)}>
        <option value="">Chưa có thông tin</option>{CV_GENDERS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select></label>
      <label>Ngày sinh<input aria-label="Ngày sinh của ứng viên" type="date" max={new Date().toISOString().slice(0, 10)} className={`${fieldClass} mt-1`} value={values.date_of_birth} onChange={event => onChange('date_of_birth', event.target.value)} /></label>
      <label>Trạng thái tìm việc<select aria-label="Trạng thái tìm việc của ứng viên" className={`${fieldClass} mt-1`} value={values.job_search_status} onChange={event => onChange('job_search_status', event.target.value)}>
        <option value="">Chưa có thông tin</option>{CV_JOB_SEARCH_STATUSES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select></label>
    </div>
  </details>;
}
