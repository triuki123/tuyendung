'use client';

import React, { useState } from 'react';
import { Edit2, Trash2, Loader2, Clock } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

interface TimeEntry {
  id: string;
  task_id: string;
  subtask_id?: string;
  user_id: string;
  user_name: string;
  duration_minutes: number;
  date_worked: string;
  description?: string;
  is_billable: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

interface TimeEntryCardProps {
  entry: TimeEntry;
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (entry: TimeEntry) => Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  updating?: boolean;
}

const durationToHours = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Hôm nay';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Hôm qua';
  }

  return date.toLocaleDateString('vi-VN', {
    month: 'short',
    day: 'numeric',
  });
};

export default function TimeEntryCard({
  entry,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
  deleting = false,
  updating = false,
}: TimeEntryCardProps) {
  const [showActions, setShowActions] = useState(false);

  const hours = durationToHours(entry.duration_minutes);
  const formattedDate = formatDate(entry.date_worked);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border border-line bg-hover hover:bg-white/8 transition-all"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Time Indicator */}
      <div className="flex-shrink-0">
        <Clock
          size={18}
          className={`${
            entry.is_billable ? 'text-emerald-400' : 'text-ink-muted'
          }`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header: Duration + Date */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-600 text-white">{hours}</span>
          <span className="text-xs text-muted-foreground">
            {formattedDate}
          </span>
          {entry.is_billable && (
            <span className="inline-block px-2 py-0.5 rounded text-xs font-500 bg-emerald-500/20 text-emerald-400">
              Tính phí
            </span>
          )}
        </div>

        {/* Description */}
        {entry.description && (
          <p className="text-sm text-muted-foreground truncate mt-1">
            {entry.description}
          </p>
        )}

        {/* User Info */}
        <div className="flex items-center gap-1 mt-2">
          <UserAvatar name={entry.user_name} size="xs" />
          <span className="text-xs text-muted-foreground">
            {entry.user_name}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="flex-shrink-0 flex gap-1">
          {canEdit && (
            <button
              onClick={() => onEdit?.(entry)}
              disabled={deleting}
              className="p-1 text-amber-400 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
              title="Sửa"
            >
              <Edit2 size={16} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete?.(entry)}
              disabled={deleting}
              className="p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
              title="Xóa"
            >
              {deleting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
