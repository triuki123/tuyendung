'use client';

import React from 'react';
import { Activity, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';

interface UserRecentActivityProps {
  currentUser: any;
  tickets: any[];
  tasks: any[];
  bookings: any[];
}

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function UserRecentActivity({
  currentUser,
  tickets,
  tasks,
  bookings,
}: UserRecentActivityProps) {
  // Combine all activities and sort by date
  const activities = [
    ...tickets.map(t => ({
      type: 'ticket',
      id: t.id,
      title: `Ticket: ${t.title}`,
      status: t.status,
      icon: AlertCircle,
      date: t.updated_at || t.created_at,
      code: t.code,
    })),
    ...tasks.map(t => ({
      type: 'task',
      id: t.id,
      title: `Task: ${t.title}`,
      status: t.status,
      icon: CheckCircle2,
      date: t.created_at,
      code: t.code,
    })),
    ...bookings.map(b => ({
      type: 'booking',
      id: b.id,
      title: `Booking: ${b.room_name}`,
      status: b.status,
      icon: Calendar,
      date: b.created_at,
      code: b.room_name,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h2 className="text-lg font-700 text-foreground mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5" />
        Hoạt Động Gần Đây
      </h2>

      <div className="space-y-3">
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Không có hoạt động nào
          </p>
        ) : (
          activities.slice(0, 8).map((activity, index) => {
            const Icon = activity.icon;
            return (
              <div
                key={`${activity.type}-${activity.id}`}
                className="bg-muted/50 rounded-lg p-3 border border-border/50 flex items-start gap-3"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {activity.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDateTime(activity.date)}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-background text-muted-foreground flex-shrink-0">
                  {activity.status}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
