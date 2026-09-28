'use client';

import { forwardRef, SelectHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  options: { value: string | number; label: string }[];
  emptyLabel?: string;
}

const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, helperText, required, options, emptyLabel = '—', className, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}
        <select
          ref={ref}
          className={`
            w-full rounded-xl border px-3 py-2 text-sm text-foreground outline-none
            transition-colors duration-200
            bg-[var(--input)] border-line
            placeholder:text-muted-foreground
            focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500/50 focus:border-red-500' : ''}
            ${className || ''}
          `}
          {...props}
        >
          <option value="">{emptyLabel}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}
        {helperText && !error && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
    );
  }
);

SelectField.displayName = 'SelectField';
export default SelectField;
