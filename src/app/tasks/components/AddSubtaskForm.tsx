'use client';

import React, { useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';

interface AddSubtaskFormProps {
  onSubmit: (data: {
    title: string;
    description?: string;
    assigned_to?: string;
    assigned_to_name?: string;
    due_date?: string;
  }) => Promise<void>;
  onCancel: () => void;
  users?: Array<{ id: string; name: string }>;
  loading?: boolean;
}

export default function AddSubtaskForm({
  onSubmit,
  onCancel,
  users = [],
  loading = false,
}: AddSubtaskFormProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_to: '',
    assigned_to_name: '',
    due_date: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Tiêu đề là bắt buộc';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        assigned_to: formData.assigned_to || undefined,
        assigned_to_name: formData.assigned_to_name || undefined,
        due_date: formData.due_date || undefined,
      });

      // Reset form
      setFormData({
        title: '',
        description: '',
        assigned_to: '',
        assigned_to_name: '',
        due_date: '',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssigneeChange = (userId: string) => {
    const selectedUser = users.find((u) => u.id === userId);
    setFormData({
      ...formData,
      assigned_to: userId,
      assigned_to_name: selectedUser?.name || '',
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 p-4 rounded-lg border border-line bg-hover"
    >
      {/* Title Input */}
      <div>
        <input
          type="text"
          placeholder="Tiêu đề subtask..."
          value={formData.title}
          onChange={(e) => {
            setFormData({ ...formData, title: e.target.value });
            if (errors.title) setErrors({ ...errors, title: '' });
          }}
          className={`w-full px-3 py-2 rounded-lg bg-hover border text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 transition-colors ${
            errors.title
              ? 'border-red-500 focus:ring-red-500'
              : 'border-line focus:ring-indigo-500'
          }`}
          disabled={submitting || loading}
        />
        {errors.title && (
          <p className="text-xs text-red-400 mt-1">{errors.title}</p>
        )}
      </div>

      {/* Description Input */}
      <textarea
        placeholder="Mô tả (tùy chọn)..."
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        className="w-full px-3 py-2 rounded-lg bg-hover border border-line text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 resize-none"
        rows={2}
        disabled={submitting || loading}
      />

      {/* Assignee Select */}
      {users.length > 0 && (
        <select
          value={formData.assigned_to}
          onChange={(e) => handleAssigneeChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-hover border border-line text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
          disabled={submitting || loading}
        >
          <option value="">Giao cho...</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      )}

      {/* Due Date Input */}
      <DateInputVN
        value={formData.due_date}
        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
        className="w-full px-3 py-2 rounded-lg bg-hover border border-line text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
        disabled={submitting || loading}
      />

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
              Đang thêm...
            </>
          ) : (
            <>
              <Plus size={16} />
              Thêm
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
