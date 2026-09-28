'use client';

import React, { useState, useEffect } from 'react';
import { Clock, LogIn, Edit3, CheckCircle2, AlertCircle, User, Zap } from 'lucide-react';
import { Ticket } from '@/lib/types/ticket';

interface Activity {
  id: string;
  type: 'create' | 'update' | 'assign' | 'status_change' | 'priority_change' | 'comment' | 'category_change';
  user: string;
  description: string;
  timestamp: string;
  icon?: React.ReactNode;
  color?: string;
}

interface ActivityLogProps {
  ticket: Ticket;
}

export default function ActivityLog({ ticket }: ActivityLogProps) {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    // Generate activities based on ticket data
    const generatedActivities: Activity[] = [
      {
        id: '1',
        type: 'create',
        user: ticket.created_by_name,
        description: `tạo ticket ${ticket.code}`,
        timestamp: ticket.created_at,
        color: 'text-blue-400',
      },
    ];

    // Add assignment activity
    if (ticket.assigned_to_name) {
      generatedActivities.push({
        id: '2',
        type: 'assign',
        user: ticket.created_by_name,
        description: `giao ticket cho ${ticket.assigned_to_name}`,
        timestamp: new Date(new Date(ticket.created_at).getTime() + 3600000).toISOString(),
        color: 'text-indigo-400',
      });
    }

    // Add priority activity
    if (ticket.priority === 'critical') {
      generatedActivities.push({
        id: '3',
        type: 'priority_change',
        user: ticket.created_by_name,
        description: `đặt độ ưu tiên thành Khẩn cấp`,
        timestamp: new Date(new Date(ticket.created_at).getTime() + 7200000).toISOString(),
        color: 'text-red-400',
      });
    }

    // Add category activity
    if (ticket.support_category) {
      generatedActivities.push({
        id: '4',
        type: 'category_change',
        user: ticket.created_by_name,
        description: `phân loại vào ${ticket.support_category}`,
        timestamp: new Date(new Date(ticket.created_at).getTime() + 10800000).toISOString(),
        color: 'text-amber-400',
      });
    }

    // Add status activity
    if (ticket.status !== 'open') {
      generatedActivities.push({
        id: '5',
        type: 'status_change',
        user: ticket.created_by_name,
        description: `cập nhật trạng thái thành ${getStatusLabel(ticket.status)}`,
        timestamp: ticket.updated_at,
        color: 'text-emerald-400',
      });
    }

    // Sort by timestamp descending (most recent first)
    setActivities(generatedActivities.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
  }, [ticket]);

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      open: 'Mở',
      in_progress: 'Đang xử lý',
      resolved: 'Đã giải quyết',
      closed: 'Đóng',
    };
    return labels[status] || status;
  };

  const getActivityIcon = (type: Activity['type']) => {
    const iconProps = { size: 12, className: 'text-muted-foreground' };
    switch (type) {
      case 'create':
        return <LogIn {...iconProps} className="text-blue-400" />;
      case 'assign':
        return <User {...iconProps} className="text-indigo-400" />;
      case 'priority_change':
        return <Zap {...iconProps} className="text-red-400" />;
      case 'status_change':
        return <CheckCircle2 {...iconProps} className="text-emerald-400" />;
      case 'update':
      case 'category_change':
        return <Edit3 {...iconProps} className="text-amber-400" />;
      case 'comment':
        return <AlertCircle {...iconProps} className="text-cyan-400" />;
      default:
        return <Clock {...iconProps} />;
    }
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 1) return 'Vừa xong';
    if (hours < 24) return `${hours}h trước`;
    if (days < 7) return `${days}d trước`;
    return d.toLocaleDateString('vi-VN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-1.5 sm:space-y-2">
      <h4 className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase">📋 Lịch Sử Hoạt Động</h4>
      <div className="space-y-0 max-h-56 sm:max-h-64 overflow-y-auto">
        {activities.length === 0 ? (
          <p className="text-2xs text-muted-foreground text-center py-3 sm:py-4">Không có hoạt động nào</p>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {activities.map((activity, idx) => (
              <div key={activity.id} className="flex gap-2 sm:gap-3 pb-2 sm:pb-3 border-b border-white/05 last:border-0">
                <div className="pt-0.5 flex-shrink-0">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xs sm:text-xs text-foreground break-words">
                    <span className="font-500 text-blue-300">{activity.user}</span>
                    {' '}
                    <span className="text-muted-foreground">{activity.description}</span>
                  </p>
                  <p className="text-2xs text-muted-foreground/70 mt-0.5">{formatTime(activity.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
