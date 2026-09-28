'use client';

import React, { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Clock, Loader2, CheckCircle, XCircle, GripHorizontal
} from 'lucide-react';
import { TASK_STATUS_CONFIG, formatTaskDeadlineStatus } from '@/lib/constants/taskConstants';
import { markTaskInProgress, markTaskDone } from '@/lib/services/taskActionService';
import { useToast } from '@/context/ToastContext';

interface Task {
  id: string;
  code?: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to_name: string;
  due_date: string;
}

interface KanbanBoardProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: string, newStatus: Task['status']) => void;
}

// Draggable Card Component
function KanbanCard({ task, isDragging }: { task: Task; isDragging?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const priorityColor = {
    low: 'text-ink-muted',
    medium: 'text-amber-400',
    high: 'text-orange-400',
  }[task.priority];

  const priorityBg = {
    low: 'bg-slate-500/20',
    medium: 'bg-amber-500/20',
    high: 'bg-orange-500/20',
  }[task.priority];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        bg-slate-800/50 border border-slate-700 rounded-lg p-3
        cursor-grab active:cursor-grabbing
        hover:border-slate-600 transition-colors
        ${isDragging ? 'shadow-lg shadow-indigo-600/20 ring-2 ring-indigo-500' : ''}
      `}
    >
      <div className="flex items-start gap-2 mb-2">
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 mt-0.5 text-ink-faint hover:text-ink-bright transition-colors"
        >
          <GripHorizontal size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-600 text-ink-muted mb-1">{task.code || 'T-???'}</p>
          <p className="text-sm font-500 text-foreground break-words line-clamp-2">{task.title}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span
          className={`h-2 w-2 rounded-full flex-shrink-0 ${
            task.priority === 'high'
              ? 'bg-orange-400'
              : task.priority === 'medium'
              ? 'bg-amber-400'
              : 'bg-slate-400'
          }`}
        />
        <span className={`text-xs font-500 ${priorityColor} ${priorityBg} px-2 py-0.5 rounded`}>
          {task.priority === 'high' ? 'Cao' : task.priority === 'medium' ? 'Trung bình' : 'Thấp'}
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-ink-muted">
          <span className="flex-1 truncate">{task.assigned_to_name}</span>
        </div>
        <div className="text-ink-faint">
          {formatTaskDeadlineStatus(task.due_date)}
        </div>
      </div>
    </div>
  );
}

// Droppable Column Component
function KanbanColumn({
  statusKey,
  statusConfig,
  tasks,
  onTaskClick,
  isOverlay,
}: {
  statusKey: string;
  statusConfig: any;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  isOverlay?: boolean;
}) {
  const { setNodeRef, isOver } = useSortable({
    id: statusKey,
    data: { type: 'Column' },
  });

  const tasksInColumn = tasks.filter(t => t.status === statusKey);

  return (
    <div
      ref={setNodeRef}
      className={`
        bg-slate-900/50 rounded-xl p-4 min-h-[500px]
        border border-slate-700/50 transition-colors
        ${isOver && !isOverlay ? 'border-indigo-500/50 bg-indigo-500/5' : ''}
      `}
    >
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700/50">
        <statusConfig.icon className={statusConfig.color} size={18} />
        <h3 className={`text-sm font-600 ${statusConfig.color}`}>
          {statusConfig.label}
        </h3>
        <span className="ml-auto text-xs font-600 text-ink-muted bg-slate-700/30 px-2 py-1 rounded">
          {tasksInColumn.length}
        </span>
      </div>

      <SortableContext items={tasksInColumn.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasksInColumn.length === 0 ? (
            <div className="text-center py-8 text-ink-faint text-sm">
              Không có công việc
            </div>
          ) : (
            tasksInColumn.map(task => (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="cursor-pointer"
              >
                <KanbanCard task={task} />
              </div>
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default function KanbanBoard({
  tasks,
  onTaskClick,
  onStatusChange,
}: KanbanBoardProps) {
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as Task['status'];

    // Only update if status actually changed
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    setUpdating(taskId);

    try {
      if (newStatus === 'in_progress') {
        await markTaskInProgress(taskId, task as any);
      } else if (newStatus === 'done') {
        await markTaskDone(taskId, task as any);
      }

      onStatusChange(taskId, newStatus);
    } catch (err) {
      console.error('Error updating task status:', err);
      toast.error('Không thể cập nhật trạng thái công việc. Vui lòng thử lại.');
    } finally {
      setUpdating(null);
    }
  };

  const activeTask = tasks.find(t => t.id === activeId);

  return (
    <DndContext
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
      onDragStart={(event) => setActiveId(event.active.id as string)}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(TASK_STATUS_CONFIG).map(([statusKey, statusConfig]) => (
          <KanbanColumn
            key={statusKey}
            statusKey={statusKey}
            statusConfig={statusConfig}
            tasks={tasks}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <KanbanCard task={activeTask} isDragging={true} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
