'use client';

import React from 'react';
import { CV_EDUCATION_LEVELS } from '@/lib/cvFilters';

export default function CandidateEducationField({ value, onChange, fieldClass }: {
  value: string; onChange: (value: string) => void; fieldClass: string;
}) {
  return <label className="block text-xs font-600 text-muted-foreground">Bằng cấp
    <select aria-label="Bằng cấp của ứng viên" value={value} onChange={event => onChange(event.target.value)} className={`${fieldClass} mt-1`}>
      <option value="">Chưa có thông tin</option>
      {CV_EDUCATION_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
    </select>
  </label>;
}
