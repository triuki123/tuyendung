'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Ticket } from '@/lib/types/ticket';

interface Task {
  id: string;
  code: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  due_date: string;
  progress?: number;
}

interface UserMyWorkProps {
  tickets: Ticket[];
  tasks: Task[];
  loading: boolean;
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'high':
      return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    case 'medium':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'low':
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    default:
      return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'in_progress':
    case 'in progress':
      return <Clock className="w-4 h-4" />;
    case 'done':
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    default:
      return <AlertCircle className="w-4 h-4" />;
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit' });
};

export default function UserMyWork({ tickets, tasks, loading }: UserMyWorkProps) {
  const openTickets = tickets.filter(t => !['resolved', 'closed'].includes(t.status));
  const openTasks = tasks.filter(t => t.status !== 'done');

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded" />
            <div className="h-3 bg-muted rounded" />
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded" />
            <div className="h-3 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Tickets */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-700 text-foreground mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Tickets Của Tôi
        </h2>
        <div className="space-y-3">
          {openTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Không có tickets chưa hoàn thành
            </p>
          ) : (
            openTickets.slice(0, 5).map(ticket => (
              <div
                key={ticket.id}
                className="bg-muted/50 rounded-lg p-3 border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {ticket.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ticket.code}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded border flex-shrink-0 ${getPriorityColor(
                      ticket.priority
                    )}`}
                  >
                    {ticket.priority}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs px-2 py-1 rounded bg-background text-muted-foreground">
                    {ticket.status}
                  </span>
                  {ticket.updated_at && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(ticket.updated_at)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Tasks */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-700 text-foreground mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          Tasks Của Tôi
        </h2>
        <div className="space-y-3">
          {openTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Không có tasks chưa hoàn thành
            </p>
          ) : (
            openTasks.slice(0, 5).map(task => (
              <div
                key={task.id}
                className="bg-muted/50 rounded-lg p-3 border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {task.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {task.code}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded border flex-shrink-0 ${getPriorityColor(
                      task.priority
                    )}`}
                  >
                    {task.priority}
                  </span>
                </div>
                {task.progress !== undefined && (
                  <div className="mb-2">
                    <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {task.progress}% hoàn thành
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs px-2 py-1 rounded bg-background text-muted-foreground">
                    {task.status}
                  </span>
                  {task.due_date && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(task.due_date)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
