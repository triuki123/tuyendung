'use client';

import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { FormFieldDef, OrgData } from './onboardingTypes';

const inputCls =
  'w-full h-11 px-3.5 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 placeholder:text-muted-foreground/50';

interface Props {
  field: FormFieldDef;
  value: any;
  org: OrgData;
  values: Record<string, any>;
  error?: string;
  onChange: (key: string, value: any) => void;
}

/** Render một field theo cấu hình — text/email/date/select/number/textarea/tel/org. */
export default function OnboardingField({ field, value, org, values, error, onChange }: Props) {
  const [showHelp, setShowHelp] = useState(false);

  const label = (
    <label className="flex items-center gap-1.5 text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">
      {field.label}
      {field.required && <span className="text-red-400">*</span>}
      {field.help_text && (
        <span className="relative inline-flex">
          <button
            type="button"
            onClick={() => setShowHelp(v => !v)}
            onBlur={() => setTimeout(() => setShowHelp(false), 200)}
            className="text-indigo-400 hover:text-indigo-300"
            aria-label={`Hướng dẫn ${field.label}`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
          {showHelp && (
            <span className="absolute left-5 top-0 z-20 w-64 rounded-xl border border-line p-3 text-2xs normal-case font-400 tracking-normal text-foreground shadow-xl"
              style={{ background: 'var(--card)' }}>
              {field.help_text}
            </span>
          )}
        </span>
      )}
    </label>
  );

  const err = error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null;

  if (field.field_type === 'org') {
    let options: { id: string; name: string }[] = [];
    let disabled = false;
    let placeholder = `-- Chọn ${field.label.toLowerCase()} --`;

    if (field.field_key === 'company_id') {
      options = org.companies;
    } else if (field.field_key === 'department_id') {
      options = org.departments.filter(d => d.company_id === values.company_id && !d.parent_department_id);
      disabled = !values.company_id;
      if (disabled) placeholder = '-- Chọn công ty trước --';
    } else if (field.field_key === 'sub_department_id') {
      options = org.subDepartments.filter(s => s.department_id === values.department_id);
      disabled = !values.department_id || options.length === 0;
      if (!values.department_id) placeholder = '-- Chọn phòng ban trước --';
      else if (options.length === 0) placeholder = '-- Phòng ban không có bộ phận --';
    } else if (field.field_key === 'position_id') {
      options = org.positions.filter(p => p.company_id === values.company_id);
      disabled = !values.company_id;
      if (disabled) placeholder = '-- Chọn công ty trước --';
    }

    return (
      <div>
        {label}
        <select
          value={value || ''}
          disabled={disabled}
          onChange={e => onChange(field.field_key, e.target.value)}
          className={`${inputCls} disabled:opacity-50 ${error ? 'border-red-500/60' : ''}`}
        >
          <option value="">{placeholder}</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {err}
      </div>
    );
  }

  if (field.field_type === 'select') {
    return (
      <div>
        {label}
        <select
          value={value || ''}
          onChange={e => onChange(field.field_key, e.target.value)}
          className={`${inputCls} ${error ? 'border-red-500/60' : ''}`}
        >
          <option value="">-- Chọn --</option>
          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {err}
      </div>
    );
  }

  if (field.field_type === 'checkbox') {
    const checked = value === true;
    return (
      <div className="sm:col-span-2">
        <button
          type="button"
          onClick={() => onChange(field.field_key, !checked)}
          className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${
            checked ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-line bg-hover hover:border-line-strong'
          }`}
        >
          <span className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
            checked ? 'border-indigo-400 bg-indigo-500' : 'border-white/30'
          }`}>
            {checked && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
              </svg>
            )}
          </span>
          <span className="text-sm text-foreground">{field.label}</span>
        </button>
        {err}
      </div>
    );
  }

  if (field.field_type === 'textarea') {
    return (
      <div className="sm:col-span-2">
        {label}
        <textarea
          value={value || ''}
          onChange={e => onChange(field.field_key, e.target.value)}
          rows={2}
          className={`w-full px-3.5 py-2.5 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none placeholder:text-muted-foreground/50 ${error ? 'border-red-500/60' : ''}`}
          placeholder={field.label}
        />
        {err}
      </div>
    );
  }

  const typeMap: Record<string, string> = { email: 'email', date: 'date', number: 'number', tel: 'tel' };
  return (
    <div>
      {label}
      <input
        type={typeMap[field.field_type] || 'text'}
        value={value ?? ''}
        min={field.field_type === 'number' ? 0 : undefined}
        onChange={e => onChange(field.field_key, e.target.value)}
        className={`${inputCls} ${error ? 'border-red-500/60' : ''}`}
        placeholder={field.field_type === 'date' ? '' : field.label}
      />
      {err}
    </div>
  );
}
