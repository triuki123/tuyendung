'use client';

import React, { useState, useCallback } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import SubtaskCard from './SubtaskCard';

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

interface SubtasksListProps {
  subtasks: Subtask[];
  completion: {
    total: number;
    done: number;
    percentage: number;
  };
  onEdit?: (subtask: Subtask) => void;
  onDelete?: (subtask: Subtask) => Promise<void>;
  onStatusChange?: (subtask: Subtask, newStatus: Subtask['status']) => Promise<void>;
  onReorder?: (subtaskIds: string[]) => Promise<void>;
  onAddNew?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  loading?: boolean;
}

export default function SubtasksList({
  subtasks,
  completion,
  onEdit,
  onDelete,
  onStatusChange,
  onReorder,
  onAddNew,
  canEdit = true,
  canDelete = true,
  loading = false,
}: SubtasksListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, subtaskId: string) => {
    setDraggedId(subtaskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, subtaskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(subtaskId);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(null);

    if (!draggedId || !dragOverId || draggedId === dragOverId) {
      setDraggedId(null);
      return;
    }

    // Reorder subtasks
    const newOrder = [...subtasks];
    const draggedIndex = newOrder.findIndex((s) => s.id === draggedId);
    const overIndex = newOrder.findIndex((s) => s.id === dragOverId);

    if (draggedIndex !== -1 && overIndex !== -1) {
      const [dragged] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(overIndex, 0, dragged);

      const reorderedIds = newOrder.map((s) => s.id);
      await onReorder?.(reorderedIds);
    }

    setDraggedId(null);
  };

  const handleDelete = async (subtask: Subtask) => {
    setDeleting(subtask.id);
    try {
      await onDelete?.(subtask);
    } finally {
      setDeleting(null);
    }
  };

  const handleStatusChange = async (subtask: Subtask, newStatus: Subtask['status']) => {
    setUpdating(subtask.id);
    try {
      await onStatusChange?.(subtask, newStatus);
    } finally {
      setUpdating(null);
    }
  };

  const getProgressColor = () => {
    if (completion.percentage === 0) return 'bg-red-500';
    if (completion.percentage < 70) return 'bg-yellow-500';
    if (completion.percentage < 100) return 'bg-blue-500';
    return 'bg-emerald-500';
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-2 bg-hover-strong rounded animate-pulse" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-hover rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Completion Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-600 text-sm">Hoàn thành</h3>
          <span className="text-xs text-muted-foreground">
            {completion.done}/{completion.total} ({completion.percentage}%)
          </span>
        </div>
        <div className="h-3 rounded-full bg-hover-strong overflow-hidden">
          <div
            className={`h-full transition-all rounded-full ${getProgressColor()}`}
            style={{ width: `${completion.percentage}%` }}
          />
        </div>
      </div>

      {/* Subtasks List */}
      {subtasks.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <AlertCircle size={16} className="mr-2" />
          <span className="text-sm">Chưa có subtasks nào</span>
        </div>
      ) : (
        <div className="space-y-2">
          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              draggable
              onDragStart={(e) => handleDragStart(e, subtask.id)}
              onDragOver={(e) => handleDragOver(e, subtask.id)}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="cursor-move"
            >
              <SubtaskCard
                subtask={subtask}
                isDragging={draggedId === subtask.id}
                onEdit={onEdit}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                canEdit={canEdit}
                canDelete={canDelete}
                deleting={deleting === subtask.id}
                updating={updating === subtask.id}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add New Subtask Button */}
      {canEdit && (
        <button
          onClick={onAddNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-line hover:border-indigo-500 hover:bg-indigo-500/10 transition-colors text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus size={16} />
          Thêm subtask
        </button>
      )}
    </div>
  );
}
