'use client';

import React, { useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Task {
  id: string;
  code?: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to_name: string;
  start_date?: string;
  due_date: string;
  parent_task_id?: string;
}

interface GanttViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function getDateRange(tasks: Task[]) {
  let minDate = new Date();
  let maxDate = new Date();

  tasks.forEach(task => {
    const startDate = task.start_date ? new Date(task.start_date) : new Date(task.due_date);
    const dueDate = new Date(task.due_date);

    if (startDate < minDate) minDate = startDate;
    if (dueDate > maxDate) maxDate = dueDate;
  });

  // Add 1 week buffer
  minDate.setDate(minDate.getDate() - 7);
  maxDate.setDate(maxDate.getDate() + 7);

  return { minDate, maxDate };
}

function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((date2.getTime() - date1.getTime()) / oneDay);
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'done':
      return 'bg-emerald-500';
    case 'in_progress':
      return 'bg-amber-500';
    case 'cancelled':
      return 'bg-red-500/50';
    default:
      return 'bg-slate-500';
  }
}

export default function GanttView({ tasks, onTaskClick }: GanttViewProps) {
  const { minDate, maxDate } = useMemo(() => getDateRange(tasks), [tasks]);
  const totalDays = daysBetween(minDate, maxDate);
  const pixelsPerDay = 20;
  const totalWidth = totalDays * pixelsPerDay;

  // Build hierarchy
  const parentTasks = tasks.filter(t => !t.parent_task_id);
  const childTasksMap = new Map<string, Task[]>();
  tasks.forEach(task => {
    if (task.parent_task_id) {
      if (!childTasksMap.has(task.parent_task_id)) {
        childTasksMap.set(task.parent_task_id, []);
      }
      childTasksMap.get(task.parent_task_id)!.push(task);
    }
  });

  const renderTask = (task: Task, indent: number = 0) => {
    const startDate = task.start_date ? new Date(task.start_date) : new Date(task.due_date);
    const dueDate = new Date(task.due_date);

    const startOffset = daysBetween(minDate, startDate) * pixelsPerDay;
    const duration = daysBetween(startDate, dueDate) * pixelsPerDay || pixelsPerDay;
    const children = childTasksMap.get(task.id) || [];

    return (
      <div key={task.id}>
        {/* Task Row */}
        <div className="flex h-12 border-b border-slate-700/50">
          {/* Left Panel */}
          <div className="w-48 flex-shrink-0 bg-slate-900/30 border-r border-slate-700/50 px-3 py-2 flex items-center gap-2 overflow-hidden">
            <div style={{ marginLeft: `${indent * 16}px` }} className="flex-shrink-0">
              {children.length > 0 && (
                <ChevronRight size={14} className="text-ink-faint" />
              )}
            </div>
            <button
              onClick={() => onTaskClick(task)}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-xs font-600 text-ink-muted truncate">{task.code || 'T-???'}</p>
              <p className="text-xs text-foreground truncate hover:text-indigo-400 transition-colors">
                {task.title}
              </p>
            </button>
          </div>

          {/* Timeline */}
          <div className="flex-1 relative bg-slate-900/50 overflow-hidden">
            {/* Task Bar */}
            <div
              style={{
                left: `${startOffset}px`,
                width: `${Math.max(duration, 4)}px`,
              }}
              className={`
                absolute h-7 top-2.5 rounded transition-all cursor-pointer
                hover:shadow-lg hover:shadow-indigo-600/30
                ${getStatusColor(task.status)}
                border border-line-strong
              `}
              onClick={() => onTaskClick(task)}
              title={`${startDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${dueDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
            />
          </div>
        </div>

        {/* Child Tasks */}
        {children.length > 0 && children.map(child => renderTask(child, indent + 1))}
      </div>
    );
  };

  // Generate date headers
  const dateHeaders: Date[] = [];
  const current = new Date(minDate);
  while (current <= maxDate) {
    dateHeaders.push(new Date(current));
    current.setDate(current.getDate() + 7); // Weekly labels
  }

  return (
    <div className="bg-slate-900/30 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Headers */}
      <div className="flex border-b border-slate-700/50">
        {/* Left Panel Header */}
        <div className="w-48 flex-shrink-0 bg-slate-800/50 border-r border-slate-700/50 px-3 py-3">
          <p className="text-xs font-600 text-ink-muted">CÔNG VIỆC</p>
        </div>

        {/* Timeline Header */}
        <div className="flex-1 bg-slate-800/50 overflow-hidden">
          <div style={{ width: `${totalWidth}px` }} className="flex h-12 border-b border-slate-700/50">
            {dateHeaders.map((date, idx) => (
              <div
                key={idx}
                style={{ width: `${7 * pixelsPerDay}px` }}
                className="border-r border-slate-700/30 px-2 py-2 flex items-center"
              >
                <span className="text-xs font-500 text-ink-muted">
                  {date.toLocaleDateString('vi-VN', {
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="overflow-x-auto">
        <div className="flex">
          {/* Left Panel */}
          <div className="w-48 flex-shrink-0">
            {parentTasks.map(task => renderTask(task))}
          </div>

          {/* Timeline */}
          <div style={{ width: `${totalWidth}px` }} className="relative bg-gradient-to-r from-slate-900/20 to-slate-900/10">
            {/* Grid Background */}
            {dateHeaders.map((_, idx) => (
              <div
                key={idx}
                style={{
                  left: `${idx * 7 * pixelsPerDay}px`,
                  width: `${7 * pixelsPerDay}px`,
                }}
                className="absolute top-0 bottom-0 border-r border-slate-700/20"
              />
            ))}

            {/* Tasks */}
            <div>
              {parentTasks.map(task => renderTask(task))}
            </div>
          </div>
        </div>
      </div>

      {/* Info Bar */}
      <div className="bg-slate-800/30 border-t border-slate-700/50 px-4 py-2 text-xs text-ink-faint">
        <p>
          {tasks.length} công việc • Từ {minDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} đến{' '}
          {maxDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}
