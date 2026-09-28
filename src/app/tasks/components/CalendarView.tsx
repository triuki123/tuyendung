'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface Task {
  id: string;
  code?: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to_name: string;
  due_date: string;
}

interface CalendarViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getFirstDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function isOverdue(dueDate: string, today: Date): boolean {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function isDeadlineToday(dueDate: string, today: Date): boolean {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return isSameDay(due, today);
}

export default function CalendarView({ tasks, onTaskClick }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  useEscapeKey(() => setExpandedDay(null), expandedDay !== null);

  const today = new Date();
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const days: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthName = currentDate.toLocaleDateString('vi-VN', {
    month: 'long',
    year: 'numeric',
  });

  const getPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    setExpandedDay(null);
  };

  const getNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    setExpandedDay(null);
  };

  const getTasksForDay = (day: number) => {
    const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return tasks.filter(task => {
      if (!task.due_date) return false;
      const dueDate = new Date(task.due_date);
      return isSameDay(dayDate, dueDate);
    });
  };

  const getDayStatus = (day: number) => {
    const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dayTasks = getTasksForDay(day);

    if (dayTasks.length === 0) return null;

    if (isToday(dayDate)) return 'today';
    if (isOverdue(tasks[0]?.due_date || '', dayDate)) return 'overdue';
    return 'future';
  };

  const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  return (
    <div className="bg-slate-900/30 rounded-xl border border-slate-700/50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-700 text-foreground">{monthName}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={getPreviousMonth}
            className="h-9 w-9 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 flex items-center justify-center transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={getNextMonth}
            className="h-9 w-9 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 flex items-center justify-center transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {weekdays.map(day => (
          <div key={day} className="text-center text-xs font-600 text-ink-muted py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, idx) =>
          day === null ? (
            <div key={`empty-${idx}`} className="aspect-square" />
          ) : (
            <div
              key={day}
              className={`
                aspect-square rounded-lg border transition-colors cursor-pointer
                ${isToday(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-700 bg-slate-800/30 hover:bg-slate-800/50'
                }
              `}
              onClick={() =>
                setExpandedDay(expandedDay === day ? null : day)
              }
            >
              <div className="h-full p-1.5 flex flex-col">
                <div className="text-xs font-600 text-foreground mb-1">{day}</div>
                <div className="flex-1 overflow-hidden space-y-0.5">
                  {getTasksForDay(day)
                    .slice(0, 2)
                    .map(task => (
                      <div
                        key={task.id}
                        onClick={e => {
                          e.stopPropagation();
                          onTaskClick(task);
                        }}
                        className={`
                          text-xs px-1 py-0.5 rounded truncate cursor-pointer
                          transition-colors hover:opacity-80
                          ${
                            task.priority === 'high'
                              ? 'bg-orange-500/30 text-orange-300'
                              : task.priority === 'medium'
                              ? 'bg-amber-500/30 text-amber-300'
                              : 'bg-slate-600/30 text-ink-bright'
                          }
                        `}
                      >
                        {task.title}
                      </div>
                    ))}
                  {getTasksForDay(day).length > 2 && (
                    <div className="text-xs text-ink-muted px-1">
                      +{getTasksForDay(day).length - 2}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Day Popover */}
      {expandedDay !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setExpandedDay(null)}>
          <div className="bg-slate-900 border border-line rounded-xl p-6 max-w-md w-full max-h-96 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-600 text-foreground">
                {new Date(currentDate.getFullYear(), currentDate.getMonth(), expandedDay).toLocaleDateString('vi-VN', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </h3>
              <button
                onClick={() => setExpandedDay(null)}
                className="text-ink-muted hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>

            {getTasksForDay(expandedDay).length === 0 ? (
              <div className="text-center py-8">
                <Inbox size={32} className="mx-auto mb-2 text-ink-faint/30" />
                <p className="text-sm text-ink-muted">Không có công việc nào</p>
              </div>
            ) : (
              <div className="space-y-2">
                {getTasksForDay(expandedDay).map(task => (
                  <button
                    key={task.id}
                    onClick={() => {
                      onTaskClick(task);
                      setExpandedDay(null);
                    }}
                    className={`
                      w-full text-left p-3 rounded-lg border transition-colors
                      hover:bg-slate-800/50 active:scale-95
                      ${
                        task.priority === 'high'
                          ? 'border-orange-500/30 bg-orange-500/5'
                          : task.priority === 'medium'
                          ? 'border-amber-500/30 bg-amber-500/5'
                          : 'border-slate-700 bg-slate-800/30'
                      }
                    `}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${
                        task.priority === 'high'
                          ? 'bg-orange-400'
                          : task.priority === 'medium'
                          ? 'bg-amber-400'
                          : 'bg-slate-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-500 text-foreground line-clamp-2">{task.title}</p>
                        <p className="text-xs text-ink-muted mt-1">{task.code || 'T-???'} • {task.assigned_to_name}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
