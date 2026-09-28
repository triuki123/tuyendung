'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, Calendar, Bell } from 'lucide-react';

interface QuickStatsProps {
  ticketsCount: number;
  tasksCount: number;
  roomBookingsCount: number;
  upcomingDeadline?: any;
}

export default function UserQuickStats({
  ticketsCount,
  tasksCount,
  roomBookingsCount,
  upcomingDeadline,
}: QuickStatsProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const stats = [
    {
      label: 'Tickets Chưa Hoàn Thành',
      value: ticketsCount,
      icon: AlertCircle,
      textColor: 'text-red-500',
      iconBg: 'bg-red-500/15',
      borderColor: 'border-red-500/30',
    },
    {
      label: 'Tasks Chưa Hoàn Thành',
      value: tasksCount,
      icon: CheckCircle2,
      textColor: 'text-blue-500',
      iconBg: 'bg-blue-500/15',
      borderColor: 'border-blue-500/30',
    },
    {
      label: 'Phòng Họp Sắp Tới',
      value: roomBookingsCount,
      icon: Calendar,
      textColor: 'text-purple-500',
      iconBg: 'bg-purple-500/15',
      borderColor: 'border-purple-500/30',
    },
    {
      label: 'Deadline Sắp Tới',
      value: upcomingDeadline ? formatDate(upcomingDeadline.due_date || upcomingDeadline.updated_at) : '—',
      icon: Bell,
      textColor: 'text-amber-500',
      iconBg: 'bg-amber-500/15',
      borderColor: 'border-amber-500/30',
      isDate: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className={`bg-card rounded-lg border ${stat.borderColor} p-4 sm:p-6`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                  {stat.label}
                </p>
                <p className={`text-2xl sm:text-3xl font-bold ${stat.textColor}`}>
                  {stat.value}
                </p>
              </div>
              <div className={`${stat.iconBg} ${stat.textColor} p-2 sm:p-3 rounded-lg`}>
                <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
