'use client';

import React, { useState, useRef } from 'react';
import { Eye, Edit2, Trash2, Check, X, Loader2, ChevronRight, Archive, RotateCcw } from 'lucide-react';
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, formatTaskDeadlineStatus } from '@/lib/constants/taskConstants';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import UserAvatar from '@/components/UserAvatar';

interface Task {
  id: string;
  code?: string;
  task_code?: string | null;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to: string;
  assigned_to_name: string;
  created_by: string;
  due_date: string;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  related_asset?: string;
}

interface TaskCardProps {
  task: Task;
  isSelected?: boolean;
  onSelect?: (task: Task) => void;
  onCheckboxChange?: (taskId: string, checked: boolean) => void;
  onQuickDone?: (task: Task) => Promise<void>;
  onQuickProgress?: (task: Task) => Promise<void>;
  onView?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => Promise<void>;
  onArchive?: (task: Task) => Promise<void>;
  onUnarchive?: (task: Task) => Promise<void>;
  loading?: boolean;
  completing?: boolean;
  progressing?: boolean;
  deleting?: boolean;
  // 🔐 Permission flags
  canEdit?: boolean;
  canDelete?: boolean;
}

const PRIORITY_DOT_COLORS = {
  low: '#6B7280',      // Gray
  medium: '#EAB308',   // Yellow
  high: '#F97316',     // Orange
};

