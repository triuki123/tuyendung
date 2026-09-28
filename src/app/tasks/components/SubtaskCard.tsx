'use client';

import React, { useState } from 'react';
import { Edit2, Trash2, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { TASK_STATUS_CONFIG } from '@/lib/constants/taskConstants';

interface Subtask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  completion_percentage: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface SubtaskCardProps {
  subtask: Subtask;
  isDragging?: boolean;
  onEdit?: (subtask: Subtask) => void;
  onDelete?: (subtask: Subtask) => Promise<void>;
  onStatusChange?: (subtask: Subtask, newStatus: Subtask['status']) => Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  updating?: boolean;
}

const STATUS_ICONS = {
  todo: Circle,
  in_progress: Loader2,
  done: CheckCircle2,
  cancelled: Circle,
};

export default function SubtaskCard({
  subtask,
  isDragging = false,
  onEdit,
  onDelete,
  onStatusChange,
  canEdit = true,
  canDelete = true,
  deleting = false,
  updating = false,
}: SubtaskCardProps) {
  const [showActions, setShowActions] = useState(false);
  const statusConfig = TASK_STATUS_CONFIG[subtask.status];
  const StatusIcon = STATUS_ICONS[subtask.status];

  const handleStatusChange = async () => {
    if (!onStatusChange || updating) return;

    const nextStatus: Record<string, Subtask['status']> = {
      todo: 'in_progress',
      in_progress: 'done',
      done: 'cancelled',
      cancelled: 'todo',
    };

    await onStatusChange(subtask, nextStatus[subtask.status]);
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
        isDragging
          ? 'border-indigo-500 bg-indigo-500/10 shadow-lg'
          : 'border-line bg-hover hover:bg-white/8'
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Status Icon - Clickable to change status */}
      <button
        onClick={handleStatusChange}
        disabled={updating}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        title={`Thay đổi trạng thái (${subtask.status})`}
      >
        {updating ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <StatusIcon size={18} className={statusConfig.color} />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-500 truncate ${
            subtask.status === 'done' ? 'line-through text-muted-foreground' : ''
          }`}
        >
          {subtask.title}
        </p>
        {subtask.assigned_to_name && (
          <div className="flex items-center gap-1 mt-1">
            <UserAvatar name={subtask.assigned_to_name} size="xs" />
            <span className="text-xs text-muted-foreground">
              {subtask.assigned_to_name}
            </span>
          </div>
        )}
      </div>

      {/* Progress Indicator */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <div className="w-12 h-1 rounded-full bg-hover-strong overflow-hidden">
          <div
            className={`h-full transition-all ${
              subtask.completion_percentage === 0
                ? 'bg-red-500'
                : subtask.completion_percentage < 70
                ? 'bg-yellow-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${subtask.completion_percentage}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground w-6 text-right">
          {subtask.completion_percentage}%
        </span>
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="flex-shrink-0 flex gap-1">
          {canEdit && (
            <button
              onClick={() => onEdit?.(subtask)}
              disabled={deleting}
              className="p-1 text-amber-400 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
              title="Sửa"
            >
              <Edit2 size={16} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete?.(subtask)}
              disabled={deleting}
              className="p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
              title="Xóa"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
