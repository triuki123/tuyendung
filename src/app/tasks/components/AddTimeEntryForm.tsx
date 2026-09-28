'use client';

import React, { useState } from 'react';
import { X, Plus, Loader2, Clock } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';

interface Subtask {
  id: string;
  title: string;
}

interface AddTimeEntryFormProps {
  onSubmit: (data: {
    duration_minutes: number;
    date_worked: string;
    description?: string;
    is_billable: boolean;
    subtask_id?: string;
  }) => Promise<void>;
  onCancel: () => void;
  subtasks?: Subtask[];
  loading?: boolean;
}

export default function AddTimeEntryForm({
  onSubmit,
  onCancel,
  subtasks = [],
  loading = false,
}: AddTimeEntryFormProps) {
  const [formData, setFormData] = useState({
    hours: '',
    minutes: '',
    date_worked: new Date().toISOString().split('T')[0],
    description: '',
    is_billable: true,
    subtask_id: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const hours = parseInt(formData.hours || '0', 10);
    const minutes = parseInt(formData.minutes || '0', 10);
    const totalMinutes = hours * 60 + minutes;

    if (totalMinutes <= 0) {
      newErrors.duration = 'Thời gian phải > 0';
    }

    if (!formData.date_worked) {
      newErrors.date_worked = 'Ngày làm việc là bắt buộc';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    const hours = parseInt(formData.hours || '0', 10);
    const minutes = parseInt(formData.minutes || '0', 10);
    const duration_minutes = hours * 60 + minutes;

    setSubmitting(true);
    try {
      await onSubmit({
        duration_minutes,
        date_worked: formData.date_worked,
        description: formData.description.trim() || undefined,
        is_billable: formData.is_billable,
        subtask_id: formData.subtask_id || undefined,
      });

      // Reset form
      setFormData({
        hours: '',
        minutes: '',
        date_worked: new Date().toISOString().split('T')[0],
        description: '',
        is_billable: true,
        subtask_id: '',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 p-4 rounded-lg border border-line bg-hover"
    >
      {/* Time Duration Input */}
      <div>
        <label className="text-sm font-500 text-muted-foreground mb-2 block">
          Thời gian làm việc
        </label>
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="number"
              min="0"
              max="24"
              placeholder="Giờ"
              value={formData.hours}
              onChange={(e) => {
                setFormData({ ...formData, hours: e.target.value });
                if (errors.duration) setErrors({ ...errors, duration: '' });
              }}
              className={`w-full px-3 py-2 rounded-lg bg-hover border text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 transition-colors ${
                errors.duration
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-line focus:ring-indigo-500'
              }`}
              disabled={submitting || loading}
            />
            <span className="text-xs text-muted-foreground mt-1 block">h</span>
          </div>
          <div className="flex-1">
            <input
              type="number"
              min="0"
              max="59"
              placeholder="Phút"
              value={formData.minutes}
              onChange={(e) => {
                setFormData({ ...formData, minutes: e.target.value });
                if (errors.duration) setErrors({ ...errors, duration: '' });
              }}
              className={`w-full px-3 py-2 rounded-lg bg-hover border text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 transition-colors ${
                errors.duration
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-line focus:ring-indigo-500'
              }`}
              disabled={submitting || loading}
            />
            <span className="text-xs text-muted-foreground mt-1 block">min</span>
          </div>
        </div>
        {errors.duration && (
          <p className="text-xs text-red-400 mt-1">{errors.duration}</p>
        )}
      </div>

      {/* Date Input */}
      <div>
        <label className="text-sm font-500 text-muted-foreground mb-2 block">
          Ngày làm việc
        </label>
        <DateInputVN
          value={formData.date_worked}
          onChange={(e) => {
            setFormData({ ...formData, date_worked: e.target.value });
            if (errors.date_worked) setErrors({ ...errors, date_worked: '' });
          }}
          className={`w-full px-3 py-2 rounded-lg bg-hover border text-sm focus:outline-none focus:ring-2 transition-colors ${
            errors.date_worked
              ? 'border-red-500 focus:ring-red-500'
              : 'border-line focus:ring-indigo-500'
          }`}
          disabled={submitting || loading}
        />
        {errors.date_worked && (
          <p className="text-xs text-red-400 mt-1">{errors.date_worked}</p>
        )}
      </div>

      {/* Description Input */}
      <div>
        <label className="text-sm font-500 text-muted-foreground mb-2 block">
          Ghi chú (tùy chọn)
        </label>
        <textarea
          placeholder="Ví dụ: Phát triển API, code review..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-hover border border-line text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 resize-none"
          rows={2}
          disabled={submitting || loading}
        />
      </div>

      {/* Subtask Select */}
      {subtasks.length > 0 && (
        <div>
          <label className="text-sm font-500 text-muted-foreground mb-2 block">
            Subtask (tùy chọn)
          </label>
          <select
            value={formData.subtask_id}
            onChange={(e) => setFormData({ ...formData, subtask_id: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-hover border border-line text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
            disabled={submitting || loading}
          >
            <option value="">Không (chính task)</option>
            {subtasks.map((subtask) => (
              <option key={subtask.id} value={subtask.id}>
                {subtask.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Billable Checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_billable"
          checked={formData.is_billable}
          onChange={(e) => setFormData({ ...formData, is_billable: e.target.checked })}
          className="w-4 h-4 rounded border-line bg-hover focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          disabled={submitting || loading}
        />
        <label
          htmlFor="is_billable"
          className="text-sm font-500 text-muted-foreground cursor-pointer flex items-center gap-1"
        >
          <Clock size={14} />
          Thời gian tính phí
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting || loading}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Đang lưu...
            </>
          ) : (
            <>
              <Plus size={16} />
              Lưu
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting || loading}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-line hover:border-line-strong hover:bg-hover text-sm font-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X size={16} />
          Hủy
        </button>
      </div>
    </form>
  );
}