export default function TaskCard({
  task,
  isSelected = false,
  onSelect,
  onCheckboxChange,
  onQuickDone,
  onQuickProgress,
  onView,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  loading = false,
  completing = false,
  progressing = false,
  deleting = false,
  canEdit = true, // Default to true for backward compatibility
  canDelete = true, // Default to true for backward compatibility
}: TaskCardProps) {
  const p = TASK_PRIORITY_CONFIG[task.priority];
  const s = TASK_STATUS_CONFIG[task.status];
  const [expandedActions, setExpandedActions] = useState(false);

  const priorityDotColor = PRIORITY_DOT_COLORS[task.priority];
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeAction, setSwipeAction] = useState<'progress' | 'done' | null>(null);

  const isPending = task.status === 'todo';
  const isInProgress = task.status === 'in_progress';
  const canProgress = isPending;
  const canComplete = isPending || isInProgress;

  // Swipe gesture handlers
  const { onTouchStart, onTouchEnd } = useSwipeGesture({
    onSwipeLeft: () => {
      if (canComplete && onQuickDone) {
        setSwipeAction('done');
        setTimeout(() => {
          onQuickDone(task);
          setSwipeAction(null);
        }, 150);
      }
    },
    onSwipeRight: () => {
      if (canProgress && onQuickProgress) {
        setSwipeAction('progress');
        setTimeout(() => {
          onQuickProgress(task);
          setSwipeAction(null);
        }, 150);
      }
    },
    threshold: 40,
  });

  return (
    <div
      ref={cardRef}
      className={`rounded-lg border transition-all duration-200 p-2 space-y-1.5 cursor-pointer relative overflow-hidden group ${
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20'
          : 'border-line bg-hover hover:border-line-strong hover:bg-white/8 shadow-sm'
      } ${swipeAction === 'progress' ? 'bg-amber-500/20 border-amber-500' : ''} ${
        swipeAction === 'done' ? 'bg-emerald-500/20 border-emerald-500' : ''
      }`}
      onClick={() => onSelect?.(task)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Swipe Action Indicators */}
      {(canProgress || canComplete) && (
        <>
          {/* Swipe Right Indicator - Progress */}
          {canProgress && (
            <div
              className={`absolute inset-0 left-0 right-auto rounded-lg bg-gradient-to-r from-amber-500/20 to-transparent flex items-center justify-start pl-4 transition-all duration-300 pointer-events-none ${
                swipeAction === 'progress' ? 'w-full' : 'w-0'
              }`}
            >
              <Loader2 size={20} className="text-amber-400" />
            </div>
          )}

          {/* Swipe Left Indicator - Done */}
          {canComplete && (
            <div
              className={`absolute inset-0 right-0 left-auto rounded-lg bg-gradient-to-l from-emerald-500/20 to-transparent flex items-center justify-end pr-4 transition-all duration-300 pointer-events-none ${
                swipeAction === 'done' ? 'w-full' : 'w-0'
              }`}
            >
              <Check size={20} className="text-emerald-400" />
            </div>
          )}
        </>
      )}

      {/* Card Content */}
      <div className="relative z-10">
        {/* Header: Checkbox + Priority Dot + Code + Title */}
        <div className="flex items-start gap-1.5">
          {/* Checkbox */}
          <div className="flex-shrink-0 pt-0.5">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onCheckboxChange?.(task.id, e.target.checked);
              }}
              className="w-3 h-3 rounded border-line-strong accent-indigo-500 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Priority Dot + Code + Title */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1">
              {/* Priority Dot */}
              <div
                className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1"
                style={{ backgroundColor: priorityDotColor }}
                title={p.label}
              />

              {/* Code + Title */}
              <div className="flex-1 min-w-0">
                <p className="text-2xs text-muted-foreground font-mono font-600 leading-tight">
                  {task.task_code || task.code || 'N/A'}
                </p>
                <p className="text-xs font-600 text-foreground line-clamp-1">{task.title}</p>
              </div>
            </div>
          </div>

          {/* Expand Button */}
          <button
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedActions(!expandedActions);
            }}
          >
            <ChevronRight size={14} className={`transition-transform ${expandedActions ? 'rotate-90' : ''}`} />
          </button>
        </div>

        {/* Meta Row: Priority Badge + Status Badge */}
        <div className="flex items-center gap-1 flex-wrap">
          {/* Priority Badge */}
          <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-2xs font-600 border ${p.bg} ${p.color}`}>
            {p.label}
          </span>

          {/* Status Badge */}
          <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-2xs font-600 border ${s.bg} ${s.color}`}>
            {s.label}
          </span>
        </div>

        {/* Info Row: Assignee + Deadline */}
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <div className="flex items-center gap-1 min-w-0">
            {task.assigned_to ? (
              <div className="flex items-center gap-1 min-w-0">
                <UserAvatar name={task.assigned_to_name} size="sm" />
                <span className="text-foreground font-500 line-clamp-1 max-w-[80px] text-2xs">
                  {task.assigned_to_name}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground italic text-2xs">Chưa giao</span>
            )}
          </div>

          {/* Deadline */}
          <span className="text-muted-foreground text-2xs">{formatTaskDeadlineStatus(task.due_date)}</span>
        </div>

        {/* Actions - Quick Complete/Progress or All Actions */}
        <div className="space-y-1">
          {/* Quick Actions (Always visible for pending/in-progress) */}
          {(canProgress || canComplete) && (
            <div className="flex gap-1">
              {canProgress && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickProgress?.(task);
                  }}
                  disabled={progressing}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50 text-2xs font-600"
                >
                  {progressing ? <Loader2 size={12} className="animate-spin" /> : <Loader2 size={12} />}
                  Làm
                </button>
              )}
              {canComplete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickDone?.(task);
                  }}
                  disabled={completing}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 text-2xs font-600"
                >
                  {completing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Xong
                </button>
              )}
            </div>
          )}

          {/* All Actions (Expandable) */}
          {expandedActions && (
            <div className="grid grid-cols-4 gap-1 pt-1 border-t border-line-subtle">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onView?.(task);
                }}
                className="flex items-center justify-center gap-0.5 px-1 py-1 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-300 hover:bg-blue-500/30 transition-colors text-2xs font-600"
                title="Xem"
              >
                <Eye size={11} />
                Xem
              </button>
              {/* Edit Button - with permission check */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (canEdit) onEdit?.(task);
                }}
                disabled={!canEdit || deleting}
                className={`flex items-center justify-center gap-0.5 px-1 py-1 rounded-lg text-2xs font-600 transition-colors ${
                  canEdit
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                    : 'bg-slate-500/10 border border-slate-500/30 text-ink-faint cursor-not-allowed'
                } disabled:opacity-50`}
                title={canEdit ? 'Sửa' : 'Bạn không có quyền chỉnh sửa task này'}
              >
                <Edit2 size={11} />
                Sửa
              </button>

              {/* Archive/Unarchive Button */}
              {task.archived_at ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnarchive?.(task);
                  }}
                  disabled={deleting}
                  className="flex items-center justify-center gap-0.5 px-1 py-1 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50 text-2xs font-600"
                  title="Khôi phục"
                >
                  {deleting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                  Khôi
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive?.(task);
                  }}
                  disabled={deleting}
                  className="flex items-center justify-center gap-0.5 px-1 py-1 rounded-lg bg-slate-500/20 border border-slate-500/50 text-ink-bright hover:bg-slate-500/30 transition-colors disabled:opacity-50 text-2xs font-600"
                  title="Lưu trữ"
                >
                  {deleting ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />}
                  Lưu
                </button>
              )}

              {/* Delete Button - with permission check */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (canDelete) onDelete?.(task);
                }}
                disabled={!canDelete || deleting}
                className={`flex items-center justify-center gap-0.5 px-1 py-1 rounded-lg text-2xs font-600 transition-colors ${
                  canDelete
                    ? 'bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30'
                    : 'bg-slate-500/10 border border-slate-500/30 text-ink-faint cursor-not-allowed'
                } disabled:opacity-50`}
                title={canDelete ? 'Xóa' : 'Bạn không có quyền xóa task này'}
              >
                {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Xóa
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
